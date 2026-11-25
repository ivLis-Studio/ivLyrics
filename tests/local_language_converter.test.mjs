import assert from "node:assert/strict";
import test from "node:test";
import { createLocalLanguageConverter } from "#ivlyrics/lyrics/localLanguageConverter.mjs";
import { createTranslator } from "#ivlyrics/lyrics/createTranslator.mjs";

test("the translator public class retains browser-backed Japanese conversion", async () => {
    const scripts = [];
    class Request {
        open(method, url) { this.url = url; }
    }
    const loaded = {
        Kuroshiro: {
            default: class {
                async init(analyzer) { assert.match(analyzer.dictPath, /kuromoji.*\/dict$/); }
                async convert(text, options) {
                    assert.equal(text, "東京");
                    assert.equal(options.to, "romaji");
                    return "  Tōkyō  ";
                }
            },
        },
        KuromojiAnalyzer: class {
            constructor({ dictPath }) { this.dictPath = dictPath; }
        },
    };
    const document = {
        querySelector(selector) {
            scripts.push(selector);
            return { dataset: {} };
        },
    };
    const Converter = createLocalLanguageConverter({
        getDocument: () => document,
        getLibrary: (name) => loaded[name],
        getXMLHttpRequest: () => Request,
        schedule: () => assert.fail("the loaded libraries should be ready immediately"),
    });
    const Translator = createTranslator({ LocalLanguageConverter: Converter });
    const translator = new Translator("ja");

    assert.equal(await translator.romajifyText("東京"), "Toukyou");
    assert.equal(Translator.normalizeRomajiString("  Ū  "), "Ū");
    assert.equal(scripts.length, 2);
    assert.equal(translator.finished.ja, true);
    const request = new Request();
    request.open("GET", "https:/cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/token.dat.gz");
    assert.equal(request.url, "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/token.dat.gz");
});
