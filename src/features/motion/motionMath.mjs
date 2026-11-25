export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export const clamp01 = (value) => clamp(value, 0, 1);
export const lerp = (from, to, amount) => from + (to - from) * amount;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutQuart = (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2);
export const easeInOutQuint = (t) => (t < 0.5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutExpo = (t) => {
	if (t <= 0) return 0;
	if (t >= 1) return 1;
	return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
};
export const easeOutBack = (t) => {
	const c1 = 1.70158;
	const c3 = c1 + 1;
	return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutBounce = (t) => {
	const n1 = 7.5625;
	const d1 = 2.75;
	if (t < 1 / d1) return n1 * t * t;
	if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
	if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
	return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

export const hashString = (text) => {
	let hash = 2166136261;
	const source = String(text ?? "");
	for (let index = 0; index < source.length; index += 1) {
		hash ^= source.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
};

/** mulberry32: a small seeded generator, so a song always gets the same edit. */
export const createRandom = (seed) => {
	let state = (seed >>> 0) || 1;
	return () => {
		state = (state + 0x6D2B79F5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
};
export const between = (random, low, high) => low + (high - low) * random();
export const round = (value, digits = 1) => {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
};
export const rotate2d = (x, y, degrees) => {
	const radians = (degrees * Math.PI) / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	return { x: x * cos - y * sin, y: x * sin + y * cos };
};
