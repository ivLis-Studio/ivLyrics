// SettingsKeys의 순서는 절대 바꾸면 안 됨.
// 새로운 항목은 무조건 맨 뒤에 추가해야 함.
// 또한 기존 항목을 삭제하면 안 됨.
// 최대 길이는 65535이어야 함.
const SettingKeys = [
  "ivLyrics:visual:playbar-button",
  "ivLyrics:visual:colorful",
  "ivLyrics:visual:gradient-background",
  "ivLyrics:visual:background-brightness",
  "ivLyrics:visual:solid-background",
  "ivLyrics:visual:solid-background-color",
  "ivLyrics:visual:noise",
  "ivLyrics:visual:background-color",
  "ivLyrics:visual:active-color",
  "ivLyrics:visual:inactive-color",
  "ivLyrics:visual:highlight-color",
  "ivLyrics:visual:alignment",
  "ivLyrics:visual:lines-before",
  "ivLyrics:visual:lines-after",
  "ivLyrics:visual:font-size",
  "ivLyrics:visual:font-family",
  "ivLyrics:visual:original-font-family",
  "ivLyrics:visual:phonetic-font-family",
  "ivLyrics:visual:translation-font-family",
  "ivLyrics:visual:original-font-weight",
  "ivLyrics:visual:original-font-size",
  "ivLyrics:visual:translation-font-weight",
  "ivLyrics:visual:translation-font-size",
  "ivLyrics:visual:translation-spacing",
  "ivLyrics:visual:phonetic-font-weight",
  "ivLyrics:visual:phonetic-font-size",
  "ivLyrics:visual:phonetic-opacity",
  "ivLyrics:visual:phonetic-spacing",
  "ivLyrics:visual:phonetic-hyphen-replace",
  "ivLyrics:visual:original-letter-spacing",
  "ivLyrics:visual:phonetic-letter-spacing",
  "ivLyrics:visual:translation-letter-spacing",
  "ivLyrics:visual:furigana-font-weight",
  "ivLyrics:visual:furigana-font-size",
  "ivLyrics:visual:furigana-opacity",
  "ivLyrics:visual:furigana-spacing",
  "ivLyrics:visual:text-shadow-enabled",
  "ivLyrics:visual:text-shadow-color",
  "ivLyrics:visual:text-shadow-opacity",
  "ivLyrics:visual:text-shadow-blur",
  "ivLyrics:visual:original-opacity",
  "ivLyrics:visual:translation-opacity",
  "ivLyrics:visual:translate:translated-lyrics-source",
  "ivLyrics:visual:translate:display-mode",
  "ivLyrics:visual:translate:detect-language-override",
  "ivLyrics:visual:translation-mode:english",
  "ivLyrics:visual:translation-mode:japanese",
  "ivLyrics:visual:translation-mode:korean",
  "ivLyrics:visual:translation-mode:chinese",
  "ivLyrics:visual:translation-mode:russian",
  "ivLyrics:visual:translation-mode:vietnamese",
  "ivLyrics:visual:translation-mode:german",
  "ivLyrics:visual:translation-mode:spanish",
  "ivLyrics:visual:translation-mode:french",
  "ivLyrics:visual:translation-mode:italian",
  "ivLyrics:visual:translation-mode:portuguese",
  "ivLyrics:visual:translation-mode:dutch",
  "ivLyrics:visual:translation-mode:polish",
  "ivLyrics:visual:translation-mode:turkish",
  "ivLyrics:visual:translation-mode:arabic",
  "ivLyrics:visual:translation-mode:hindi",
  "ivLyrics:visual:translation-mode:thai",
  "ivLyrics:visual:translation-mode:indonesian",
  "ivLyrics:visual:translation-mode:gemini",
  "ivLyrics:visual:translation-mode-2:english",
  "ivLyrics:visual:translation-mode-2:japanese",
  "ivLyrics:visual:translation-mode-2:korean",
  "ivLyrics:visual:translation-mode-2:chinese",
  "ivLyrics:visual:translation-mode-2:russian",
  "ivLyrics:visual:translation-mode-2:vietnamese",
  "ivLyrics:visual:translation-mode-2:german",
  "ivLyrics:visual:translation-mode-2:spanish",
  "ivLyrics:visual:translation-mode-2:french",
  "ivLyrics:visual:translation-mode-2:italian",
  "ivLyrics:visual:translation-mode-2:portuguese",
  "ivLyrics:visual:translation-mode-2:dutch",
  "ivLyrics:visual:translation-mode-2:polish",
  "ivLyrics:visual:translation-mode-2:turkish",
  "ivLyrics:visual:translation-mode-2:arabic",
  "ivLyrics:visual:translation-mode-2:hindi",
  "ivLyrics:visual:translation-mode-2:thai",
  "ivLyrics:visual:translation-mode-2:indonesian",
  "ivLyrics:visual:translation-mode-2:gemini",
  "ivLyrics:visual:gemini-api-key",
  "ivLyrics:visual:gemini-api-key-romaji",
  "ivLyrics:visual:translate",
  "ivLyrics:visual:furigana-enabled",
  "ivLyrics:visual:ja-detect-threshold",
  "ivLyrics:visual:hans-detect-threshold",
  "ivLyrics:visual:fade-blur",
  "ivLyrics:visual:highlight-mode",
  "ivLyrics:visual:highlight-intensity",
  "ivLyrics:visual:karaoke-bounce",
  "ivLyrics:visual:karaoke-mode-enabled",
  "ivLyrics:visual:fullscreen-key",
  "ivLyrics:visual:synced-compact",
  "ivLyrics:visual:global-delay",
  "ivLyrics:provider:lrclib:on",
  "ivLyrics:provider:ivlyrics:on",
  "ivLyrics:provider:spotify:on",
  "ivLyrics:provider:local:on",
  "ivLyrics:services-order",
  "ivLyrics:lock-mode",
  "ivLyrics:local-lyrics",
  "ivLyrics:track-sync-offsets",
  "ivLyrics:visual:video-background",
  "ivLyrics:visual:video-blur",
  "ivLyrics:visual:fullscreen-two-column",
  "ivLyrics:visual:fullscreen-show-album",
  "ivLyrics:visual:fullscreen-show-info",
  "ivLyrics:visual:fullscreen-center-when-no-lyrics",
  "ivLyrics:visual:fullscreen-album-size",
  "ivLyrics:visual:fullscreen-album-radius",
  "ivLyrics:visual:fullscreen-title-size",
  "ivLyrics:visual:fullscreen-artist-size",
  "ivLyrics:visual:fullscreen-lyrics-right-padding",
  "ivLyrics:visual:fullscreen-show-clock",
  "ivLyrics:visual:fullscreen-clock-size",
  "ivLyrics:visual:fullscreen-show-context",
  "ivLyrics:visual:fullscreen-show-next-track",
  "ivLyrics:visual:fullscreen-next-track-seconds",
  "ivLyrics:visual:fullscreen-show-controls",
  "ivLyrics:visual:fullscreen-show-volume",
  "ivLyrics:visual:fullscreen-show-progress",
  "ivLyrics:visual:fullscreen-show-lyrics-progress",
  "ivLyrics:visual:fullscreen-control-button-size",
  "ivLyrics:visual:fullscreen-controls-background",
  "ivLyrics:visual:fullscreen-auto-hide-ui",
  "ivLyrics:visual:fullscreen-auto-hide-delay",
  "ivLyrics:visual:video-cover",
  "ivLyrics:visual:prefetch-enabled",
  "ivLyrics:visual:prefetch-video-enabled",
  "ivLyrics:visual:fullscreen-layout-reverse",
  "ivLyrics:visual:language",
  "ivLyrics:visual:community-sync-enabled",
  "ivLyrics:visual:community-sync-auto-apply",
  "ivLyrics:visual:community-sync-min-confidence",
  "ivLyrics:visual:community-sync-auto-submit",
  "ivLyrics:visual:fullscreen-browser-fullscreen",
  "ivLyrics:visual:fullscreen-tmi-font-size",
  "ivLyrics:visual:fullscreen-button",
  "ivLyrics:visual:fullscreen-tv-mode",
  "ivLyrics:visual:fullscreen-tv-album-size",
  "ivLyrics:visual:fullscreen-trim-title",
  "ivLyrics:visual:fullscreen-show-album-name",
  "ivLyrics:visual:fullscreen-tv-show-album-name",
  "ivLyrics:visual:fullscreen-tv-show-controls",
  "ivLyrics:visual:fullscreen-tv-show-progress",
  "ivLyrics:visual:fullscreen-show-context-image",
  "ivLyrics:visual:fullscreen-info-gap",
  "ivLyrics:visual:fullscreen-show-queue",
  "ivLyrics:visual:translate-metadata",
  "ivLyrics:visual:translate-metadata-mode",
  "ivLyrics:visual:panel-font-scale",
  "ivLyrics:visual:video-helper-enabled",
  "ivLyrics:visual:panel-lyrics-font-family",
  "ivLyrics:visual:panel-lyrics-width",
  "ivLyrics:visual:panel-lyrics-original-size",
  "ivLyrics:visual:panel-lyrics-phonetic-size",
  "ivLyrics:visual:panel-lyrics-translation-size",
  "ivLyrics:visual:panel-bg-type",
  "ivLyrics:visual:panel-bg-color",
  "ivLyrics:visual:panel-bg-gradient-1",
  "ivLyrics:visual:panel-bg-gradient-2",
  "ivLyrics:visual:panel-bg-opacity",
  "ivLyrics:visual:panel-border-enabled",
  "ivLyrics:visual:panel-border-color",
  "ivLyrics:visual:panel-border-opacity",
];

const BYTES_FOR_INDEX = Math.ceil(SettingKeys.length / 255);
const CUSTOM_INDEX_PREFIX = new Array(BYTES_FOR_INDEX).fill(0xff);

// PRE_DEFINED_VALUES의 길이는 255 미만이어야 함.
// 나머지 사항은 SettingKeys와 동일함.
const PRE_DEFINED_VALUES = [
  // boolean values
  "true",
  "false",

  // translation sources
  "geminiKo",
  "gemini_ko",
  "geminiJa",
  "gemini_ja",
  "geminiZh",
  "gemini_zh",
  "geminiEn",
  "gemini_en",
  "geminiRomaji",
  "gemini_romaji",

  // alignment options
  "below",
  "above",
  "auto",
  "center",
  "left",
  "right",

  // font weights
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",

  // font names
  "Pretendard Variable",
  "Noto Sans KR",
  "Nanum Gothic",
  "Nanum Myeongjo",
  "Black Han Sans",
  "Do Hyeon",
  "Jua",
  "Nanum Gothic Coding",
  "Gowun Batang",
  "Gowun Dodum",
  "IBM Plex Sans KR",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Inter",
  "Raleway",
  "Oswald",
  "Merriweather",
  "Playfair Display",
];

if (PRE_DEFINED_VALUES.length >= 255) {
  throw new Error("PRE_DEFINED_VALUES length exceeds 255");
}

const toIgnore = new Set([
  "ivLyrics:local-lyrics",
]);

class SettingsObject {
  // 다음과 같은 양식으로 문자화함.
  // [커스텀 키 개수:2바이트]
  // - [커스텀 키 1 길이:2바이트][커스텀 키 1 문자들...]
  // - [커스텀 키 2 길이:2바이트][커스텀 키 2 문자들...]
  // ...
  // [설정 키 개수:2바이트]
  // - [키 인덱스:BYTES_FOR_INDEX 바이트] 또는 [0xff... 커스텀 키 접두사][커스텀 키 길이:2바이트][커스텀 키 문자들...]
  // - [값 인덱스:1바이트] 또는 [0xff 커스텀 값 표시][커스텀 값 길이:2바이트][커스텀 값 문자들...]
  serialize(config) {
    console.groupCollapsed("Serializing config");
    console.log("Config:", config);

    const cbytes = [];
    const CONFIG_KEYS = Object.keys(config).filter((x) => !toIgnore.has(x));
    const customKeys = [];
    for (let i = 0; i < CONFIG_KEYS.length; i++) {
      const key = CONFIG_KEYS[i];
      if (!SettingKeys.includes(key)) {
        customKeys.push(key);
        continue;
      }
    }

    const append2BNumber = (length) => {
      if (length < 0 || length >= 256 ** BYTES_FOR_INDEX) {
        throw new Error("Length out of bounds " + length);
      }
      cbytes.push((length >> 8) & 0xff);
      cbytes.push(length & 0xff);
    };

    const append2BNumberForString = (length) => {
      // 문자열 길이는 항상 2바이트(최대 65535)로 저장
      if (length < 0 || length >= 65536) {
        throw new Error("String length out of bounds " + length);
      }
      cbytes.push((length >> 8) & 0xff);
      cbytes.push(length & 0xff);
    };

    const appendString = (str) => {
      append2BNumberForString(str.length);
      for (let j = 0; j < str.length; j++) {
        cbytes.push(str.charCodeAt(j));
      }
    };

    const customKeyCount = customKeys.length;
    append2BNumber(customKeyCount);

    if (customKeyCount > 65535) {
      throw new Error("Custom key count exceeds 65535");
    }

    console.log("Custom Keys:", customKeys);
    for (let i = 0; i < customKeys.length; i++) {
      const key = customKeys[i];
      appendString(key);
    }

    append2BNumber(CONFIG_KEYS.length);
    for (let i = 0; i < CONFIG_KEYS.length; i++) {
      const key = CONFIG_KEYS[i];
      console.log("Key:", key);
      if (customKeys.includes(key)) {
        console.log("CKey:", key);
        // 커스텀 키인 경우
        cbytes.push(...CUSTOM_INDEX_PREFIX);
        const keyIndex = customKeys.indexOf(key);
        append2BNumber(keyIndex);
      } else {
        const keyIndex = SettingKeys.indexOf(key);
        if (keyIndex === -1) throw new Error("Key not found in SettingKeys");

        // 인덱스 추가
        append2BNumber(keyIndex);
      }

      // 값 추가
      const value = config[key];
      if (typeof value !== "string") {
        throw new Error("Only string values are supported");
      }

      const predefinedIndex = PRE_DEFINED_VALUES.indexOf(value);
      if (predefinedIndex !== -1) {
        // 사전 정의된 값인 경우
        cbytes.push(predefinedIndex);
      } else {
        cbytes.push(0xff); // 커스텀 값임을 나타내는 표시
        appendString(value);
      }
    }

    console.log("Serialized bytes:", cbytes);
    console.log(
      "Serialized string:",
      new TextDecoder().decode(new Uint8Array(cbytes))
    );
    console.log("Total bytes:", cbytes.length);
    console.groupEnd();
    return new Uint8Array(cbytes);
  }

  deserialize(byteArray) {
    console.groupCollapsed("Deserializing byte array");
    console.log("Byte array:", byteArray);

    let offset = 0;

    const read2BNumber = () => {
      if (offset + 2 > byteArray.length) {
        throw new Error("Unexpected end of byte array");
      }
      const value = (byteArray[offset] << 8) | byteArray[offset + 1];
      offset += 2;
      return value;
    };

    const readString = () => {
      const length = read2BNumber();
      if (offset + length > byteArray.length) {
        throw new Error("Unexpected end of byte array");
      }
      let str = "";
      for (let j = 0; j < length; j++) {
        str += String.fromCharCode(byteArray[offset + j]);
      }
      offset += length;
      return str;
    };

    const customKeyCount = read2BNumber();
    const customKeys = [];
    for (let i = 0; i < customKeyCount; i++) {
      const key = readString();
      customKeys.push(key);
    }
    console.log("Custom Keys:", customKeys);

    const configCount = read2BNumber();
    const config = {};
    for (let i = 0; i < configCount; i++) {
      let key;
      // 키 읽기
      let isCustomKey = true;
      for (let j = 0; j < BYTES_FOR_INDEX; j++) {
        if (byteArray[offset + j] !== 0xff) {
          isCustomKey = false;
          break;
        }
      }

      if (isCustomKey) {
        offset += BYTES_FOR_INDEX;
        key = customKeys[read2BNumber()];
      } else {
        const keyIndex = read2BNumber();
        if (keyIndex < 0 || keyIndex >= SettingKeys.length) {
          throw new Error("Invalid key index: " + keyIndex);
        }
        key = SettingKeys[keyIndex];
      }

      // 값 읽기
      const valueIndicator = byteArray[offset++];
      let value;
      if (valueIndicator === 0xff) {
        value = readString();
      } else {
        if (valueIndicator < 0 || valueIndicator >= PRE_DEFINED_VALUES.length) {
          throw new Error("Invalid predefined value index: " + valueIndicator);
        }
        value = PRE_DEFINED_VALUES[valueIndicator];
      }

      config[key] = value;
    }

    console.log("Deserialized config:", config);

    console.groupEnd();
    return config;
  }
}

const settingsObject = new SettingsObject();
