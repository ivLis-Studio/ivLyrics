import { readAiProviderFixture } from "./ai-provider.mjs";
// Offline, loopback-only production Settings fixture.
// node tests/fixtures/settings_hotfix_server.mjs /path/to/react18/node_modules [port]
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleInitializer } from "./initializer-bundle.mjs";
import { sourceUrl } from "./source-paths.mjs";
import { buildLocalDatabaseWorker } from "../../.github/scripts/build_lrclib_local_runtime.mjs";
import { readPcStylesheet } from "../../.github/scripts/pc_stylesheet.mjs";
import { readPlaylistPickerFixture, bundleFixtureImports, readFullscreenOverlayFixture, readI18nFixture, readSettingsRuntimeFixture, readSettingsStylesFixture, readVinylPlayerFixture } from "./legacy-page-source.mjs";
import { createDefaultVisualSettings } from "../../src/spicetify/createAppConfig.mjs";
import { SETTINGS_DEFAULT_VALUES, SETTINGS_FALLBACK_DEFAULT_VALUES } from "../../src/features/settings/settingsDefaults.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const modules = resolve(process.argv[2] || "/tmp/ivlyrics-welcome-deps.YxOkwc/node_modules");
const files = new Map([
  ["/react.js", resolve(modules, "react/umd/react.development.js")],
  ["/react-dom.js", resolve(modules, "react-dom/umd/react-dom.development.js")],
  ...["Settings.js", "SettingsStyles.js", "I18n.js", "PlaylistPicker.js", "FullscreenOverlay.js", "VinylPlayerMode.js", "Addon_AI_DeepL.js", "Addon_Lyrics_Lrclib.js"]
    .map(name => ["/" + name, sourceUrl(name)]),
]);
for (const file of files.values()) readFileSync(file);
const worker = await buildLocalDatabaseWorker();
const databaseRuntime = bundleFixtureImports(
  'import { installLocalLrclibDatabase } from "#ivlyrics/providers/lyrics/LrclibLocalDatabase.js";\n'
  + `installLocalLrclibDatabase(window, ${JSON.stringify(worker.source)});`,
  "fixtureSettingsLocalDatabase",
);

function previewHelpers() {
  return bundleFixtureImports(
    `import { createFuriganaTextAdapter } from "#ivlyrics/lyrics/lyricTextMarkup.mjs";
import { getLyricFuriganaConverter } from "#ivlyrics/lyrics/lyricsTextRuntime.mjs";
Utils.applyFuriganaIfEnabled = createFuriganaTextAdapter({
  readEnabled: () => CONFIG?.visual?.["furigana-enabled"],
  readConverter: () => getLyricFuriganaConverter(window),
});`,
    "fixtureSettingsFurigana",
  );
}

const fixtureConfigDefaults = createDefaultVisualSettings();
// Fail before listening if this checkout cannot provide its own preview helpers.
previewHelpers();
const csp = [
  "default-src 'none'", "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "font-src 'self'", "connect-src 'self'",
  "frame-src 'none'", "worker-src 'self' blob:", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join("; ");
const server = createServer((request, response) => {
  const headers = { "Cache-Control": "no-store", "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, headers); response.end("Fixture is read-only"); return;
    }
    const url = new URL(request.url, "http://127.0.0.1");
    let body, type = "application/javascript";
    if (url.pathname === "/favicon.ico") { response.writeHead(204, headers); response.end(); return; }
    if (url.pathname === "/" || url.pathname === "/settings_hotfix.html") {
      type = "text/html";
      body = readFileSync(new URL("./settings_hotfix.html", import.meta.url), "utf8");
    } else if (url.pathname === "/fixture-config.js") {
      body = `const FIXTURE_CONFIG_DEFAULTS = ${JSON.stringify(fixtureConfigDefaults)};
const FIXTURE_SETTINGS_FALLBACK_DEFAULT_VALUES = ${JSON.stringify(SETTINGS_FALLBACK_DEFAULT_VALUES)};
const FIXTURE_RESETTABLE_SETTINGS = new Set(${JSON.stringify([
  ...Object.keys(SETTINGS_DEFAULT_VALUES), ...Object.keys(SETTINGS_FALLBACK_DEFAULT_VALUES),
])});
const CONFIG = {visual: {...FIXTURE_CONFIG_DEFAULTS}}; window.CONFIG = CONFIG;`;
    } else if (url.pathname === "/fixture-preview-helpers.js") {
      body = previewHelpers();
    } else if (url.pathname === "/fixture-fonts.css") {
      type = "text/css"; body = "/* Offline fixture: use fonts already installed on the host. */";
    } else if (url.pathname === "/health") {
      type = "application/json";
      body = JSON.stringify({ fixture: "settings_hotfix", offline: true, root, modules,
        defaults: Object.keys(fixtureConfigDefaults).length, sourceReload: "every request" });
    } else if (url.pathname === "/LrclibLocalDatabase.js") {
      body = databaseRuntime;
    } else if (url.pathname === "/I18n.js") {
      body = readI18nFixture();
    } else if (url.pathname === "/SettingsStyles.js") {
      body = readSettingsStylesFixture();
    } else if (url.pathname === "/Settings.js") {
      body = readSettingsRuntimeFixture();
    } else if (url.pathname === "/PlaylistPicker.js") {
      body = readPlaylistPickerFixture();
    } else if (url.pathname === "/Addon_AI_DeepL.js") {
      body = readAiProviderFixture("Addon_AI_DeepL.js");
    } else if (url.pathname === "/FullscreenOverlay.js") {
      body = readFullscreenOverlayFixture();
    } else if (url.pathname === "/VinylPlayerMode.js") {
      body = readVinylPlayerFixture();
    } else if (url.pathname === "/Addon_Lyrics_Lrclib.js") {
      body = bundleInitializer(files.get(url.pathname));
    } else if (url.pathname === "/style.css") {
      type = "text/css";
      // Route the remote font import to the empty local stylesheet.
      body = readPcStylesheet().replace(/@import\s+url\(["']?https?:\/\/[^)]+\)\s*;/g, '@import url("/fixture-fonts.css");');
    } else if (files.has(url.pathname)) {
      body = readFileSync(files.get(url.pathname));
    } else { response.writeHead(404, headers); response.end("Not in fixture allowlist"); return; }
    response.writeHead(200, { ...headers, "Content-Type": `${type}; charset=utf-8` });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    response.writeHead(500, { ...headers, "Content-Type": "text/plain; charset=utf-8" });
    response.end(error.stack);
  }
});
server.listen(Number(process.argv[3] || 0), "127.0.0.1", () => {
  console.log(`Settings fixture: http://127.0.0.1:${server.address().port}/?language=en&theme=dark&tab=general`);
  console.log("Live production sources; API/account/network operations are offline stubs.");
});
