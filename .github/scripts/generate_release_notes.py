#!/usr/bin/env python3

import json
import os
import re
import subprocess
import sys
import textwrap
import urllib.error
import urllib.request
from pathlib import Path


REPOSITORY = "ivLis-Studio/ivLyrics"
TEMPLATE_PATH = Path(".github/release-notes-template.md")


def run_git(args, allow_fail=False):
    result = subprocess.run(
        ["git", *args],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode != 0 and not allow_fail:
        raise RuntimeError(result.stderr.strip() or "git command failed")
    return result.stdout.strip()


def version_key(tag):
    value = tag[1:] if tag.lower().startswith("v") else tag
    parts = []
    for chunk in re.split(r"[^0-9A-Za-z]+", value):
        if not chunk:
            continue
        parts.append((0, int(chunk)) if chunk.isdigit() else (1, chunk.lower()))
    return parts


def previous_tag(current_tag):
    current_key = version_key(current_tag)
    tags = [
        tag
        for tag in run_git(["tag", "--list", "v*"]).splitlines()
        if tag and tag != current_tag and version_key(tag) < current_key
    ]
    return sorted(tags, key=version_key)[-1] if tags else ""


def resolve_ref(tag):
    if run_git(["rev-parse", "--verify", f"{tag}^{{commit}}"], allow_fail=True):
        return tag
    return "HEAD"


def compare_url(current_tag, previous):
    if previous:
        return f"https://github.com/{REPOSITORY}/compare/{previous}...{current_tag}"
    return f"https://github.com/{REPOSITORY}/commits/{current_tag}"


def release_changes(previous, current_ref):
    range_spec = f"{previous}..{current_ref}" if previous else current_ref
    log_text = run_git(
        [
            "log",
            "--no-merges",
            "--max-count=100",
            "--pretty=format:%h%x09%s",
            range_spec,
        ],
        allow_fail=True,
    )
    stat_ref = previous if previous else current_ref
    stat_text = run_git(["diff", "--stat", stat_ref], allow_fail=True)
    return log_text, stat_text


def commit_subjects(log_text):
    subjects = [
        line.split("\t", 1)[-1].strip()
        for line in log_text.splitlines()
        if line.strip()
    ]
    return subjects or ["Prepare the ivLyrics release."]


def fallback_content(version, log_text):
    subjects = commit_subjects(log_text)
    title = re.sub(r"[-_]+", " ", subjects[0]).strip() or "Release"
    return {
        "title": title,
        "ko": {
            "summary": f"ivLyrics {version} 릴리스입니다.",
            "highlights": subjects[:6],
            "fixes": subjects[6:12] or ["릴리스 버전 정보와 배포 절차를 갱신했습니다."],
        },
        "en": {
            "summary": f"This is the ivLyrics {version} release.",
            "highlights": subjects[:6],
            "fixes": subjects[6:12] or ["Updated release version metadata and publishing workflow."],
        },
    }


def normalize_chat_url(base_url):
    base = (base_url or "").strip().rstrip("/")
    if not base:
        return ""
    if base.endswith("/chat/completions"):
        return base
    if base.endswith("/v1"):
        return base + "/chat/completions"
    return base + "/v1/chat/completions"


def normalize_title(value):
    title = re.sub(r"\s+", " ", str(value or "")).strip(" `#-_")
    return title[:80].rstrip() or "Release"


def normalize_note_section(section):
    def string_value(key):
        return str(section.get(key) or "").strip()

    def list_value(key):
        value = section.get(key)
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str) and value.strip():
            return [value.strip()]
        return []

    return {
        "summary": string_value("summary"),
        "highlights": list_value("highlights"),
        "fixes": list_value("fixes"),
    }


def parse_ai_json(text):
    value = (text or "").strip()
    value = re.sub(r"^```(?:json)?\s*", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\s*```$", "", value)
    try:
        data = json.loads(value)
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    ko = data.get("ko") if isinstance(data.get("ko"), dict) else {}
    en = data.get("en") if isinstance(data.get("en"), dict) else {}
    if not ko or not en:
        return {}
    return {
        "title": normalize_title(data.get("title")),
        "ko": normalize_note_section(ko),
        "en": normalize_note_section(en),
    }


def ai_release_content(version, tag, previous, log_text, stat_text):
    api_key = os.environ.get("AI_API_KEY", "").strip()
    api_url = normalize_chat_url(os.environ.get("AI_BASE_URL", ""))
    model = os.environ.get("AI_MODEL", "").strip() or "gpt-4o-mini"
    if not api_key or not api_url:
        return {}

    prompt = textwrap.dedent(
        f"""
        You write bilingual GitHub release notes for ivLyrics, a Spicetify custom app that displays synchronized lyrics, karaoke effects, translations, and music-player enhancements.
        Return JSON only. Do not return Markdown.

        Release version: {version}
        Current tag: {tag}
        Previous tag: {previous or "(none)"}
        Compare URL: {compare_url(tag, previous)}

        Output JSON schema:
        {{
          "title": "Short English release title without the version number",
          "ko": {{
            "summary": "Korean one-sentence summary",
            "highlights": ["Korean user-facing highlight", "..."],
            "fixes": ["Korean improvement or fix", "..."]
          }},
          "en": {{
            "summary": "English one-sentence summary",
            "highlights": ["English user-facing highlight", "..."],
            "fixes": ["English improvement or fix", "..."]
          }}
        }}

        Requirements:
        - Keep the title under 60 characters and do not include {version} or {tag}.
        - Write Korean and English sections with equivalent meaning.
        - Describe user-visible changes first and maintenance changes second.
        - Use only changes supported by the commit list and diff stat.
        - Do not mention secrets, private URLs, internal tokens, or a Full Changelog link.
        - Do not describe the version-number-only edits as a product feature.

        Commits:
        {log_text or "(no commit log)"}

        Diff stat:
        {stat_text or "(no diff stat)"}
        """
    ).strip()
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "Generate accurate, concise release notes from git metadata only.",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.25,
    }
    request = urllib.request.Request(
        api_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "ivLyrics-ReleaseBot/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace").strip()
        if len(body) > 1200:
            body = body[:1200] + "...(truncated)"
        detail = f"HTTP {exc.code}: {exc.reason or ''}".strip()
        if body:
            detail += f" / {body}"
        print(f"AI release note generation failed: {detail}", file=sys.stderr)
        return {}
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"AI release note generation failed: {exc}", file=sys.stderr)
        return {}

    choices = data.get("choices") or []
    if not choices:
        return {}
    message = choices[0].get("message") or {}
    return parse_ai_json(message.get("content") or "")


def markdown_bullets(values, fallback):
    items = [str(value).strip() for value in values if str(value).strip()]
    return "\n".join(f"- {item}" for item in (items or [fallback]))


def render_notes(version, tag, previous, content):
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    ko = content.get("ko") or {}
    en = content.get("en") or {}
    return template.format(
        version=version,
        tag=tag,
        previous_tag=previous or "None",
        compare_url=compare_url(tag, previous),
        ko_summary=ko.get("summary") or f"ivLyrics {version} 릴리스입니다.",
        ko_highlights=markdown_bullets(
            ko.get("highlights") or [], "주요 변경 사항을 정리했습니다."
        ),
        ko_fixes=markdown_bullets(
            ko.get("fixes") or [], "안정성과 배포 절차를 개선했습니다."
        ),
        en_summary=en.get("summary") or f"This is the ivLyrics {version} release.",
        en_highlights=markdown_bullets(
            en.get("highlights") or [], "Updated the main user-facing experience."
        ),
        en_fixes=markdown_bullets(
            en.get("fixes") or [], "Improved stability and release maintenance."
        ),
    )


def write_github_outputs(values):
    output_path = os.environ.get("GITHUB_OUTPUT", "").strip()
    if not output_path:
        return
    with open(output_path, "a", encoding="utf-8") as output:
        for key, value in values.items():
            output.write(f"{key}={value}\n")


def main():
    version = os.environ.get("RELEASE_VERSION", "").strip()
    tag = os.environ.get("RELEASE_TAG", "").strip() or f"v{version}"
    if not re.fullmatch(r"[0-9]+[.][0-9]+[.][0-9]+", version):
        raise RuntimeError(f"Invalid RELEASE_VERSION: {version}")
    if tag != f"v{version}":
        raise RuntimeError(f"Release tag {tag} does not match version {version}")

    previous = previous_tag(tag)
    current_ref = resolve_ref(tag)
    log_text, stat_text = release_changes(previous, current_ref)
    content = ai_release_content(
        version, tag, previous, log_text, stat_text
    ) or fallback_content(version, log_text)
    title = normalize_title(content.get("title"))
    release_title = f"{version} - {title}"
    notes = render_notes(version, tag, previous, content)

    out_dir = Path(os.environ.get("RELEASE_NOTES_DIR", "release-metadata"))
    out_dir.mkdir(parents=True, exist_ok=True)
    notes_path = out_dir / "release-notes.md"
    metadata_path = out_dir / f"ivLyrics-{tag}-release.json"
    notes_path.write_text(notes.strip() + "\n", encoding="utf-8")
    metadata_path.write_text(
        json.dumps(
            {
                "version": version,
                "tag": tag,
                "commit": run_git(["rev-parse", "HEAD"]),
                "previousTag": previous,
                "compareUrl": compare_url(tag, previous),
                "releaseTitle": release_title,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    write_github_outputs(
        {
            "release_title": release_title,
            "notes_path": notes_path.resolve(),
            "metadata_path": metadata_path.resolve(),
        }
    )
    print(f"previous_tag={previous}")
    print(f"release_title={release_title}")
    print(f"notes={notes_path}")
    print(f"metadata={metadata_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Release note generation failed: {exc}", file=sys.stderr)
        sys.exit(1)
