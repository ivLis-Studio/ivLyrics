const asText = (value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
};

const asTextArray = (value) => Array.isArray(value)
    ? value.map(asText).filter(Boolean)
    : [];

const hasValue = (value) => {
    if (Array.isArray(value)) return value.some(hasValue);
    if (value && typeof value === "object") return Object.values(value).some(hasValue);
    return Boolean(asText(value));
};

export { asText, asTextArray, hasValue };
