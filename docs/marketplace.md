<img width="2208" height="512" alt="ivLyrics — Enjoy music in your language" src="https://github.com/ivLis-Studio/ivLyrics/blob/main/docs/assets/preview_readme_en.png?raw=true" />

# ivLyrics

Read the lyrics. Sing along. Understand the song.

ivLyrics brings original lyrics, pronunciation, and translation together inside Spotify on your PC. Keep a simple lyrics screen, switch to fullscreen or a vinyl layout, or add an album-art or video background.

[Full guide](https://github.com/ivLis-Studio/ivLyrics#readme) · [한국어 안내](https://github.com/ivLis-Studio/ivLyrics/blob/main/README.md) · [English guide](https://github.com/ivLis-Studio/ivLyrics/blob/main/README_EN.md) · [Get help](https://discord.gg/2fu36fUzdE)

https://github.com/user-attachments/assets/8375c5af-ae42-4f32-b138-47a8c15fa1e7

## What you can do

- Follow synced lyrics and karaoke highlighting when timing is available.
- Display original lyrics, pronunciation, and translation in the combination you prefer.
- Add Japanese furigana and adjust each text layer's font, size, and color.
- Choose fullscreen, TV, and vinyl layouts, backgrounds, and motion effects.
- Adjust a song's lyric or video timing and use community sync data.
- Explore optional cultural explanations, Research, and Learning features with a compatible AI provider.

Lyrics, timing, video, and AI capabilities vary by song and provider. AI output can be incorrect.

## Install on your PC

You need the **Spotify desktop app and [Spicetify](https://spicetify.app/docs/getting-started)** on Windows, macOS, or Linux. Restart your terminal if you just installed Spicetify.

On Linux, also prepare Bash, `curl`, `unzip`, and either `sha256sum` or `shasum` for file verification.

**Windows — PowerShell**

```powershell
iwr -useb https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.ps1 | iex
```

**macOS / Linux — Terminal**

```bash
curl -fsSL https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.sh | bash
```

These commands run the official repository's installer. Inspect the [Windows](https://github.com/ivLis-Studio/ivLyrics/blob/main/updater/install.ps1) or [macOS / Linux](https://github.com/ivLis-Studio/ivLyrics/blob/main/updater/install.sh) script first if you prefer. Use the same command to update. For a manual install, download `ivLyrics.zip` from the [latest release](https://github.com/ivLis-Studio/ivLyrics/releases/latest) and follow the [full guide](https://github.com/ivLis-Studio/ivLyrics/blob/main/README_EN.md#get-started).

## Play your first song

1. Reopen Spotify and select **ivLyrics** in the sidebar.
2. Follow the first-run language, appearance, and playback guide.
3. Play a song. Open settings from the on-screen menu to make the text and background comfortable.

You do not need to configure every option before listening. Settings search helps you find a specific control later.

## Add translation or pronunciation

Choose your output language in **General → Language**. Then open **AI Providers**, configure a connection if required, and enable the capabilities you want.

**Translation and pronunciation are separate.** Google Translate and Bing Translate support translation only; pronunciation requires a compatible AI provider. You do not need a Gemini key for every feature.

**Local AI** is an optional, translation-only provider that runs on your device. It is off by default and requires a large model download and enough memory. Move it above other translation providers to try it first, or disable online translation providers for local-only translation processing. Online providers can charge for usage and receive the text needed to process your request; check their limits and terms before enabling them.

## Which other apps do I need?

For the basic PC lyrics screen, no companion app is required.

- [Android](https://github.com/ivLis-Studio/ivLyrics-Android) and [iOS](https://github.com/ivLis-Studio/ivLyrics-IOS) have separate installation guides; the PC commands above are not for phones.
- [Overlay](https://github.com/ivLis-Studio/ivLyrics-overlay) keeps lyrics above other desktop windows.
- [Helper](https://github.com/ivLis-Studio/ivLyrics-helper) is optional for video playback assistance and external integrations.

## Need help or want to remove it?

Check enabled **Lyrics Providers** if a song has no lyrics. For AI problems, check the provider key, model, supported capabilities, and usage limits. Try another song to see whether the problem is song-specific.

The [full guide](https://github.com/ivLis-Studio/ivLyrics/blob/main/README_EN.md) includes updates, uninstall commands, and troubleshooting. Export settings before resetting or removing the app.

Report issues on [Discord](https://discord.gg/2fu36fUzdE) or [GitHub](https://github.com/ivLis-Studio/ivLyrics/issues) with your versions, song link, and reproduction steps. Remove API keys and account tokens from screenshots and logs.

## Support and credits

ivLyrics is a non-profit open-source project developed and maintained by an individual. Your support goes toward development and server costs.

<a href="https://buymeacoffee.com/ivlis"><img height="68" alt="Support ivLyrics on Buy Me a Coffee" src="https://github.com/user-attachments/assets/3e021039-c587-47e8-b18c-f129828ebbb3" /></a>
<a href="https://fairy.hada.io/@ivlyrics"><img height="68" alt="Support ivLyrics on Fairy (Korea only)" src="https://github.com/user-attachments/assets/7eba4031-d6b5-49de-b546-0e8413d92df0" /></a>

Fairy is a support platform available only in Korea. If you are outside Korea, please use Buy Me a Coffee.

[Original Lyrics-Plus project](https://github.com/spicetify/cli/tree/main/CustomApps/lyrics-plus) · [License](https://github.com/ivLis-Studio/ivLyrics/blob/main/LICENSE)

## License and open-source notices

The ivLyrics source code is licensed under the [GNU LGPL v2.1](https://github.com/ivLis-Studio/ivLyrics/blob/main/LICENSE). See the README for [third-party notices and the ivLyrics server access policy](https://github.com/ivLis-Studio/ivLyrics/blob/main/README_EN.md#license-and-open-source-notices).

## Unofficial project, copyright, and terms

> [!IMPORTANT]
> ⚠️ Disclaimer
>
> **Unofficial Project Notice**
>
> This project and its contributors are not affiliated with, authorized by, endorsed by, or officially connected to Spotify or any of its affiliates or subsidiaries. **This project is an independent, unofficial, non-profit extension created by a volunteer team to provide a desktop user experience.**
>
> **Trademark Notice**
>
> The name "Spotify," along with related names, marks, emblems, and images, are registered trademarks of their respective owners. These trademarks are used strictly for identification and reference purposes and do not imply any association with the trademark holders. This project does not intend to infringe upon those trademarks or cause harm to their owners.
>
> **Limitation of Liability**
>
> This application (extension) is provided "AS IS," and all risks arising from its use are the sole responsibility of the user. The developers and contributors shall not be held liable for any claims, damages, or legal consequences arising from the use of this software or any related transactions. All consequences resulting from the use of this software are entirely the user's responsibility.
>
> **Copyright and Terms Compliance**
>
> This project does not claim ownership of any lyrics, translations, videos, or other third-party content, nor does it grant licenses to such content. Users are solely responsible for reviewing and complying with all applicable copyright laws, platform policies, API terms of service, and local regulations. Any responsibility for storing, reproducing, distributing, transmitting, or commercially using content through this project rests entirely with the user.
