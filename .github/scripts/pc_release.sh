#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

validate_version() {
  [[ "$RELEASE_VERSION" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] ||
    fail "Use a numeric major.minor.patch release version."
}

select_source() {
  validate_version
  local tag="v$RELEASE_VERSION" sha
  if [[ "$DRY_RUN" != true ]]; then
    [[ "$GITHUB_REF_NAME" == "$DEFAULT_BRANCH" ]] || fail "Publishing requires the default branch."
    if sha="$(git rev-parse --verify "refs/tags/$tag^{commit}" 2>/dev/null)"; then
      git merge-base --is-ancestor "$sha" HEAD || fail "The release tag is outside the default branch history."
      git cat-file -e "$sha:.github/scripts/build_pc.mjs" ||
        fail "The release tag predates install ZIP builds. Use a new version."
      git switch --detach "$sha"
    fi
  fi
  {
    echo "tag=$tag"
    echo "sha=$(git rev-parse HEAD)"
  } >> "$GITHUB_OUTPUT"
}

verify_release_identity() {
  validate_version
  [[ "$RELEASE_TAG" == "v$RELEASE_VERSION" ]] || fail "The release tag does not match the requested version."
  [[ "$RELEASE_SHA" == "$(git rev-parse HEAD)" ]] || fail "The publish job did not check out the tested commit."
}

remote_release_commit() {
  local tag_ref="refs/tags/$RELEASE_TAG" refs
  refs="$(git ls-remote --tags origin "$tag_ref" "$tag_ref^{}")" || return 1
  # Annotated tags expose both the tag object and the peeled commit.
  awk -v tag="$tag_ref" '
    $2 == tag       { object = $1 }
    $2 == tag "^{}" { commit = $1 }
    END { print (commit != "" ? commit : object) }
  ' <<< "$refs"
}

require_tested_tag() {
  local commit
  commit="$(remote_release_commit)" || fail "Could not resolve the release tag on origin."
  [[ "$commit" == "$RELEASE_SHA" ]] || fail "The remote release tag does not point to the tested commit."
}

require_non_older_version() {
  local stable="$1" source="$2"
  [[ "$stable" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] ||
    fail "The stable version from $source is invalid."
  [[ "$(printf '%s\n' "$stable" "$RELEASE_VERSION" | sort -V | tail -1)" == "$RELEASE_VERSION" ]] ||
    fail "The requested stable version is older than $source ($stable)."
}

read_latest_release_tag() {
  gh api "repos/$GITHUB_REPOSITORY/releases/latest" --jq .tag_name
}

require_non_older_public_release() {
  local tag
  tag="$(read_latest_release_tag)" || fail "Could not verify the latest stable release on GitHub."
  require_non_older_version "${tag#v}" "the latest GitHub release"
}

read_stable_update_marker() {
  git fetch origin "$DEFAULT_BRANCH" >&2 || return 1
  git show FETCH_HEAD:version.txt | tr -d '\r\n'
}

require_publishable_stable_version() {
  local stable
  stable="$(read_stable_update_marker)" || fail "Could not read version.txt on the default branch."
  require_non_older_version "$stable" "version.txt on the default branch"
  require_non_older_public_release
}

find_artifact() {
  local name="$1" path
  path="$(find release-artifact -type f -name "$name")"
  [[ -n "$path" && "$path" != *$'\n'* && -s "$path" ]] || fail "Expected one nonempty release artifact named $name."
  printf '%s\n' "$path"
}

verify_archive_pair() {
  local archive_path="$1" checksum_path="$2" digest
  [[ "${RELEASE_PACKAGE_SHA256:-}" =~ ^[0-9a-f]{64}$ ]] ||
    fail "The build job did not provide a valid ZIP checksum."
  digest="$(sha256sum -- "$archive_path")" || fail "Could not read the release ZIP."
  [[ "${digest%% *}" == "$RELEASE_PACKAGE_SHA256" ]] ||
    fail "The archive does not match the tested ZIP."
  cmp -s "$checksum_path" <(printf '%s  ivLyrics.zip\n' "$RELEASE_PACKAGE_SHA256") ||
    fail "The release checksum file does not match the tested ZIP."
}

verify_artifacts() {
  archive="$(find_artifact ivLyrics.zip)"
  checksum="$(find_artifact ivLyrics.zip.sha256)"
  notes="$(find_artifact release-notes.md)"
  local metadata
  metadata="$(find_artifact "ivLyrics-$RELEASE_TAG-release.json")"
  [[ "$checksum" == "$archive.sha256" ]] || fail "The archive and checksum must be in the same directory."
  verify_archive_pair "$archive" "$checksum"
  [[ "$(unzip -p "$archive" ivLyrics/version.txt)" == "$RELEASE_VERSION" ]] || fail "The ZIP version does not match the release."
  python3 - "$metadata" "$notes" "$RELEASE_VERSION" "$RELEASE_TAG" "$RELEASE_SHA" "$RELEASE_TITLE" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

path, notes, version, tag, commit, title = sys.argv[1:]
with open(path, encoding="utf-8") as file:
    metadata = json.load(file)
expected = {"version": version, "tag": tag, "commit": commit, "releaseTitle": title}
if any(metadata.get(key) != value for key, value in expected.items()):
    raise SystemExit("Release metadata does not match the tested source and release inputs.")
if metadata.get("releaseNotesSha256") != hashlib.sha256(Path(notes).read_bytes()).hexdigest():
    raise SystemExit("Release notes do not match the checked release metadata.")
PY
}

verify_uploaded_assets() (
  local downloaded
  downloaded="$(mktemp -d)"
  trap 'rm -r -- "$downloaded"' EXIT
  gh release download "$RELEASE_TAG" --dir "$downloaded" --pattern ivLyrics.zip --pattern ivLyrics.zip.sha256
  verify_archive_pair "$downloaded/ivLyrics.zip" "$downloaded/ivLyrics.zip.sha256"
)

publish_release() {
  verify_release_identity
  local archive checksum notes draft commit latest
  verify_artifacts
  if [[ "$PRERELEASE" == false ]]; then
    require_publishable_stable_version
  fi

  if draft="$(gh release view "$RELEASE_TAG" --json isDraft --jq .isDraft 2>&1)"; then
    [[ "$draft" == true || "$draft" == false ]] || fail "Could not determine whether $RELEASE_TAG is a draft."
  elif [[ "$draft" == "release not found" ]]; then
    draft=missing
  else
    fail "Could not look up $RELEASE_TAG on GitHub: $draft"
  fi
  if [[ "$draft" == false ]]; then
    require_tested_tag
    verify_uploaded_assets
    [[ "$(gh release view "$RELEASE_TAG" --json isPrerelease --jq .isPrerelease)" == "$PRERELEASE" ]] ||
      fail "The published release type differs from the requested type."
    echo "published=false" >> "$GITHUB_OUTPUT"
    return
  fi

  commit="$(remote_release_commit)" || fail "Could not resolve the release tag on origin."
  if [[ -z "$commit" ]]; then
    git push origin "$RELEASE_SHA:refs/tags/$RELEASE_TAG"
  fi
  require_tested_tag
  if [[ "$draft" == missing ]]; then
    gh release create "$RELEASE_TAG" --verify-tag --draft --title "$RELEASE_TITLE" --notes-file "$notes"
  fi
  gh release upload "$RELEASE_TAG" "$archive" "$checksum" --clobber
  verify_uploaded_assets
  require_tested_tag
  latest=false
  if [[ "$PRERELEASE" == false ]]; then
    require_publishable_stable_version
    latest=true
  fi
  gh release edit "$RELEASE_TAG" --draft=false --prerelease="$PRERELEASE" --latest="$latest" \
    --title "$RELEASE_TITLE" --notes-file "$notes"
  echo "published=true" >> "$GITHUB_OUTPUT"
}

is_latest_release() {
  local tag
  tag="$(read_latest_release_tag)" || return 1
  [[ "$tag" == "$RELEASE_TAG" ]]
}

advance_update_marker() {
  verify_release_identity
  [[ "$PRERELEASE" == false ]] || fail "A prerelease cannot update the stable version marker."
  local attempt stable
  for attempt in 1 2 3; do
    if is_latest_release; then break; fi
    sleep 2
  done
  is_latest_release || fail "The tested release is not the latest stable release."
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  for attempt in 1 2 3; do
    stable="$(read_stable_update_marker)" || fail "Could not read version.txt on the default branch."
    require_non_older_version "$stable" "version.txt on the default branch"
    require_tested_tag
    verify_uploaded_assets
    if [[ "$stable" == "$RELEASE_VERSION" ]]; then
      git switch --detach "$RELEASE_SHA"
      return 0
    fi
    is_latest_release || fail "The latest stable release changed before updating version.txt."
    git switch --detach FETCH_HEAD
    printf '%s\n' "$RELEASE_VERSION" > version.txt
    git add version.txt
    git commit -m "chore(release): advertise $RELEASE_TAG to installed clients"
    if git push origin "HEAD:refs/heads/$DEFAULT_BRANCH"; then
      git switch --detach "$RELEASE_SHA"
      return 0
    fi
  done
  fail "Could not push the stable update marker."
}

case "${1:-}" in
  select-source) select_source ;;
  publish) publish_release ;;
  advance-update-marker) advance_update_marker ;;
  *) fail "Expected select-source, publish, or advance-update-marker." ;;
esac
