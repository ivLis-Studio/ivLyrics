const KARAOKE_RTL_STRONG_CHAR_REGEX = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/u;
const KARAOKE_LTR_STRONG_CHAR_REGEX = /[A-Za-z\u00C0-\u02AF\u0370-\u052F\u1E00-\u1EFF]/u;
const KARAOKE_JOINING_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/u;

const getKaraokeTextDirection = (text) => {
    const normalizedText = typeof text === "string" ? text : "";
    let rtlCount = 0;
    let ltrCount = 0;

    for (const char of normalizedText) {
        if (KARAOKE_RTL_STRONG_CHAR_REGEX.test(char)) {
            rtlCount++;
            continue;
        }
        if (KARAOKE_LTR_STRONG_CHAR_REGEX.test(char)) {
            ltrCount++;
        }
    }

    return rtlCount > ltrCount ? "rtl" : "ltr";
};

const needsKaraokeJoiningScript = (text) => {
    const normalizedText = typeof text === "string" ? text : "";
    return KARAOKE_RTL_STRONG_CHAR_REGEX.test(normalizedText) ||
        KARAOKE_JOINING_SCRIPT_REGEX.test(normalizedText);
};

const shouldWrapKaraokeByWord = (text, motionStyle = null) => {
    const normalizedText = typeof text === "string" ? text : "";
    return /\S\s+\S/u.test(normalizedText)
        || (motionStyle === "expressive" && /[^\s.\-\u2010\u2011][.\-\u2010\u2011]+[^\s.\-\u2010\u2011]/u.test(normalizedText));
};

export {
    getKaraokeTextDirection, needsKaraokeJoiningScript, shouldWrapKaraokeByWord, KARAOKE_JOINING_SCRIPT_REGEX,
};
