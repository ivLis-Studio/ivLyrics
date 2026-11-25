const CLEAN_HTML_RT_REGEX = /<rt[^>]*>.*?<\/rt>/gi;
const CLEAN_HTML_RUBY_REGEX = /<\/?ruby[^>]*>/gi;
const CLEAN_HTML_TAG_REGEX = /<[^>]+>/g;

export function formatTime(timestamp) {
  if (Number.isNaN(timestamp)) return timestamp.toString();
  let minutes = Math.trunc(timestamp / 60000);
  let seconds = ((timestamp - minutes * 60000) / 1000).toFixed(2);

  if (minutes < 10) minutes = `0${minutes}`;
  if (seconds < 10) seconds = `0${seconds}`;

  return `${minutes}:${seconds}`;
}
export function formatTextWithTimestamps(text, startTime = 0) {
  if (text.props?.children) {
    return text.props.children
      .map((child) => {
        if (typeof child === "string") {
          return child;
        }
        if (child.props?.children) {
          return child.props?.children[0];
        }
      })
      .join("");
  }
  if (Array.isArray(text)) {
    let wordTime = startTime;
    return text
      .map((word) => {
        wordTime += word.time;
        return `${word.word}<${formatTime(wordTime)}>`;
      })
      .join("");
  }
  return text;
}

/**
 * 해당 줄의 활성화된 항목들만 복사하기 위한 텍스트 생성
 * @param {string|object} mainText - 메인 텍스트 (후리가나 HTML 포함 가능, 또는 객체)
 * @param {string} subText - 발음 (로마지 등)
 * @param {string} subText2 - 번역
 * @param {string} originalText - 원문 가사 (원본)
 * @returns {string} 복사할 텍스트
 */
export function formatLyricLineToCopy(mainText, subText, subText2, originalText) {
  const lines = [];

  // HTML 태그 제거 헬퍼
  const cleanHtml = (text) => {
    if (!text || typeof text !== "string") return "";
    if (!text.includes("<")) return text.trim();
    return text
      .replace(CLEAN_HTML_RT_REGEX, "") // rt 태그 제거
      .replace(CLEAN_HTML_RUBY_REGEX, "") // ruby 태그 제거
      .replace(CLEAN_HTML_TAG_REGEX, "") // 기타 HTML 태그 제거
      .trim();
  };

  // 원문 처리 - originalText가 있으면 우선 사용, 없으면 mainText 사용
  let originalClean = "";
  if (originalText && typeof originalText === "string") {
    originalClean = cleanHtml(originalText);
  } else if (mainText && typeof mainText === "string") {
    originalClean = cleanHtml(mainText);
  } else if (mainText && typeof mainText === "object" && mainText.text) {
    // 카라오케 모드에서 line 객체인 경우
    originalClean = cleanHtml(mainText.text);
  }

  if (originalClean) {
    lines.push(originalClean);
  }

  // subText 처리 (발음)
  const subClean = cleanHtml(subText);
  if (subClean) {
    lines.push(subClean);
  }

  // subText2 처리 (번역)
  const sub2Clean = cleanHtml(subText2);
  if (sub2Clean) {
    lines.push(sub2Clean);
  }

  return lines.join("\n");
}

export function convertParsedToLRC(lyrics, isBelow) {
  let original = "";
  let conver = "";

  if (isBelow) {
    for (const line of lyrics) {
      if (line) {
        const startTime = line.startTime || 0;
        original += `[${formatTime(
          startTime
        )}]${formatTextWithTimestamps(
          line.originalText || "",
          startTime
        )}\n`;
        conver += `[${formatTime(
          startTime
        )}]${formatTextWithTimestamps(line.text || "", startTime)}\n`;
      }
    }
  } else {
    for (const line of lyrics) {
      if (line) {
        const startTime = line.startTime || 0;
        original += `[${formatTime(
          startTime
        )}]${formatTextWithTimestamps(line.text || "", startTime)}\n`;
      }
    }
  }

  return {
    original,
    conver,
  };
}
export function convertParsedToUnsynced(lyrics, isBelow) {
  let original = "";
  let conver = "";

  if (isBelow) {
    for (const line of lyrics) {
      if (typeof line.originalText === "object") {
        original += `${line.originalText?.props?.children?.[0]}\n`;
      } else {
        original += `${line.originalText}\n`;
      }

      if (typeof line.text === "object") {
        conver += `${line.text?.props?.children?.[0]}\n`;
      } else {
        conver += `${line.text}\n`;
      }
    }
  } else {
    for (const line of lyrics) {
      if (typeof line.text === "object") {
        original += `${line.text?.props?.children?.[0]}\n`;
      } else {
        original += `${line.text}\n`;
      }
    }
  }

  return {
    original,
    conver,
  };
}
export function parseLocalLyrics(lyrics, readTrackDurationMs) {
  // Preprocess lyrics by removing [tags] and empty lines
  const lines = lyrics
    .replaceAll(/\[[a-zA-Z]+:.+\]/g, "")
    .trim()
    .split("\n");

  const syncedTimestamp = /\[([0-9:.]+)\]/;
  const karaokeTimestamp = /<([0-9:.]+)>/;

  const unsynced = [];

  const isSynced = lines[0].match(syncedTimestamp);
  const synced = isSynced ? [] : null;

  const isKaraoke = lines[0].match(karaokeTimestamp);
  const karaoke = isKaraoke ? [] : null;

  function timestampToMs(timestamp) {
    const [minutes, seconds] = timestamp.replace(/\[\]<>/, "").split(":");
    return Number(minutes) * 60 * 1000 + Number(seconds) * 1000;
  }

  function parseKaraokeLine(line, startTime) {
    let wordTime = timestampToMs(startTime);
    const karaokeLine = [];
    const karaoke = line.matchAll(/(\S+ ?)<([0-9:.]+)>/g);
    for (const match of karaoke) {
      const word = match[1];
      const time = match[2];
      karaokeLine.push({ word, time: timestampToMs(time) - wordTime });
      wordTime = timestampToMs(time);
    }
    return karaokeLine;
  }

  for (const [i, line] of lines.entries()) {
    const time = line.match(syncedTimestamp)?.[1];
    let lyricContent = line.replace(syncedTimestamp, "").trim();
    const lyric = lyricContent.replaceAll(/<([0-9:.]+)>/g, "").trim();

    if (line.trim() !== "") {
      if (isKaraoke) {
        if (!lyricContent.endsWith(">")) {
          // For some reason there are a variety of formats for karaoke lyrics, Wikipedia is also inconsisent in their examples
          const endTime =
            lines[i + 1]?.match(syncedTimestamp)?.[1] ||
            formatTime(readTrackDurationMs());
          lyricContent += `<${endTime}>`;
        }
        const karaokeLine = parseKaraokeLine(lyricContent, time);
        karaoke.push({ text: karaokeLine, startTime: timestampToMs(time) });
      }
      isSynced &&
        time &&
        synced.push({ text: lyric || "♪", startTime: timestampToMs(time) });
      unsynced.push({ text: lyric || "♪" });
    }
  }

  return { synced, unsynced, karaoke };
}
