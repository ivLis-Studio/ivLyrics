// Usage: node tests/fixtures/vinyl_player_server.mjs /path/to/node_modules [port]
// Requires local React 18 UMD files. Serves only the fixture and production
// LP sources on loopback; it never connects to Spotify or changes app settings.
// Add ?baseline=1 to render the unmodified 44c0625 sources for comparison.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const reactRoot = process.argv[2];
if (!reactRoot) throw new Error("Pass a node_modules directory containing React 18 UMD files");
const port = Number(process.argv[3] || 48173);
const readSource = (path, baseline) => baseline
  ? execFileSync("git", ["show", `44c0625:${path}`], { cwd: root, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 })
  : readFileSync(resolve(root, path), "utf8");
const section = (source, start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  if (from < 0 || to <= from) throw new Error(`Missing fixture source: ${start}`);
  return source.slice(from, to);
};
const metadataSource = baseline => {
  const source = readSource("FullscreenOverlay.js", baseline);
  return `${section(source, "    const trimTitle =", "    const isUnknownTrackMetadata =")}
window.fixtureLiveTrack = (CONFIG, trackUri, translatedMetadata, item) => {
  const title = item.metadata.title, artist = item.metadata.artist_name, coverUrl = item.metadata.image_url;
  const trimTitleEnabled = CONFIG.visual["fullscreen-trim-title"] === true;
  const trackAccentUri = item.uri, trackAccent = "#f9a0b3";
  const getFirstSpotifyUri = (...values) => values.find(value => String(value || "").startsWith("spotify:"));
  const getCurrentArtistUri = () => "spotify:artist:fixture";
  const getCurrentAlbumUri = () => "spotify:album:fixture";
  Spicetify.Player.data.item = item;
  ${section(source, "        const computeLiveVinylTrack =", "        const {\n            currentPlayerItem, currentPlayerMetadata, currentTrackUri,")}
  return computeLiveVinylTrack().liveVinylTrack;
};
window.fixtureVinylSettings = CONFIG => {
  ${section(source, "        const computeVinylSettings =", "        const renderFocusedLyricsView =")}
  return computeVinylSettings();
};`;
};
const settingsSource = baseline => {
  const source = readSource("Settings.js", baseline);
  const from = source.indexOf("const renderFullscreenVinylSection =");
  const items = section(source.slice(from), "            items: [", "            onChange: saveVinylSetting,")
    .replace(/^\s*items:\s*/, "").trim().replace(/,$/, "");
  return `window.fixtureSettingItems = CONFIG => {
    const ConfigSlider = "toggle", ConfigSliderRange = "range";
    return (${items});
  };`;
};
const files = new Map([
  ["/react.js", resolve(reactRoot, "react/umd/react.development.js")],
  ["/react-dom.js", resolve(reactRoot, "react-dom/umd/react-dom.development.js")],
]);
for (const file of files.values()) readFileSync(file); // Fail before opening a port if React is absent.
const server = createServer((request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    const baseline = url.pathname.startsWith("/baseline/");
    const path = baseline ? url.pathname.slice("/baseline".length) : url.pathname;
    let body, type = "application/javascript";
    if (path === "/qa-art.svg") {
      const finish = () => {
        if (response.destroyed) return;
        const failed = url.searchParams.has("fail");
        response.writeHead(failed ? 503 : 200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
        response.end(failed ? "fixture artwork failure" : '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#25767e"/><text x="30" y="210" fill="white" font-size="28">HYDRATED LOCAL ART</text></svg>');
      };
      const timer = setTimeout(finish, Math.min(15000, Math.max(0, Number(url.searchParams.get("delay")) || 0)));
      response.on("close", () => clearTimeout(timer));
      return;
    } else if (path === "/" || path === "/cd") {
      body = readFileSync(new URL(path === "/cd" ? "./cd_player.html" : "./vinyl_player.html", import.meta.url), "utf8")
        .replaceAll("@SOURCE_PREFIX@", url.searchParams.has("baseline") ? "/baseline" : "");
      type = "text/html";
    } else if (files.has(path)) body = readFileSync(files.get(path));
    else if (path === "/metadata.js") body = metadataSource(baseline);
    else if (path === "/settings.js") body = settingsSource(baseline);
    else if (["/style.css", "/CdVisualizer.js", "/PlaylistPicker.js", "/FullscreenOverlay.js", "/VinylPlayerMode.js", "/VinylActiveLyricRenderer.js", "/Pages.js", "/LyricsWordSegmenter.js", "/langs/LangEn.js"].includes(path)) {
      body = readSource(path.slice(1), baseline);
      if (path.endsWith(".css")) { type = "text/css"; body = body.replace(/^@import\s+[^;]+;/gm, ""); }
    } else if (path === "/favicon.ico") { response.writeHead(204); response.end(); return; }
    else { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain" }); response.end(error.message);
  }
});
server.listen(port, "127.0.0.1", () => console.log(`LP fixture: http://127.0.0.1:${server.address().port}`));
