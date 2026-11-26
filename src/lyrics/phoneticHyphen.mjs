export function formatPhoneticHyphen(text, mode) {
    if (typeof text !== "string") return text;
    if (mode === "space") return text.replace(/-/g, " ");
    if (mode === "remove") return text.replace(/-/g, "");
    return text;
}
