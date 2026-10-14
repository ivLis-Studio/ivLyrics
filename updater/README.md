# ivLyrics updater protocol

ivLyrics can register a safe local protocol handler:

```text
ivlyrics-updater://update
ivlyrics-updater://open-log
```

The handler ignores external command text and only allows the fixed actions above. The `update` action downloads and runs the official installer:

- Windows: `https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.ps1`
- macOS/Linux: `https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.sh`

The install and uninstall bootstrap scripts are maintained in this directory:

```text
updater/install.ps1
updater/install.sh
updater/uninstall.ps1
updater/uninstall.sh
```

Public install, update, and uninstall commands intentionally download these scripts from GitHub Raw instead of executing the copies inside the installed app. This keeps first-time installation available before the app directory exists and lets the uninstaller remove the installed `ivLyrics` directory without depending on a script running from inside that directory.

## Platform handlers

- Windows: registers `ivlyrics-updater` under `HKCU:\Software\Classes`.
  It derives the active config directory from the config file reported by `spicetify -c`. If the installer directory differs, registration creates a directory junction from Spicetify's configured `CustomApps\ivLyrics` path to the installed app. An existing real ivLyrics directory is synchronized without deleting destination-only files, and the uninstaller records enough state to clean either mode safely.
- macOS: creates `~/.config/spicetify/CustomApps/ivLyrics/updater/macos/ivLyrics Updater.app` and registers `CFBundleURLTypes`. The app runs the updater in the background instead of automating Terminal.
- Linux: creates `~/.local/share/applications/ivlyrics-updater.desktop` and points it to `~/.config/spicetify/CustomApps/ivLyrics/updater/unix/ivlyrics-updater.sh` through `xdg-mime`.

## Installer hooks

After the app folder has been copied to the Spicetify CustomApps directory, installers can register the updater with:

```text
Windows: updater/windows/register-updater-protocol.ps1
macOS/Linux: updater/unix/register-updater-protocol.sh
```

Uninstallers can remove the protocol with:

```text
Windows: updater/windows/unregister-updater-protocol.ps1
macOS/Linux: updater/unix/unregister-updater-protocol.sh
```

## Windows local AI WebGPU runtime

The Windows installer also checks the active Spicetify configuration's
`[Setting] spotify_path` for the DirectX shader compiler runtime. This check runs
after closing Spotify and before the already-up-to-date check, so rerunning the
installer can repair missing dependencies without reinstalling ivLyrics.

- Source: Microsoft's official [DX Compiler release v1.9.2609](https://github.com/microsoft/DirectXShaderCompiler/releases/tag/v1.9.2609),
  Windows asset `dxc_2026_09_29.zip`.
- Pinned SHA-256: `ad31b1fc8443175d204f77a611fdb3ef2ec42759bdc2f1167368de24a4a7e7f1`.
  Update the version, URL, and digest together after validating a new release.
- Select `bin/x64`, `bin/x86`, or `bin/arm64` using the PE machine type of
  `Spotify.exe`, including x64 Spotify running on an ARM64 Windows device.
- Download only when at least one DLL is missing. Verify the archive before
  extraction and both DLL architectures before copying. Existing files are never
  overwritten; an incompatible or linked destination produces a warning.
- Retain the archive's `LICENCE-MIT.txt`, `LICENSE-LLVM.txt`, and `LICENSE-MS.txt`
  in `ivLyrics-DXC-Licenses/<version>` alongside Spotify.
- Copy only missing `dxil.dll` and `dxcompiler.dll` files next to `Spotify.exe`.
  Stage each copy before an atomic rename so failed copies leave no partial DLLs.
  If installation fails, remove only DLLs created during that attempt. Download,
  permission, or unsupported-architecture failures do not block ivLyrics installation.
- Relaunch Spotify after repair so its GPU process loads the dependencies.
  When the app is already up to date, reopen Spotify if it was running or DLLs
  were installed. Spotify updates that remove the DLLs can be repaired by
  rerunning the same installer.

These DLLs enable the Direct3D WebGPU backend to create a device; GPU/driver
support is still required. This does not change Firefox's separate WebAssembly
compatibility path.
