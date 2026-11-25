// ============================================
// Language detection rules
// ============================================
// Layered on top of the original detector (detectLanguageByRules): the
// script that owns the lyric decides first; scripts several languages share
// are split by the letters only one of them uses; Latin lyrics go through
// romanized-language word lists, the model and a few pair checks. Measured
// (2026-10) on 168 hand-checked lyrics in 37 languages: 97-100% of whole
// songs correct, against 65-87% for the original detector alone; on 4,900
// LRCLIB lyrics labeled through Wikidata, 92% (song labels) and 82% (artist
// labels) agree, against 80% and 70%. Most remaining disagreements are
// labels that do not fit the lyrics (an English song by a Spanish artist).
export const LanguageRefiner = (() => {
    // Same claim rule as the original detector: a non-Latin script owns the
    // lyric once it holds enough of the lines, so a borrowed English hook
    // does not relabel a Korean or Arabic song.
    const LINE_SHARE = 0.15;
    const MIN_LINES = 3;
    const HAN_CHARACTER = /\p{Script=Han}/u;
    const ARABIC_CHARACTER = /\p{Script=Arabic}/u;

    // Credit lines some sources prepend ("作词 : …", "Composed by …").
    const CREDIT_LINE = /^\s*(?:作词|作詞|作曲|编曲|編曲|制作人|製作人|词|詞|曲|lyrics by|lyricist|composed by|composer|written by|produced by|producer)\s*[:：]/iu;

    // Scripts written by (practically) a single song language.
    const SINGLE_LANGUAGE_SCRIPTS = [
        ["el", 0x0370, 0x03FF], ["el", 0x1F00, 0x1FFF], ["he", 0x0590, 0x05FF], ["hy", 0x0530, 0x058F],
        ["ka", 0x10A0, 0x10FF], ["ta", 0x0B80, 0x0BFF], ["te", 0x0C00, 0x0C7F], ["kn", 0x0C80, 0x0CFF],
        ["ml", 0x0D00, 0x0D7F], ["gu", 0x0A80, 0x0AFF], ["pa", 0x0A00, 0x0A7F], ["or", 0x0B00, 0x0B7F],
        ["si", 0x0D80, 0x0DFF], ["th", 0x0E00, 0x0E7F], ["lo", 0x0E80, 0x0EFF], ["km", 0x1780, 0x17FF],
        ["my", 0x1000, 0x109F], ["am", 0x1200, 0x139F], ["bo", 0x0F00, 0x0FFF], ["bn", 0x0980, 0x09FF],
    ];

    const scriptOfCodePoint = (code) => {
        if (code < 0x0250) {
            return (code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A)
                || (code >= 0xC0 && code !== 0xD7 && code !== 0xF7) ? "latin" : null;
        }
        if (code >= 0x1E00 && code <= 0x1EFF) return "latin";
        if (code >= 0x0400 && code <= 0x052F) return "cyrillic";
        // The span between Arabic presentation-form blocks also contains
        // emoji variation selectors and CJK punctuation, not Arabic text.
        if (ARABIC_CHARACTER.test(String.fromCodePoint(code))) return "arabic";
        if (code >= 0x0900 && code <= 0x097F) return "devanagari";
        if ((code >= 0x1100 && code <= 0x11FF) || (code >= 0x3130 && code <= 0x318F)
            || (code >= 0xAC00 && code <= 0xD7AF) || (code >= 0x3040 && code <= 0x30FF)
            || (code >= 0xFF66 && code <= 0xFF9F) || HAN_CHARACTER.test(String.fromCodePoint(code))) return "cjk";
        for (const [language, from, to] of SINGLE_LANGUAGE_SCRIPTS) {
            if (code >= from && code <= to) return language;
        }
        return null;
    };

    const scriptOfLine = (text) => {
        const counts = new Map();
        for (const character of text) {
            const script = scriptOfCodePoint(character.codePointAt(0));
            if (script) counts.set(script, (counts.get(script) || 0) + 1);
        }
        let best = null;
        let bestCount = 0;
        for (const [script, count] of counts) {
            if (count > bestCount || (count === bestCount && script === "latin")) {
                best = script;
                bestCount = count;
            }
        }
        return best;
    };

    const countMatches = (text, regex) => (text.match(regex) || []).length;

    // Urdu writes letters neither Arabic nor Persian uses (tteh, ddal,
    // rreh, noon ghunna, yeh barree, do-chashmi heh); Persian adds peh,
    // tcheh, jeh, gaf, keheh and farsi yeh to the Arabic alphabet, which
    // Urdu shares, so Urdu is checked first.
    const resolveArabicScript = (text) => {
        const total = countMatches(text, /[؀-ۿ]/gu) || 1;
        if (countMatches(text, /[ٹڈڑںےھ]/gu) / total >= 0.02) return "ur";
        return countMatches(text, /[پچژگکی]/gu) / total >= 0.07 ? "fa" : "ar";
    };

    // The model asked once about a whole song can be pulled off by a few
    // n-grams (clear Spanish read as Hungarian, Finnish as Tagalog), and a
    // hook sung twenty times counts twenty times. Each distinct line votes
    // instead, its ranking weighted by its word count.
    const rankByLines = (text, model, only) => {
        if (!model?.detectAll) return [];
        const tally = new Map();
        let total = 0;
        for (const line of new Set(text.split("\n"))) {
            const weight = wordsOf(line).length;
            if (weight < 2) continue;
            try {
                const ranking = model.detectAll(line, { only });
                if (!Array.isArray(ranking)) return [];
                for (const entry of ranking) {
                    if (!entry || (only && !only.includes(entry.lang)) || !Number.isFinite(entry.accuracy)
                        || entry.accuracy <= 0 || entry.accuracy > 1) continue;
                    tally.set(entry.lang, (tally.get(entry.lang) || 0) + weight * entry.accuracy);
                }
            } catch (_) {
                // An optional model must not break lyric loading. Retain
                // script/word rules if inference fails for this song.
                return [];
            }
            total += weight;
        }
        return [...tally.entries()]
            .sort((left, right) => right[1] - left[1])
            .map(([lang, score]) => ({ lang, accuracy: score / total }));
    };

    // Cyrillic languages are mostly settled by their own letters.
    const CYRILLIC_LANGUAGES = ["ru", "uk", "bg", "be", "mk", "sr", "kk", "mn", "tt"];
    const resolveCyrillic = (text, model) => {
        const lower = text.toLowerCase();
        if (/[ѓќѕ]/u.test(lower)) return "mk";
        if (/[ђћ]/u.test(lower)) return "sr";
        // Kazakh writes these letters every few words (5-10% of letters); a
        // Russian rap track with one Kazakh guest verse stays near 1%.
        if (countMatches(lower, /[әғқңұһ]/gu) / (countMatches(lower, /\p{Script=Cyrillic}/gu) || 1) >= 0.02) return "kk";
        if (/ў/u.test(lower)) return "be";
        if (/[їєґ]/u.test(lower) || (/і/u.test(lower) && !/[ыэ]/u.test(lower))) return "uk";
        if (/[јџљњ]/u.test(lower)) return "sr";
        return rankByLines(text, model, CYRILLIC_LANGUAGES)[0]?.lang || "ru";
    };

    const MARATHI_WORDS = new Set(["आहे", "आणि", "नाही", "मला", "तुला", "माझा", "माझी", "तुझा", "तुझी", "होते", "काय"]);
    const NEPALI_WORDS = new Set(["छ", "छन्", "हुन्छ", "मेरो", "तिम्रो", "गर्न", "भयो", "थियो", "छैन"]);
    const HINDI_WORDS = new Set(["है", "हैं", "और", "मैं", "तुम", "मेरा", "मेरी", "तेरा", "तेरी", "नहीं", "क्या", "का", "की", "के"]);
    const resolveDevanagari = (text) => {
        const words = text.split(/\s+/u);
        const countIn = (set) => words.filter((word) => set.has(word)).length;
        const hindi = countIn(HINDI_WORDS);
        const marathi = countMatches(text, /ळ/gu) + countIn(MARATHI_WORDS) * 2;
        const nepali = countIn(NEPALI_WORDS) * 2;
        if (marathi > hindi && marathi >= 4) return "mr";
        if (nepali > hindi && nepali >= 4) return "ne";
        return "hi";
    };

    // ============================================
    // Latin script
    // ============================================
    const wordsOf = (text) => text.toLowerCase().normalize("NFC").match(/[\p{L}\p{M}0-9']+/gu) || [];

    // Lyrics written in Latin letters for a language with its own script.
    // Romanized Hindi and Urdu are one written language (Hindustani) and
    // report as "hi". Arabizi writes the letters Latin lacks with digits
    // (3 = ع, 7 = ح, 9 = ق).
    const ROMANIZED_WORDS = {
        hi: new Set(["hai", "hain", "main", "mein", "tum", "tumhe", "tumhara", "tera", "teri", "tere", "mera", "meri", "mere", "dil", "pyaar", "pyar", "nahi", "nahin", "kya", "kyun", "aur", "bhi", "hum", "humko", "yeh", "woh", "tu", "tujhe", "mujhe", "mujhko", "zindagi", "raha", "rahi", "rahe", "sakte", "sakta", "bin", "bina", "jaan", "saath", "ishq", "khuda", "sanam", "yaara", "yaar", "kuch", "abhi", "phir", "hota", "hoti", "jab", "kabhi", "dard", "aankhon", "aankhein", "raat", "duniya", "aaja", "jaana", "apna", "apni", "tujhko", "chahiye", "lagta", "lagti", "hoon", "hu", "mujhse", "tujhse", "kaise", "kahin", "jaise", "wajah", "mohabbat", "afreen", "jahan", "sapne", "baat", "baatein", "husn", "nazar", "chehra", "zulf", "noor", "maula", "sajna", "sajda", "aankhen", "nigahen", "tasveer", "mehfil", "khwab", "khwaab", "intezaar", "jaanam", "humsafar", "dua", "tanha", "pyaasa", "dekha", "dekho", "suno", "kaho", "chalo", "laga", "lagi", "gaya", "gayi", "aaya", "aayi", "tujhme", "mujhme", "hoke", "rehna", "reh", "sakoon", "sukoon", "kehna", "kaha", "agar", "toh", "khud", "juda", "tujh", "mujh", "jaayenge", "jayenge", "wajood", "hoga", "hogi", "karna", "karta", "karti", "kiya", "diya", "liya", "sirf", "yahan", "wahan", "jaisa", "pehle", "jaate", "jaati", "aate"]),
        ja: new Set(["watashi", "boku", "ore", "kimi", "anata", "desu", "deshou", "kokoro", "sora", "yume", "itsumo", "zutto", "mada", "nani", "doko", "kono", "sono", "koto", "mono", "hito", "sekai", "hikari", "namida", "kaze", "hoshi", "sayonara", "arigatou", "daisuki", "suki", "aishiteru", "toki", "yoru", "shinjite", "kitto", "futari", "hitori", "kimochi", "omoi", "basho", "michi", "owari", "dakara", "demo", "shiranai", "wakaranai", "nakute", "shite", "kara", "made", "dake", "naku", "mitai", "konna", "sonna", "donna"]),
        ko: new Set(["saranghae", "neoui", "naui", "geudae", "uri", "neon", "naneun", "neoneun", "haru", "sarang", "jigeum", "oneul", "maeil", "dasi", "hamkke", "gati", "modeun", "eolmana", "hajiman", "eotteoke", "bogo", "sipeo", "nunmul", "maeum", "oppa", "jeongmal", "neomu", "naega", "nega", "geurae", "eopseo", "itjana", "andwae", "gamsa"]),
        ar: new Set(["habibi", "habibti", "enti", "inta", "inti", "nheb", "nhebek", "nhebbek", "omri", "galbi", "rani", "kifech", "chnowa", "barcha", "yesser", "inchallah", "mabrouk", "khouya", "lyoum", "nta", "nti", "kifeh", "kidayr", "wakha", "bezaf", "mazal", "ghir", "hadi", "hada", "ndir", "nkoun", "tbghi", "bghit", "mchit", "jit", "lazem", "kima", "chkoun", "galbek"]),
    };
    const ARABIZI_WORD = /^[a-z']*[379][a-z']+$/u;

    // Share of the words that belong to each romanized language, and how
    // many different ones: one hook word repeated is not a romanized lyric.
    const scoreRomanized = (words) => {
        const total = words.length || 1;
        return Object.entries(ROMANIZED_WORDS).map(([language, set]) => {
            const hits = words.filter((word) => word.length > 1
                && (set.has(word) || (language === "ar" && ARABIZI_WORD.test(word))));
            return { language, share: hits.length / total, distinct: new Set(hits).size };
        }).sort((left, right) => right.share - left.share);
    };

    // ============================================
    // Romanized lyrics, line by line
    // ============================================
    // Japanese romaji, Chinese pinyin and romanized Korean each have a
    // shape no Latin-script language shares, so every line is checked on
    // its own and the song goes to a romanized language once a quarter of
    // its lines (at least three) are written in it. Mixed songs (an anime
    // opening with English choruses) keep their romanized language.
    // Measured (2026-10): 97% of 631 cutlet/pypinyin/Revised-Romanization
    // renderings of real lyrics, 26 of 28 romanized lyrics found on LRCLIB
    // (the two misses spell Korean the pre-2000 way, without "eo"), and no
    // false romanized answer on 3,700 Latin-script lyrics.
    const ROMAJI_WORD = /^(?:(?:[kgsztdnhbpmrfjv]|sh|ch|ts|ky|gy|ny|hy|by|py|my|ry|dy|w|y)?[aiueo]|n(?![aiueoy])|([kgsztdbpmrcj])(?=\1|ch))+$/u;
    // Particles Romance languages also use as words (te, ta, da, na, de,
    // to, e) are left out: "Ai, se eu te pego" is not Japanese.
    const ROMAJI_PARTICLES = new Set(["wa", "ga", "wo", "o", "ni", "mo", "no", "ka", "yo", "ne", "kara", "made", "dake", "demo", "desu", "masu", "nai", "dakedo", "kedo", "shi"]);
    // Verb and adjective endings: no word list covers every conjugated verb.
    const ROMAJI_ENDING = /^[a-z]{2,}(?:mashita|masen|masu|deshita|deshou|nakatta|nakute|tteru|teiru|teru|tai|nai|rareru|saseru|chatta|tara|nagara)$/u;
    const isJapaneseWord = (word) => ROMAJI_WORDS.has(word) || ROMAJI_ENDING.test(word);
    const ROMAJI_WORDS = new Set(["watashi", "boku", "ore", "kimi", "anata", "kokoro", "sora", "yume", "itsumo", "zutto", "mada", "mou", "nani", "doko", "kono", "sono", "koto", "mono", "hito", "sekai", "hikari", "namida", "kaze", "hoshi", "sayonara", "arigatou", "daisuki", "suki", "aishiteru", "toki", "yoru", "asa", "hana", "kitto", "futari", "hitori", "kimochi", "omoi", "basho", "michi", "owari", "dakara", "shiranai", "wakaranai", "shite", "naku", "mitai", "konna", "sonna", "donna", "kanashii", "ureshii", "tooku", "ima", "mae", "ashita", "kyou", "itsuka", "dokoka", "nanimo", "kotoba", "koe", "naze", "doushite", "iru", "aru", "naru", "suru", "kuru", "miru", "shinjite", "wasurenai", "nanda", "sa", "ze", "zo"]);
    const PINYIN_SYLLABLES = new Set((
        "a ai an ang ao ba bai ban bang bao bei ben beng bi bian biang biao bie bin bing bo bong bu ca " +
        "cai can cang cao ce cei cen ceng cha chai chan chang chao che chen cheng chi chong chou chu chua " +
        "chuai chuan chuang chui chun chuo ci cong cou cu cuan cui cun cuo da dai dan dang dao de dei den " +
        "deng di dia dian diao die din ding diu dong dou du duan dui dun duo e ei en eng er fa fan fang " +
        "fei fen feng fiao fo fou fu ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang " +
        "gui gun guo ha hai han hang hao he hei hen heng hm hng hong hou hu hua huai huan huang hui hun " +
        "huo ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun ka kai kan kang kao ke kei ken " +
        "keng kong kou ku kua kuai kuan kuang kui kun kuo la lai lan lang lao le lei len leng li lia lian " +
        "liang liao lie lin ling liu lo long lou lu luan lue lun luo m ma mai man mang mao me mei men " +
        "meng mi mian miao mie min ming miu mo mou mu n na nai nan nang nao ne nei nen neng ng ni nia " +
        "nian niang niao nie nin ning niu nong nou nu nuan nue nun nuo o ou pa pai pan pang pao pei pen " +
        "peng pi pian piao pie pin ping po pou pu qi qia qian qiang qiao qie qin qing qiong qiu qu quan " +
        "que qun ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo sa sai san sang sao se sen " +
        "seng sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun " +
        "shuo si song sou su suan sui sun suo ta tai tan tang tao te tei teng ti tian tiao tie ting tong " +
        "tou tu tuan tui tun tuo wa wai wan wang wei wen weng wo wong wu xi xia xian xiang xiao xie xin " +
        "xing xiong xiu xu xuan xue xun ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun za zai " +
        "zan zang zao ze zei zen zeng zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu " +
        "zhua zhuai zhuan zhuang zhui zhun zhuo zi zong zou zu zuan zui zun zuo "
    ).trim().split(" "));
    const PINYIN_TONE_MARK = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/u;
    // Revised Romanization writes the Korean vowel ㅓ as "eo" (neo, eopseo,
    // geu, seo). The other pairs (eu, ui, ae, oe) are everywhere in French,
    // so they only count inside the word list below.
    const KOREAN_VOWEL_PAIR = /eo/u;
    // Endings of romanized Korean words (neun, reul, eseo, jiman, …) that
    // French and English words do not end in.
    const KOREAN_ROMANIZED_ENDING = /^[a-z]{2,}(?:neun|neunde|reul|eseo|jiman|haeyo|hajanh|eopseo|itjana|nikka|iya|geol|geon|jyo|haeng|hamyeon|ttae)$/u;
    // English words that contain "eo".
    const ENGLISH_EO_WORDS = new Set(["people", "video", "leo", "theo", "geo", "deodorant", "pigeon", "dungeon", "luncheon", "george", "leopard", "rodeo", "stereo", "neon", "neo", "peon", "theory"]);
    const KOREAN_ROMANIZED_WORDS = new Set(["saranghae", "neoui", "naui", "geudae", "uri", "neon", "naneun", "neoneun", "haru", "sarang", "jigeum", "oneul", "maeil", "dasi", "hamkke", "modeun", "eolmana", "hajiman", "eotteoke", "bogo", "sipeo", "nunmul", "maeum", "jeongmal", "neomu", "naega", "nega", "geurae", "eopseo", "itjana", "andwae", "neol", "nal", "geu", "nae", "isseo", "hae", "jwo", "gwa"]);

    const romanTokens = (line) => (line.toLowerCase().normalize("NFC").match(/[\p{L}\p{M}']+/gu) || [])
        .map((word) => word.replace(/'/g, "")).filter(Boolean);
    const withoutMarks = (word) => word.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ü/g, "v");

    // "ja"/"zh"/"ko" for a line clearly in that romanization, "ja-shaped"
    // for a line that only has romaji's syllable shape (a weak vote).
    const isKoreanRomanizedWord = (word) => KOREAN_ROMANIZED_WORDS.has(word)
        || KOREAN_ROMANIZED_ENDING.test(word)
        || (KOREAN_VOWEL_PAIR.test(word) && !ENGLISH_EO_WORDS.has(word));

    const classifyRomanizedLine = (line) => {
        const tokens = romanTokens(line);
        // "La la la la" is a hook, and every pinyin syllable list contains "la".
        if (tokens.length < 3 || new Set(tokens).size < 3) return null;
        const plain = tokens.map(withoutMarks);
        const shareOf = (test) => plain.filter(test).length / plain.length;
        const pinyinShare = shareOf((word) => PINYIN_SYLLABLES.has(word));
        // Spanish and Portuguese put an accent on a word or two ("ya de mí");
        // pinyin marks most syllables.
        const toneMarked = tokens.filter((word) => PINYIN_TONE_MARK.test(word)).length / tokens.length;
        if (toneMarked >= 0.5 && pinyinShare >= 0.8) return "zh";
        // Without tone marks, scat ("dei da-dan da") is pinyin too; real
        // pinyin lines hardly repeat a syllable.
        if (pinyinShare >= 0.95 && new Set(plain).size >= 4 && !plain.some((word) => ROMAJI_WORDS.has(word))) return "zh";
        const japaneseWords = plain.filter(isJapaneseWord).length;
        const particles = new Set(plain.filter((word) => ROMAJI_PARTICLES.has(word))).size;
        const romajiShaped = shareOf((word) => ROMAJI_WORD.test(word)) >= 0.9;
        if (romajiShaped && (japaneseWords >= 1 || particles >= 2)) return "ja";
        if (shareOf(isKoreanRomanizedWord) >= 0.4 && new Set(plain.filter(isKoreanRomanizedWord)).size >= 2) return "ko";
        return romajiShaped ? "ja-shaped" : null;
    };

    const detectRomanizedLines = (lines) => {
        // Each distinct line counts once: a scat hook sung twenty times
        // ("dai da-dan da", all pinyin syllables) is still one line.
        const usable = [...new Set(lines)].filter((line) => romanTokens(line).length >= 3);
        if (usable.length < 3) return null;
        const votes = new Map();
        for (const line of usable) {
            const language = classifyRomanizedLine(line);
            if (language) votes.set(language, (votes.get(language) || 0) + 1);
        }
        const japaneseWordsInSong = () => new Set(usable.flatMap((line) => romanTokens(line).map(withoutMarks))
            .filter(isJapaneseWord)).size;
        const [best, count] = [...votes.entries()].filter(([language]) => language !== "ja-shaped")
            .sort((left, right) => right[1] - left[1])[0] || [null, 0];
        // Korean pop keeps long English parts, so fewer lines need to be Korean.
        const share = best === "ko" ? 0.15 : 0.25;
        if (best && count >= (best === "ko" ? 5 : 3) && count / usable.length >= share) {
            // Across a song, romaji uses many different Japanese words.
            return best !== "ja" || japaneseWordsInSong() >= 3 ? best : null;
        }
        // Korean pop mixes English into the same line, which keeps single lines
        // under the bar; across the whole song the Korean words still stand out.
        const songWords = usable.flatMap((line) => romanTokens(line).map(withoutMarks));
        const koreanWords = new Set(songWords.filter(isKoreanRomanizedWord));
        if (koreanWords.size >= 12 && songWords.filter(isKoreanRomanizedWord).length / songWords.length >= 0.12) return "ko";
        // Stylized romaji: few lines name a particle, but most have the shape.
        const strongJapanese = votes.get("ja") || 0;
        const shaped = strongJapanese + (votes.get("ja-shaped") || 0);
        if (strongJapanese >= 2 && shaped / usable.length >= 0.3) {
            const known = japaneseWordsInSong();
            // A song that is almost entirely romaji-shaped needs fewer known words.
            if (known >= 3 || (known >= 2 && shaped / usable.length >= 0.6)) return "ja";
        }
        return null;
    };

    // Song languages the model may answer for Latin text; artificial and
    // archaic ones (Esperanto, Latin, Klingon, …) are left out.
    const LATIN_LANGUAGES = ["en", "es", "pt", "fr", "it", "de", "nl", "sv", "da", "no", "fi", "is", "pl", "cs", "sk", "hu", "ro", "tr", "id", "tl", "vi", "sr", "lt", "lv", "et", "af", "ga"];

    // Words Malay uses where Indonesian does not (the model has no Malay).
    // Literary words both share (engkau, tiada, harapan, …) are left out.
    const MALAY_WORDS = new Set(["awak", "kerana", "boleh", "mahu", "sahaja", "betul", "cakap", "nak", "dah", "kat", "hendak", "jua", "beta", "nian", "ibarat", "beradu", "takde", "kenapakah"]);
    const INDONESIAN_WORDS = new Set(["kamu", "bisa", "karena", "mau", "nggak", "gak", "banget", "udah", "aja", "kenapa", "gimana", "emang", "sih", "kok", "deh", "dong", "cuma", "kamulah", "denganmu", "bilang", "pernah", "merasa", "ingin"]);
    // Catalan, which the model lacks, reads to it line by line as Spanish,
    // Portuguese, Italian, French or even Vietnamese.
    const CATALAN_WORDS = new Set(["els", "amb", "però", "perquè", "molt", "jo", "meu", "meva", "teu", "teva", "aquest", "aquesta", "aquests", "més", "nit", "vull", "puc", "estic", "sóc", "ets", "són", "sense", "fins", "també", "mateix", "dels", "pel", "pels", "nosaltres", "vosaltres", "vaig", "allà", "doncs", "gaire", "encara", "avui", "demà", "dir", "fer", "veure", "anar", "cap", "res", "tothom", "ningú", "potser", "mentre", "llavors", "bé", "molts", "moltes", "seva", "nostra", "vostra", "dóna", "fa", "puguis", "sigui"]);
    const SPANISH_WORDS = new Set(["los", "pero", "porque", "muy", "yo", "mío", "tuyo", "este", "esta", "más", "noche", "quiero", "puedo", "estoy", "soy", "eres", "somos", "son", "su", "sin", "hasta", "ahora", "también", "nada", "nunca", "todo", "mismo", "y", "el", "es", "me", "te", "nos", "se", "voy", "vas", "va", "aquí"]);
    const SERBIAN_EKAVIAN = /^(lep|vreme|dete|uvek|mleko|reč|deca|beo|hteo|cvet|svet|srećan)/u;
    // Inside a stem "ije" is ijekavian (lijepo, vrijeme); at the end of a
    // word it is a case ending both write (nije, kategorije).
    const IJEKAVIAN = /ije\p{L}/u;
    const CROATIAN_WORDS = new Set(["što", "tko", "gdje", "ovdje", "negdje", "nigdje", "htio", "sretan", "sretna", "tisuću", "kruh", "zrak"]);
    const SERBIAN_WORDS = new Set(["šta", "sta", "hteo", "htela", "srećan", "srećna", "hiljadu", "hleb", "vazduh", "beše"]);
    // Albanian function words; ë and ç alone also occur in Dutch, French
    // and Luxembourgish.
    const ALBANIAN_WORDS = new Set(["të", "në", "një", "që", "është", "për", "dhe", "më", "unë", "kjo", "nuk", "s'ka"]);

    const resolveLatin = (text, model) => {
        const lower = text.toLowerCase();
        const words = wordsOf(text);
        if (words.length < 3) return null;
        const [roman, nextRoman] = scoreRomanized(words);
        const ranked = rankByLines(text, model, LATIN_LANGUAGES);
        const confidence = ranked[0]?.accuracy ?? 0;
        // A romanized lyric is dense in many of that language's own words.
        // Very dense evidence wins outright (the model reads romanized Hindi
        // as Tagalog with confidence); moderate evidence only when the
        // model is unsure.
        if (roman.distinct >= 4 && roman.share >= nextRoman.share * 1.8
            && (roman.share >= 0.2 || (roman.share >= 0.1 && confidence < 0.9))) {
            return roman.language;
        }
        // Letters that settle the question outright, and an answer the
        // text's own orthography rules out (Icelandic always has ð or þ).
        // Azerbaijani shares ğ and ı with Turkish but alone writes ə.
        if (countMatches(lower, /ə/gu) >= 3) return "az";
        if (countMatches(lower, /[ğı]/gu) >= 3) return "tr";
        if (new Set(words.filter((word) => ALBANIAN_WORDS.has(word))).size >= 4) return "sq";
        const candidate = ranked.find((entry) => entry.lang !== "is" || /[ðþ]/u.test(lower));
        if (!candidate) return null;
        let language = candidate.lang;
        const countIn = (set) => words.filter((word) => set.has(word)).length;
        if (language === "id" || language === "ms") {
            const malay = countIn(MALAY_WORDS);
            language = malay >= 3 && malay > countIn(INDONESIAN_WORDS) * 1.5 ? "ms" : "id";
        }
        if (["es", "it", "fr", "vi", "pt"].includes(language)) {
            // Portuguese writes meu and teu too, so those only count elsewhere.
            const catalan = words.filter((word) => CATALAN_WORDS.has(word)
                && (language !== "pt" || (word !== "meu" && word !== "teu"))).length;
            if (catalan >= 6 && catalan > countIn(SPANISH_WORDS) * 1.2) language = "ca";
        }
        if (language === "sr") {
            // Croatian (and Bosnian) write the ijekavian "ije" where
            // Serbian mostly writes "e": lijepo/lepo, vrijeme/vreme; a few
            // everyday words differ too (što/šta, tko, kruh/hleb).
            const ijekavian = words.filter((word) => (IJEKAVIAN.test(word) && !word.startsWith("nije"))
                || CROATIAN_WORDS.has(word)).length;
            const ekavian = words.filter((word) => SERBIAN_EKAVIAN.test(word) || SERBIAN_WORDS.has(word)).length;
            language = ijekavian > ekavian ? "hr" : "sr";
        }
        return language;
    };

    /**
     * @param {string[]} lines lyric lines (credit lines already removed)
     * @param {{model: object|null, scoreByRules: () => string|null}} options
     *   scoreByRules runs the original detector on the same lines.
     */
    const detect = (lines, { model = null, scoreByRules }) => {
        const votes = new Map();
        for (const line of lines) {
            const script = scriptOfLine(line);
            if (script) votes.set(script, (votes.get(script) || 0) + 1);
        }
        const totalVotes = [...votes.values()].reduce((sum, count) => sum + count, 0) || 1;
        const [dominant, dominantVotes] = [...votes.entries()]
            .filter(([script]) => script !== "latin")
            .sort((left, right) => right[1] - left[1])[0] || [null, 0];
        const text = lines.join("\n");
        if (dominant && (totalVotes < 4 || dominantVotes >= MIN_LINES) && dominantVotes / totalVotes >= LINE_SHARE) {
            // Japanese, Korean and Chinese keep the original detector's
            // kana/hangul/simplified-traditional analysis.
            if (dominant === "cjk") return scoreByRules();
            if (dominant === "arabic") return resolveArabicScript(text);
            if (dominant === "cyrillic") return resolveCyrillic(text, model);
            if (dominant === "devanagari") return resolveDevanagari(text);
            return dominant;
        }
        return detectRomanizedLines(lines) || resolveLatin(text, model) || scoreByRules();
    };

    return { detect, isCreditLine: (line) => CREDIT_LINE.test(line) };
})();
