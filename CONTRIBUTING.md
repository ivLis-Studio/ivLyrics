# Contributing to ivLyrics

> **한국어 요약**
> 큰 기능이나 구조 변경은 PR 전에 이슈나 [Discord](https://discord.gg/2fu36fUzdE)에서 먼저 이야기해 주세요. PR에는 실행한 테스트와 화면 변화(전후 캡처)를 적어 주세요. 새 문구는 `langs/`의 모든 언어 파일에 추가하고, 설정 키는 저장된 값을 옮기는 마이그레이션 없이 바꾸거나 지우지 마세요. AI로 만든 코드도 한 줄씩 직접 검토하고 설명할 수 있어야 합니다. 기여한 코드는 [LICENSE](LICENSE) 6조에 따라 라이선스됩니다. 보안 문제는 공개 이슈 대신 [보안 정책](https://github.com/ivLis-Studio/.github/blob/main/SECURITY.md)을 따라 주세요.

Thanks for helping improve ivLyrics. This guide covers ivLyrics for PC (the Spicetify app). The [shared contributing guide](https://github.com/ivLis-Studio/.github/blob/main/CONTRIBUTING.md) covers the Android, iOS, Overlay, and Helper repositories.

## Before you start

- **Bugs:** open an issue with the bug report form. Bugs in the Android, LSPatch, and iOS apps are also reported here, with the matching platform selected.
- **Questions and help:** ask on [Discord](https://discord.gg/2fu36fUzdE).
- **Features and larger changes:** open a feature request or start a Discord thread before writing code. A short agreement on scope saves rework for both sides.
- **Small fixes:** typos, clear bugs, and focused fixes can go straight to a pull request.
- **Security problems:** do not open an issue. Follow the [security policy](https://github.com/ivLis-Studio/.github/blob/main/SECURITY.md).

## License of contributions

ivLyrics is source-available under the [ivLyrics Source-Available License 1.0](LICENSE). It is not open source: you may fork and modify it to develop and contribute changes, but not redistribute it. By submitting a contribution, you confirm that you have the right to submit it and grant ivLis Studio the license in Section 6 of [LICENSE](LICENSE). You keep the copyright in your work.

Files listed as LGPL-2.1 in [NOTICE.md](NOTICE.md) stay under LGPL-2.1. Changes you make to those files are also available under LGPL-2.1.

## Development setup

ivLyrics for PC runs directly from these files; there is no build step or package manager.

1. Install [Spicetify](https://spicetify.app/) and make sure `spicetify apply` works.
2. Fork this repository and clone your fork into Spicetify's `CustomApps` folder as `ivLyrics`.
   - Windows: run `spicetify -c` and use the `CustomApps` folder beside the reported `config-xpui.ini`.
   - macOS and Linux: `~/.config/spicetify/CustomApps` by default.
3. Enable it and apply:

   ```sh
   spicetify config custom_apps ivLyrics
   spicetify apply
   ```

4. After editing files, run `spicetify apply` again, or restart Spotify.

Tests need [Node.js](https://nodejs.org/) 24 or later.

## Project layout

| Path | Contents |
|---|---|
| `index.js`, `*.js`, `style.css` | The app. Spicetify loads the scripts listed in `manifest.json` in order. Each file is a plain browser script. |
| `langs/` | Interface text for every supported language. `LangEn.js` is the reference. |
| `tests/` | Node tests (`node:test`) and their fixtures. |
| `mobile/motion/` | The host that runs the motion lyrics scripts inside the Android and iOS apps. |
| `.github/scripts/` | Release, code generation, and maintenance scripts. |
| `third_party/` | Vendored third-party code with its license notices. |
| `updater/` | Install, update, and uninstall scripts. |

## Rules for changes

- **Keep it buildless.** Write plain browser JavaScript that Spicetify can load as is. If you add a script, add it to `manifest.json` in the right load order.
- **Do not break saved settings.** Never rename or remove a settings key, or change what a stored value means, without migrating values that users already saved. Choose defaults that keep current behavior.
- **Translate every string.** Add new interface text to every file in `langs/`. `lang_completeness.test.mjs` and `lang_usage.test.mjs` check keys, placeholders, and untranslated English.
- **Keep performance in mind.** The lyrics page and fullscreen modes run every frame. Avoid layout reads, allocations, and React re-renders in per-frame paths. A performance change must not change what users see.
- **Keep endpoints private.** Some provider addresses are deliberately obfuscated. Do not de-obfuscate them in code, comments, tests, or pull request descriptions, and never commit API keys or tokens.
- **Generated copies.** Some files are copied into other repositories:
  - Motion lyrics: edit the PC sources, then rebuild the apps' page with `node .github/scripts/build_motion_mobile.mjs --out <file>`.
  - Sync data codec: `SyncDataCodec.js` is the source of truth. Run `node .github/scripts/sync_codec.mjs --check` with the sibling repositories checked out next to this one.
  - Local LRCLIB database: edit `.github/scripts/lrclib_local_database_worker.mjs` and rebuild `LrclibLocalDatabaseRuntime.js` as described at the top of `.github/scripts/build_lrclib_local_runtime.mjs`.
- **Leave releases to maintainers.** Do not change `version.txt` or the release workflows in a feature pull request.

## AI-assisted contributions

You may use AI tools. You are still the author: read every line, test it, and be able to explain it. Keep the diff focused on one problem. Pull requests that rename settings, rewrite unrelated code, or ship untested generated code will be closed.

## Testing

Run these before opening a pull request. CI runs the same checks.

```sh
node --test tests/*.test.mjs
for f in *.js langs/*.js; do node --check "$f"; done
```

Add or update a test when you fix a bug or change behavior. For visible changes, also test in Spotify and attach before and after screenshots or a short video to the pull request.

## Commits and pull requests

- Write commit messages in English using [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Keep one topic per pull request, and fill in the pull request template.
- Enable **Allow edits by maintainers**. Maintainers may push fixes to your branch before merging.
- Link the issue that the pull request resolves, for example `Closes #123`.

## Code of conduct

Everyone taking part in ivLyrics spaces follows the [code of conduct](https://github.com/ivLis-Studio/.github/blob/main/CODE_OF_CONDUCT.md).
