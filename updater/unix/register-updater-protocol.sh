#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OS_NAME="$(uname -s)"

if [[ -z "$APP_DIR" ]]; then
    APP_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
fi

SOURCE_UPDATER="${SCRIPT_DIR}/ivlyrics-updater.sh"
if [[ ! -f "$SOURCE_UPDATER" ]]; then
    echo "Updater script not found: $SOURCE_UPDATER" >&2
    exit 1
fi

remember_spicetify_state() {
    local updater_dir="${APP_DIR}/updater/unix"
    local state_path="${SPICETIFY_STATE:-}"
    local xdg_state_path="${XDG_STATE_HOME:-}"
    local saved_environment
    if [[ -n "$state_path" && "$state_path" != /* ]]; then
        state_path="${PWD}/${state_path}"
    fi
    if [[ -n "$xdg_state_path" && "$xdg_state_path" != /* ]]; then
        xdg_state_path="${PWD}/${xdg_state_path}"
    fi

    # The desktop launcher does not necessarily inherit the install shell.
    # Save paths as data, so spaces and shell metacharacters stay literal.
    saved_environment="$(mktemp "${updater_dir}/.spicetify-state.XXXXXX")"
    if ! printf '%s\0%s\0' "$state_path" "$xdg_state_path" > "$saved_environment" ||
        ! mv -f -- "$saved_environment" "${updater_dir}/.spicetify-state"; then
        rm -f -- "$saved_environment"
        return 1
    fi
}

read_macos_updater_handler() {
    osascript -l JavaScript - 'ivlyrics-updater://update' <<'JS'
ObjC.import("AppKit");
function run(args) {
    const app = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString(args[0]));
    if (app.isNil()) return "";
    const bundle = $.NSBundle.bundleWithURL(app);
    if (bundle.isNil()) return "";
    const id = ObjC.unwrap(bundle.bundleIdentifier) || "";
    return id + "\n" + ObjC.unwrap(app.URLByResolvingSymlinksInPath.path);
}
JS
}

verify_macos_updater_handler() {
    local lsregister="$1" app_path="$2" bundle_id="$3" removed_log="$4"
    local selected stale_path previous_path retries=0
    local -a removed_paths=("$app_path")

    # Registering a bundle does not make it the selected handler. Launch
    # Services may continue to favor a backup with the same bundle identifier.
    while :; do
        selected=$(read_macos_updater_handler) || return 1
        stale_path=${selected#*$'\n'}
        if [[ "$selected" == "$bundle_id"$'\n'/* ]] &&
            [[ "$stale_path" == "$app_path" || "$stale_path" -ef "$app_path" ]]; then
            return 0
        fi

        if [[ -n "$selected" ]]; then
            if [[ "$selected" != "$bundle_id"$'\n'/* ]]; then
                echo "macOS has assigned ivlyrics-updater:// to another application." >&2
                return 1
            fi

            for previous_path in "${removed_paths[@]}"; do
                if [[ "$stale_path" == "$previous_path" ]]; then
                    stale_path=""
                    break
                fi
            done
            if [[ -n "$stale_path" ]]; then
                printf '%s\0' "$stale_path" >> "$removed_log" || return 1
                "$lsregister" -u "$stale_path" || return 1
                removed_paths+=("$stale_path")
                retries=0
                continue
            fi
        fi

        # Launch Services can briefly return any of the paths already removed.
        if [[ "$retries" -ge 5 ]]; then
            echo "macOS has not selected the installed app for ivlyrics-updater://." >&2
            return 1
        fi
        retries=$((retries + 1))
        sleep .2
    done
}

cleanup_macos_registration() {
    local status="$1" stale_path
    if [[ "$committed" = false ]]; then
        if [[ "$registration_attempted" = true ]]; then
            "$lsregister" -u "$app_path" >/dev/null 2>&1 || true
        fi
        if { [[ "$candidate_installed" = true ]] && ! rm -rf -- "$app_path"; } ||
            { [[ -e "$staging/previous.app" ]] && ! mv "$staging/previous.app" "$app_path"; }; then
            echo "Could not restore the previous updater bundle. Recovery directory: $staging" >&2
            return 1
        fi
        while IFS= read -r -d '' stale_path; do
            if [[ -d "$stale_path" && "$stale_path" != "$original_path" ]]; then
                "$lsregister" -f "$stale_path" || echo "Could not restore updater registration: $stale_path" >&2
            fi
        done < "$removed_log"
        if [[ "$registration_attempted" = true && -d "$original_path" ]]; then
            "$lsregister" -f "$original_path" || echo "Could not restore updater registration: $original_path" >&2
        fi
    fi
    rm -rf -- "$staging"
    return "$status"
}

register_macos() (
    local updater_script="${APP_DIR}/updater/unix/ivlyrics-updater.sh"
    local macos_dir="${APP_DIR}/updater/macos"
    local app_path="${macos_dir}/ivLyrics Updater.app"
    local bundle_id="kr.ivlis.ivlyrics.updater"
    local legacy_updater_root="${HOME}/Library/Application Support/ivLyrics/Updater"
    local legacy_app_path="${legacy_updater_root}/ivLyrics Updater.app"
    local lsregister="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
    lsregister="$(type -P lsregister || printf '%s' "$lsregister")"
    local escaped_updater_script staging candidate generated_applescript plist
    local original_handler original_path removed_log
    local candidate_installed=false registration_attempted=false committed=false

    if [[ ! -f "$updater_script" ]]; then
        echo "Updater script not found in app directory: $updater_script" >&2
        exit 1
    fi

    mkdir -p "$macos_dir"
    chmod +x "$updater_script"

    if ! command -v osacompile >/dev/null 2>&1; then
        echo "osacompile is required to register ivlyrics-updater:// on macOS." >&2
        return 1
    fi
    if [[ ! -x "$lsregister" ]]; then
        echo "Launch Services registration is unavailable." >&2
        return 1
    fi

    original_handler=$(read_macos_updater_handler) || return 1
    if [[ -n "$original_handler" && "$original_handler" != "$bundle_id"$'\n'/* ]]; then
        echo "macOS has assigned ivlyrics-updater:// to another application." >&2
        return 1
    fi
    original_path=${original_handler#*$'\n'}

    staging=$(mktemp -d "${macos_dir}/.updater-bundle.XXXXXX")
    removed_log="$staging/removed-handlers"
    : > "$removed_log"
    trap 'cleanup_macos_registration "$?"' EXIT
    candidate="$staging/ivLyrics Updater.app"
    generated_applescript="$staging/ivlyrics-updater.applescript"

    escaped_updater_script="$(printf '%s' "$updater_script" | sed 's/\\/\\\\/g; s/"/\\"/g')"
    cat > "$generated_applescript" <<EOF
on runUpdater(theURL)
    set updaterScript to "$escaped_updater_script"
    try
        do shell script "/usr/bin/nohup /bin/bash " & quoted form of updaterScript & " " & quoted form of theURL & " >/dev/null 2>&1 &"
        display notification "Update started in the background." with title "ivLyrics Updater"
    on error errorMessage
        display dialog "ivLyrics Updater could not start:" & return & errorMessage buttons {"OK"} default button "OK" with icon caution
    end try
end runUpdater

on open location theURL
    runUpdater(theURL)
end open location

on run
    runUpdater("ivlyrics-updater://update")
end run
EOF

    osacompile -o "$candidate" "$generated_applescript"

    plist="${candidate}/Contents/Info.plist"
    /usr/libexec/PlistBuddy \
        -c "Add :CFBundleURLTypes array" \
        -c "Add :CFBundleURLTypes:0 dict" \
        -c "Add :CFBundleURLTypes:0:CFBundleURLName string ivLyrics Updater" \
        -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" \
        -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string ivlyrics-updater" "$plist"
    /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $bundle_id" "$plist" 2>/dev/null || \
        /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string $bundle_id" "$plist"
    # osacompile may have signed the app before Info.plist was updated.
    /usr/bin/codesign --force --sign - "$candidate"

    if [[ -e "$app_path" ]]; then
        mv "$app_path" "$staging/previous.app"
    fi
    mv "$candidate" "$app_path"
    candidate_installed=true
    registration_attempted=true
    "$lsregister" -f "$app_path"
    verify_macos_updater_handler "$lsregister" "$(cd "$app_path" && pwd -P)" "$bundle_id" "$removed_log"
    committed=true

    if [[ -d "$legacy_app_path" && ! "$legacy_app_path" -ef "$app_path" ]]; then
        "$lsregister" -u "$legacy_app_path" >/dev/null 2>&1 || true
        rm -rf -- "$legacy_app_path"
        rmdir -- "$legacy_updater_root" 2>/dev/null || true
    fi

    echo "Registered ivlyrics-updater:// protocol for macOS."
)

register_linux() {
    local data_home="${XDG_DATA_HOME:-${HOME}/.local/share}"
    local updater_script="${APP_DIR}/updater/unix/ivlyrics-updater.sh"
    local desktop_dir="${data_home}/applications"
    local desktop_file="${desktop_dir}/ivlyrics-updater.desktop"

    if [[ ! -f "$updater_script" ]]; then
        echo "Updater script not found in app directory: $updater_script" >&2
        exit 1
    fi

    mkdir -p "$desktop_dir"
    chmod +x "$updater_script"

    cat > "$desktop_file" <<EOF
[Desktop Entry]
Type=Application
Name=ivLyrics Updater
Exec=/bin/bash "${updater_script}" %u
MimeType=x-scheme-handler/ivlyrics-updater;
Terminal=true
NoDisplay=true
EOF

    chmod +x "$desktop_file"

    if command -v xdg-mime >/dev/null 2>&1; then
        xdg-mime default ivlyrics-updater.desktop x-scheme-handler/ivlyrics-updater
    fi

    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$desktop_dir" >/dev/null 2>&1 || true
    fi

    echo "Registered ivlyrics-updater:// protocol for Linux."
}

case "$OS_NAME" in
    Darwin) remember_spicetify_state; register_macos ;;
    Linux) remember_spicetify_state; register_linux ;;
    *) echo "Unsupported OS for updater protocol: $OS_NAME" >&2; exit 1 ;;
esac
