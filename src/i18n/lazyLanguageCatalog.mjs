import { inflateSync } from "fflate";

export function createLazyLanguageCatalog(encodedLanguages) {
    const sources = new Map(Object.entries(encodedLanguages));
    const decoded = new Map();
    return {
        keys: () => sources.keys(),
        hasData: code => sources.has(code),
        get(code) {
            if (!sources.has(code)) return undefined;
            if (!decoded.has(code)) {
                const bytes = Uint8Array.from(atob(sources.get(code)), character => character.charCodeAt(0));
                decoded.set(code, JSON.parse(new TextDecoder().decode(inflateSync(bytes))));
            }
            return decoded.get(code);
        },
    };
}
