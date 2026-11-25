import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { createLyricsLanguageModel } from "../src/lyrics/lyricsLanguageModel.mjs";
import { createLyricsLanguageDetector } from "../src/lyrics/lyricsLanguageDetector.mjs";
import { bundleInitializer } from "./fixtures/initializer-bundle.mjs";

test("the bundled lyrics service retries initialization while Spotify is loading", () => {
    const window = {};
    const scheduled = [];
    vm.runInNewContext(bundleInitializer(new URL("../src/lyrics/LyricsService.js", import.meta.url)), {
        window,
        setTimeout(callback, delay) { scheduled.push({ callback, delay }); return scheduled.length + 1; },
    });
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].delay, 300);
    scheduled[0].callback();
    assert.equal(scheduled.length, 2);
    assert.equal(scheduled[1].delay, 300);
    assert.equal(typeof window.ivLyricsTrackIdentity.extractTrackId, "function");
});
// A stand-in for tinyld: answers fixed rankings, honoring the `only` filter.
const stubModel = (rankingFor) => ({
    detectAll: (text, { only } = {}) => rankingFor(text).filter((entry) => !only || only.includes(entry.lang)),
});

function load({ fetchImpl, importImpl, integrity, timeoutMs, timers = {} } = {}) {
    const events = [];
    const revoked = [];
    const blobs = new Map();
    const window = {
        dispatchEvent: (event) => events.push(event.type),
    };
    const runtime = {
        fetch: fetchImpl,
        crypto: fetchImpl ? webcrypto : undefined,
        btoa,
        URL: {
            createObjectURL(blob) {
                const url = `blob:language-model-${blobs.size}`;
                blobs.set(url, blob);
                return url;
            },
            revokeObjectURL: (url) => revoked.push(url),
        },
        Blob,
        AbortController,
        setTimeout,
        clearTimeout,
        ...timers,
    };
    const LanguageModel = createLyricsLanguageModel({
        onReady: () => window.dispatchEvent({ type: "ivLyrics:language-model-ready" }),
        getRuntime: () => runtime,
        importModule: importImpl || (async () => { throw new Error("no import in tests"); }),
        warn: () => { },
        integrity,
        fetchTimeoutMs: timeoutMs,
    });
    const Utils = createLyricsLanguageDetector({
        languageModel: LanguageModel,
        readSetting: () => null,
    });
    return { Utils, LanguageModel, events, revoked, blobs, window };
}

// Detect with the model "loaded" (or with the rules only).
function detector(model = null) {
    const loaded = load();
    loaded.LanguageModel.get = () => model;
    loaded.LanguageModel.load = () => Promise.resolve(model);
    return (lines) => loaded.Utils.detectLanguage(lines.map((text) => ({ text })));
}

test("languages with their own script need no model", () => {
    const detect = detector();
    assert.equal(detect(["Σ' αγαπώ πολύ", "μείνε μαζί μου απόψε", "η νύχτα είναι δική μας"]), "el");
    assert.equal(detect(["אני אוהב אותך", "תישארי איתי הלילה", "הלילה הוא שלנו"]), "he");
    assert.equal(detect(["நான் உன்னை காதலிக்கிறேன்", "இன்று இரவு என்னுடன் இரு", "இந்த இரவு நமது"]), "ta");
    assert.equal(detect(["მიყვარხარ", "დარჩი ჩემთან ამაღამ", "ეს ღამე ჩვენია"]), "ka");
});

test("Cyrillic lyrics are told apart by their own letters", () => {
    const detect = detector();
    assert.equal(detect(["Я тебе кохаю і чекаю", "Ти моя зоря, моє життя", "Ніч така довга без тебе"]), "uk");
    assert.equal(detect(["Я тебя люблю и жду", "Ты моя звезда, моя жизнь", "Ночь такая длинная без тебя, ты слышишь"]), "ru");
    assert.equal(detect(["Волим те и чекам те", "Ноћ је дуга без тебе", "Ти си моја ђурђевданска звезда"]), "sr");
    assert.equal(detect(["Я цябе кахаю", "Ты мая зорка, маё жыццё", "Ноч такая доўгая без цябе"]), "be");
    assert.equal(detect(["Мен сені сүйемін", "Сен менің жұлдызымсың", "Түн ұзақ сенсіз"]), "kk");
    // Bulgarian has no letters of its own; the model separates it from Russian.
    const bulgarian = ["Обичам те и те чакам", "Ти си моята звезда, моят живот", "Нощта е толкова дълга без теб"];
    assert.equal(detect(bulgarian), "ru", "without the model the rules answer Russian");
    assert.equal(detector(stubModel(() => [{ lang: "bg", accuracy: 0.9 }, { lang: "ru", accuracy: 0.1 }]))(bulgarian), "bg");
    // Real case: an Oxxxymiron track with one Kazakh guest verse read as Kazakh.
    const russianVerse = ["Старый город спит под тонким слоем снега", "Я иду по крышам, не боясь упасть",
        "Каждый фонарь здесь помнит наши разговоры", "Мы писали песни на обрывках старых карт",
        "И пока трамваи тихо едут в парк", "Я считаю звёзды, что упали в наш двор"];
    const russianWithGuest = [...russianVerse, ...russianVerse.map((line) => `${line}, да`), ...russianVerse.map((line) => `${line}, нет`),
        "Қалам қолымда, сөзім жүректе", "Біздің қала түнде ұйықтамайды"];
    assert.equal(detect(russianWithGuest), "ru");
});

test("Cyrillic lyrics are put to the model line by line too", () => {
    // Real case: Klava Koka's "Покинула чат", where a one-word hook sung
    // over and over pulled the whole-song answer to Kazakh.
    const hook = "Бум бум бум бум";
    const model = stubModel((text) => (text.includes("\n") || text === hook
        ? [{ lang: "kk", accuracy: 0.9 }] : [{ lang: "ru", accuracy: 0.8 }, { lang: "bg", accuracy: 0.2 }]));
    assert.equal(detector(model)(["Ты опять звонишь мне ночью", "Телефон горит в руке", "Я молчу и слушаю дождь",
        "Он стучит по крыше", ...Array(12).fill(hook), "Завтра будет новый день", "Мы начнём его с нуля"]), "ru");
});

test("Arabic-script lyrics separate Arabic, Persian and Urdu", () => {
    const detect = detector();
    assert.equal(detect(["أحبك يا حبيبي", "ابقى معي هذه الليلة", "الليل طويل من غيرك"]), "ar");
    assert.equal(detect(["دوستت دارم عزیزم", "پیش من بمان امشب", "شب بی تو چقدر طولانی است"]), "fa");
    // Urdu was reported as Persian: it shares Persian's letters but adds its own.
    assert.equal(detect(["میں تم سے پیار کرتا ہوں", "آج رات میرے ساتھ رہو", "تمہارے بغیر رات بہت لمبی ہے"]), "ur");
});

test("Devanagari lyrics separate Hindi and Marathi", () => {
    const detect = detector();
    assert.equal(detect(["मैं तुमसे प्यार करता हूँ", "तुम मेरी जान हो", "यह रात तुम्हारे बिना लंबी है"]), "hi");
    assert.equal(detect(["माझं तुझ्यावर प्रेम आहे", "तू माझी आहेस आणि मी तुझा", "ही रात्र तुझ्याशिवाय खूप लांब आहे, नाही का"]), "mr");
});

test("Japanese, Korean and Chinese keep the original analysis; credit lines are ignored", () => {
    const detect = detector();
    assert.equal(detect(["夜空に光る星を見て", "君のことを想っている", "いつまでも一緒にいたい"]), "ja");
    assert.equal(detect(["너를 사랑해", "오늘 밤 나와 함께 있어줘", "이 밤은 우리의 것"]), "ko");
    assert.equal(detect(["作词 : 某人", "作曲 : 某人", "编曲 : 某人", "夜空に光る星を見て", "君のことを想っている"]), "ja",
        "credit lines in Chinese do not outvote the lyric");
});

test("Latin lyrics trust the model where the word scorer has no answer", () => {
    const romanian = ["Te iubesc și te aștept", "Noaptea e lungă fără tine", "Rămâi cu mine în seara asta"];
    assert.equal(detector(stubModel(() => [{ lang: "ro", accuracy: 0.95 }]))(romanian), "ro");
    const norwegian = ["Jeg elsker deg og venter på deg", "Natten er lang uten deg", "Bli hos meg i kveld"];
    assert.equal(detector(stubModel(() => [{ lang: "no", accuracy: 0.7 }, { lang: "sv", accuracy: 0.2 }]))(norwegian), "no");
});

test("the model is asked line by line, so a repeated hook cannot outvote the verses", () => {
    // Real cases: asked about whole songs at once, tinyld read Rosalía's
    // "La noche de anoche" as Hungarian and a Finnish ballad as Tagalog.
    const verses = [
        "Bailamos hasta que salió el sol",
        "Y la ciudad entera se quedó dormida",
        "Tu risa sonaba más fuerte que la música",
        "No quiero que se acabe esta noche",
    ];
    const hook = "Eh-eh, eh-eh, eh-eh";
    const asked = [];
    const model = stubModel((text) => {
        asked.push(text);
        if (text.includes("\n")) return [{ lang: "hu", accuracy: 0.6 }, { lang: "es", accuracy: 0.4 }];
        return text === hook ? [{ lang: "hu", accuracy: 1 }] : [{ lang: "es", accuracy: 0.9 }, { lang: "pt", accuracy: 0.1 }];
    });
    const song = [...verses, ...Array(20).fill(hook), ...verses];
    assert.equal(detector(model)(song), "es");
    assert.ok(asked.every((text) => !text.includes("\n")), "never asked about the whole song at once");
    assert.equal(asked.filter((text) => text === hook).length, 1, "each distinct line is asked once");
    // The original word scorer no longer overrides the model on Latin text:
    // on 900+ labeled songs it was wrong more often than right (it named
    // Portuguese sertanejo and a Dutch ballad French).
    const dutch = ["Hij liep met een gitaar door de stad", "Hij zong voor iedereen die bleef staan", "Soms vrolijk en soms een beetje stil", "De straatmuzikant"];
    assert.equal(detector(stubModel(() => [{ lang: "nl", accuracy: 1 }]))(dutch), "nl");
});

test("letters settle Turkish and rule out Icelandic", () => {
    // Real case: the model called a Turkish song with dozens of ğ and ı Icelandic.
    const turkish = ["Gidiyorum bütün aşklar yüreğimde", "Sana korkular bıraktım", "Ağlıyorum ışıkların altında"];
    assert.equal(detector(stubModel(() => [{ lang: "is", accuracy: 0.95 }, { lang: "tr", accuracy: 0.05 }]))(turkish), "tr");
    const english = ["walk with me tonight", "under the city lights", "we never sleep at all"];
    assert.equal(detector(stubModel(() => [{ lang: "is", accuracy: 0.6 }, { lang: "en", accuracy: 0.4 }]))(english), "en",
        "Icelandic is never written without ð or þ");
});

test("languages the model lacks: Azerbaijani by ə, Albanian by its function words", () => {
    // Real cases: Aygün Kazımova read as Turkish, Rona Nishliu's "Suus" as Dutch.
    const azerbaijani = ["Gecələr səni düşünürəm", "Ürəyim sənin adını çəkir", "Sən gələndə dünya gözəl olur"];
    assert.equal(detector(stubModel(() => [{ lang: "tr", accuracy: 0.9 }]))(azerbaijani), "az");
    const albanian = ["Unë të pres në breg të detit", "Nata është e gjatë pa ty", "Kjo zemër nuk harron", "Për ty këndoj një këngë"];
    assert.equal(detector(stubModel(() => [{ lang: "nl", accuracy: 0.5 }]))(albanian), "sq");
    const dutch = ["België is mijn land", "de ideeën van de zee", "Noël komt naar huis vannacht"];
    assert.equal(detector(stubModel(() => [{ lang: "nl", accuracy: 0.9 }]))(dutch), "nl", "ë alone is not Albanian");
});

test("close pairs the model cannot split: Catalan, Croatian, Malay", () => {
    const catalan = ["Jo vull estar amb tu aquesta nit", "perquè ets el meu amor i també el meu món",
        "no puc dormir sense tu, encara pensem en demà"];
    assert.equal(detector(stubModel(() => [{ lang: "es", accuracy: 0.5 }, { lang: "it", accuracy: 0.4 }]))(catalan), "ca");
    // tinyld reads most Catalan lines as French or Vietnamese.
    assert.equal(detector(stubModel(() => [{ lang: "fr", accuracy: 1 }]))(catalan), "ca");
    const spanish = ["Yo quiero estar contigo esta noche", "porque eres mi amor y también mi mundo", "no puedo dormir sin ti"];
    assert.equal(detector(stubModel(() => [{ lang: "es", accuracy: 0.9 }]))(spanish), "es");
    // Portuguese shares meu and teu with Catalan (Dulce Pontes, "Canção do Mar").
    const portuguese = ["Levei o meu barco até ao fim do cais", "o meu amor ficou a ver o mar", "e o vento trouxe o teu nome",
        "guardei a luz do teu olhar", "no meu peito o meu fado", "meu coração ainda espera"];
    assert.equal(detector(stubModel(() => [{ lang: "pt", accuracy: 0.96 }]))(portuguese), "pt");

    const serbianModel = stubModel(() => [{ lang: "sr", accuracy: 0.9 }]);
    assert.equal(detector(serbianModel)(["Lijepa si kao vrijeme proljeća", "uvijek ću te voljeti", "ti si moje dijete sreće"]), "hr");
    assert.equal(detector(serbianModel)(["Lepa si kao vreme proleća", "uvek ću te voleti", "ti si moje dete sreće"]), "sr");
    // "nije" and case endings (kategorije) are written the same in both.
    assert.equal(detector(serbianModel)(["Nisi vise dete, znas", "soba bez kategorije", "to nije ljubav",
        "nije ni bilo", "reci mi sta hoces"]), "sr");
    // Catalan read as Portuguese line by line (The Tyets, "Fa dies").
    const balearic = ["Fa temps que vull tornar a la mar", "Encara penso en tu cada nit",
        "Quan arribi l'estiu serem més a prop", "Al teu costat no em falta res", "Només vull caminar amb tu",
        "I també sé que és molt tard"];
    assert.equal(detector(stubModel(() => [{ lang: "pt", accuracy: 0.6 }]))(balearic), "ca");

    const indonesianModel = stubModel(() => [{ lang: "id", accuracy: 0.9 }]);
    assert.equal(detector(indonesianModel)(["Awak tahu kerana aku sayang", "aku nak awak tahu", "boleh tak awak mahu bersama"]), "ms");
    assert.equal(detector(indonesianModel)(["Kamu tahu karena aku sayang", "aku mau kamu tahu", "bisa nggak kita bersama"]), "id");
});

test("romanized lyrics report the language they are written in", () => {
    const tagalog = stubModel(() => [{ lang: "tl", accuracy: 0.95 }]);
    const hindi = ["Tum mere dil ki dhadkan ho", "tere bina kya hai zindagi", "main tujhe kabhi na bhoolunga yaara",
        "jab tum saath ho toh sab hai"];
    assert.equal(detector(tagalog)(hindi), "hi", "dense Hindi words beat a confident Tagalog guess");
    assert.equal(detector()(hindi), "hi", "and the rules alone already catch it");
    const arabizi = ["Ya 7abibi enti 3omri", "nhebek barcha w galbi m3ak", "rani nestanna fik kol lila"];
    assert.equal(detector(stubModel(() => [{ lang: "tl", accuracy: 0.5 }]))(arabizi), "ar");
});

test("Japanese written in Latin letters (romaji) is Japanese, even beside English lines", () => {
    const english = stubModel(() => [{ lang: "en", accuracy: 0.6 }, { lang: "it", accuracy: 0.3 }]);
    const romaji = [
        "Kimi no koe ga kikoeru yoru ni",
        "Boku wa itsumo yume wo miteru",
        "Sora ni hikaru hoshi wo miageta",
        "Namida ga koboreru mae ni",
        "Take my hand and never let go",
        "Ashita mo kitto aeru kara",
        "Futari de aruita michi wo wasurenai",
    ];
    assert.equal(detector(english)(romaji), "ja");
    assert.equal(detector()(romaji), "ja", "no model needed");
    // Stylized romaji with few listed words still has romaji's syllable shape
    // and Japanese verb endings throughout.
    assert.equal(detector(english)([
        "Machi no akari ga kieta tokoro de",
        "Hashiridashita kodou wo osaete",
        "Tsumetai kaze ni fukarenagara",
        "Utaitai uta wo sagashiteiru",
        "Tooi hibi wo omoidashita",
        "Wasuretakunai to negatta",
    ]), "ja");
    // Lyric sites spell long vowels several ways (Hepburn macrons, "ou",
    // plain "o") and some shout in capitals.
    const hepburn = ["Kimi no koe ga kikoeru yoru ni", "Bokura wa kyō mo tōku e aruku", "Sora ni hikaru hoshi wo miageta",
        "Ashita mo kitto aeru kara", "Kokoro no naka de yūki wo sagasu", "Futari de aruita michi wo wasurenai"];
    const spellings = {
        hepburn,
        "ou/uu": hepburn.map((line) => line.replace(/ō/g, "ou").replace(/ū/g, "uu")),
        "plain vowels": hepburn.map((line) => line.normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
        capitals: hepburn.map((line) => line.toUpperCase()),
        "o for wo": hepburn.map((line) => line.replace(/\bwo\b/g, "o")),
    };
    for (const [style, lines] of Object.entries(spellings)) {
        assert.equal(detector(english)(lines), "ja", style);
    }
});

test("pinyin and romanized Korean are recognized too", () => {
    const english = stubModel(() => [{ lang: "en", accuracy: 0.5 }]);
    assert.equal(detector(english)(["wǒ xiǎng nǐ měi yī tiān", "nǐ shì wǒ de xīn", "yè wǎn de xīng xīng hěn liàng", "wǒ men yì qǐ zǒu ba"]), "zh");
    assert.equal(detector(english)(["wo xiang ni mei yi tian", "ni shi wo de xin shang ren", "ye wan de xing xing hen liang", "wo men yi qi zou xia qu ba"]), "zh",
        "also without tone marks");
    assert.equal(detector(english)(["neoui moksoriga deullyeo", "naneun eonjena neol gidaryeo", "uri hamkke geotdeon geu gil",
        "nunmuri heulleodo gwaenchana", "jigeum i sungan neoreul saranghae"]), "ko");
});

test("romanized checks do not fire on Romance, French or hook-heavy lyrics", () => {
    const portuguese = stubModel(() => [{ lang: "pt", accuracy: 0.9 }]);
    // Every word here is also a legal romaji syllable string.
    assert.equal(detector(portuguese)(["Ai se eu te vejo hoje", "Nossa menina bonita", "Ai ai se eu te tenho", "Vem dançar comigo agora"]), "pt");
    const french = stubModel(() => [{ lang: "fr", accuracy: 0.95 }]);
    // "eu" and "ui" are as common in French as in romanized Korean.
    assert.equal(detector(french)(Array.from({ length: 6 }, () => "Plus lui, plus elle et tous ceux qui sont seuls")
        .concat(["Être heureux ou malheureux", "Les fleurs fanées meurent un jour"])), "fr");
    // "la" is a pinyin syllable, but a line of "la la la" is a hook.
    const hook = Array.from({ length: 8 }, () => "La la la la la la la");
    assert.equal(detector(portuguese)([...hook, "Eu canto para ti", "Canto a noite inteira"]), "pt");
    const italian = stubModel(() => [{ lang: "it", accuracy: 0.9 }]);
    assert.equal(detector(italian)(["Amore mio sei tutto per me", "Dove sono le notte di luna", "Sono qui a pensare a te", "Tutto il mondo dorme ancora"]), "it");
    // Real cases from testing on real lyrics. Edurne, "Gracioso": one accent
    // is not a pinyin tone mark, however often the line repeats.
    const spanish = stubModel(() => [{ lang: "es", accuracy: 0.9 }]);
    assert.equal(detector(spanish)([...Array(7).fill("Ven ya, ya, ya a mí"), "Dale ya, ya, ya a mí", "Toma ya, ya, ya a mí",
        "Qué gracia tienes", "Siempre llegas tarde", "Y te ríes de todo lo que digo", "No tienes vergüenza, qué valor"]), "es");
    // Yasmin K., "Du hast den schönsten Arsch der Welt": a scat intro made of
    // pinyin syllables.
    const german = stubModel(() => [{ lang: "de", accuracy: 0.97 }]);
    assert.equal(detector(german)(["Dei da-dan, da-da-da", "Dei da-dan da", "Die Stadt ist leise, nur der Regen spricht",
        "Ich warte auf ein Zeichen von dir", "Die Lichter gehen langsam aus", "Und ich zähle jeden Schritt",
        "Wir tanzen bis der Morgen kommt", "Die Straßen sind noch nass", "Ich halte deine Hand ganz fest",
        "Bleib noch eine Nacht", "Nur noch eine Nacht", "Dai da-dan da"]), "de");
});

test("romanized checks do not fire on ordinary lyrics", () => {
    const english = stubModel(() => [{ lang: "en", accuracy: 0.98 }]);
    assert.equal(detector(english)(["I hum along in the main street", "the trash bin is full tonight",
        "my heart beats for you", "you are the only one I need"]), "en");
    // A Norwegian song with one Arabic hook word repeated is still Norwegian.
    const norwegian = stubModel(() => [{ lang: "no", accuracy: 0.7 }]);
    assert.equal(detector(norwegian)(["Jeg går hjem i natt, 3layk", "3layk, 3layk, alltid 3layk", "byen sover når jeg går",
        "vi er unge og vi lever nå"]), "no");
});

test("an answer given before the model loads is revisited once it has", () => {
    const loaded = load();
    let model = null;
    let loadCalls = 0;
    loaded.LanguageModel.get = () => model;
    loaded.LanguageModel.load = () => { loadCalls++; return Promise.resolve(model); };
    const romanian = ["Te iubesc și te aștept", "Noaptea e lungă fără tine", "Rămâi cu mine în seara asta"]
        .map((text) => ({ text }));
    const before = loaded.Utils.detectLanguage(romanian);
    assert.notEqual(before, "ro", "the rules have no Romanian");
    assert.equal(loadCalls, 1, "first use starts loading the model");
    model = stubModel(() => [{ lang: "ro", accuracy: 0.95 }]);
    assert.equal(loaded.Utils.detectLanguage(romanian), "ro");
    assert.equal(loaded.Utils.detectLanguage(romanian), "ro", "and is cached");
});

test("multiline provider text keeps lyrics after credits and shares normalized cache entries", () => {
    let calls = 0;
    const loaded = load();
    loaded.LanguageModel.get = () => stubModel(() => { calls++; return [{ lang: "es", accuracy: 0.95 }]; });
    const lines = ["Yo quiero estar contigo esta noche", "porque eres mi amor y también mi mundo", "no puedo dormir sin ti"];
    assert.equal(loaded.Utils.detectLanguage([{ originalText: `作词 : 某人\r\n${lines.join("\r\n")}` }]), "es");
    const firstCalls = calls;
    assert.ok(firstCalls > 0);
    assert.equal(loaded.Utils.detectLanguage(lines.map((line) => `  ${line.normalize("NFD")}  `)), "es");
    assert.equal(calls, firstCalls, "CRLF, surrounding spaces and decomposed accents do not rerun inference");
});

test("supplementary Han and bilingual CJK keep the original rule verdict with a model loaded", () => {
    const loaded = load();
    let calls = 0;
    loaded.LanguageModel.get = () => stubModel(() => { calls++; return [{ lang: "en", accuracy: 1 }]; });
    const english = ["Take my hand and never let go", "I will always wait for you", "We are together in the night"];
    const fixtures = [
        ["너를 사랑해", "오늘 밤 나와 함께 있어줘", "이 밤은 우리의 것"],
        ["夜空に光る星を見て", "君のことを想っている", "いつまでも一緒にいたい"],
        ["我们一起走过的时光", "你是我最爱的朋友", "风中传来了你的声音"],
        ["我們一起走過的時光", "你是我最愛的朋友", "風中傳來了你的聲音"],
        ["\u{30000}\u{30001}", "\u{30002}\u{30003}", "\u{30004}\u{30005}"],
    ];
    for (const native of fixtures) {
        const lines = [...english, ...native, ...english];
        const expected = loaded.Utils.detectLanguageByRules(lines);
        assert.ok(["ko", "ja", "zh-hans", "zh-hant"].includes(expected));
        assert.equal(loaded.Utils.detectLanguage(lines), expected, native.join(" / "));
    }
    assert.equal(calls, 0, "native CJK never goes through the Latin model");
});

test("the rules cache retains the line boundaries used for bilingual script votes", () => {
    const loaded = load();
    const lines = ["너를 사랑해", "오늘도 함께해", "나는 기다려",
        "I will always wait for you here tonight", "You are the only one I need in my life", "We are together in the night and forever"];
    assert.equal(loaded.Utils.detectLanguage(lines), "ko");
    assert.equal(loaded.Utils.detectLanguage([lines.join(" ")]), "en", "one mostly English line casts a different script vote");
});

test("emoji variation selectors and presentation punctuation do not count as Arabic verses", () => {
    const lines = ["I will always wait for you", "You are the only one I need", "We are together in the night", "❤️", "❣️", "♥️", "︵︶"];
    assert.equal(detector(stubModel(() => [{ lang: "en", accuracy: 1 }]))(lines), "en");
    assert.equal(detector()(lines), "en");
});

test("language result caching remains bounded and avoids repeated inference", () => {
    let calls = 0;
    const loaded = load();
    loaded.Utils._maxLangCacheSize = 2;
    loaded.LanguageModel.get = () => stubModel(() => { calls++; return [{ lang: "en", accuracy: 1 }]; });
    for (const line of ["I will wait for you", "You are the only one I need", "We are together in the night"]) {
        assert.equal(loaded.Utils.detectLanguage([line]), "en");
        assert.ok(loaded.Utils._langDetectCache.size <= 2);
    }
    assert.equal(calls, 3);
    assert.equal(loaded.Utils.detectLanguage(["You are the only one I need"]), "en");
    assert.equal(calls, 3, "a retained result needs no inference");
    assert.equal(loaded.Utils.detectLanguage(["I will wait for you"]), "en");
    assert.equal(calls, 4, "the oldest evicted result is recomputed");
});

test("uppercase orthography still overrides an incompatible Latin model guess", () => {
    const icelandic = stubModel(() => [{ lang: "is", accuracy: 0.95 }, { lang: "tr", accuracy: 0.05 }]);
    assert.equal(detector(icelandic)(["Gidiyorum bütün aşklar yüreğimde", "Sana korkular bıraktım", "Ağlıyorum ışıkların altında"].map((line) => line.toUpperCase())), "tr");
    const english = stubModel(() => [{ lang: "is", accuracy: 0.9 }, { lang: "en", accuracy: 0.1 }]);
    assert.equal(detector(english)(["ÉG ELSKA ÞIG", "ÞÚ ERT ALLT FYRIR MIG", "VIÐ VERÐUM SAMAN Í NÓTT"]), "is");
});

test("broken or malformed model rankings fall back to the language rules", () => {
    const lines = ["I will always wait for you", "You are the only one I need", "We are together in the night"];
    for (const detectAll of [
        () => { throw new Error("model failed"); },
        () => ({}),
        () => [null, { lang: "ro", accuracy: NaN }, { lang: "fr", accuracy: Infinity }, { lang: "de", accuracy: -1 }, { lang: "xx", accuracy: 1 }],
    ]) assert.equal(detector({ detectAll })(lines), "en");
});

test("the model only runs after its SHA-384 matches the pinned file", async () => {
    const bytes = new TextEncoder().encode("export const detectAll = () => [];").buffer;
    const digest = new Uint8Array(await webcrypto.subtle.digest("SHA-384", bytes));
    const integrity = `sha384-${btoa(String.fromCharCode(...digest))}`;
    const fetchImpl = async () => ({ ok: true, arrayBuffer: async () => bytes });
    const module = { detectAll: () => [] };

    const imports = [];
    const tampered = load({ fetchImpl, importImpl: async (url) => { imports.push(url); return module; } });
    assert.equal(await tampered.LanguageModel.load(), null, "the shipped hash does not match these bytes");
    assert.deepEqual(imports, [], "nothing unverified is imported");

    const verified = load({ fetchImpl, integrity, importImpl: async (url) => { imports.push(url); return module; } });
    verified.window.__ivLyricsLanguageModelImport = () => { throw new Error("untrusted window hook must not run"); };
    assert.equal(await verified.LanguageModel.load(), module);
    assert.deepEqual(imports, ["blob:language-model-0"]);
    assert.deepEqual(verified.events, ["ivLyrics:language-model-ready"]);
    assert.deepEqual(verified.revoked, imports);
    assert.deepEqual(new Uint8Array(await verified.blobs.get(imports[0]).arrayBuffer()), new Uint8Array(bytes),
        "the blob contains exactly the bytes that passed SHA-384");

    // A policy that refuses blob: must never cause a second, unchecked URL import.
    const urls = [];
    const blocked = load({ fetchImpl, integrity, importImpl: async (url) => {
        urls.push(url);
        if (url.startsWith("blob:")) throw new Error("blocked by CSP");
        return module;
    } });
    assert.equal(await blocked.LanguageModel.load(), null);
    assert.deepEqual(urls, ["blob:language-model-0", "blob:language-model-1"]);
    assert.deepEqual(blocked.revoked, urls, "even refused modules release their blob URLs");
    assert.deepEqual(blocked.events, [], "rules remain active when CSP blocks verified execution");
});

test("an unreachable CDN falls back to the mirror, then to the rules", async () => {
    const requested = [];
    const offline = load({ fetchImpl: async (url) => { requested.push(url); throw new Error("offline"); } });
    assert.equal(await offline.LanguageModel.load(), null);
    assert.equal(requested.length, 2);
    assert.match(requested[1], /^https:\/\/unpkg\.com\/tinyld@1\.3\.4\//);
    const slow = load({ fetchImpl: () => new Promise(() => { }), timeoutMs: 15 });
    assert.equal(await slow.LanguageModel.whenReady(5), null, "waiting is bounded");
    assert.equal(await slow.LanguageModel.load(), null, "downloads are bounded too");
    assert.equal(await load().LanguageModel.load(), null, "no fetch available: rules only");
});

test("stalled fetches and response bodies abort each mirror once and keep offline detection cheap", async () => {
    for (const stage of ["fetch", "body"]) {
        const requests = [];
        const offline = load({ timeoutMs: 10, fetchImpl: async (url, options) => {
            requests.push({ url, options });
            const stalled = new Promise(() => { });
            return stage === "fetch" ? stalled : { ok: true, arrayBuffer: () => stalled };
        } });
        const pending = offline.LanguageModel.load();
        assert.equal(offline.LanguageModel.load(), pending, "concurrent callers share one download");
        assert.equal(await pending, null);
        assert.equal(requests.length, 2, "each mirror has a bounded attempt");
        for (const { options } of requests) {
            assert.equal(options.cache, "force-cache");
            assert.equal(options.credentials, "omit");
            assert.match(options.integrity, /^sha384-/);
            assert.equal(options.signal.aborted, true);
        }
        assert.equal(await offline.LanguageModel.whenReady(100), null);
        assert.equal(offline.Utils.detectLanguage(["I will always wait for you"]), "en");
        assert.equal(requests.length, 2, "cached failure does not re-download or delay subsequent songs");
        assert.equal(offline.blobs.size, 0, "no incomplete response can reach the import boundary");
    }
});

test("a tampered primary mirror is never imported and a verified mirror remains usable", async () => {
    const bytes = new TextEncoder().encode("export const detectAll = () => [];").buffer;
    const digest = new Uint8Array(await webcrypto.subtle.digest("SHA-384", bytes));
    const integrity = `sha384-${btoa(String.fromCharCode(...digest))}`;
    const requests = [];
    const imported = [];
    const module = { detectAll: () => [] };
    const loaded = load({ integrity, fetchImpl: async (url) => {
        requests.push(url);
        return { ok: true, arrayBuffer: async () => requests.length === 1 ? new ArrayBuffer(1) : bytes };
    }, importImpl: async (url) => { imported.push(url); return module; } });
    assert.equal(await loaded.LanguageModel.load(), module);
    assert.equal(requests.length, 2);
    assert.deepEqual(imported, ["blob:language-model-0"]);
    assert.deepEqual(loaded.revoked, imported);
    assert.equal(await loaded.LanguageModel.load(), module);
    assert.equal(requests.length, 2, "the model is cached for later callers");
});

test("readiness timers are cleared after early failure or a successful background load", async () => {
    const active = new Set();
    const timers = {
        setTimeout(fn, delay) { const id = setTimeout(fn, delay); active.add(id); return id; },
        clearTimeout(id) { active.delete(id); clearTimeout(id); },
    };
    const offline = load({ timers, fetchImpl: async () => { throw new Error("offline"); } });
    assert.equal(await offline.LanguageModel.whenReady(1000), null);
    assert.equal(active.size, 0);

    const bytes = new TextEncoder().encode("export const detectAll = () => [];").buffer;
    const digest = new Uint8Array(await webcrypto.subtle.digest("SHA-384", bytes));
    const integrity = `sha384-${btoa(String.fromCharCode(...digest))}`;
    let deliver;
    const module = { detectAll: () => [] };
    const loaded = load({ integrity, timers, fetchImpl: () => new Promise((resolve) => { deliver = resolve; }),
        importImpl: async () => module });
    assert.equal(await loaded.LanguageModel.whenReady(1), null);
    deliver({ ok: true, arrayBuffer: async () => bytes });
    assert.equal(await loaded.LanguageModel.whenReady(1000), module, "a short readiness timeout does not cancel loading");
    assert.equal(active.size, 0);
    assert.deepEqual(loaded.events, ["ivLyrics:language-model-ready"]);
});
