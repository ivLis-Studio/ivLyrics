#!/usr/bin/env python3

import argparse
import os
import re
import sys
from pathlib import Path


VERSION_PATTERN = r"(?:0|[1-9][0-9]*)[.](?:0|[1-9][0-9]*)[.](?:0|[1-9][0-9]*)"
VERSION_RE = re.compile(rf"^{VERSION_PATTERN}$")
UTILS_RE = re.compile(
    rf'(?m)^(?P<prefix>[ \t]*currentVersion:[ \t]*")'
    rf'(?P<version>{VERSION_PATTERN})(?P<suffix>",[ \t]*)$'
)
NOTICE_RE = re.compile(
    rf'(?m)(?P<prefix>window[.]ivLyricsVersion[ \t]*[|][|][ \t]*\n[ \t]*")'
    rf'(?P<version>{VERSION_PATTERN})(?P<suffix>")'
)
DEFAULT_ROOT = Path(__file__).resolve().parents[2]


def repository_root():
    override = os.environ.get("IVLYRICS_RELEASE_ROOT", "").strip()
    return Path(override).resolve() if override else DEFAULT_ROOT


def parse_version(value):
    value = str(value or "").strip()
    if not VERSION_RE.fullmatch(value):
        raise ValueError(
            f"Invalid version '{value}'. Use numeric semantic versioning, for example 5.5.1."
        )
    return value


def version_key(value):
    return tuple(int(part) for part in parse_version(value).split("."))


def read_text(path):
    if not path.is_file():
        raise RuntimeError(f"Required version file is missing: {path}")
    return path.read_text(encoding="utf-8")


def extract_single(path, pattern, label):
    text = read_text(path)
    matches = list(pattern.finditer(text))
    if len(matches) != 1:
        raise RuntimeError(
            f"Expected exactly one {label} version in {path.name}, found {len(matches)}."
        )
    return matches[0].group("version")


def read_state(root):
    version_path = root / "version.txt"
    version_text = read_text(version_path)
    version_value = version_text.strip()
    if version_text not in {version_value, version_value + "\n"}:
        raise RuntimeError("version.txt must contain only one version value.")
    parse_version(version_value)

    state = {
        "version.txt": version_value,
        "Utils.js": extract_single(root / "Utils.js", UTILS_RE, "Utils.currentVersion"),
        "NoticeSystem.js": extract_single(
            root / "NoticeSystem.js", NOTICE_RE, "NoticeSystem fallback"
        ),
    }
    if len(set(state.values())) != 1:
        details = ", ".join(f"{name}={value}" for name, value in state.items())
        raise RuntimeError(f"Release versions are inconsistent: {details}")
    return state


def replace_single(path, pattern, target, label):
    text = read_text(path)

    def replacement(match):
        return f'{match.group("prefix")}{target}{match.group("suffix")}'

    updated, count = pattern.subn(replacement, text)
    if count != 1:
        raise RuntimeError(
            f"Expected exactly one {label} version in {path.name}, replaced {count}."
        )
    path.write_text(updated, encoding="utf-8")


def write_github_outputs(values):
    output_path = os.environ.get("GITHUB_OUTPUT", "").strip()
    if not output_path:
        return
    with open(output_path, "a", encoding="utf-8") as output:
        for key, value in values.items():
            output.write(f"{key}={value}\n")


def prepare(root, target):
    target = parse_version(target)
    state = read_state(root)
    current = next(iter(state.values()))
    if version_key(target) < version_key(current):
        raise RuntimeError(
            f"Release version {target} is older than current version {current}."
        )

    changed = version_key(target) > version_key(current)
    if changed:
        (root / "version.txt").write_text(target, encoding="utf-8")
        replace_single(root / "Utils.js", UTILS_RE, target, "Utils.currentVersion")
        replace_single(
            root / "NoticeSystem.js",
            NOTICE_RE,
            target,
            "NoticeSystem fallback",
        )

    checked = read_state(root)
    if set(checked.values()) != {target}:
        raise RuntimeError(f"Version update validation failed for {target}.")

    write_github_outputs(
        {
            "previous_version": current,
            "version": target,
            "tag": f"v{target}",
            "changed": str(changed).lower(),
        }
    )
    action = "updated" if changed else "already current"
    print(f"Release version {target}: {action}")


def check(root, expected):
    expected = parse_version(expected) if expected else ""
    state = read_state(root)
    current = next(iter(state.values()))
    if expected and current != expected:
        raise RuntimeError(f"Expected version {expected}, found {current}.")
    print(f"Release version check passed: {current}")


def main():
    parser = argparse.ArgumentParser(
        description="Update and validate the three ivLyrics release version locations."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare_parser = subparsers.add_parser("prepare")
    prepare_parser.add_argument("version")
    check_parser = subparsers.add_parser("check")
    check_parser.add_argument("version", nargs="?")
    args = parser.parse_args()

    root = repository_root()
    if args.command == "prepare":
        prepare(root, args.version)
    else:
        check(root, args.version)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Version automation failed: {exc}", file=sys.stderr)
        sys.exit(1)
