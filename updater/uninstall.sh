#!/bin/bash

# ivLyrics Uninstaller for macOS/Linux

# --- Configuration ---
FINAL_APP_NAME="ivLyrics"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;90m'
NC='\033[0m'

# --- State ---
CURRENT_VERSION=""

# --- Helper Functions ---
print_logo() {
    echo ""
    echo -e "${RED}"
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
                          Y8b d88P     UNINSTALLER
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
        info)    color=$GRAY ;;
        *)       color=$GRAY ;;
    esac

    echo -e "             ${color}$message${NC}"
}

print_complete() {
    echo ""
    echo -e "${GREEN}"
    cat << "EOF"
    +--------------------------------------------------+
    |                                                  |
    |     ivLyrics has been uninstalled successfully!  |
    |                                                  |
    |     Thank you for using ivLyrics.                |
    |                                                  |
    +--------------------------------------------------+
EOF
    echo -e "${NC}"
}

print_not_installed() {
    echo ""
    echo -e "${YELLOW}"
    cat << "EOF"
    +--------------------------------------------------+
    |                                                  |
    |     ivLyrics is not installed on this system.    |
    |                                                  |
    +--------------------------------------------------+
EOF
    echo -e "${NC}"
}

resolve_custom_apps_dir() {
    if ! command -v spicetify >/dev/null 2>&1; then
        printf '%s/CustomApps\n' "${SPICETIFY_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/spicetify}"
        return
    fi

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
    local version_file="$TARGET_DIR/version.txt"
    if [ -f "$version_file" ]; then
        tr -d '\n\r' < "$version_file"
    fi
}

apply_spicetify() {
    local log_file="$INSTALL_LOCK/apply.log"
    spicetify apply 2>&1 | tee "$log_file"
    local -a pipeline_status=("${PIPESTATUS[@]}")
    [ "${pipeline_status[0]}" -eq 0 ] && [ "${pipeline_status[1]}" -eq 0 ] &&
        ! grep -Fq -e "Spotify version mismatch with Spicetify." \
            -e "Custom app \"$FINAL_APP_NAME\" not found" \
            -e "Custom app \"$FINAL_APP_NAME\" does not have index.js" "$log_file"
}

read_spicetify_apps() {
    if ! spicetify config custom_apps; then
        print_substep "Could not read the active Spicetify configuration." "error" >&2
        return 1
    fi
}

is_ivlyrics_registered() {
    local apps=${1//$'\r'/}
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

remove_spicetify_registration() {
    if ! command -v spicetify >/dev/null 2>&1; then
        print_substep "Spicetify not found, skipping..." "warning"
        return 0
    fi

    local configured_apps
    configured_apps=$(read_spicetify_apps) || return 1
    is_ivlyrics_registered "$configured_apps" || return 0

    RESTORE_REGISTRATION=true
    if ! set_ivlyrics_registration false; then
        print_substep "Could not remove ivLyrics from custom_apps." "error"
        return 1
    fi

    APPLY_STARTED=true
    if ! apply_spicetify; then
        print_substep "Spicetify could not apply removal. The installed files were kept." "error"
        return 1
    fi

    RESTORE_REGISTRATION=false
    print_substep "Spicetify applied" "success"
}

release_install_lock() {
    rm -f -- "$INSTALL_LOCK/apply.log"
    rmdir -- "$INSTALL_LOCK"
}

cleanup_uninstall() {
    local status=$?
    if [ "$RESTORE_REGISTRATION" = true ]; then
        if ! set_ivlyrics_registration true >/dev/null; then
            print_substep "Could not restore custom_apps. Check the Spicetify config." "warning" >&2
        elif [ "$APPLY_STARTED" = true ] && ! apply_spicetify >/dev/null; then
            print_substep "Run 'spicetify apply' to restore the Spotify patch." "warning" >&2
        fi
    fi
    release_install_lock
    return "$status"
}

unregister_updater_protocol() {
    local unregister_script="$TARGET_DIR/updater/unix/unregister-updater-protocol.sh"
    local os_name output data_home desktop_file updater_script
    os_name=$(uname -s)

    if [ -f "$unregister_script" ] &&
        { [ "$os_name" != Linux ] || [ -f "$TARGET_DIR/updater/unix/linux-desktop-entry.sh" ]; }; then
        if output=$(bash "$unregister_script" "$TARGET_DIR" 2>&1); then
            print_substep "${output:-Updater protocol unregistered}" "success"
        else
            print_substep "Updater protocol unregister failed" "warning"
        fi
        return
    fi

    if [ "$os_name" = Darwin ]; then
        rm -rf "$HOME/Library/Application Support/ivLyrics/Updater"
        print_substep "Updater helper files removed" "success"
        return
    fi

    data_home="${XDG_DATA_HOME:-$HOME/.local/share}"
    desktop_file="$data_home/applications/ivlyrics-updater.desktop"
    updater_script="$TARGET_DIR/updater/unix/ivlyrics-updater.sh"
    # Older installations wrote a literal Exec line and removed the shared
    # desktop file unconditionally. Check the path before removing it here.
    if [ -f "$desktop_file" ] &&
        { [[ "$updater_script" == *$'\n'* ]] || ! grep -Fxq -- "Exec=/bin/bash \"$updater_script\" %u" "$desktop_file"; }; then
        print_substep "The Linux updater is registered for another Spicetify profile." "success"
        return
    fi
    rm -f "$desktop_file"
    rm -rf "$data_home/ivLyrics/updater"
    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$data_home/applications" >/dev/null 2>&1 || true
    fi
    print_substep "Updater helper files removed" "success"
}

has_tty() {
    [ -r /dev/tty ] && [ -w /dev/tty ]
}

prompt_tty() {
    local prompt="$1"
    local reply=""

    if has_tty; then
        printf "%b" "$prompt" > /dev/tty
        read -r reply < /dev/tty
    else
        echo ""
        echo -e "  ${RED}Error: interactive terminal not available.${NC}" >&2
        exit 1
    fi

    printf "%s" "$reply"
}

confirm_yes() {
    local prompt="$1"
    local answer

    answer="$(prompt_tty "$prompt")"
    case "$answer" in
        y|Y) return 0 ;;
        *)   return 1 ;;
    esac
}

# --- Main Script ---
clear
print_logo

if ! CUSTOM_APPS_DIR=$(resolve_custom_apps_dir); then
    print_substep "Could not locate the active config with 'spicetify -c'." "error"
    exit 1
fi
TARGET_DIR="$CUSTOM_APPS_DIR/$FINAL_APP_NAME"

# Check if ivLyrics is installed
if [ ! -d "$TARGET_DIR" ]; then
    print_not_installed
    exit 0
fi

# Get current version
CURRENT_VERSION="$(get_current_version)"
if [ -n "$CURRENT_VERSION" ]; then
    echo -e "              ${GRAY}Installed version: $CURRENT_VERSION${NC}"
fi
echo ""

# Confirmation prompt
if ! confirm_yes "  ${YELLOW}Are you sure you want to uninstall ivLyrics? (y/N): ${NC}"; then
    echo ""
    echo -e "  ${GRAY}Uninstallation cancelled.${NC}"
    echo ""
    exit 0
fi

INSTALL_LOCK="$CUSTOM_APPS_DIR/.ivLyrics-install.lock"
if ! mkdir -- "$INSTALL_LOCK"; then
    print_substep "Another installation or removal may be in progress at $INSTALL_LOCK." "error"
    exit 1
fi
RESTORE_REGISTRATION=false
APPLY_STARTED=false
trap cleanup_uninstall EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# Step 1: Remove from Spicetify config
print_section "REMOVING CONFIGURATION"
print_step 1 3 "Updating Spicetify configuration..." "running"

remove_spicetify_registration || exit 1

# Step 2: Remove updater protocol
print_section "REMOVING UPDATER"
print_step 2 3 "Removing updater protocol..." "running"
unregister_updater_protocol

# Step 3: Delete files
print_section "REMOVING FILES"
print_step 3 3 "Deleting ivLyrics files..." "running"

if [ -d "$TARGET_DIR" ]; then
    if rm -rf "$TARGET_DIR"; then
        print_substep "Removed: $TARGET_DIR" "success"
    else
        print_substep "Failed to remove: $TARGET_DIR" "error"
        exit 1
    fi
else
    print_substep "Directory not found" "info"
fi

# Done with ivLyrics removal
release_install_lock
trap - EXIT HUP INT TERM
print_complete

# Ask about Spicetify removal
echo ""
if [ "$CUSTOM_APPS_DIR" = "$HOME/.config/spicetify/CustomApps" ] &&
    confirm_yes "  ${YELLOW}Would you also like to uninstall Spicetify completely? (y/N): ${NC}"; then
    echo ""
    print_section "REMOVING SPICETIFY"
    print_step 1 2 "Restoring Spotify to original state..." "running"

    if command -v spicetify >/dev/null 2>&1; then
        if spicetify restore >/dev/null 2>&1; then
            print_substep "Spotify restored" "success"
        else
            print_substep "Could not restore (may already be clean)" "warning"
        fi
    else
        print_substep "Spicetify not found, skipping restore..." "warning"
    fi

    print_step 2 2 "Removing Spicetify files..." "running"

    if [ -d "$HOME/.spicetify" ]; then
        if rm -rf "$HOME/.spicetify"; then
            print_substep "Removed: ~/.spicetify" "success"
        else
            print_substep "Failed to remove: ~/.spicetify" "error"
        fi
    else
        print_substep "~/.spicetify not found" "info"
    fi

    if [ -d "$HOME/.config/spicetify" ]; then
        if rm -rf "$HOME/.config/spicetify"; then
            print_substep "Removed: ~/.config/spicetify" "success"
        else
            print_substep "Failed to remove: ~/.config/spicetify" "error"
        fi
    else
        print_substep "~/.config/spicetify not found" "info"
    fi

    echo ""
    echo -e "${GREEN}"
    cat << "EOF"
    +--------------------------------------------------+
    |                                                  |
    |     Spicetify has been completely removed!       |
    |                                                  |
    +--------------------------------------------------+
EOF
    echo -e "${NC}"
fi

echo -e "  ${GRAY}GitHub: github.com/ivLis-Studio/ivLyrics${NC}"
echo ""
