# ivLyrics Update Helper

[한국어 설치 안내](../README.md) · [English installation guide](../README_EN.md)

The update helper lets the update button inside ivLyrics open the official installer on your computer. You do not need to run a separate app or keep a terminal open.

It is part of the PC installer, **not** the separate [ivLyrics Helper companion](https://github.com/ivLis-Studio/ivLyrics-helper) used for video and external integrations.

## Start here

1. Install ivLyrics using the command in the [main guide](../README_EN.md#get-started).
2. When an update is available, use the update controls in ivLyrics **About**.
3. Allow your operating system to open **ivLyrics Updater** if asked.
4. Wait for the installer to finish, then reopen Spotify if needed.

The helper fetches the published release through the official installer; it does not install unreleased commits from `main`.

## If the update button does not respond

Run the installation command from the main guide again. This also registers the helper if registration was missing. If you only installed by copying files manually, the protocol handler may not be registered yet.

If the installer was interrupted during an update, start it again. It restores the previous app files and Spicetify registration before downloading a release. If the new app was already applied, the installer keeps it and finishes registering the updater.

If GitHub cannot be reached, the helper can try a GitHub proxy. The installer can also use its configured download mirror. Do not replace these URLs with a source you do not trust.

An update log can help explain a failed download or installation:

| System | Log location |
| --- | --- |
| Windows | `%LOCALAPPDATA%\ivLyrics\Updater\updater.log` |
| macOS | `~/Library/Logs/ivLyrics/updater.log` |
| Linux | `$XDG_STATE_HOME/ivLyrics/updater.log`, or `~/.local/state/ivLyrics/updater.log` when unset |

Share the relevant error through [Discord](https://discord.gg/2fu36fUzdE) or a [GitHub issue](https://github.com/ivLis-Studio/ivLyrics/issues), with your OS and app versions. Review logs for personal information before posting.

## What it opens on your computer

The registered `ivlyrics-updater` protocol supports two fixed actions:

```text
ivlyrics-updater://update
ivlyrics-updater://open-log
```

The first runs the installer; the second opens the update log. It is not a general-purpose command runner. Only approve updater prompts when you intend to update ivLyrics or open its log.

To remove ivLyrics and the registered helper, use the [uninstall instructions](../README_EN.md#updates-and-removal). Removing only the app files may leave the protocol registration behind.

<details>
<summary>Installer and integration reference</summary>

The public install/update scripts are [install.ps1](install.ps1) and [install.sh](install.sh). Removal uses [uninstall.ps1](uninstall.ps1) and [uninstall.sh](uninstall.sh).

Registration and removal scripts:

- Windows: [register](windows/register-updater-protocol.ps1) / [unregister](windows/unregister-updater-protocol.ps1)
- macOS and Linux: [register](unix/register-updater-protocol.sh) / [unregister](unix/unregister-updater-protocol.sh)

Windows registers the protocol for the current user. macOS registers an updater app in the installed app's `updater/macos` folder. Linux registers a desktop entry with the protocol handler.

The public commands download their bootstrap scripts rather than relying on an already installed copy, so they also work for first-time installation and removal.

</details>
