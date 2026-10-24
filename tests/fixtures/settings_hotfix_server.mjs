// Offline, loopback-only production Settings fixture.
// node tests/fixtures/settings_hotfix_server.mjs /path/to/react18/node_modules [port]
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = fileURLToPath(new URL("../../", import.meta.url));
const modules = resolve(process.argv[2] || "/tmp/ivlyrics-welcome-deps.YxOkwc/node_modules");
const files = new Map([
  ["/react.js", resolve(modules, "react/umd/react.development.js")],
  ["/react-dom.js", resolve(modules, "react-dom/umd/react-dom.development.js")],
  ...["Settings.js", "SettingsStyles.js", "I18n.js", "PlaylistPicker.js", "FullscreenOverlay.js", "VinylPlayerMode.js", "Addon_AI_DeepL.js", "LrclibLocalDatabaseRuntime.js", "LrclibLocalDatabase.js", "Addon_Lyrics_Lrclib.js", "style.css"]
    .map(name => ["/" + name, resolve(root, name)]),
]);
const languages = readdirSync(resolve(root, "langs")).filter(name => /^Lang[A-Za-z]+\.js$/.test(name)).sort();
for (const name of languages) files.set("/langs/" + name, resolve(root, "langs", name));
for (const file of files.values()) readFileSync(file);

// Extract declarations only; never run the Spotify bootstrap in index.js/Pages.js.
function declaration(source, name) {
  const match = new RegExp(`^(?:const|let|var|function|class) ${name}\\b`, "m").exec(source);
  if (!match) throw new Error(`Production helper not found: ${name}`);
  const rest = source.slice(match.index + 1);
  const next = rest.search(/\n(?=(?:const|let|var|function|class|window\.|\(function)\b)/);
  return source.slice(match.index, next < 0 ? source.length : match.index + 1 + next);
}

function productionDefaults() {
  const source = readFileSync(resolve(root, "index.js"), "utf8");
  const start = source.indexOf("const CONFIG = {");
  const end = source.indexOf("window.CONFIG = CONFIG;", start);
  if (start < 0 || end < start) throw new Error("Production CONFIG markers not found");
  const helpers = [];
  for (let attempt = 0; attempt < 60; attempt++) {
    const context = vm.createContext({
      APP_NAME: "ivLyrics", window: {}, console,
      navigator: { language: "en-US", languages: ["en-US"] },
      StorageManager: {
        get: (_key, fallback = true) => fallback, getItem: () => null,
        getPersisted: () => null, setPersisted() {}, setItem() {}, removeItem() {},
      },
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    });
    try {
      vm.runInContext(`${helpers.map(name => declaration(source, name)).join("\n")}\n${source.slice(start, end)}\nglobalThis.visual = CONFIG.visual;`, context, { timeout: 1000 });
      return context.visual;
    } catch (error) {
      const missing = /^(\w+) is not defined/.exec(error.message)?.[1];
      if (!missing || helpers.includes(missing)) throw error;
      helpers.unshift(missing);
    }
  }
  throw new Error("Could not resolve production CONFIG helpers");
}

function previewHelpers() {
  const source = readFileSync(resolve(root, "Pages.js"), "utf8");
  const names = ["getLyricsTypographyStyleVariables", "createBreakIconChildren", "InterludeIndicator",
    "getLyricsDisplayMode", "renderAnnotatedLyricHTML", "renderLyricSubLine"];
  const seen = new Set();
  const result = [];
  const add = name => {
    if (seen.has(name)) return;
    seen.add(name);
    const body = declaration(source, name);
    // Pull in the small, pure production typography/interlude dependencies.
    for (const match of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
      const dependency = match[1];
      if (dependency !== name && new RegExp(`^(?:const|let|var|function|class) ${dependency}\\b`, "m").test(source)) add(dependency);
    }
    result.push(body);
  };
  names.forEach(add);
  const index = readFileSync(resolve(root, "index.js"), "utf8");
  result.push(declaration(index, "PRONUNCIATION_DISPLAY_MODES"), declaration(index, "isPronunciationDisplayMode"));
  // Use the actual pure text/ruby helpers without loading Utils' host startup.
  const utils = readFileSync(resolve(root, "Utils.js"), "utf8");
  result.push(declaration(utils, "KANJI_CHARACTER_REGEX"));
  const methods = ["rubyTextToHTML", "applyFuriganaIfEnabled"].map(name => {
    const start = utils.indexOf(`\n  ${name}(`), end = utils.indexOf("\n  },", start);
    if (start < 0 || end < start) throw new Error(`Production preview text helper not found: ${name}`);
    return utils.slice(start, end + "\n  },".length);
  });
  result.push(`Object.assign(Utils, {${methods.join("\n")}\n});`);
  return result.join("\n");
}

// Fail before listening if this checkout cannot provide its own defaults/helpers.
productionDefaults();
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
      body = readFileSync(new URL("./settings_hotfix.html", import.meta.url), "utf8")
        .replace("<!-- LANGUAGE_SCRIPTS -->", languages.map(name => `<script src="/langs/${name}"></script>`).join("\n"));
    } else if (url.pathname === "/fixture-config.js") {
      body = `const FIXTURE_CONFIG_DEFAULTS = ${JSON.stringify(productionDefaults())};\nconst CONFIG = {visual: {...FIXTURE_CONFIG_DEFAULTS}}; window.CONFIG = CONFIG;`;
    } else if (url.pathname === "/fixture-preview-helpers.js") {
      body = previewHelpers();
    } else if (url.pathname === "/fixture-fonts.css") {
      type = "text/css"; body = "/* Offline fixture: use fonts already installed on the host. */";
    } else if (url.pathname === "/health") {
      type = "application/json";
      body = JSON.stringify({ fixture: "settings_hotfix", offline: true, root, modules,
        defaults: Object.keys(productionDefaults()).length, sourceReload: "every request" });
    } else if (files.has(url.pathname)) {
      body = readFileSync(files.get(url.pathname));
      if (url.pathname.endsWith(".css")) {
        type = "text/css";
        // The complete production stylesheet is retained; only remote font imports
        // point to an empty local stylesheet so the fixture makes zero external requests.
        body = body.toString().replace(/@import\s+url\(["']?https?:\/\/[^)]+\)\s*;/g, '@import url("/fixture-fonts.css");');
      }
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
