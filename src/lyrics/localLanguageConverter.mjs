// 외부 라이브러리 경로
const kuroshiroPath = "https://cdn.jsdelivr.net/npm/kuroshiro@1.2.0/dist/kuroshiro.min.js";
const kuromojiPath = "https://cdn.jsdelivr.net/npm/kuroshiro-analyzer-kuromoji@1.1.0/dist/kuroshiro-analyzer-kuromoji.min.js";
const aromanize = "https://cdn.jsdelivr.net/npm/aromanize@0.1.5/aromanize.min.js";
const openCCPath = "https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.min.js";
const pinyinProPath = "https://cdn.jsdelivr.net/npm/pinyin-pro@3.19.7/dist/index.min.js";
const tinyPinyinPath = "https://cdn.jsdelivr.net/npm/tiny-pinyin/dist/tiny-pinyin.min.js";
const dictPath = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict";

const PASSTHROUGH_LANGUAGES = [
    "ru", "vi", "de", "en", "es", "fr", "it", "pt", "nl", "pl", "tr", "cs", "ar", "hi", "th", "id", "ms",
];
const CONVERTER_LANGUAGES = ["ja", "ko", "zh", ...PASSTHROUGH_LANGUAGES];

export function createLocalLanguageConverter({ getDocument, getLibrary, getXMLHttpRequest, schedule }) {
    return class LocalLanguageConverter {
        constructor(lang, isUsingNetease = false) {
            this.finished = Object.fromEntries(CONVERTER_LANGUAGES.map(code => [code, false]));
            this.isUsingNetease = isUsingNetease;
            this.initializationPromise = null;
            this.kuroshiro = null;
            this.Aromanize = null;
            this.OpenCC = null;

            this.applyKuromojiFix();
            this.initializationPromise = this.initializeAsync(lang);
        }

        async initializeAsync(lang) {
            await this.injectExternals(lang);
            await this.createTranslator(lang);
        }

        includeExternal(url) {
            return new Promise((resolve, reject) => {
                const document = getDocument();
                const existingScript = document.querySelector(`script[src="${url}"]`);
                if (existingScript) {
                    if (existingScript.dataset) existingScript.dataset.loaded = existingScript.dataset.loaded || "true";
                    return resolve();
                }

                const script = document.createElement("script");
                script.setAttribute("type", "text/javascript");
                script.setAttribute("src", url);

                script.addEventListener("load", () => {
                    script.dataset.loaded = "true";
                    resolve();
                });

                script.addEventListener("error", () => {
                    reject(new Error(`Failed to load script: ${url}`));
                });

                document.head.appendChild(script);
            });
        }

        async injectExternals(lang) {
            const langCode = lang?.slice(0, 2);
            switch (langCode) {
                case "ja":
                    await Promise.all([
                        this.includeExternal(kuromojiPath),
                        this.includeExternal(kuroshiroPath),
                    ]);
                    break;
                case "ko":
                    await this.includeExternal(aromanize);
                    break;
                case "zh":
                    await this.includeExternal(openCCPath);
                    this.includeExternal(pinyinProPath).catch(() => { });
                    this.includeExternal(tinyPinyinPath).catch(() => { });
                    break;
                default:
                    if (PASSTHROUGH_LANGUAGES.includes(langCode)) this.finished[langCode] = true;
                    break;
            }
        }

        async awaitFinished(language) {
            const langCode = language?.slice(0, 2);
            if (this.initializationPromise) {
                await this.initializationPromise;
            }
            if (langCode && !this.finished[langCode]) {
                await this.injectExternals(language);
                await this.createTranslator(language);
            }
        }

        applyKuromojiFix() {
            const { prototype } = getXMLHttpRequest();
            if (typeof prototype.realOpen !== "undefined") return;
            prototype.realOpen = prototype.open;
            prototype.open = function (method, url, bool) {
                if (url.indexOf(dictPath.replace("https://", "https:/")) === 0) {
                    this.realOpen(method, url.replace("https:/", "https://"), bool);
                } else {
                    this.realOpen(method, url, bool);
                }
            };
        }

        async createTranslator(lang) {
            const langCode = lang.slice(0, 2);

            switch (langCode) {
                case "ja":
                    if (this.kuroshiro) return;
                    await this.waitForGlobals(["Kuroshiro", "KuromojiAnalyzer"], 10000);
                    this.kuroshiro = new (getLibrary("Kuroshiro").default)();
                    await this.kuroshiro.init(new (getLibrary("KuromojiAnalyzer"))({ dictPath }));
                    this.finished.ja = true;
                    break;

                case "ko":
                    if (this.Aromanize) return;
                    await this.waitForGlobals(["Aromanize"], 5000);
                    this.Aromanize = getLibrary("Aromanize");
                    this.finished.ko = true;
                    break;

                case "zh":
                    if (this.OpenCC) return;
                    await this.waitForGlobals(["OpenCC"], 5000);
                    this.OpenCC = getLibrary("OpenCC");
                    this.finished.zh = true;
                    break;

                default:
                    if (PASSTHROUGH_LANGUAGES.includes(langCode)) this.finished[langCode] = true;
                    break;
            }
        }

        async waitForGlobals(globalNames, timeoutMs = 5000) {
            const startTime = Date.now();

            return new Promise((resolve, reject) => {
                const checkGlobals = () => {
                    const allAvailable = globalNames.every((name) => getLibrary(name) !== undefined);

                    if (allAvailable) {
                        resolve();
                        return;
                    }

                    if (Date.now() - startTime > timeoutMs) {
                        reject(new Error(`Timeout waiting for globals: ${globalNames.join(", ")}`));
                        return;
                    }

                    schedule(checkGlobals, 50);
                };

                checkGlobals();
            });
        }

        static _romajiMap = { 'ō': 'ou', 'ū': 'uu', 'ā': 'aa', 'ī': 'ii', 'ē': 'ee' };
        static _romajiPattern = /[ōūāīē]/g;

        static normalizeRomajiString(s) {
            if (typeof s !== "string") return "";
            return s
                .replace(this._romajiPattern, match => this._romajiMap[match])
                .replace(/\s{2,}/g, " ")
                .trim();
        }

        async romajifyText(text, target = "romaji", mode = "spaced") {
            await this.awaitFinished("ja");
            const out = await this.kuroshiro.convert(text, {
                to: target,
                mode,
                romajiSystem: "hepburn",
            });
            return this.constructor.normalizeRomajiString(out);
        }

        async convertToRomaja(text, target) {
            await this.awaitFinished("ko");
            if (target === "hangul") return text;
            if (!this.Aromanize || typeof this.Aromanize.hangulToLatin !== "function") {
                throw new Error("Korean converter not initialized");
            }
            return this.Aromanize.hangulToLatin(text, "rr-translit");
        }

        async convertChinese(text, from, target) {
            await this.awaitFinished("zh");
            const converter = this.OpenCC.Converter({
                from,
                to: target,
            });
            return converter(text);
        }

        async loadPinyinPro() {
            if (getLibrary("pinyinPro") !== undefined) return true;
            const urls = [
                pinyinProPath,
                "https://cdn.jsdelivr.net/npm/pinyin-pro@3.19.7/dist/index.js",
                "https://unpkg.com/pinyin-pro@3.19.7/dist/index.min.js",
            ];
            for (const url of urls) {
                try {
                    await this.includeExternal(url);
                    await this.waitForGlobals(["pinyinPro"], 8000);
                    return true;
                } catch { }
            }
            return false;
        }

        async loadTinyPinyin() {
            if (getLibrary("TinyPinyin") !== undefined) return true;
            const urls = [
                tinyPinyinPath,
                "https://unpkg.com/tiny-pinyin/dist/tiny-pinyin.min.js",
            ];
            for (const url of urls) {
                try {
                    await this.includeExternal(url);
                    await this.waitForGlobals(["TinyPinyin"], 8000);
                    return true;
                } catch { }
            }
            return false;
        }

        async convertToPinyin(text, options = {}) {
            try {
                if (await this.loadTinyPinyin()) {
                    return getLibrary("TinyPinyin").convertToPinyin(text || "");
                }
                if (await this.loadPinyinPro()) {
                    const toneType = options.toneType || "mark";
                    const type = options.type || "string";
                    const nonZh = options.nonZh || "consecutive";
                    return getLibrary("pinyinPro").pinyin(text || "", { toneType, type, nonZh });
                }
                return text || "";
            } catch {
                return text || "";
            }
        }
    };
}
