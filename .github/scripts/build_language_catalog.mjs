import { deflateSync } from "fflate";
import { LANGUAGE_DATA, LANGUAGE_NAMES } from "../../src/i18n/languageCatalog.mjs";

export function buildLanguageCatalog() {
    const encodedLanguages = Object.fromEntries([...LANGUAGE_DATA].map(([code, data]) => [
        code, Buffer.from(deflateSync(Buffer.from(JSON.stringify(data)))).toString("base64"),
    ]));
    return [
        'import { createLazyLanguageCatalog } from "./src/i18n/lazyLanguageCatalog.mjs";',
        `export const LANGUAGE_NAMES = ${JSON.stringify(LANGUAGE_NAMES)};`,
        `export const LANGUAGE_DATA = createLazyLanguageCatalog(${JSON.stringify(encodedLanguages)});`,
    ].join("\n");
}
