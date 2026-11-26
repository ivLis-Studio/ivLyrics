#!/bin/bash

# ivLyrics Installer for macOS/Linux
# Beautiful CLI Edition

# --- Configuration ---
REPO="ivLis-Studio/ivLyrics"
FINAL_APP_NAME="ivLyrics"
PROXY_URL="https://ivlis.kr/ivLyrics/proxy.php"
MAX_RETRIES=3
METADATA_TIMEOUT=20
ARCHIVE_TIMEOUT=180
SCRIPT_VERSION="2.0.0"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# --- State ---
IS_UPDATE=false
CURRENT_VERSION=""
FORCE_INSTALL=false

# --- Command Line Arguments ---
print_help() {
    echo ""
    echo -e "${CYAN}ivLyrics Installer${NC}"
    echo ""
    echo "Usage: ./install.sh [options]"
    echo ""
    echo "Options:"
    echo "  -f, --force     Force reinstall even if already up to date"
    echo "  -h, --help      Show this help message"
    echo "  -v, --version   Show installer version"
    echo ""
    exit 0
}

print_version() {
    echo "ivLyrics Installer v${SCRIPT_VERSION}"
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -f|--force)
            FORCE_INSTALL=true
            shift
            ;;
        -h|--help)
            print_help
            ;;
        -v|--version)
            print_version
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# --- Helper Functions ---
print_logo() {
    echo ""
    echo -e "${CYAN}"
    cat << "EOF"
    d8b          888                        d8b
    Y8P          888                        Y8P
                 888
    888 888  888 888      888  888 888d888 888  .d8888b .d8888b
    888 888  888 888      888  888 888P"   888 d88P"    88K
    888 Y88  88P 888      888  888 888     888 888      "Y8888b.
    888  Y8bd8P  888      Y88b 888 888     888 Y88b.         X88
    888   Y88P   88888888  "Y88888 888     888  "Y8888P  88888P'
                               888
                          Y8b d88P     for Spotify
                           "Y88P"
EOF
    echo -e "${NC}"
}

print_section() {
    echo ""
    echo -e "  ${WHITE}>> $1${NC}"
    echo -e "  ${GRAY}--------------------------------------------------${NC}"
}

print_step() {
    local current=$1
    local total=$2
    local message=$3
    local status=$4

    local icon color
    case $status in
        running) icon="[*]"; color=$CYAN ;;
        success) icon="[+]"; color=$GREEN ;;
        warning) icon="[!]"; color=$YELLOW ;;
        error)   icon="[x]"; color=$RED ;;
        *)       icon="[ ]"; color=$WHITE ;;
    esac

    echo -e "     ${color}${icon}${NC} ${GRAY}($current/$total)${NC} ${WHITE}$message${NC}"
}

print_substep() {
    local message=$1
    local type=$2

    local color
    case $type in
        success) color=$GREEN ;;
        warning) color=$YELLOW ;;
        error)   color=$RED ;;
        *)       color=$GRAY ;;
    esac

    echo -e "             ${color}$message${NC}"
}

print_progress_bar() {
    local percent=$1
    local width=30
    local filled=$((width * percent / 100))
    local empty=$((width - filled))

    local bar="["
    for ((i=0; i<filled; i++)); do bar+="="; done
    for ((i=0; i<empty; i++)); do bar+="."; done
    bar+="]"

    printf "\r             %s %d%%" "$bar" "$percent"
}

print_success() {
    local version=$1
    local is_update=$2

    local action="installed"
    if [ "$is_update" = true ]; then
        action="updated"
    fi

    local success_message
    printf -v success_message '%-50s' "     ivLyrics has been $action successfully!"

    echo ""
    echo -e "${GREEN}"
    cat << EOF
    +--------------------------------------------------+
    |                                                  |
    |$success_message|
    |                                                  |
    |     Please restart Spotify to use ivLyrics.      |
    |                                                  |
    +--------------------------------------------------+
EOF
    echo -e "${NC}"
}

print_footer() {
    local version=$1
    echo ""
    echo -e "  ${GRAY}Version: $version${NC}"
    echo -e "  ${GRAY}GitHub:  github.com/ivLis-Studio/ivLyrics${NC}"
    echo ""
}

resolve_custom_apps_dir() {
    local config_path config_dir
    config_path=$(spicetify -c 2>/dev/null) || return 1
    case "$config_path" in
        */config-xpui.ini)
            config_dir=$(cd "${config_path%/*}" && pwd -P) || return 1
            printf '%s/CustomApps\n' "$config_dir"
            ;;
        *) return 1 ;;
    esac
}

get_current_version() {
    local version_file="$TARGET_DIR/$FINAL_APP_NAME/version.txt"
    if [ -f "$version_file" ]; then
        tr -d '\n\r' < "$version_file"
    fi
}

normalize_version() {
    printf '%s' "$1" | tr -d '[:space:]' | sed 's/^[vV]//'
}

is_release_version() {
    [[ "$1" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]
}

is_version_newer() {
    local IFS=. LC_ALL=C index installed remote
    local -a installed_parts remote_parts
    read -r -a installed_parts <<< "$1"
    read -r -a remote_parts <<< "$2"
    for index in 0 1 2; do
        installed="${installed_parts[index]}"
        remote="${remote_parts[index]}"
        if [ "${#installed}" -ne "${#remote}" ]; then
            [ "${#installed}" -gt "${#remote}" ]
            return
        fi
        if [ "$installed" != "$remote" ]; then
            [[ "$installed" > "$remote" ]]
            return
        fi
    done
    return 1
}

request_release() {
    local timeout="$1"
    shift
    curl --fail --silent --show-error --proto '=https' --tlsv1.2 \
        --connect-timeout 10 --max-time "$timeout" "$@"
}

check_network() {
    if request_release 5 "https://api.github.com" > /dev/null 2>&1; then
        return 0
    elif request_release 5 "$PROXY_URL" > /dev/null 2>&1; then
        return 0
    fi
    return 1
}

close_spotify() {
    if pgrep -x "Spotify" > /dev/null 2>&1 || pgrep -x "spotify" > /dev/null 2>&1; then
        print_substep "Spotify is running, closing..." "warning"
        pkill -x "Spotify" 2>/dev/null || true
        pkill -x "spotify" 2>/dev/null || true
        sleep 2
        if pgrep -x "Spotify" >/dev/null 2>&1 || pgrep -x "spotify" >/dev/null 2>&1; then
            print_substep "Could not close Spotify. Close it and retry." "error"
            return 1
        fi
        print_substep "Spotify closed" "success"
        return 0
    fi
    print_substep "Spotify is not running" "success"
    return 0
}

list_manifest_runtime_files() {
    # Spicetify's legacy manifests declare both lists, while a bundled release
    # only loads startup.js. Inspect them without a new installer dependency.
    awk '
        { manifest = manifest $0 " " }
        END {
            if (manifest !~ /"name"[[:space:]]*:[[:space:]]*"ivLyrics"/) exit 1
            while (match(manifest, /"subfiles(_extension)?"[[:space:]]*:[[:space:]]*/)) {
                manifest = substr(manifest, RSTART + RLENGTH)
                if (!match(manifest, /^\[[^]]*\]/)) exit 1
                entries = substr(manifest, 2, RLENGTH - 2)
                manifest = substr(manifest, RLENGTH + 1)
                if (entries ~ /^[[:space:]]*$/) continue
                count = split(entries, paths, ",")
                for (i = 1; i <= count; i++) {
                    path = paths[i]
                    gsub(/^[[:space:]]+|[[:space:]]+$/, "", path)
                    if (path !~ /^"[[:alnum:]_.\/-]+"$/) exit 1
                    print substr(path, 2, length(path) - 2)
                }
            }
        }
    ' "$1"
}

verify_installation() {
    local app_dir="$1"
    local file runtime_files
    for file in index.js manifest.json style.css version.txt; do
        [ -s "$app_dir/$file" ] || return 1
    done
    [ "$(normalize_version "$(cat "$app_dir/version.txt")")" = "$LATEST_VERSION_NORMALIZED" ] || return 1
    runtime_files=$(list_manifest_runtime_files "$app_dir/manifest.json") || return 1
    while IFS= read -r file; do
        [ -n "$file" ] || continue
        case "/$file/" in
            *//*|*/../*|*/./*) return 1 ;;
        esac
        [ -f "$app_dir/$file" ] && [ -s "$app_dir/$file" ] || return 1
    done <<< "$runtime_files"
}

preserve_macos_updater_bundle() {
    local target_dir="$1/updater/macos"
    local bundle_name="ivLyrics Updater.app"
    local previous_bundle="$FINAL_APP_DIR/updater/macos/$bundle_name"
    [ -d "$previous_bundle" ] && [ "$(uname -s)" = Darwin ] || return 0
    app_path_exists "$target_dir/$bundle_name" && return 0

    # The signed launcher points at the same updater script path after the swap.
    mkdir -p -- "$target_dir" &&
        /usr/bin/ditto "$previous_bundle" "$target_dir/$bundle_name"
}

register_updater_protocol() {
    local app_dir="$TARGET_DIR/$FINAL_APP_NAME"
    local register_script="$app_dir/updater/unix/register-updater-protocol.sh"
    local output

    if [ ! -f "$register_script" ]; then
        print_substep "Updater protocol script not found, skipping" "warning"
        return 0
    fi

    if output=$(bash "$register_script" "$app_dir" 2>&1); then
        print_substep "Updater protocol registered" "success"
        return 0
    fi

    [ -z "$output" ] || printf '%s\n' "$output" >&2
    print_substep "Updater protocol registration failed. ivLyrics is installed. Run the installer again to retry registration." "warning"
    return 1
}

retry_command() {
    local max_attempts=$1
    local delay=$2
    shift 2
    local attempt=1
    while [ $attempt -le $max_attempts ]; do
        if "$@"; then
            return 0
        fi

        if [ $attempt -lt $max_attempts ]; then
            print_substep "Attempt $attempt failed. Retrying in ${delay}s..." "warning"
            sleep $delay
        fi
        attempt=$((attempt + 1))
    done

    return 1
}

app_path_exists() {
    [ -e "$1" ] || [ -L "$1" ]
}

begin_installation() {
    local apps=$1 incoming=${2:-} had_app=false registered=false
    if app_path_exists "$FINAL_APP_DIR"; then had_app=true; fi
    if is_ivlyrics_registered "$apps"; then registered=true; fi
    mkdir -- "$INSTALL_TRANSACTION" || return 1
    if [ -n "$incoming" ]; then
        mv -- "$incoming" "$INSTALL_TRANSACTION/incoming" || return 1
    fi
    # Record the old state before changing either the app directory or custom_apps.
    printf '%s %s\n' "$had_app" "$registered" > "$INSTALL_TRANSACTION/before.next" &&
        mv -- "$INSTALL_TRANSACTION/before.next" "$INSTALL_TRANSACTION/before"
}

restore_previous_installation() {
    local restart=${1:-false} had_app registered current_apps
    local previous="$INSTALL_TRANSACTION/previous" rejected="$INSTALL_TRANSACTION/rejected"
    [ ! -L "$INSTALL_TRANSACTION" ] || return 1
    [ -d "$INSTALL_TRANSACTION" ] || return 0
    if [ ! -f "$INSTALL_TRANSACTION/before" ] || [ -f "$INSTALL_TRANSACTION/committed" ]; then
        rm -rf -- "$INSTALL_TRANSACTION" || return 1
        return 0
    fi
    read -r had_app registered < "$INSTALL_TRANSACTION/before" || return 1
    case "$had_app:$registered" in
        true:true|true:false|false:true|false:false) ;;
        *) return 1 ;;
    esac
    if [ "$restart" = true ] && [ -f "$INSTALL_TRANSACTION/apply-started" ]; then
        close_spotify || return 1
    fi
    if app_path_exists "$previous"; then
        if app_path_exists "$FINAL_APP_DIR"; then
            ! app_path_exists "$rejected" && mv -- "$FINAL_APP_DIR" "$rejected" || return 1
        fi
        mv -- "$previous" "$FINAL_APP_DIR" || return 1
    elif [ "$had_app" = true ]; then
        app_path_exists "$FINAL_APP_DIR" || return 1
    elif ! app_path_exists "$INSTALL_TRANSACTION/incoming" && app_path_exists "$FINAL_APP_DIR"; then
        ! app_path_exists "$rejected" && mv -- "$FINAL_APP_DIR" "$rejected" || return 1
    fi
    current_apps=$(read_spicetify_apps) || return 1
    if { [ "$registered" = true ] && ! is_ivlyrics_registered "$current_apps"; } ||
        { [ "$registered" = false ] && is_ivlyrics_registered "$current_apps"; }; then
        set_ivlyrics_registration "$registered" >/dev/null || return 1
    fi
    if [ -f "$INSTALL_TRANSACTION/apply-started" ]; then
        apply_spicetify >/dev/null || return 1
    fi
    rm -rf -- "$INSTALL_TRANSACTION"
}

lock_installer_guard() {
    local guard="$TARGET_DIR/.ivLyrics-install.guard" attempt
    local -a try_guard
    if command -v flock >/dev/null 2>&1; then
        try_guard=(flock -n 8)
    elif command -v perl >/dev/null 2>&1; then
        # macOS supplies Perl with flock(2). The shell keeps the open descriptor.
        try_guard=(perl -e '
            use Fcntl qw(LOCK_EX LOCK_NB);
            open my $guard, ">>&=8" or exit 1;
            exit(flock($guard, LOCK_EX | LOCK_NB) ? 0 : 1);
        ')
    else
        return 2
    fi

    exec 8>>"$guard" || return 1
    # A child may still hold the descriptor briefly after the installer exits.
    for attempt in 1 2 3 4 5 6 7 8 9 10; do
        "${try_guard[@]}" && return 0
        sleep 0.1
    done
    "${try_guard[@]}"
}

read_spicetify_apps() {
    if ! spicetify config custom_apps; then
        print_substep "Could not read the active Spicetify configuration." "error" >&2
        return 1
    fi
}

is_ivlyrics_registered() {
    local apps=${1//$'\r'/}
    # Spicetify may print one app per line instead of the INI pipe list.
    case "|${apps//$'\n'/|}|" in
        *"|$FINAL_APP_NAME|"*) return 0 ;;
        *) return 1 ;;
    esac
}

set_ivlyrics_registration() {
    local expected=$1 app_argument="$FINAL_APP_NAME" apps
    if [ "$expected" = false ]; then app_argument="$FINAL_APP_NAME-"; fi
    spicetify config custom_apps "$app_argument" || return 1
    apps=$(read_spicetify_apps) || return 1
    if is_ivlyrics_registered "$apps"; then
        [ "$expected" = true ]
    else
        [ "$expected" = false ]
    fi
}

apply_spicetify() {
    local log_file="$INSTALL_LOCK/apply.log"
    spicetify apply 2>&1 | tee "$log_file"
    local -a pipeline_status=("${PIPESTATUS[@]}")
    # Spicetify can skip a custom app and still report success.
    [ "${pipeline_status[0]}" -eq 0 ] && [ "${pipeline_status[1]}" -eq 0 ] &&
        ! grep -Fq -e "Spotify version mismatch with Spicetify." \
            -e "Custom app \"$FINAL_APP_NAME\" not found" \
            -e "Custom app \"$FINAL_APP_NAME\" does not have index.js" "$log_file"
}

apply_installation() {
    print_section "CONFIGURING"
    print_step 7 7 "Applying Spicetify configuration..." "running"
    if ! is_ivlyrics_registered "$1"; then
        if ! set_ivlyrics_registration true; then
            print_substep "Could not register ivLyrics in Spicetify." "error"
            return 1
        fi
    fi
    print_substep "Custom app registered" "success"

    : > "$INSTALL_TRANSACTION/apply-started" || return 1
    # On first setup, Spicetify can create its missing Spotify backup with auto.
    if ! apply_spicetify && ! { [ "$IS_UPDATE" = false ] && spicetify -n auto && apply_spicetify; }; then
        print_substep "Spicetify could not apply the update. Rolling back the installation." "error"
        return 1
    fi
    : > "$INSTALL_TRANSACTION/committed" || return 1
    print_substep "Spicetify applied" "success"
}

cleanup_installer_temp() {
    local status=$?
    if ! restore_previous_installation; then
        print_substep "Could not finish restoration. Recovery files: $INSTALL_TRANSACTION" "error" >&2
        return 1
    fi
    local download
    for download in "$INSTALL_LOCK"/download.*; do
        if [ -d "$download" ]; then rm -rf -- "$download" || return 1; fi
    done
    rm -f -- "$INSTALL_LOCK/apply.log" "$INSTALL_LOCK/installer-v1"
    rmdir -- "$INSTALL_LOCK"
    return "$status"
}
# --- Main Script ---
clear
print_logo

# Step 1: Check network connectivity
print_section "CHECKING REQUIREMENTS"
print_step 1 7 "Checking network connectivity..." "running"

NETWORK_AVAILABLE=true
if check_network; then
    print_substep "Network connected" "success"
else
    NETWORK_AVAILABLE=false
    print_substep "No network connection!" "warning"
fi

# Step 2: Check Spicetify
print_step 2 7 "Checking Spicetify installation..." "running"

if ! command -v spicetify &> /dev/null; then
    if [ "$NETWORK_AVAILABLE" = false ]; then exit 1; fi
    print_substep "Spicetify is not installed!" "warning"
    echo ""
    echo -e "  ${YELLOW}Spicetify is required to use ivLyrics.${NC}"
    echo ""
    echo -ne "  ${CYAN}Would you like to install Spicetify now? (Y/n): ${NC}"
    read -r install_choice

    if [ "$install_choice" = "" ] || [ "$install_choice" = "y" ] || [ "$install_choice" = "Y" ]; then
        echo ""
        print_substep "Installing Spicetify..." "info"
        print_substep "This may take a minute..." "info"
        echo ""

        # Download and run Spicetify installer
        if curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh; then
            # Refresh PATH
            export PATH="$PATH:$HOME/.spicetify"

            # Check again
            sleep 2
            if command -v spicetify &> /dev/null; then
                echo ""
                print_substep "Spicetify installed successfully!" "success"

            else
                echo ""
                print_substep "Spicetify installation may require a terminal restart." "warning"
                echo -e "  ${YELLOW}Please restart your terminal and run this script again.${NC}"
                echo ""
                exit 1
            fi
        else
            echo ""
            print_substep "Failed to install Spicetify automatically." "error"
            echo -e "  ${WHITE}Please install manually:${NC}"
            echo -e "  ${CYAN}  curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh${NC}"
            echo ""
            exit 1
        fi
    else
        echo ""
        echo -e "  ${GRAY}Installation cancelled. Spicetify is required.${NC}"
        echo ""
        exit 1
    fi
else
    print_substep "Spicetify found" "success"
fi

# Step 3: Resolve the active Spicetify profile
print_step 3 7 "Finding the active Spicetify app directory..." "running"
if ! TARGET_DIR=$(resolve_custom_apps_dir); then
    print_substep "Could not locate the active config with 'spicetify -c'." "error"
    exit 1
fi
print_substep "Using $TARGET_DIR" "success"

# Step 4: Check target directory
print_step 4 7 "Checking target directory..." "running"

if [ ! -d "$TARGET_DIR" ]; then
    print_substep "Creating directory..." "info"
    mkdir -p "$TARGET_DIR"
    if [ $? -ne 0 ]; then
        print_substep "Failed to create directory" "error"
        exit 1
    fi
fi
print_substep "Directory ready" "success"

INSTALL_LOCK="$TARGET_DIR/.ivLyrics-install.lock"
INSTALL_TRANSACTION="$INSTALL_LOCK/transaction"
FINAL_APP_DIR="$TARGET_DIR/$FINAL_APP_NAME"
lock_installer_guard
guard_status=$?
if [ "$guard_status" -ne 0 ] && [ "$guard_status" -ne 2 ]; then
    print_substep "Another installation or removal may be in progress at $INSTALL_LOCK." "error"
    exit 1
fi
if ! mkdir -- "$INSTALL_LOCK"; then
    if [ "$guard_status" -ne 0 ] || [ -L "$INSTALL_LOCK" ] || [ ! -f "$INSTALL_LOCK/installer-v1" ]; then
        print_substep "Another installation or removal may be in progress at $INSTALL_LOCK." "error"
        exit 1
    fi
    if ! restore_previous_installation true; then
        print_substep "Could not recover the interrupted installation. Recovery files: $INSTALL_TRANSACTION" "error"
        exit 1
    fi
    print_substep "Recovered interrupted ivLyrics installation" "success"
fi
: > "$INSTALL_LOCK/installer-v1" || exit 1
trap cleanup_installer_temp EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
if [ "$NETWORK_AVAILABLE" = false ]; then exit 1; fi

CURRENT_VERSION=$(get_current_version)
if [ -n "$CURRENT_VERSION" ]; then
    IS_UPDATE=true
    echo -e "                    ${YELLOW}[ UPDATING ]${NC}"
    echo -e "              ${GRAY}Current version: $CURRENT_VERSION${NC}"
else
    echo -e "                    ${GREEN}[ INSTALLING ]${NC}"
fi
echo ""

# Step 5: Fetch version info
print_section "DOWNLOADING"
print_step 5 7 "Fetching latest version..." "running"

DOWNLOAD_URL=""
VERSION_TAG="unknown"
EXPECTED_SHA256=""
CHECKSUM_URL=""

read_release_string_fields() {
    grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | cut -d'"' -f4
}

fetch_from_github() {
    local response asset_urls
    response=$(request_release "$METADATA_TIMEOUT" "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null) || return 1
    # Extract complete fields before testing asset names, even when all assets
    # share a line or the JSON separates a key and value across lines.
    response=$(tr -d '\r\n' <<< "$response")
    asset_urls=$(read_release_string_fields browser_download_url <<< "$response")
    DOWNLOAD_URL=$(awk '/\/ivLyrics\.zip$/ { print; exit }' <<< "$asset_urls")
    CHECKSUM_URL=$(awk '/\/ivLyrics\.zip\.sha256$/ { print; exit }' <<< "$asset_urls")
    VERSION_TAG=$(read_release_string_fields tag_name <<< "$response" | head -n 1)

    [ -n "$DOWNLOAD_URL" ] && [ -n "$CHECKSUM_URL" ] &&
        is_release_version "$(normalize_version "$VERSION_TAG")"
}

fetch_from_proxy() {
    local expected_version="${1:-}" expected_hash="${2:-}" response tag hash version
    response=$(request_release "$METADATA_TIMEOUT" "${PROXY_URL}?action=version" 2>/dev/null) || return 1
    grep -q '"zip_available":[[:space:]]*true' <<< "$response" || return 1
    tag=$(grep -o '"tag_name":[[:space:]]*"[^"]*"' <<< "$response" | head -n 1 | cut -d'"' -f4)
    hash=$(grep -o '"sha256":[[:space:]]*"[A-Fa-f0-9]\{64\}"' <<< "$response" | head -n 1 | cut -d'"' -f4 | tr '[:upper:]' '[:lower:]')
    version=$(normalize_version "$tag")
    is_release_version "$version" && [ -n "$hash" ] || return 1
    if [ -n "$expected_version" ] && [ "$expected_version" != "$version" ]; then
        print_substep "Proxy offers $version, but GitHub selected $expected_version." "warning"
        return 1
    fi
    if [ -n "$expected_hash" ] && [ "$expected_hash" != "$hash" ]; then
        print_substep "Proxy checksum does not match the GitHub release." "warning"
        return 1
    fi

    VERSION_TAG="$tag"
    EXPECTED_SHA256="$hash"
    DOWNLOAD_URL="${PROXY_URL}?action=download"
    CHECKSUM_URL=""
}

# Try GitHub first with retries
if retry_command $MAX_RETRIES 2 "fetch_from_github"; then
    print_substep "Found version: $VERSION_TAG (via GitHub)" "success"
else
    print_substep "GitHub unavailable, trying proxy..." "warning"

    if retry_command $MAX_RETRIES 2 "fetch_from_proxy"; then
        print_substep "Found version: $VERSION_TAG (via proxy)" "success"
    else
        print_step 5 7 "Failed to fetch version info" "error"
        print_substep "Could not connect after $MAX_RETRIES attempts" "error"
        exit 1
    fi
fi

# Check if already up to date
CURRENT_VERSION_NORMALIZED=$(normalize_version "$CURRENT_VERSION")
LATEST_VERSION_NORMALIZED=$(normalize_version "$VERSION_TAG")
if [ "$FORCE_INSTALL" = false ] && is_release_version "$CURRENT_VERSION_NORMALIZED" &&
    is_version_newer "$CURRENT_VERSION_NORMALIZED" "$LATEST_VERSION_NORMALIZED"; then
    print_substep "Installed version $CURRENT_VERSION_NORMALIZED is newer than the available release $LATEST_VERSION_NORMALIZED." "info"
    exit 0
fi

if [ "$IS_UPDATE" = true ] && [ "$CURRENT_VERSION_NORMALIZED" = "$LATEST_VERSION_NORMALIZED" ] &&
    [ "$FORCE_INSTALL" = false ] && verify_installation "$TARGET_DIR/$FINAL_APP_NAME"; then
    previous_custom_apps=$(read_spicetify_apps) || exit 1
    echo ""
    if is_ivlyrics_registered "$previous_custom_apps"; then
        echo -e "  ${GREEN}Already up to date! (v$LATEST_VERSION_NORMALIZED)${NC}"
        echo -e "  ${GRAY}Use --force to reinstall anyway.${NC}"
    else
        close_spotify || exit 1
        begin_installation "$previous_custom_apps" || exit 1
        apply_installation "$previous_custom_apps" || exit 1
    fi
    echo ""
    print_substep "Checking updater protocol..." "info"
    register_updater_protocol || exit 1
    echo ""
    exit 0
fi

# Step 6: Download and extract
print_step 6 7 "Downloading ivLyrics..." "running"

# Stage on the same filesystem as the installed app, so replacing it is a rename.
TEMP_ROOT=$(mktemp -d "$INSTALL_LOCK/download.XXXXXX") || {
    print_substep "Could not create a secure temporary directory" "error"
    exit 1
}
TEMP_ZIP="$TEMP_ROOT/ivLyrics.zip"
TEMP_EXTRACT="$TEMP_ROOT/extract"
calculate_sha256() {
    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | awk '{print $1}'
    elif command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    else
        return 1
    fi
}

read_github_checksum() {
    local response hash
    response=$(request_release "$METADATA_TIMEOUT" --location "$CHECKSUM_URL" 2>/dev/null) || return 1
    hash=$(awk 'NR == 1 {print tolower($1)}' <<< "$response")
    case "$hash" in
        ''|*[!0-9a-f]*) return 1 ;;
    esac
    [ "${#hash}" -eq 64 ] || return 1
    EXPECTED_SHA256="$hash"
}

download_file() {
    local actual_sha256
    rm -f -- "$TEMP_ZIP"
    request_release "$ARCHIVE_TIMEOUT" --location "$DOWNLOAD_URL" -o "$TEMP_ZIP" || return 1
    [ -f "$TEMP_ZIP" ] && [ "$(wc -c < "$TEMP_ZIP")" -ge 1000 ] || return 1
    actual_sha256=$(calculate_sha256 "$TEMP_ZIP") || return 1
    [ "$actual_sha256" = "$EXPECTED_SHA256" ]
}

# Progress simulation + download
for i in 0 20 40 60; do
    print_progress_bar $i
    sleep 0.05
done

download_release_archive() {
    if [ -z "$CHECKSUM_URL" ]; then
        retry_command "$MAX_RETRIES" 2 download_file
        return
    fi
    if retry_command "$MAX_RETRIES" 2 read_github_checksum && retry_command "$MAX_RETRIES" 2 download_file; then
        return 0
    fi

    print_substep "GitHub archive download failed, trying proxy..." "warning"
    retry_command "$MAX_RETRIES" 2 fetch_from_proxy "$LATEST_VERSION_NORMALIZED" "$EXPECTED_SHA256" || return 1
    print_substep "Found version: $VERSION_TAG (via proxy)" "success"
    retry_command "$MAX_RETRIES" 2 download_file
}

if ! download_release_archive; then
    echo ""
    print_step 6 7 "Download failed" "error"
    exit 1
fi

print_progress_bar 100
echo ""
print_substep "Download complete" "success"

# Extract
print_substep "Extracting files..." "info"

mkdir -p "$TEMP_EXTRACT"

unzip -q -o "$TEMP_ZIP" -d "$TEMP_EXTRACT"
if [ $? -ne 0 ]; then
    print_substep "Extraction failed" "error"
    exit 1
fi

# Prefer the release folder, then accept the layout used by earlier archives.
EXTRACTED_DIR="$TEMP_EXTRACT/$FINAL_APP_NAME"
if [ ! -d "$EXTRACTED_DIR" ]; then
    EXTRACTED_DIR=$(find "$TEMP_EXTRACT" -maxdepth 1 -type d -name "ivLis-Studio-ivLyrics-*" -print -quit)
fi
if [ -z "$EXTRACTED_DIR" ]; then
    EXTRACTED_DIR=$(find "$TEMP_EXTRACT" -maxdepth 1 -mindepth 1 -type d -print -quit)
fi

if [ -z "$EXTRACTED_DIR" ]; then
    print_substep "Could not find extracted folder" "error"
    exit 1
fi

print_substep "Verifying extracted release..." "info"
if ! verify_installation "$EXTRACTED_DIR"; then
    print_substep "The archive is missing required files or its version does not match $VERSION_TAG." "error"
    exit 1
fi
print_substep "Extracted release verified" "success"

if ! preserve_macos_updater_bundle "$EXTRACTED_DIR"; then
    print_substep "Could not preserve the existing macOS updater. The installation is unchanged." "error"
    exit 1
fi

previous_custom_apps=$(read_spicetify_apps) || exit 1
close_spotify || exit 1

begin_installation "$previous_custom_apps" "$EXTRACTED_DIR" || exit 1
if app_path_exists "$FINAL_APP_DIR"; then
    mv -- "$FINAL_APP_DIR" "$INSTALL_TRANSACTION/previous" || exit 1
fi
mv -- "$INSTALL_TRANSACTION/incoming" "$FINAL_APP_DIR" || exit 1

# Step 7: Apply Spicetify
apply_installation "$previous_custom_apps" || exit 1

print_substep "Registering updater protocol..." "info"
register_updater_protocol || exit 1

# Done!
print_success "$VERSION_TAG" "$IS_UPDATE"
print_footer "$VERSION_TAG"
