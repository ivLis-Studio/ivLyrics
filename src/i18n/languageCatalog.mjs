import LangKo from "./langs/LangKo.js";
import LangEn from "./langs/LangEn.js";
import LangZhCN from "./langs/LangZhCN.js";
import LangZhTW from "./langs/LangZhTW.js";
import LangJa from "./langs/LangJa.js";
import LangEs from "./langs/LangEs.js";
import LangFr from "./langs/LangFr.js";
import LangDe from "./langs/LangDe.js";
import LangIt from "./langs/LangIt.js";
import LangRu from "./langs/LangRu.js";
import LangSv from "./langs/LangSv.js";
import LangPt from "./langs/LangPt.js";
import LangHi from "./langs/LangHi.js";
import LangAr from "./langs/LangAr.js";
import LangFa from "./langs/LangFa.js";
import LangBn from "./langs/LangBn.js";
import LangCs from "./langs/LangCs.js";
import LangTh from "./langs/LangTh.js";
import LangTr from "./langs/LangTr.js";
import LangVi from "./langs/LangVi.js";
import LangId from "./langs/LangId.js";
import LangMs from "./langs/LangMs.js";

export const LANGUAGE_NAMES = {
    ko: "한국어",
    en: "English",
    "zh-CN": "简体中文",
    "zh-TW": "繁體中文",
    ja: "日本語",
    es: "Español",
    fr: "Français",
    de: "Deutsch",
    it: "Italiano",
    ru: "Русский",
    sv: "Svenska",
    pt: "Português",
    hi: "हिन्दी",
    ar: "العربية",
    fa: "فارسی",
    bn: "বাংলা",
    cs: "Čeština",
    th: "ภาษาไทย",
    tr: "Türkçe",
    vi: "Tiếng Việt",
    id: "Bahasa Indonesia",
    ms: "Bahasa Melayu"
};


export const LANGUAGE_DATA = new Map([
    ["ko", LangKo],
    ["en", LangEn],
    ["zh-CN", LangZhCN],
    ["zh-TW", LangZhTW],
    ["ja", LangJa],
    ["es", LangEs],
    ["fr", LangFr],
    ["de", LangDe],
    ["it", LangIt],
    ["ru", LangRu],
    ["sv", LangSv],
    ["pt", LangPt],
    ["hi", LangHi],
    ["ar", LangAr],
    ["fa", LangFa],
    ["bn", LangBn],
    ["cs", LangCs],
    ["th", LangTh],
    ["tr", LangTr],
    ["vi", LangVi],
    ["id", LangId],
    ["ms", LangMs],
]);
