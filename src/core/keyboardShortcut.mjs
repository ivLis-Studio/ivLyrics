const MODIFIERS = ["ctrl", "alt", "shift", "meta"];
const KEY_ALIASES = new Map(Object.entries({
  control: "ctrl", option: "alt", command: "meta", cmd: "meta",
  arrowleft: "left", arrowright: "right", arrowup: "up", arrowdown: "down",
  spacebar: "space", return: "enter", escape: "esc", del: "delete", ins: "insert",
  slash: "/", divide: "numpaddivide", "num /": "numpaddivide", "num/": "numpaddivide", "+": "plus",
}));
const UNASSIGNABLE_KEYS = new Set(["", "unidentified", "dead", "process", "altgraph", "compose"]);
const SHIFTED_PUNCTUATION = new Map(Object.entries({
  "~": "`", "!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0",
  "_": "-", plus: "=", "{": "[", "}": "]", "|": "\\", ":": ";", '"': "'", "<": ",", ">": ".", "?": "/",
}));
const KEY_LABELS = new Map(Object.entries({
  ctrl: "⌃", alt: "⌥", shift: "⇧", meta: "⌘", mod: "Mod",
  left: "←", right: "→", up: "↑", down: "↓", space: "Space", enter: "Enter", esc: "Esc", tab: "Tab",
  backspace: "Backspace", delete: "Delete", numpaddivide: "Num /", plus: "+",
}));

function normalizeKey(value) {
  const key = value === " " ? "space" : String(value ?? "").trim().toLowerCase();
  return KEY_ALIASES.get(key) ?? key;
}

function splitChord(value) {
  const chord = String(value ?? "").trim();
  const endsWithPlus = chord.endsWith("++");
  if (chord === "+") return ["plus"];
  const tokens = (endsWithPlus ? chord.slice(0, -2) : chord).split("+").map(normalizeKey).filter(Boolean);
  if (endsWithPlus) tokens.push("plus");
  return tokens;
}

function splitSequence(value) {
  const source = String(value ?? "").trim().replace(/\s*\+\s*/g, "+");
  if (!source) return [];
  return normalizeKey(source) === "numpaddivide" ? ["numpaddivide"] : source.split(/\s+/);
}

function canonicalChord(value, primaryModifier) {
  const tokens = splitChord(value);
  const key = tokens.pop();
  if (!key || MODIFIERS.includes(key) || UNASSIGNABLE_KEYS.has(key)) return "";
  const modifiers = new Set(tokens.map(token => token === "mod" ? primaryModifier : token));
  if ([...modifiers].some(token => !MODIFIERS.includes(token))) return "";
  const base = modifiers.has("shift") ? (SHIFTED_PUNCTUATION.get(key) ?? key) : key;
  return [...MODIFIERS.filter(token => modifiers.has(token)), base].join("+");
}

export function parseKeyboardShortcut(value, primaryModifier = "ctrl") {
  const sequence = splitSequence(value).map(chord => canonicalChord(chord, primaryModifier));
  return sequence.every(Boolean) ? sequence : [];
}

export const getPrimaryKeyboardModifier = platform => /^(Mac|iPhone|iPad|iPod)/i.test(platform || "") ? "meta" : "ctrl";

export function captureKeyboardShortcut(event) {
  if (!event || event.isComposing || event.keyCode === 229 || event.getModifierState?.("AltGraph")) return "";
  const key = event.code === "NumpadDivide" ? "numpaddivide" : normalizeKey(event.key);
  if (UNASSIGNABLE_KEYS.has(key) || MODIFIERS.includes(key)) return "";
  const modifiers = [["ctrl", event.ctrlKey], ["alt", event.altKey], ["shift", event.shiftKey], ["meta", event.metaKey]];
  return [...modifiers.filter(([, held]) => held).map(([token]) => token), key].join("+");
}

export const getKeyboardShortcutChord = event => canonicalChord(captureKeyboardShortcut(event), "ctrl");

export function formatKeyboardShortcut(value, labels = KEY_LABELS) {
  return splitSequence(value).flatMap((chord, index) => [
    ...(index ? ["→"] : []),
    ...splitChord(chord).map(key => labels.get(key) ?? KEY_LABELS.get(key)
      ?? (key.length === 1 || /^f\d{1,2}$/.test(key) ? key.toUpperCase() : key)),
  ]);
}
