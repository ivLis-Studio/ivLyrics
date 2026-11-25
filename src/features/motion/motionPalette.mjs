import { clamp } from "./motionMath.mjs";

export const hexColor = (value) => {
	const text = String(value ?? "").trim();
	return /^#[0-9a-f]{6}$/i.test(text) ? text.toLowerCase() : null;
};

const parseColor = (value) => {
	const text = String(value ?? "").trim();
	let match = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (match) {
		const hex = match[1].length === 3 ? match[1].split("").map((digit) => digit + digit).join("") : match[1];
		return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
	}
	match = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
	return match ? [match[1], match[2], match[3]].map((part) => clamp(Math.round(Number(part)), 0, 255)) : null;
};
const rgbToHsl = ([red, green, blue]) => {
	const r = red / 255;
	const g = green / 255;
	const b = blue / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const light = (max + min) / 2;
	if (max === min) return [0, 0, light];
	const delta = max - min;
	const saturation = light > 0.5 ? delta / (2 - max - min) : delta / (max + min);
	let hue;
	if (max === r) hue = (g - b) / delta + (g < b ? 6 : 0);
	else if (max === g) hue = (b - r) / delta + 2;
	else hue = (r - g) / delta + 4;
	return [hue / 6, saturation, light];
};
const hslToHex = ([hue, saturation, light]) => {
	const channel = (n) => {
		const k = (n + hue * 12) % 12;
		const a = saturation * Math.min(light, 1 - light);
		return Math.round(255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
	};
	return "#" + [channel(0), channel(8), channel(4)].map((value) => value.toString(16).padStart(2, "0")).join("");
};
/**
 * Two accent colours that stay vivid and readable over video. The cover's
 * colour leads: the AI palette (which favoured pinks and reds whatever the
 * cover) only leads when the cover has no colour to give (missing, or grey),
 * and otherwise may only add a second colour clearly apart from it.
 */
export const paletteFrom = (accent, aiPalette) => {
	const readable = (rgb) => {
		const [hue, saturation, light] = rgbToHsl(rgb);
		return hslToHex([hue, Math.max(saturation, 0.62), clamp(light, 0.58, 0.72)]);
	};
	const colourful = (rgb) => !!rgb && rgbToHsl(rgb)[1] >= 0.08;
	const fromAi = (Array.isArray(aiPalette) ? aiPalette : []).map(parseColor).filter(colourful).map(readable);
	const cover = parseColor(accent);
	// A grey cover with no AI colour gets a cool, quiet blue rather than a loud pink.
	const first = colourful(cover) ? readable(cover) : fromAi[0] || hslToHex([0.6, 0.62, 0.68]);
	const [hue, saturation] = rgbToHsl(parseColor(first));
	const apart = (colour) => {
		const distance = Math.abs(rgbToHsl(parseColor(colour))[0] - hue);
		return Math.min(distance, 1 - distance) >= 0.12;
	};
	const second = fromAi.find((colour) => colour !== first && apart(colour));
	return [first, second || hslToHex([(hue + 0.42) % 1, Math.max(0.62, saturation), 0.66])];
};

/** A palette colour deepened into a ground (colour fields) that white type reads on. */
export const deepOf = (color) => {
	const [hue, saturation] = rgbToHsl(parseColor(color) || [255, 92, 160]);
	return hslToHex([hue, Math.max(0.74, saturation), 0.44]);
};
