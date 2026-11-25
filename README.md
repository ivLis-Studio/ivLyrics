![ivLyrics — 당신의 언어로 즐기는 음악](docs/assets/preview_readme_ko.png)

[한국어](README.md) · [English](README_EN.md)

# ivLyrics

당신의 언어로 즐기는 음악.

Spotify PC에서 가사를 읽고, 발음을 따라 부르고, 뜻까지 함께 확인하세요. 원문·발음·번역을 원하는 조합으로 표시하고, 가사에 집중하는 화면부터 영상 배경과 LP 모드까지 취향에 맞게 꾸밀 수 있습니다.

[설치하기](#시작하기) · [최신 버전](https://github.com/ivLis-Studio/ivLyrics/releases/latest) · [도움받기](https://discord.gg/2fu36fUzdE)

![ivLyrics 가사 화면](https://github.com/user-attachments/assets/0596a769-76aa-49c5-970c-85897fe8d260)

## 이런 때 사용해 보세요

- **좋아하는 외국어 곡을 따라 부르고 싶을 때** — 발음 표기와 일본어 후리가나를 함께 볼 수 있습니다.
- **가사의 뜻이 궁금할 때** — 번역을 나란히 읽고, 지원하는 AI 제공자로 문화적 배경 설명·리서치·학습 모드를 이용할 수 있습니다.
- **음악에 더 몰입하고 싶을 때** — 전체화면, TV·LP 모드, 앨범 커버·영상 배경을 골라 보세요.
- **내 눈에 편한 화면이 필요할 때** — 원문·발음·번역의 글꼴과 크기, 색상을 따로 조절하고 화면 모션도 바꿀 수 있습니다.
- **가사가 음악보다 빠르거나 느릴 때** — 곡별 싱크를 조정하거나 커뮤니티 싱크를 이용할 수 있습니다.

가사와 싱크의 제공 여부는 곡과 가사 제공자에 따라 다릅니다. AI가 생성한 번역·발음·설명에는 오류가 있을 수 있습니다.

## 내 환경에 맞는 ivLyrics

이 페이지는 **Windows·macOS·Linux의 Spotify 데스크톱용** 안내입니다. 모바일에는 아래의 전용 앱을 설치하세요.

| 사용 환경이나 목적 | 선택할 서비스 |
| --- | --- |
| PC의 Spotify 안에서 가사 보기 | **ivLyrics** — 이 페이지에서 설치 |
| Android에서 가사 보기 | [ivLyrics Android](https://github.com/ivLis-Studio/ivLyrics-Android) |
| iPhone·iPad에서 가사 보기 | [ivLyrics iOS](https://github.com/ivLis-Studio/ivLyrics-IOS) |
| 다른 창 위에 가사를 띄워 두기 | [Overlay](https://github.com/ivLis-Studio/ivLyrics-overlay) — 별도 선택 설치 |
| 영상 재생 보조·외부 앱 연동 사용하기 | [Helper](https://github.com/ivLis-Studio/ivLyrics-helper) — 필요한 기능에만 선택 설치 |

기본 가사 화면을 이용하려고 Overlay·Helper나 서버를 모두 설치할 필요는 없습니다.

## 시작하기

### 1. Spotify와 Spicetify 준비

Spotify 데스크톱 앱과 [Spicetify](https://spicetify.app/docs/getting-started)가 필요합니다. Spotify에서 음악이 정상적으로 재생되는지 먼저 확인해 주세요.

Linux에서는 Bash, `curl`, `unzip`과 파일 검증을 위한 `sha256sum` 또는 `shasum`도 준비해 주세요.

Spicetify를 막 설치했다면 PowerShell이나 터미널을 닫았다가 다시 여세요. 아래 명령은 웹 플레이어나 휴대전화에서 사용하는 명령이 아닙니다.

### 2. ivLyrics 설치

사용 중인 운영체제의 명령을 실행하세요. 설치와 업데이트에 같은 명령을 사용합니다.

**Windows — PowerShell**

```powershell
iwr -useb https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.ps1 | iex
```

**macOS·Linux — 터미널**

```bash
curl -fsSL https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/install.sh | bash
```

공식 저장소의 설치 스크립트를 내려받아 실행하는 명령입니다. 실행 전에 [Windows 스크립트](updater/install.ps1) 또는 [macOS·Linux 스크립트](updater/install.sh)를 확인할 수 있습니다.

<details>
<summary>명령 대신 직접 설치하고 싶어요</summary>

1. [최신 릴리스](https://github.com/ivLis-Studio/ivLyrics/releases/latest)의 **Assets**에서 `ivLyrics.zip`을 받습니다.
2. 압축을 풀어 `index.js`와 `manifest.json`이 바로 들어 있는 폴더의 이름을 `ivLyrics`로 맞춥니다. 같은 이름의 폴더가 이중으로 들어가지 않게 해 주세요.
3. Spicetify의 `CustomApps` 폴더에 복사합니다.
   - Windows: `spicetify -c`로 확인한 `config-xpui.ini` 옆의 `CustomApps` 폴더
   - macOS·Linux 기본 경로: `~/.config/spicetify/CustomApps`
4. 다음 명령을 실행하고 Spotify를 다시 엽니다.

```shell
spicetify config custom_apps ivLyrics
spicetify apply
```

직접 설치한 경우에는 새 버전도 릴리스에서 내려받아 교체할 수 있습니다. 자세한 폴더 안내는 [Spicetify 공식 문서](https://spicetify.app/docs/customization/custom-apps)를 참고하세요.

GitHub의 `Source code.zip`은 소스 배포본입니다. 직접 빌드하려면 [개발 안내](https://github.com/ivLis-Studio/ivLyrics/blob/main/CONTRIBUTING.md#development-setup)를 참고하세요.

</details>

### 3. 첫 곡 재생

Spotify를 다시 열고 사이드바에서 **ivLyrics**를 선택하세요. 처음 표시되는 안내에서 언어·화면 스타일·재생 방식을 고른 뒤 곡을 재생하면 됩니다. 이 설정들은 나중에 다시 바꿀 수 있습니다.

화면에 마우스를 움직여 메뉴를 열고 설정으로 들어가세요. 찾는 항목이 보이지 않으면 **설정 검색**을 사용해 보세요.

## 번역과 발음 켜기

번역과 발음은 별개의 기능입니다. 번역만 켜거나, 따라 부르기 편하게 발음만 표시할 수도 있습니다.

1. **일반 → 언어**에서 앱 표시 언어와 발음/번역에 사용할 언어를 정합니다.
2. **AI 제공자 → 연결**에서 사용할 제공자의 API 키·모델 등 필요한 정보를 입력합니다.
3. 제공자 목록에서 원하는 제공자와 **번역·발음** 기능을 켭니다. 제공자에 따라 지원하는 기능이 다릅니다.
4. 현재 곡의 변환 설정에서 번역·발음을 선택합니다. 설정을 바꿨는데 기존 결과가 남아 있다면 해당 결과를 다시 생성해 주세요.

Google Translate·Bing Translate는 **번역 전용**입니다. 발음 생성에는 발음을 지원하는 AI 제공자가 필요합니다. 모든 기능에 Gemini 키가 필수인 것은 아닙니다.

### 외부 번역 API 대신 Local AI를 쓰고 싶어요

**AI 제공자 → Local AI**에서 모델을 내려받고 제공자를 켠 뒤, 먼저 사용하려면 다른 번역 제공자보다 위로 옮겨 주세요. 기본적으로 꺼져 있으며, **로컬 라이트·로컬 미디엄·로컬 하이** 중에서 선택할 수 있습니다.

- Local AI는 **번역만** 지원하고 API 키는 필요하지 않습니다.
- 모델은 약 1~2GB의 다운로드가 필요하며, 실행 시 추가 메모리를 사용합니다. 느리거나 메모리가 부족하면 더 가벼운 품질을 선택하세요.
- 번역 처리는 기기에서 실행됩니다. 엔진과 모델을 내려받는 데에는 인터넷이 필요하며, 가사 조회 등 앱의 다른 기능까지 오프라인이 되는 것은 아닙니다.
- 제공자 목록의 위에서부터 요청을 시도하므로, 온라인 제공자가 앞에 있으면 그쪽으로 먼저 전송될 수 있고 실패 시 다음 제공자로 전환됩니다. 기기 내 번역만 원한다면 다른 번역 제공자는 꺼 주세요.

## 내게 맞게 꾸미기

| 바꾸고 싶은 것 | 설정에서 찾아볼 곳 |
| --- | --- |
| 원문·발음·번역의 글꼴, 크기, 줄 간격 | 외관 → 가사 레이어 |
| 앨범 커버, 영상, 배경 밝기와 모션 | 외관 |
| 전체화면·TV·LP 화면 | 전체화면 |
| 오른쪽 패널에 보이는 가사 | 패널 가사 |
| 사용할 가사 출처와 조회 순서 | 가사 제공자 |
| 화면 효과가 무겁게 느껴질 때 | 성능 |

처음부터 모든 항목을 조절할 필요는 없습니다. 기본 화면으로 몇 곡 들어본 뒤 불편한 부분만 바꿔 보세요.

## 업데이트와 삭제

새 버전은 **정보**의 업데이트 안내 또는 위의 설치 명령으로 적용할 수 있습니다. 자동 설치를 사용했다면 앱 안의 업데이트 버튼을 위한 로컬 업데이트 도우미도 등록됩니다. 버튼이 반응하지 않으면 설치 명령을 다시 실행해 보세요. [업데이트 도우미 안내](updater/README.md)

설정을 보관하려면 설정 검색에서 **설정 내보내기**를 찾아 먼저 저장해 두세요. 내보낸 파일을 공유할 때는 민감한 정보가 포함됐는지 확인하세요.

<details>
<summary>ivLyrics 삭제하기</summary>

**Windows — PowerShell**

```powershell
iwr -useb https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/uninstall.ps1 | iex
```

**macOS·Linux — 터미널**

```bash
curl -fsSL https://raw.githubusercontent.com/ivLis-Studio/ivLyrics/main/updater/uninstall.sh | bash
```

확인 메시지를 읽고 진행해 주세요. Spicetify 전체 삭제를 추가로 묻는 경우, 다른 테마·확장 프로그램을 계속 사용하려면 동의하지 마세요.

</details>

## 잘 안 될 때

| 증상 | 먼저 확인해 주세요 |
| --- | --- |
| 사이드바에 ivLyrics가 없어요 | Spotify를 다시 열고 `spicetify apply`를 실행해 보세요. 수동 설치라면 폴더가 이중으로 들어갔는지도 확인하세요. |
| 가사가 안 나와요 | 다른 곡에서도 같은지 확인하고 **가사 제공자**의 활성화 상태와 순서를 확인하세요. 모든 곡에 가사가 있는 것은 아닙니다. |
| 번역은 나오는데 발음이 안 나와요 | 발음을 지원하는 제공자의 **발음** 기능이 켜져 있는지 확인하세요. Google·Bing 번역만으로는 발음을 만들 수 없습니다. |
| 원하는 언어로 나오지 않아요 | **일반 → 언어**의 발음/번역 언어를 확인한 뒤 현재 곡의 결과를 다시 생성해 보세요. |
| API 요청이 실패해요 | API 키, 선택한 모델, 제공자의 사용량·요금 한도를 확인하고 연결 테스트를 실행하세요. |
| 가사나 영상 싱크가 어긋나요 | 현재 곡의 설정에서 가사·영상 오프셋을 따로 조절하세요. |
| 영상이 안 나오거나 화면이 버벅여요 | 앨범 커버 배경으로 바꿔 비교하고, 영상·블러·모션 효과를 줄여 보세요. Helper를 쓰는 경우 실행·연결 상태도 확인하세요. |
| Spotify 업데이트 후 실행이 안 돼요 | [Spicetify 공식 안내](https://spicetify.app/docs/getting-started)에 따라 Spicetify를 업데이트하고 다시 적용하세요. |

NVIDIA NIM은 기본 URL `https://integrate.api.nvidia.com/v1`과 채팅용 모델을 확인해 주세요. 목록에 있어도 실제 요청에서 404가 나는 모델은 다른 모델로 바꿔 연결 테스트를 해보세요.

초기화나 재설치는 마지막 수단으로 사용하세요. 먼저 설정을 내보내고, 아래 정보와 함께 문의하면 원인을 찾는 데 도움이 됩니다.

## 도움받기와 데이터 안내

[Discord](https://discord.gg/2fu36fUzdE)의 버그 리포트·기능 제안 채널 또는 [GitHub Issues](https://github.com/ivLis-Studio/ivLyrics/issues)에 남겨 주세요.

- 사용 중인 OS, Spotify·Spicetify·ivLyrics 버전
- 문제가 생긴 곡의 링크와 재현 순서
- 화면 캡처나 오류 메시지 — **API 키·계정 토큰은 가린 뒤** 공유해 주세요.

외부 AI 기능을 사용하면 처리를 위해 가사나 곡 정보가 선택한 제공자에게 전송될 수 있습니다. 요금·사용량 제한·데이터 처리 방식은 제공자와 모델에 따라 다릅니다. NVIDIA NIM처럼 브라우저 연결을 우회해야 하는 경우에는 API 키와 요청이 설정된 Spicetify CORS 프록시를 거칠 수 있습니다.

## 함께 만드는 ivLyrics

[후원하기](https://buymeacoffee.com/ivlis) · [원본 Lyrics-Plus 프로젝트](https://github.com/spicetify/cli/tree/main/CustomApps/lyrics-plus) · [라이선스](LICENSE)

[<img width="400" height="200" alt="ivLis Studio 후원" src="https://github.com/user-attachments/assets/130c5bf8-f8c3-493b-bbdb-b748e77babcd" />](https://buymeacoffee.com/ivlis)

<details>
<summary>비공식 프로젝트·저작권·이용 안내</summary>

> [!IMPORTANT]
> ⚠️ 면책 조항 (Disclaimer)
>
> **비공식 프로젝트 안내**
>
> 본 프로젝트와 기여자는 Spotify, 또는 그 계열사 및 자회사와 어떠한 제휴, 권한 부여, 승인 또는 공식적인 연결 관계도 없음을 밝힙니다. **본 프로젝트는 데스크톱 경험 제공을 목적으로 자원봉사 팀이 개발한 독립적이고 비영리적인 비공식 확장 프로그램입니다.**
>
> **상표권 안내**
>
> "Spotify"라는 명칭을 포함하여 관련 명칭, 마크, 엠블럼 및 이미지는 해당 소유자의 등록 상표입니다. 이러한 상표의 사용은 식별 및 참조 목적으로만 사용되며, 상표권자와의 어떠한 연관성도 시사하지 않습니다. 본 프로젝트는 해당 상표권을 침해하거나 상표권자에게 피해를 줄 의도가 없음을 명시합니다.
>
> **책임의 한계**
>
> 본 애플리케이션(확장 프로그램)은 "있는 그대로(AS IS)" 제공되며, 사용 시 발생하는 위험은 전적으로 사용자의 책임입니다. 개발자 또는 기여자는 본 소프트웨어의 사용 또는 기타 거래와 관련하여 발생하는 청구, 손해 또는 법적 결과를 포함한 어떠한 책임도 지지 않습니다. 본 소프트웨어 사용으로 인한 모든 결과에 대한 책임은 전적으로 사용자에게 있습니다.
>
> **저작권 및 약관 준수**
>
> 본 프로젝트는 가사, 번역문, 영상 또는 기타 제3자 콘텐츠의 소유권을 주장하지 않으며, 해당 콘텐츠에 대한 라이선스를 부여하지도 않습니다. 사용자는 관련 저작권법, 플랫폼 정책, API 이용약관 및 현지 법령을 직접 확인하고 준수할 책임이 있으며, 본 프로젝트를 이용한 저장, 복제, 배포, 송신 또는 상업적 이용에 대한 책임은 전적으로 사용자에게 있습니다.
>

</details>

## 라이선스와 오픈소스 고지

ivLyrics의 소스 코드는 [GNU LGPL v2.1](LICENSE)을 따릅니다. 포함된 제3자 구성요소에는 각 구성요소의 라이선스가 적용됩니다. 가사와 영상 등 제3자 콘텐츠의 이용 조건은 각 권리자가 정합니다. ivLyrics 서버에 저장된 콘텐츠의 권리 침해 신고 및 삭제 요청은 me@ivl.is로 보내 주세요.

**ivLyrics 서버 이용 정책**

ivLis Studio는 서버 부하를 관리하기 위해 `ivlis.kr`, `ivl.is` 및 각 하위 도메인에서 운영하는 서비스에 대한 앱의 자동 요청을 공식 ivLyrics 배포본과 사전 승인된 클라이언트에 한해 허용합니다. 승인받지 않은 포크나 외부 앱에서는 이들 주소로 보내는 요청을 비활성화하거나 자체 서버로 전환해 주세요. 이 정책은 ivLis Studio가 운영하는 서비스에 대한 접근에 적용되며, 코드의 사용·수정·재배포는 LGPL v2.1을 따릅니다.

Copyright (c) 2025–2026 ivLis Studio and contributors.

<details>
<summary>LGPL-2.1 적용 파일과 기여자</summary>

아래 소스와 그 소스에서 빌드된 부분에는 [LGPL-2.1](third_party/lyrics-plus.LGPL-2.1.txt)이 적용됩니다. 사용·수정·재배포 권한도 해당 라이선스를 따릅니다. v7.1.17까지의 릴리스(커밋 `3c251f7`)는 기존 조건으로 계속 제공됩니다.

**Spicetify lyrics-plus 파생 파일**

`src/spicetify/index.js`, `src/styles/`, `src/core/Utils.js`, `src/lyrics/speakerColors.mjs`, `src/lyrics/LyricsService.js`, `src/lyrics/Pages.js`, `src/features/settings/Settings.js`, `src/app/OptionsMenu.js`, `src/features/player/PlaybarButton.js`, `manifest.json`, `src/lyrics/NowPlayingPanelLyrics.js`, `src/lyrics/TranslationModeHelper.js`

위 파일에서 분리한 `src/lyrics/creator-profile/`과 `src/features/settings/`의 `.mjs` 파일, `src/lyrics/`의 `furigana.mjs`, `translation*.mjs`, `lyricsBackgroundStyles.mjs`, `lyricsLanguage*.mjs`, `karaokeWordTiming.mjs`, `karaokeFill.mjs`, `karaokeMotion.mjs`, `karaokeGlyphUpdates.mjs`, `karaokeLivePainter.mjs`, `karaokeWordSupplementHook.mjs`, `createWordSupplementPrefetcher.mjs`, `lyricsTextOutline.mjs`, `lyricsTypography.mjs`, `lyricInterludePresentation.mjs`, `lyricTextMarkup.mjs`, `lyricCulturalAnnotations.mjs`, `createLyricSubLineRenderer.mjs`, `createLyricLineActions.mjs`, `lyricsLineComponents.mjs`, `createSyncedLyricRows.mjs`, `syncDataSourceCompatibility.mjs`에도 같은 라이선스가 적용됩니다.

`src/core/trackIdentity.mjs`, `src/lyrics/panelLyricPresentation.mjs`, `src/features/overlay/overlayLyricPayload.mjs`, `src/features/overlay/overlayOffsets.mjs`에도 같은 라이선스가 적용됩니다.

**LGPL-2.1로 제출된 기여가 포함된 파일**

- 런타임: `src/providers/ai/AIAddonManager.js`, `src/providers/ai/AIRequest.js`, `src/providers/ai/Addon_AI_ChatGPT.js`, `src/providers/lyrics/Addon_Lyrics_LrcRed.js`, `src/providers/lyrics/Addon_Lyrics_Lrclib.js`, `src/providers/lyrics/Addon_Lyrics_OpenLyrics.js`, `src/features/fullscreen/FullscreenOverlay.js`, `src/features/share/LyricsShareImage.js`, `src/lyrics/LyricsWordSegmenter.js`, `src/features/player/PlaylistPicker.js`, `src/lyrics/PronunciationFirst.js`, `src/features/sync/SyncDataCreator.js`, `src/features/sync/syncCreatorVocalStyles.mjs`, `src/features/video/VideoBackground.js`, `src/features/video/VideoBackgroundDepend.js`, `src/features/video/VideoMatch.js`, `src/lyrics/WordLevelSupplements.js`, `src/lyrics/createWordSupplementService.mjs`, `src/lyrics/createWordSupplementBatcher.mjs`
- 번역: `src/i18n/langs/`의 전체 파일
- 분리한 모듈: `src/providers/ai/`과 `src/features/sync/`의 `.mjs` 파일
- 테스트: `tests/capability_master_switch.test.mjs`, `tests/cdn_script_integrity.test.mjs`, `tests/character_pronunciation_repair.test.mjs`, `tests/chatgpt_capability_seeding.test.mjs`, `tests/chinese_pronunciation_tones.test.mjs`, `tests/creator_profile_playlist.test.mjs`, `tests/creator_profile_row_layout.test.mjs`, `tests/fixtures/fullscreen_controller_background_browser.js`, `tests/fixtures/playlist_picker_browser.js`, `tests/fixtures/sync_creator_preview_browser.js`, `tests/fullscreen_controller_background.test.mjs`, `tests/fullscreen_playback_updates.test.mjs`, `tests/interlude_padding_collapse.test.mjs`, `tests/karaoke_adaptive_motion.test.mjs`, `tests/karaoke_expressive_long_words.test.mjs`, `tests/karaoke_expressive_motion.test.mjs`, `tests/karaoke_static_render_cache.test.mjs`, `tests/karaoke_style_invalidation.test.mjs`, `tests/karaoke_vocal_render_cache.test.mjs`, `tests/language_detection.test.mjs`, `tests/lyrics_provider_same_song.test.mjs`, `tests/lyrics_seek_fade_compensation.test.mjs`, `tests/lyrics_text_shadow.test.mjs`, `tests/lyrics_word_segmenter_quoted_words.test.mjs`, `tests/openai_connections.test.mjs`, `tests/openai_connections_unified.test.mjs`, `tests/openai_primary_presentation.test.mjs`, `tests/panel_lyric_html_escaping.test.mjs`, `tests/playlist_picker_button.test.mjs`, `tests/playlist_picker_panel.test.mjs`, `tests/playlist_picker_placement.test.mjs`, `tests/pronunciation_fill.test.mjs`, `tests/renderer_settings_equivalence.test.mjs`, `tests/settings_fullscreen_preview.test.mjs`, `tests/settings_import_endpoint_guard.test.mjs`, `tests/settings_menu_ownership.test.mjs`, `tests/settings_provider_master_switch.test.mjs`, `tests/share_image_controls_contract.test.mjs`, `tests/share_image_word_level.test.mjs`, `tests/sync_adjust_panel.test.mjs`, `tests/sync_creator_loaded_lrclib_id.test.mjs`, `tests/sync_creator_lock_integration.test.mjs`, `tests/sync_creator_lrclib_transport.test.mjs`, `tests/sync_creator_preview_navigation.test.mjs`, `tests/sync_creator_preview_rules.test.mjs`, `tests/sync_creator_pronunciation_bubble_layout.test.mjs`, `tests/sync_creator_segment_offset.test.mjs`, `tests/sync_creator_selection_effect.test.mjs`, `tests/sync_unsubmitted_draft.test.mjs`, `tests/synced_render_reuse.test.mjs`, `tests/track_sync_migration.test.mjs`, `tests/video_drift_correction.test.mjs`, `tests/video_match_quality.test.mjs`, `tests/video_prefetch_track_identity.test.mjs`, `tests/video_quick_sync.test.mjs`, `tests/word_supplement_han_mixed_line.test.mjs`, `tests/word_supplement_pending_dedup.test.mjs`, `tests/word_supplement_persistence_fallback.test.mjs`, `tests/word_supplement_prefetch_track_id.test.mjs`, `tests/word_supplement_quoted_units.test.mjs`, `tests/word_supplement_regenerate.test.mjs`, `tests/youtube_ad_suppression.test.mjs`

기여자: PixelAxolotl, Ahmedxsaad, Oein, hohofught, kpnkpn1324, twoeater, karma-skz, Junsu Park, alixti, moxuun. 전체 기여 이력은 Git에서 확인할 수 있습니다.

</details>

<details>
<summary>제3자 구성요소 및 라이선스</summary>

- **Preact** — MIT. 모바일 모션 가사 빌드에 포함됩니다. [라이선스 전문](third_party/preact/LICENSE)
- **Bootstrap** — MIT. `src/styles/`에 일부가 포함됩니다.
- **TinySegmenter** — Copyright (c) 2008, Taku Kudo. [저작권·라이선스 고지](third_party/TinySegmenter.LICENSE.txt)
- **wa-sqlite 1.0.0** — Copyright (c) 2023 Roy T. Hashimoto. MIT 라이선스이며, 고지 전문은 설치본의 `startup.js`에 보존되어 있습니다.
- **spicetify-visualizer** — Copyright (c) 2026 Konsl. MIT 라이선스입니다. CD 비주얼라이저의 음량·피치 보간 로직 일부를 [원본 커밋](https://github.com/Konsl/spicetify-visualizer/tree/12cb2a9066690b4e023bccc9466ae784ebb62364)에서 수정·통합했습니다. 원형 렌더러와 생명주기 처리는 ivLyrics에서 구현했습니다.

<details>
<summary>spicetify-visualizer — MIT 라이선스 전문</summary>

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

</details>
