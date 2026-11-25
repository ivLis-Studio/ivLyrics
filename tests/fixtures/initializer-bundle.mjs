import { readFileSync } from "node:fs";
import { buildSync } from "esbuild";
import { dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

// Execute the production ESM initializer and its dependencies in the same
// isolated VM as the Spotify stubs used by the extension contract tests.
export function bundleInitializer(sourceUrl, { transformSource } = {}) {
    const path = fileURLToPath(sourceUrl);
    const contents = transformSource
        ? transformSource(readFileSync(path, "utf8").replace("export default function", "const initialize = function")) + "\ninitialize();"
        : `import initialize from ${JSON.stringify("./" + basename(path))}; initialize();`;
    return buildSync({
        stdin: {
            contents,
            sourcefile: transformSource ? path : undefined,
            resolveDir: dirname(path),
        },
        bundle: true,
        format: "iife",
        platform: "browser",
        write: false,
    }).outputFiles[0].text;
}
