// node tests/fixtures/first_use_server.mjs /path/to/react18/node_modules [port]
// Loopback-only production-source UI fixture: no Spotify login, API keys or AI calls.
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const modules = process.argv[2];
if (!modules) throw new Error("Pass a node_modules directory containing React 18 UMD files");
const files = new Map([
  ["/react.js", resolve(modules, "react/umd/react.development.js")],
  ["/react-dom.js", resolve(modules, "react-dom/umd/react-dom.development.js")],
  ...["SettingsStyles.js", "OptionsMenu.js", "SetupWizard.js", "LearningMode.js", "I18n.js", "PlaylistPicker.js", "FullscreenOverlay.js", "style.css"]
    .map(name => ["/" + name, resolve(root, name)]),
]);
const languages = readdirSync(resolve(root, "langs")).filter(name => /^Lang[A-Za-z]+\.js$/.test(name));
for (const name of languages) files.set("/langs/" + name, resolve(root, "langs", name));
for (const file of files.values()) readFileSync(file);
const server = createServer((request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/favicon.ico") { response.writeHead(204); response.end(); return; }
    const html = url.pathname === "/";
    if (!html && !files.has(url.pathname)) { response.writeHead(404); response.end(); return; }
    const body = html
      ? readFileSync(new URL("./first_use.html", import.meta.url), "utf8")
        .replace("<!-- LANGUAGE_SCRIPTS -->", languages.map(name => `<script src="/langs/${name}"></script>`).join("\n"))
      : readFileSync(files.get(url.pathname));
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
