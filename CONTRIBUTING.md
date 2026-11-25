# Contributing to ivLyrics

> **한국어 요약**
> 큰 기능이나 구조 변경은 PR 전에 이슈나 [Discord](https://discord.gg/2fu36fUzdE)에서 먼저 이야기해 주세요. PR에는 실행한 테스트와 화면 변화(전후 캡처)를 적어 주세요. 새 문구는 `src/i18n/langs/`의 모든 언어 파일에 추가하고, 설정 키는 저장된 값을 옮기는 마이그레이션 없이 바꾸거나 지우지 마세요. AI로 만든 코드도 한 줄씩 직접 검토하고 설명할 수 있어야 합니다. 기여하는 코드는 [GNU LGPL v2.1](LICENSE)로 제출해 주세요. 보안 문제는 공개 이슈 대신 [보안 정책](https://github.com/ivLis-Studio/.github/blob/main/SECURITY.md)을 따라 주세요.

Thanks for helping improve ivLyrics. This guide covers ivLyrics for PC (the Spicetify app). The [shared contributing guide](https://github.com/ivLis-Studio/.github/blob/main/CONTRIBUTING.md) covers the Android, iOS, Overlay, and Helper repositories.

## Before you start

- **Bugs:** open an issue with the bug report form. Bugs in the Android, LSPatch, and iOS apps are also reported here, with the matching platform selected.
- **Questions and help:** ask on [Discord](https://discord.gg/2fu36fUzdE).
- **Features and larger changes:** open a feature request or start a Discord thread before writing code. A short agreement on scope saves rework for both sides.
- **Small fixes:** typos, clear bugs, and focused fixes can go straight to a pull request.
- **Security problems:** do not open an issue. Follow the [security policy](https://github.com/ivLis-Studio/.github/blob/main/SECURITY.md).

## License of contributions

Please submit your changes under the [GNU LGPL v2.1](LICENSE). By submitting a contribution, you confirm that you have the right to license it under those terms. You keep the copyright in your work.

## Development setup

1. Install [Spicetify](https://spicetify.app/) and make sure `spicetify apply` works.
2. Clone your fork into a development folder. Install Node.js 24 or later, then run `npm ci` and `npm run build`.
3. Copy `dist/ivLyrics` into the Spicetify `CustomApps` folder.
   - Windows: run `spicetify -c` and use the `CustomApps` folder beside the reported `config-xpui.ini`.
   - macOS and Linux: `~/.config/spicetify/CustomApps` by default.
4. Enable it and apply:

   ```sh
   spicetify config custom_apps ivLyrics
   spicetify apply
   ```

5. After editing, run `npm run build`, replace the installed `CustomApps/ivLyrics` folder with the rebuilt one, and run `spicetify apply` again.

Run `npm run package` to produce `dist/ivLyrics.zip` and `dist/ivLyrics.zip.sha256`.
See the [PC build and release guide](docs/pc-build-and-release.md) for the runtime entry points and release procedure.

## Project layout

| Path | Contents |
|---|---|
| `src/spicetify/` | Entry points and ordered legacy inputs. The page loads on navigation and startup code runs when Spotify starts. |
| `src/app/`, `src/core/`, `src/lyrics/`, `src/features/`, `src/providers/` | App logic grouped by responsibility. |
| `src/styles/` | Spicetify stylesheet and shared motion styles. |
| `src/i18n/langs/` | Interface text for every supported language. `LangEn.js` is the reference. |
| `dist/ivLyrics/` | Generated files that Spicetify installs. |
| `tests/` | Node tests (`node:test`) and their fixtures. |
| `src/features/motion/mobile/` | The host that runs the motion lyrics scripts inside the Android and iOS apps. |
| `.github/scripts/` | Release, code generation, and maintenance scripts. |
| `third_party/` | Vendored third-party code with its license notices. |
| `updater/` | Install, update, and uninstall scripts. |

## Rules for changes

- **Keep the entry points distinct.** Use explicit imports for new modules. Add code to the startup list in `src/spicetify/inputs.json` only when it needs to initialize as Spotify starts, and keep the order of existing initializers. The build uses the React instance supplied by Spicetify.
- **Do not break saved settings.** Never rename or remove a settings key, or change what a stored value means, without migrating values that users already saved. Choose defaults that keep current behavior.
- **Translate every string.** Add new interface text to every file in `src/i18n/langs/`. `lang_completeness.test.mjs` and `lang_usage.test.mjs` check keys, placeholders, and untranslated English.
- **Keep performance in mind.** The lyrics page and fullscreen modes run every frame. Avoid layout reads, allocations, and React re-renders in per-frame paths. A performance change must not change what users see.
- **Keep endpoints private.** Some provider addresses are deliberately obfuscated. Do not de-obfuscate them in code, comments, tests, or pull request descriptions, and never commit API keys or tokens.
- **Generated copies.** Some files are copied into other repositories:
  - Motion lyrics: edit the PC sources, then rebuild the apps' page with `node .github/scripts/build_motion_mobile.mjs --out <file>`.
  - Sync data codec: [`src/features/sync/SyncDataCodec.mjs`](src/features/sync/SyncDataCodec.mjs) is the source of truth. Run `node .github/scripts/sync_codec.mjs --check` with `ivLyrics-backend` checked out next to this repository.
  - Local LRCLIB database: edit `.github/scripts/lrclib_local_database_worker.mjs`. The build embeds the worker and the pinned SQLite WASM automatically.
- **Leave releases to maintainers.** Do not change `version.txt` or the release workflows in a feature pull request.

## AI-assisted contributions

You may use AI tools. You are still the author: read every line, test it, and be able to explain it. Keep the diff focused on one problem. Pull requests that rename settings, rewrite unrelated code, or ship untested generated code will be closed.

## Testing

Run these before opening a pull request. CI runs the same checks.

```sh
npm ci
npm run package
npm test
```

Add or update a test when you fix a bug or change behavior. For visible changes, also test in Spotify and attach before and after screenshots or a short video to the pull request.

## Commits and pull requests

- Write commit messages in English using [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Keep one topic per pull request, and fill in the pull request template.
- Enable **Allow edits by maintainers**. Maintainers may push fixes to your branch before merging.
- Link the issue that the pull request resolves, for example `Closes #123`.

## Code of conduct

Everyone taking part in ivLyrics spaces follows the [code of conduct](https://github.com/ivLis-Studio/.github/blob/main/CODE_OF_CONDUCT.md).
