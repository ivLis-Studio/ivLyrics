import { readPlaylistPickerFixture, readFullscreenOverlayFixture, readI18nFixture, readLearningModeFixture, readOptionsMenuFixture, readSettingsStylesFixture, readSetupWizardFixture } from "./legacy-page-source.mjs";
// node tests/fixtures/first_use_server.mjs /path/to/react18/node_modules [port]
// Loopback-only production-source UI fixture: no Spotify login, API keys or AI calls.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sourceUrl } from "./source-paths.mjs";
import { readPcStylesheet } from "../../.github/scripts/pc_stylesheet.mjs";

const modules = process.argv[2];
if (!modules) throw new Error("Pass a node_modules directory containing React 18 UMD files");
const files = new Map([
  ["/react.js", resolve(modules, "react/umd/react.development.js")],
  ["/react-dom.js", resolve(modules, "react-dom/umd/react-dom.development.js")],
  ["/OptionsMenu.js", new URL("../../src/app/OptionsMenu.js", import.meta.url)],
  ...["SettingsStyles.js", "SetupWizard.js", "LearningMode.js", "I18n.js", "PlaylistPicker.js", "FullscreenOverlay.js"]
    .map(name => ["/" + name, sourceUrl(name)]),
]);
for (const file of files.values()) readFileSync(file);
const sources = new Map([
  ["/style.css", readPcStylesheet],
  ["/I18n.js", readI18nFixture],
  ["/OptionsMenu.js", readOptionsMenuFixture],
  ["/SettingsStyles.js", readSettingsStylesFixture],
  ["/SetupWizard.js", readSetupWizardFixture],
  ["/LearningMode.js", readLearningModeFixture],
  ["/FullscreenOverlay.js", readFullscreenOverlayFixture],
  ["/PlaylistPicker.js", readPlaylistPickerFixture],
]);
const server = createServer((request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/favicon.ico") { response.writeHead(204); response.end(); return; }
    const html = url.pathname === "/";
    if (!html && !sources.has(url.pathname) && !files.has(url.pathname)) { response.writeHead(404); response.end(); return; }
    const body = html
      ? readFileSync(new URL("./first_use.html", import.meta.url), "utf8")
      : sources.get(url.pathname)?.() ?? readFileSync(files.get(url.pathname));
    const type = html ? "text/html" : url.pathname.endsWith(".css") ? "text/css" : "application/javascript";
    response.writeHead(200, { "Content-Type": type + "; charset=utf-8", "Cache-Control": "no-store" });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain" }); response.end(error.message);
  }
});
server.listen(Number(process.argv[3] || 0), "127.0.0.1", () => {
  console.log(`First-use fixture: http://127.0.0.1:${server.address().port}`);
});
