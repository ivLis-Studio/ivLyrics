#!/usr/bin/env bash
set -euo pipefail

URI="${1:-ivlyrics-updater://update}"
INSTALLER_URLS=(
    "https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.sh"
    "https://ghfast.top/https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.sh"
)
export PATH="${HOME}/.spicetify:${HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

if [[ "$(uname -s)" == "Darwin" ]]; then
    LOG_ROOT="${HOME}/Library/Logs/ivLyrics"
else
    STATE_HOME="${XDG_STATE_HOME:-${HOME}/.local/state}"
    LOG_ROOT="${STATE_HOME}/ivLyrics"
fi

LOG_PATH="${LOG_ROOT}/updater.log"

notify_macos() {
    if [[ "$(uname -s)" != "Darwin" ]]; then
        return 0
    fi
    if ! command -v osascript >/dev/null 2>&1; then
        return 0
    fi

    local message="$1"
    /usr/bin/osascript -e "display notification \"${message}\" with title \"ivLyrics Updater\"" >/dev/null 2>&1 || true
}

notify_failure_on_exit() {
    local status=$?
    if [[ "$status" -ne 0 ]]; then
        notify_macos "Update failed. Check updater.log."
    fi
}

trap notify_failure_on_exit EXIT

log() {
    mkdir -p "$LOG_ROOT"
    local line
    line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    printf '%s\n' "$line" >> "$LOG_PATH"
    printf '%s\n' "$*"
}

log_stream() {
    while IFS= read -r line; do
        log "[installer] $line"
    done
}

download_installer() {
    local destination="$1"
    local installer_url=""
    local download_status=1
    local index=0

    for installer_url in "${INSTALLER_URLS[@]}"; do
        rm -f -- "$destination"
        if command -v curl >/dev/null 2>&1; then
            set +e
            curl -fsSLo "$destination" --connect-timeout 20 --max-time 40 "$installer_url" 2>&1 | log_stream
            download_status=${PIPESTATUS[0]}
            set -e
        elif command -v wget >/dev/null 2>&1; then
            set +e
            wget --timeout=20 --tries=1 -O "$destination" "$installer_url" 2>&1 | log_stream
            download_status=${PIPESTATUS[0]}
            set -e
        else
            log "curl or wget is required."
            return 1
        fi

        if [[ "$download_status" -eq 0 ]] \
            && [[ -f "$destination" ]] \
            && [[ "$(wc -c < "$destination")" -ge 512 ]] \
            && grep -Fq '# ivLyrics Installer for macOS/Linux' "$destination"; then
            if [[ "$index" -gt 0 ]]; then
                log "Downloaded installer through the GitHub proxy."
            fi
            return 0
        fi

        if [[ "$index" -eq 0 ]]; then
            log "Direct GitHub download failed; trying the GitHub proxy."
        fi
        index=$((index + 1))
    done

    rm -f -- "$destination"
    return 1
}

get_action() {
    local raw="$1"
    local action=""

    case "$raw" in
        ivlyrics-updater://*)
            action="${raw#ivlyrics-updater://}"
            action="${action%%[/?#]*}"
            ;;
        update|open-log)
            action="$raw"
            ;;
        *)
            return 1
            ;;
    esac

    case "$action" in
        ""|update) printf 'update' ;;
        open-log) printf 'open-log' ;;
        *) return 1 ;;
    esac
}

open_log() {
    mkdir -p "$LOG_ROOT"
    touch "$LOG_PATH"

    if command -v open >/dev/null 2>&1; then
        open "$LOG_PATH"
    elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$LOG_PATH" >/dev/null 2>&1 &
    else
        printf '%s\n' "$LOG_PATH"
    fi
}

restore_spicetify_state() {
    local saved_environment="$1/.spicetify-state"
    local state_path xdg_state_path
    [[ -f "$saved_environment" ]] || return 0
    if ! { IFS= read -r -d '' state_path && IFS= read -r -d '' xdg_state_path; } < "$saved_environment"; then
        log "Could not read the configured Spicetify state. Install ivLyrics again to repair the updater."
        return 1
    fi

    if [[ -n "$state_path" ]]; then
        export SPICETIFY_STATE="$state_path"
    else
        unset SPICETIFY_STATE
    fi
    if [[ -n "$xdg_state_path" ]]; then
        export XDG_STATE_HOME="$xdg_state_path"
    else
        unset XDG_STATE_HOME
    fi
}

restore_spicetify_profile() {
    local script_dir profile
    # The launcher path identifies the profile even when CustomApps or ivLyrics is a link.
    script_dir="$(CDPATH= cd -L -- "$(dirname "${BASH_SOURCE[0]}")" && pwd -L)" || return 1
    case "$script_dir" in
        */CustomApps/ivLyrics/updater/unix)
            profile="${script_dir%/CustomApps/ivLyrics/updater/unix}"
            if [[ ! -f "$profile/config-xpui.ini" ]]; then
                log "The registered Spicetify config is missing: $profile/config-xpui.ini"
                return 1
            fi
            export SPICETIFY_CONFIG="$profile"
            restore_spicetify_state "$script_dir"
            ;;
    esac
}

run_update() {
    restore_spicetify_profile || return 1

    log "Starting ivLyrics update."
    if command -v spicetify >/dev/null 2>&1; then
        log "Using spicetify: $(command -v spicetify)"
    else
        log "spicetify was not found in PATH before running installer."
    fi

    local temp_root
    temp_root="$(mktemp -d "${TMPDIR:-/tmp}/ivlyrics-updater.XXXXXX")"
    local installer_path="${temp_root}/install.sh"

    log "Downloading official installer."
    if ! download_installer "$installer_path"; then
        log "Installer download failed from both GitHub and the GitHub proxy."
        rm -rf "$temp_root"
        return 1
    fi

    chmod +x "$installer_path"
    log "Running installer."
    local installer_status=0
    set +e
    bash "$installer_path" </dev/null 2>&1 | log_stream
    installer_status=${PIPESTATUS[0]}
    set -e

    if [[ "$installer_status" -ne 0 ]]; then
        log "Installer failed with exit code ${installer_status}."
        rm -rf "$temp_root"
        return "$installer_status"
    fi

    rm -rf "$temp_root"
    log "ivLyrics update completed."
    notify_macos "Update completed."
}

main() {
    local action
    if ! action="$(get_action "$URI")"; then
        log "Unsupported updater action: $URI"
        exit 1
    fi

    case "$action" in
        update) run_update ;;
        open-log) open_log ;;
    esac
}

main "$@"
