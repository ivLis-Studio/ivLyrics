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


def release_range(previous, current_ref):
    return f"{previous}..{current_ref}" if previous else current_ref


def git_diff_stat(previous, current_ref):
    range_spec = release_range(previous, current_ref)
    if previous:
        return run_git(["diff", "--stat", range_spec], allow_fail=True)
    return run_git(
        ["diff-tree", "--root", "--stat", "--no-commit-id", current_ref],
        allow_fail=True,
    )


def parse_numstat(text):
    files = []
    for line in text.splitlines():
        parts = line.split("\t", 2)
        if len(parts) != 3:
            continue
        added, deleted, path = parts
        files.append(
            {
                "path": path.strip(),
                "added": int(added) if added.isdigit() else None,
                "deleted": int(deleted) if deleted.isdigit() else None,
            }
        )
    return files


def release_commits(previous, current_ref):
    range_spec = release_range(previous, current_ref)
    raw = run_git(
        [
            "log",
            "--no-merges",
            "--pretty=format:%h%x1f%s%x1f%b%x1e",
            range_spec,
        ],
        allow_fail=True,
    )
    commits = []
    for record in raw.split("\x1e"):
        record = record.strip()
        if not record:
            continue
        parts = record.split("\x1f", 2)
        if len(parts) < 2:
            continue
        commit_hash = parts[0].strip()
        subject = parts[1].strip()
        body = parts[2].strip() if len(parts) > 2 else ""
        files = parse_numstat(
            run_git(
                ["show", "--format=", "--numstat", commit_hash],
                allow_fail=True,
            )
        )
        commits.append(
            {
                "hash": commit_hash,
                "subject": subject,
                "body": body,
                "files": files,
            }
        )
    if commits:
        return commits
    return [
        {
            "hash": run_git(["rev-parse", "--short", current_ref], allow_fail=True)
            or "HEAD",
            "subject": "Prepare the ivLyrics release.",
            "body": "",
            "files": [],
        }
    ]


def commit_evidence(commits):
    blocks = []
    for commit in commits:
        files = commit["files"]
        file_lines = []
        for item in files[:40]:
            if item["added"] is None or item["deleted"] is None:
                stats = "binary"
            else:
                stats = f"+{item['added']}/-{item['deleted']}"
            file_lines.append(f"  - {item['path']} ({stats})")
        if len(files) > 40:
            file_lines.append(f"  - ... and {len(files) - 40} more files")
        body = commit["body"][:2000].strip()
        blocks.append(
            "\n".join(
                [
                    f"Commit: {commit['hash']}",
                    f"Subject: {commit['subject']}",
                    f"Body: {body or '(none)'}",
                    "Files:",
                    *(file_lines or ["  - (no file stats)"]),
                ]
            )
        )
    return "\n\n".join(blocks)


def parse_commit_subject(subject):
    match = re.match(
        r"^(?P<type>build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)"
        r"(?:\([^)]+\))?!?:\s*",
        subject,
        re.IGNORECASE,
    )
    if not match:
        return "", subject.strip()
    return match.group("type").lower(), subject[match.end() :].strip()


def fallback_release_title(entries):
    summary = " ".join(text.lower() for _, text in entries)
    topics = []
    if re.search(
        r"\blyrics?\b|\btranslation\b|\bpronunciation\b|\bcultural\b|open[- ]lyrics|instrumental",
        summary,
    ):
        topics.append("Lyrics")
    if re.search(
        r"\bplayback\b|\bnow playing\b|\bvinyl\b|\blp\b|\bplayer\b|\bvideo background\b",
        summary,
    ):
        topics.append("Playback")
    if re.search(r"\bui\b|\bdialog\b|\bnotice\b|\bpopup\b|\bsettings?\b", summary):
        topics.append("UI")

    if len(topics) == 1:
        return f"{topics[0]} Improvements and Fixes"
    if len(topics) == 2:
        return f"{topics[0]} and {topics[1]} Improvements"
    if len(topics) > 2:
        return f"{', '.join(topics[:-1])}, and {topics[-1]} Improvements"
    return "ivLyrics Improvements and Fixes"


def fallback_category(subject):
    value = subject.lower()
    if re.search(
        r"lyrics?|translation|pronunciation|cultural|provider|open[- ]lyrics|"
        r"instrumental|karaoke|overlay",
        value,
    ):
        return "lyrics"
    if re.search(
        r"playback|now playing|vinyl|\blp\b|player|video|scroll|track|spotify dj",
        value,
    ):
        return "playback"
    if re.search(r"\bui\b|dialog|notice|popup|settings?|layout|design", value):
        return "ui"
    return "maintenance"


def fallback_item(commit, language):
    commit_type, text = parse_commit_subject(commit["subject"])
    title = text or commit["subject"]
    files = commit["files"]
    additions = sum(item["added"] or 0 for item in files)
    deletions = sum(item["deleted"] or 0 for item in files)
    paths = ", ".join(f"`{item['path']}`" for item in files[:4])
    if len(files) > 4:
        paths += f", +{len(files) - 4}"
    if language == "ko":
        details = (
            f"{len(files)}개 파일에서 +{additions}/-{deletions}줄을 변경했습니다."
            + (f" 주요 범위: {paths}." if paths else "")
        )
    else:
        details = (
            f"Changed {len(files)} files with +{additions}/-{deletions} lines."
            + (f" Main scope: {paths}." if paths else "")
        )
    if commit_type in {"build", "chore", "ci", "docs", "style", "test"}:
        details += (
            " 사용자 기능 외의 유지보수 변경입니다."
            if language == "ko"
            else " This is a maintenance change outside the main user features."
        )
    return {
        "title": title,
        "details": details,
        "commits": [commit["hash"]],
    }


def fallback_sections(commits, language):
    labels = {
        "ko": {
            "lyrics": "가사, AI 및 오버레이",
            "playback": "재생, LP 및 영상",
            "ui": "UI 및 설정",
            "maintenance": "안정성 및 유지보수",
        },
        "en": {
            "lyrics": "Lyrics, AI, and Overlay",
            "playback": "Playback, LP, and Video",
            "ui": "UI and Settings",
            "maintenance": "Reliability and Maintenance",
        },
    }
    grouped = {key: [] for key in labels[language]}
    for commit in commits:
        grouped[fallback_category(commit["subject"])].append(
            fallback_item(commit, language)
        )
    return [
        {"title": labels[language][key], "items": grouped[key]}
        for key in labels[language]
        if grouped[key]
    ]


def fallback_content(version, commits):
    entries = [parse_commit_subject(commit["subject"]) for commit in commits]
    count = len(commits)
    return {
        "title": fallback_release_title(entries),
        "ko": {
            "summary": (
                f"ivLyrics {version}은 이전 릴리스 이후의 {count}개 변경을 "
                "기능 영역별로 정리한 업데이트입니다."
            ),
            "sections": fallback_sections(commits, "ko"),
        },
        "en": {
            "summary": (
                f"ivLyrics {version} includes {count} changes since the previous "
                "release, organized by product area."
            ),
            "sections": fallback_sections(commits, "en"),
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


def normalize_commit_list(value):
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def normalize_note_item(item):
    if not isinstance(item, dict):
        return {}
    title = str(item.get("title") or "").strip()
    details = str(item.get("details") or "").strip()
    commits = normalize_commit_list(item.get("commits"))
    if not title or not details or not commits:
        return {}
    return {"title": title, "details": details, "commits": commits}


def normalize_note_section(section):
    if not isinstance(section, dict):
        return {}
    sections = []
    for group in section.get("sections") or []:
        if not isinstance(group, dict):
            continue
        title = str(group.get("title") or "").strip()
        items = [
            normalized
            for item in group.get("items") or []
            if (normalized := normalize_note_item(item))
        ]
        if title and items:
            sections.append({"title": title, "items": items})
    return {
        "summary": str(section.get("summary") or "").strip(),
        "sections": sections,
    }


def covered_commits(section):
    return [
        commit
        for group in section.get("sections") or []
        for item in group.get("items") or []
        for commit in item.get("commits") or []
    ]


def has_complete_commit_coverage(content, commits):
    expected = [commit["hash"] for commit in commits]
    if not expected:
        return False
    for language in ("ko", "en"):
        actual = covered_commits(content.get(language) or {})
        if len(actual) != len(expected) or set(actual) != set(expected):
            return False
    return True


def parse_ai_json(text, commits):
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
    content = {
        "title": normalize_title(data.get("title")),
        "ko": normalize_note_section(ko),
        "en": normalize_note_section(en),
    }
    if not has_complete_commit_coverage(content, commits):
        return {}
    return content


def ai_release_content(version, tag, previous, commits, stat_text):
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
            "summary": "Korean summary in two to four sentences",
            "sections": [
              {{
                "title": "Korean product-area heading",
                "items": [
                  {{
                    "title": "Short Korean change title",
                    "details": "One to three detailed Korean sentences describing behavior, conditions, and user impact.",
                    "commits": ["short commit hash"]
                  }}
                ]
              }}
            ]
          }},
          "en": {{
            "summary": "Equivalent English summary in two to four sentences",
            "sections": [
              {{
                "title": "Equivalent English product-area heading",
                "items": [
                  {{
                    "title": "Short English change title",
                    "details": "One to three detailed English sentences describing behavior, conditions, and user impact.",
                    "commits": ["same short commit hash"]
                  }}
                ]
              }}
            ]
          }}
        }}

        Requirements:
        - Keep the title under 60 characters and do not include {version} or {tag}.
        - Write Korean and English sections with equivalent meaning.
        - Create descriptive product-area sections like Lyrics and AI, Playback and LP Mode, UI and Settings, or Reliability. Use only sections that fit the supplied changes.
        - Describe user-visible changes first and maintenance changes last.
        - Cover every supplied commit hash exactly once in the Korean items and exactly once in the English items. The two languages must map the same hashes to equivalent items.
        - Combine commits into one item only when they are tightly related parts of the same user-facing change. Otherwise keep separate items.
        - Do not cap the number of sections or items. Completeness is more important than brevity.
        - Make each details field specific enough to explain what changed, when it matters, and what the user will notice. Avoid vague phrases such as "improved stability" unless the evidence provides no more detail.
        - Mention cross-view behavior, defaults, compatibility, localization coverage, cache behavior, or edge cases when the supplied evidence supports them.
        - Use only changes supported by the commit evidence and aggregate diff stat.
        - Do not mention secrets, private URLs, internal tokens, or a Full Changelog link.
        - Do not describe the version-number-only edits as a product feature.

        Commit evidence:
        {commit_evidence(commits)}

        Aggregate diff stat:
        {stat_text or "(no diff stat)"}
        """
    ).strip()
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Generate accurate, detailed, and complete release notes from "
                    "git evidence. Never omit a supplied commit."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.15,
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
        timeout_seconds = int(os.environ.get("AI_TIMEOUT_SECONDS", "300"))
    except ValueError:
        timeout_seconds = 300
    timeout_seconds = max(60, min(timeout_seconds, 900))

    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
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
    return parse_ai_json(message.get("content") or "", commits)


def markdown_sections(sections, fallback_title, fallback_text):
    rendered = []
    for section in sections:
        title = str(section.get("title") or "").strip()
        items = section.get("items") or []
        if not title or not items:
            continue
        bullets = []
        for item in items:
            item_title = str(item.get("title") or "").strip()
            details = str(item.get("details") or "").strip()
            if item_title and details:
                bullets.append(f"- **{item_title}**: {details}")
        if bullets:
            rendered.append(f"### {title}\n" + "\n".join(bullets))
    return "\n\n".join(rendered) or f"### {fallback_title}\n- {fallback_text}"


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
        ko_sections=markdown_sections(
            ko.get("sections") or [],
            "변경 사항",
            "이전 릴리스 이후의 변경 사항을 정리했습니다.",
        ),
        en_summary=en.get("summary") or f"This is the ivLyrics {version} release.",
        en_sections=markdown_sections(
            en.get("sections") or [],
            "Changes",
            "Changes since the previous release are listed here.",
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
    stat_text = git_diff_stat(previous, current_ref)
    commits = release_commits(previous, current_ref)
    content = ai_release_content(version, tag, previous, commits, stat_text)
    require_ai = os.environ.get("RELEASE_NOTES_REQUIRE_AI", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }
    if not content and require_ai:
        raise RuntimeError(
            "AI release-note generation did not return complete bilingual notes; "
            "the release was stopped instead of publishing fallback statistics."
        )
    content = content or fallback_content(version, commits)
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
                "commitCount": len(commits),
                "coveredCommits": [commit["hash"] for commit in commits],
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
