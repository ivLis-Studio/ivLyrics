import { readFileSync } from "node:fs";
import inputs from "../../src/spicetify/inputs.json" with { type: "json" };

export function readPcStylesheet() {
    const { styles } = inputs;
    if (styles.length === 0 || new Set(styles).size !== styles.length) {
        throw new Error("Expected a non-empty list of unique stylesheets");
    }
    // The order is part of the cascade, including the fullscreen overrides.
    return styles.map(path => {
        if (!/^src\/styles\/(?:[\w-]+\/)*[\w-]+\.css$/.test(path)) {
            throw new Error("Invalid stylesheet source: " + path);
        }
        const css = readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
        return css.endsWith("\n") ? css : css + "\n";
    }).join("");
}
