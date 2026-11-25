import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

export function readLanguageTable(file) {
    const source = readFileSync(new URL("../../src/i18n/langs/" + file, import.meta.url), "utf8");
    return runInNewContext(source.replace(/^export default /m, "globalThis.table = ") + "\ntable;", {}, { filename: file });
}

// Browser fixtures still use classic scripts to set up their mock UI.
export function readClassicLanguageFixture(file) {
    const table = readLanguageTable(file);
    const key = "LANG_" + table.meta.code.toUpperCase().replace("-", "_");
    return `window[${JSON.stringify(key)}] = ${JSON.stringify(table)};`;
}
