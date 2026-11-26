<img width="2208" height="512" alt="ivLyrics — Enjoy music in your language" src="https://github.com/ivLis-Studio/ivLyrics/blob/main/preview_readme_en.png?raw=true" />

[한국어](README.md) · [English](README_EN.md)

# ivLyrics

Enjoy music in your language.

Read lyrics, follow the pronunciation, and understand the meaning inside Spotify on your PC. Choose the combination of original lyrics, pronunciation, and translation that works for you, then make the screen your own—from a quiet lyrics view to video backgrounds and a vinyl player.

[Get started](#get-started) · [Latest release](https://github.com/ivLis-Studio/ivLyrics/releases/latest) · [Get help](https://discord.gg/2fu36fUzdE)

![ivLyrics lyrics view](https://github.com/user-attachments/assets/0596a769-76aa-49c5-970c-85897fe8d260)

## Make more of the songs you love

- **Sing along in another language.** Show pronunciation guides and Japanese furigana.
- **Understand what you are hearing.** Read a translation alongside the lyrics, with optional cultural context, Research, and Learning features through compatible AI providers.
- **Set the mood.** Choose fullscreen, TV, or vinyl layouts, album artwork, and video backgrounds.
- **Make the text comfortable.** Adjust fonts, sizes, and colors separately for the original, pronunciation, and translation layers, and tune the screen's motion effects.
- **Fix lyrics that run early or late.** Adjust a song's timing or use community sync data.

Lyrics and timing availability depend on the song and provider. AI-generated translations, pronunciation, and explanations can be incorrect.

## Choose the right ivLyrics

This guide is for **Spotify desktop on Windows, macOS, and Linux**. Use the dedicated apps on mobile.

| Where or how you want to listen | What to use |
| --- | --- |
| Lyrics inside Spotify on your PC | **ivLyrics** — install below |
| Lyrics on Android | [ivLyrics Android](https://github.com/ivLis-Studio/ivLyrics-Android) |
| Lyrics on iPhone or iPad | [ivLyrics iOS](https://github.com/ivLis-Studio/ivLyrics-IOS) |
| Lyrics floating above other windows | [Overlay](https://github.com/ivLis-Studio/ivLyrics-overlay) — optional companion |
| Video playback assistance or external app integrations | [Helper](https://github.com/ivLis-Studio/ivLyrics-helper) — only for the features you need |

You do not need to install every companion or run a server to use the basic lyrics screen.

## Get started

### 1. Prepare Spotify and Spicetify

You need the Spotify desktop app and [Spicetify](https://spicetify.app/docs/getting-started). Check that Spotify can play music before continuing.

On Linux, also install Bash, `curl`, `unzip`, and either `sha256sum` or `shasum` for file verification.

If you just installed Spicetify, close and reopen PowerShell or your terminal. These commands are not for the web player or mobile apps.

### 2. Install ivLyrics

Run the command for your operating system. The same command also updates an existing installation.

**Windows — PowerShell**

```powershell
iwr -useb https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.ps1 | iex
```

**macOS / Linux — Terminal**

```bash
curl -fsSL https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.sh | bash
```

These commands download and run the installer from the official repository. You can inspect the [Windows script](updater/install.ps1) or [macOS / Linux script](updater/install.sh) first.

<details>
<summary>Prefer to install manually?</summary>

1. Open the [latest release](https://github.com/ivLis-Studio/ivLyrics/releases/latest) and download **ivLyrics.zip** from **Assets**.
2. Extract it and name the folder containing `index.js` and `manifest.json` directly `ivLyrics`. Avoid nesting one `ivLyrics` folder inside another.
3. Copy it into Spicetify's `CustomApps` folder.
   - Windows: run `spicetify -c` and use the `CustomApps` folder beside the reported `config-xpui.ini`.
   - macOS / Linux default: `~/.config/spicetify/CustomApps`
4. Run these commands and reopen Spotify.

```shell
spicetify config custom_apps ivLyrics
spicetify apply
```

For future manual updates, download and replace the app from a new release. See [Spicetify's custom app guide](https://spicetify.app/docs/customization/custom-apps) for folder details.

</details>

### 3. Play your first song

Reopen Spotify and select **ivLyrics** in the sidebar. Follow the first-run guide to choose your language, appearance, and playback preferences, then play a song. You can change these choices later.

Move your mouse over the screen to open its menu and enter settings. Use **settings search** if you cannot find an option.

## Turn on translation and pronunciation

Translation and pronunciation are separate features. You can read just the translation, or display pronunciation to help you sing along.

1. In **General → Language**, choose the app language and the language used for pronunciation and translation.
2. In **AI Providers → Connections**, enter any API key, model, or other details required by your chosen provider.
3. Enable the provider and the **Translation / Pronunciation** capabilities you want. Supported capabilities vary by provider.
4. Choose translation and pronunciation in the current song's conversion settings. If an existing result remains after a change, regenerate that result.

Google Translate and Bing Translate are **translation-only**. Pronunciation requires a provider that supports it. A Gemini key is not required for every feature.

### Prefer Local AI instead of an external translation API?

In **AI Providers → Local AI**, download a model, enable the provider, and move it above other translation providers if you want it tried first. It is off by default. Choose **Local Light, Local Medium, or Local High**.

- Local AI supports **translation only** and does not need an API key.
- The model download is roughly 1–2GB, with additional memory needed while running. Try a lighter quality if it is slow or memory is limited.
- Translation runs on your device. Downloading the engine and model still requires internet access; other app functions, such as fetching lyrics, are not made offline.
- Providers are tried from the top of the list, so an online provider placed earlier can receive the request first; failures can fall through to later providers. Disable other translation providers if you want translation processing to stay on your device.

## Make it comfortable

| What you want to change | Where to look |
| --- | --- |
| Fonts, sizes, and spacing for each text layer | Appearance → Lyric layers |
| Artwork, video, background brightness, and motion | Appearance |
| Fullscreen, TV, and vinyl layouts | Fullscreen |
| Lyrics in the right-hand sidebar | Panel Lyrics |
| Lyric sources and lookup order | Lyrics Providers |
| Effects that feel too demanding | Performance |

You do not need to configure everything at once. Start with the defaults, listen to a few songs, and adjust what gets in your way.

## Updates and removal

Use the update controls in **About**, or run the installation command again. Automatic installation also registers a local updater for the in-app update button. If the button does not respond, rerun the installer. [Updater help](updater/README.md)

To keep a backup, search settings for **Export Settings** before making major changes. Check exported files for sensitive information before sharing them.

<details>
<summary>Uninstall ivLyrics</summary>

**Windows — PowerShell**

```powershell
iwr -useb https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/uninstall.ps1 | iex
```

**macOS / Linux — Terminal**

```bash
curl -fsSL https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/uninstall.sh | bash
```

Read the confirmation prompts before continuing. If you are also asked to remove Spicetify completely, decline if you want to keep other themes and extensions.

</details>

## When something does not work

| What you see | What to check first |
| --- | --- |
| ivLyrics is missing from the sidebar | Reopen Spotify and run `spicetify apply`. For a manual install, check for a nested app folder. |
| No lyrics appear | Try another song, then check enabled sources and their order in **Lyrics Providers**. Not every song has lyrics available. |
| Translation works, but pronunciation does not | Enable **Pronunciation** for a compatible provider. Google and Bing translation alone cannot generate it. |
| Results are in the wrong language | Check the pronunciation / translation language in **General → Language**, then regenerate the current result. |
| An API request fails | Check the key, selected model, provider quota, and billing limits, then run a connection test. |
| Lyrics or video are out of sync | Adjust the current song's lyric and video offsets separately. |
| Video fails or the view stutters | Compare with an album-art background and reduce video, blur, or motion effects. If using Helper, check that it is running and connected. |
| Spotify stops working after an update | Follow [Spicetify's official guide](https://spicetify.app/docs/getting-started) to update Spicetify and apply it again. |

For NVIDIA NIM, check the default Base URL, `https://integrate.api.nvidia.com/v1`, and choose a chat model. A listed model can still return 404 for chat requests; try another model and test the connection.

Treat resets and reinstalls as a last resort. Export settings first, then contact us with the details below.

## Help, costs, and data

Use the bug-report or feature-request channels on [Discord](https://discord.gg/2fu36fUzdE), or open a [GitHub issue](https://github.com/ivLis-Studio/ivLyrics/issues).

Include:

- Your OS and Spotify, Spicetify, and ivLyrics versions.
- The song link and steps that reproduce the issue.
- A screenshot or error message, with **API keys and account tokens removed**.

External AI features may send lyrics or song information to the provider you choose. Charges, usage limits, and data handling depend on that provider and model. Connections such as NVIDIA NIM may route API keys and requests through the configured Spicetify CORS proxy when a browser connection needs a workaround.

## Support and credits

[Support development](https://buymeacoffee.com/ivlis) · [Original Lyrics-Plus project](https://github.com/spicetify/cli/tree/main/CustomApps/lyrics-plus) · [License](LICENSE)

[<img width="400" height="200" alt="Support ivLis Studio" src="https://github.com/user-attachments/assets/130c5bf8-f8c3-493b-bbdb-b748e77babcd" />](https://buymeacoffee.com/ivlis)

<details>
<summary>Unofficial project, copyright, and terms</summary>

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

</details>

## License and open-source notices

The ivLyrics source code is licensed under the [GNU LGPL v2.1](LICENSE). Bundled third-party components keep their respective licenses. Rights holders set the terms for use of lyrics, videos, and other third-party content and can request removal of content stored on ivLyrics servers at me@ivl.is.

**ivLyrics server access policy**

To manage server load, ivLis Studio permits automated requests to the services it operates at `ivlis.kr`, `ivl.is`, and their subdomains only from official ivLyrics builds and clients that ivLis Studio has approved in advance. If you maintain a fork or another app without that approval, disable requests to those addresses or point them at a service you operate. This policy governs access to services operated by ivLis Studio. Use, modification, and redistribution of the source code are governed by the LGPL v2.1.

See [NOTICE.md](NOTICE.md) for the Spicetify lyrics-plus attribution, contributor credits, and component licenses.

- **TinySegmenter** — Copyright (c) 2008, Taku Kudo. [Copyright and license notice](TinySegmenter.LICENSE.txt)
- **wa-sqlite 1.0.0** — Copyright (c) 2023 Roy T. Hashimoto. MIT License; the full notice is also preserved in the distributed `LrclibLocalDatabaseRuntime.js`.
- **spicetify-visualizer** — Copyright (c) 2026 Konsl. MIT License. Parts of the CD visualizer's loudness and pitch interpolation are adapted from the [original commit](https://github.com/Konsl/spicetify-visualizer/tree/12cb2a9066690b4e023bccc9466ae784ebb62364). The radial renderer and lifecycle are specific to ivLyrics.

<details>
<summary>spicetify-visualizer — full MIT license</summary>

```text
MIT License

Copyright (c) 2026 Konsl

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

</details>
