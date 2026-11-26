linux_updater_exec_line() {
    local value="$1"
    # Quote for Exec first, then escape those backslashes for the desktop file.
    value=${value//\\/\\\\}
    value=${value//\"/\\\"}
    value=${value//\$/\\\$}
    value=${value//\`/\\\`}
    value=${value//\\/\\\\}
    value=${value//%/%%}
    value=${value//$'\t'/\\t}
    value=${value//$'\n'/\\n}
    value=${value//$'\r'/\\r}
    printf 'Exec=/bin/bash "%s" %%u' "$value"
}

lock_linux_updater_desktop() {
    if command -v flock >/dev/null 2>&1; then
        exec 9>>"$1/.ivlyrics-updater.lock" && flock -w 10 9
    fi
}
