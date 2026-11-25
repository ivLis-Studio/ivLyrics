import { GOOGLE_FONTS, lyricsFontStylesheet } from "../../core/lyricsFontCatalog.mjs";

export function loadSettingsFontFamily(document, fontFamily, { refreshExisting = true, debug = () => {} } = {}) {
  if (!fontFamily) return;

  const fonts = fontFamily.split(",").map((font) => font.trim().replace(/['"]/g, ""));
  fonts.forEach((font) => {
    debug(`[ivLyrics] Checking font: ${font} for loading`);
    if (!font || !GOOGLE_FONTS.includes(font)) {
      debug(`[ivLyrics] Font ${font} not in GOOGLE_FONTS list or invalid`);
      return;
    }

    const fontId = font.replace(/ /g, "-").toLowerCase();
    const linkId = `ivLyrics-google-font-${fontId}`;
    let link = document.getElementById(linkId);

    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
      debug(`[ivLyrics] Created new link element for: ${font}`);
    } else if (!refreshExisting) {
      return;
    }

    link.href = lyricsFontStylesheet(font);
    debug(`[ivLyrics] Font link href set to: ${link.href}`);
  });
}

export function loadStoredSettingsFonts(document, visual, debug) {
  const options = { refreshExisting: false, debug };
  for (const [label, key] of [
    ["Base", "font-family"],
    ["Original", "original-font-family"],
    ["Phonetic", "phonetic-font-family"],
    ["Translation", "translation-font-family"],
  ]) {
    debug(`[ivLyrics] ${label} font from CONFIG: ${visual[key]}`);
    loadSettingsFontFamily(document, visual[key], options);
  }
  loadSettingsFontFamily(document, visual["instrumental-break-label-font-family"], options);
}
