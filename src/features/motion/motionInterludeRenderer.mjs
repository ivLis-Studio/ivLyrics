import { applyFont, SVG_NS } from "./motionDomEffects.mjs";
import { CUE_BEATS, SCENE_FADE_MS } from "./motionInterludes.mjs";
import { graphemesOf } from "./motionLyricModel.mjs";
import { motionShapes as shapes } from "./MotionLyricsShapes.mjs";
import { between, clamp, clamp01, createRandom, easeInOutCubic, easeInOutSine, easeOutBack, easeOutCubic, easeOutExpo, round } from "./motionMath.mjs";
import { easeInCubic } from "./motionTypeEffects.mjs";

export function createInterludeRenderer({ document, interlude, readPlan, readPulses, write }) {
	// ---- Interludes: scenes over the video while no lyrics are on screen (interludesOf)
	let cueCache = {};
	const scenesShown = new Map();
	let cueEl = null;
	const node = (tag, className, parent) => {
		const element = document.createElement(tag);
		if (className) element.className = className;
		parent?.appendChild(element);
		return element;
	};
	/** Beats within span ms before time, latest first: the song's analysis, or without one the tempo's. */
	const beatsBefore = (scene, time, span) => {
		const found = [];
		const source = readPulses() || readPlan()?.pulses;
		if (source?.times?.length) {
			const times = source.times;
			let low = 0;
			let high = times.length;
			while (low < high) {
				const middle = (low + high) >>> 1;
				if (times[middle] <= time) low = middle + 1;
				else high = middle;
			}
			for (let index = low - 1; index >= 0 && time - times[index] <= span && found.length < 16; index -= 1) {
				found.push({ time: times[index], strength: source.strengths[index] || 0.5 });
			}
			return found;
		}
		const count = Math.floor((time - scene.start) / scene.beat);
		for (let index = count; index >= 0 && time - (scene.start + index * scene.beat) <= span && found.length < 16; index -= 1) {
			found.push({ time: scene.start + index * scene.beat, strength: index % 4 === 0 ? 1 : 0.62 });
		}
		return found;
	};
	/** How hard the beat hits now (0 to 1), dying away after each beat. */
	const beatLevel = (scene, time) => {
		let level = 0;
		for (const hit of beatsBefore(scene, time, 600)) level = Math.max(level, clamp01(hit.strength * 1.15) * Math.exp(-(time - hit.time) / 190));
		return level;
	};

	const mountScene = (scene) => {
		const W = readPlan().W;
		const H = readPlan().H;
		const least = Math.min(W, H);
		const random = createRandom(scene.seed);
		const el = node("div", "ivlyrics-motion-scene is-" + scene.style);
		const state = { el, cache: {} };
		const part = (element) => ({ el: element, cache: {} });
		const halo = (size) => {
			const ring = node("div", "ivlyrics-motion-scene-halo", el);
			ring.style.width = round(size) + "px";
			ring.style.height = round(size) + "px";
			if (shapes?.createSvg) ring.appendChild(shapes.createSvg(document, shapes.motifOf("halo"), size).svg);
			return part(ring);
		};
		switch (scene.style) {
			case "title": {
				const set = scene.title;
				const block = node("div", "ivlyrics-motion-scene-title", el);
				applyFont(block, set.spec);
				block.style.fontSize = round(set.size) + "px";
				state.block = part(block);
				state.letters = [];
				for (const chunk of set.title.split(/(\s+)/u)) {
					if (!chunk) continue;
					if (/^\s+$/u.test(chunk)) {
						block.appendChild(document.createTextNode(" "));
						continue;
					}
					const word = node("span", "ivlyrics-motion-scene-word", block);
					for (const grapheme of graphemesOf(chunk)) {
						const letter = node("span", "ivlyrics-motion-scene-letter", word);
						letter.textContent = grapheme;
						state.letters.push(part(letter));
					}
				}
				state.rule = part(node("div", "ivlyrics-motion-scene-rule", el));
				if (set.artist) {
					const by = node("div", "ivlyrics-motion-scene-artist", el);
					applyFont(by, set.artistSpec);
					by.style.fontSize = round(clamp(set.size * 0.22, 13, 42)) + "px";
					by.textContent = set.artist;
					state.artist = part(by);
				}
				break;
			}
			case "pulse": {
				state.rings = Array.from({ length: 7 }, () => {
					const ring = node("div", "ivlyrics-motion-scene-ring", el);
					ring.style.width = round(least * 0.5) + "px";
					ring.style.height = round(least * 0.5) + "px";
					return part(ring);
				});
				state.halo = halo(least * 0.62);
				state.core = part(node("div", "ivlyrics-motion-scene-core", el));
				break;
			}
			case "eq": {
				const row = node("div", "ivlyrics-motion-scene-eq", el);
				state.bars = Array.from({ length: 36 }, () => part(node("div", "ivlyrics-motion-scene-bar", row)));
				node("div", "ivlyrics-motion-scene-axis", el);
				break;
			}
			case "marquee": {
				const set = scene.title;
				const field = node("div", "ivlyrics-motion-scene-marquee", el);
				field.style.transform = "translate(-50%,-50%) rotate(" + round((random() < 0.5 ? -1 : 1) * between(random, 5, 9), 2) + "deg)";
				const copies = Math.ceil((W * 1.9) / set.unitWidth) + 2;
				state.unit = set.unitWidth;
				state.rows = Array.from({ length: 4 }, (_, index) => {
					const row = node("div", "ivlyrics-motion-scene-row" + (index % 2 ? " is-fill" : " is-outline"), field);
					applyFont(row, set.spec);
					row.style.fontSize = round(set.rowSize) + "px";
					row.textContent = set.unit.repeat(copies);
					return part(row);
				});
				break;
			}
			case "orbit": {
				const names = scene.motifs.filter((name) => shapes?.motifOf?.(name));
				state.items = Array.from({ length: 8 }, (_, index) => {
					const item = node("div", "ivlyrics-motion-scene-motif" + (index % 3 === 1 ? " is-alt" : ""), el);
					const size = least * between(random, 0.07, 0.14);
					item.style.width = round(size) + "px";
					item.style.height = round(size) + "px";
					const motif = shapes?.motifOf?.(names[index % Math.max(1, names.length)] || "sparkle");
					if (motif) item.appendChild(shapes.createSvg(document, motif, size).svg);
					const entry = part(item);
					entry.orbit = {
						radius: least * (0.17 + 0.045 * index),
						speed: (index % 2 ? 1 : -1) * between(random, 7, 16),
						phase: random() * 360,
						spin: (random() < 0.5 ? -1 : 1) * between(random, 10, 40),
						tilt: between(random, 0.5, 0.72),
					};
					return entry;
				});
				state.halo = halo(least * 0.72);
				break;
			}
			case "stripes": {
				const count = 12;
				state.spacing = W * 0.17;
				const field = node("div", "ivlyrics-motion-scene-stripes", el);
				field.style.width = round(state.spacing * count) + "px";
				field.style.transform = "translate(-50%,-50%) rotate(" + round((random() < 0.5 ? -1 : 1) * between(random, 18, 30), 2) + "deg)";
				state.bands = Array.from({ length: count }, (_, index) => {
					const band = node("div", "ivlyrics-motion-scene-band is-" + ["a", "b", "w"][index % 3], field);
					band.style.width = round(W * 0.075) + "px";
					return part(band);
				});
				state.frames = [0.46, 0.32].map((share) => {
					const frameEl = node("div", "ivlyrics-motion-scene-frame", el);
					frameEl.style.width = round(W * share) + "px";
					frameEl.style.height = round(H * share * 1.05) + "px";
					return part(frameEl);
				});
				break;
			}
			case "grid": {
				state.sun = part(node("div", "ivlyrics-motion-scene-sun", el));
				state.sun.el.style.width = round(least * 0.46) + "px";
				state.sun.el.style.height = round(least * 0.46) + "px";
				const floor = node("div", "ivlyrics-motion-scene-floor", el);
				state.lines = part(node("div", "ivlyrics-motion-scene-lines", floor));
				node("div", "ivlyrics-motion-scene-horizon", el);
				state.cell = 90;
				break;
			}
			case "count": {
				const digits = node("div", "ivlyrics-motion-scene-count", el);
				digits.style.fontSize = round(H * 0.42) + "px";
				state.outline = part(node("span", "ivlyrics-motion-scene-digits is-outline", digits));
				state.fill = part(node("span", "ivlyrics-motion-scene-digits is-fill", digits));
				node("div", "ivlyrics-motion-scene-rail", el);
				state.track = part(node("div", "ivlyrics-motion-scene-track", el));
				break;
			}
			case "wave":
			default: {
				state.waves = [0.34, 0.22, 0.47].map((share, index) => {
					const length = W * share;
					const amplitude = H * (0.09 + index * 0.03);
					const width = W * 2 + length * 2;
					const svg = document.createElementNS(SVG_NS, "svg");
					svg.setAttribute("class", "ivlyrics-motion-scene-wave is-" + index);
					svg.setAttribute("viewBox", "0 " + round(-amplitude * 1.6) + " " + round(width) + " " + round(amplitude * 3.2));
					svg.setAttribute("width", String(round(width)));
					svg.setAttribute("height", String(round(amplitude * 3.2)));
					svg.setAttribute("preserveAspectRatio", "none");
					svg.setAttribute("aria-hidden", "true");
					const path = document.createElementNS(SVG_NS, "path");
					let d = "M0 0Q" + round(length / 4) + " " + round(-amplitude) + " " + round(length / 2) + " 0";
					for (let x = length; x <= width + 0.5; x += length / 2) d += "T" + round(x) + " 0";
					path.setAttribute("d", d);
					path.setAttribute("fill", "none");
					path.setAttribute("stroke", "currentColor");
					path.setAttribute("stroke-width", index === 1 ? "4" : "3");
					path.setAttribute("stroke-linecap", "round");
					path.setAttribute("vector-effect", "non-scaling-stroke");
					svg.appendChild(path);
					el.appendChild(svg);
					const entry = part(svg);
					entry.length = length;
					return entry;
				});
				break;
			}
		}
		return state;
	};

	const paintScene = (state, scene, time) => {
		const W = readPlan().W;
		const since = time - scene.start;
		const span = Math.max(1, scene.end - scene.start);
		const beat = beatLevel(scene, time);
		const move = (entry, value) => write(entry.cache, "transform", value, (next) => { entry.el.style.transform = next; });
		const fade = (entry, value) => write(entry.cache, "opacity", round(clamp01(value), 3), (next) => { entry.el.style.opacity = String(next); });
		switch (scene.style) {
			case "title": {
				// The letters rise in one after another, drift apart as the card holds, and go before the lyrics come.
				const count = state.letters.length;
				const step = Math.min(55, 900 / Math.max(1, count));
				const drift = 0.05 * easeInOutSine(clamp01(since / span));
				state.letters.forEach((letter, index) => {
					const k = easeOutExpo(clamp01((since - 140 - index * step) / 640));
					const out = easeInCubic(clamp01((time - (scene.end - 950 + index * step * 0.5)) / 460));
					fade(letter, k * (1 - out));
					move(letter, "translate(" + round((index - (count - 1) / 2) * drift, 3) + "em," + round((1 - k) * 0.6 - out * 0.35, 3) + "em) scale(" + round(1 + (1 - k) * 0.25, 3) + ")");
				});
				move(state.block, "scale(" + round(1 + 0.035 * clamp01(since / span) + beat * 0.012, 4) + ")");
				const open = easeInOutCubic(clamp01((since - 380) / 820)) * (1 - easeInCubic(clamp01((time - (scene.end - 700)) / 420)));
				move(state.rule, "scaleX(" + round(open, 3) + ")");
				if (state.artist) {
					const k = easeOutCubic(clamp01((since - 650) / 600)) * (1 - clamp01((time - (scene.end - 800)) / 420));
					fade(state.artist, k);
					move(state.artist, "translateY(" + round((1 - k) * 0.6, 3) + "em)");
				}
				break;
			}
			case "pulse": {
				// A ring bursts out from the centre on every beat.
				const hits = beatsBefore(scene, time, 1800).filter((hit) => hit.strength >= 0.3);
				state.rings.forEach((ring, index) => {
					const hit = hits[index];
					if (!hit) {
						fade(ring, 0);
						return;
					}
					const t = clamp01((time - hit.time) / 1800);
					fade(ring, (0.4 + 0.5 * clamp01(hit.strength)) * Math.pow(1 - t, 1.4));
					move(ring, "translate(-50%,-50%) scale(" + round(0.22 + 2.1 * easeOutCubic(t), 3) + ")");
				});
				fade(state.halo, 0.55);
				move(state.halo, "translate(-50%,-50%) rotate(" + round((since * 0.014) % 360, 2) + "deg) scale(" + round(1 + beat * 0.07, 3) + ")");
				move(state.core, "translate(-50%,-50%) scale(" + round(0.6 + beat * 0.9, 3) + ")");
				break;
			}
			case "eq": {
				const count = state.bars.length;
				state.bars.forEach((bar, index) => {
					const phase = index / count;
					const swell = 0.5 + 0.5 * Math.sin(time * 0.0021 + phase * 6.283 + (scene.seed % 7));
					const jitter = 0.5 + 0.5 * Math.sin(time * 0.0113 * (1 + (index % 5) * 0.17) + index * 1.7);
					const middle = 1 - Math.abs(phase - 0.5) * 1.1;
					const grow = easeOutCubic(clamp01((since - Math.abs(index - count / 2) * 18) / 520));
					const height = clamp((0.05 + 0.22 * swell * middle + beat * (0.35 + 0.55 * jitter) * middle + 0.08 * jitter) * grow, 0.02, 1);
					move(bar, "scaleY(" + round(height, 3) + ")");
				});
				break;
			}
			case "marquee": {
				// The title in huge rows sliding past each other, outlined and filled in turn.
				state.rows.forEach((row, index) => {
					const way = index % 2 ? 1 : -1;
					const travel = (way * W * (0.045 + index * 0.012) * since) / 1000 + index * state.unit * 0.37;
					const shift = ((travel % state.unit) + state.unit) % state.unit;
					const rise = (1 - easeOutExpo(clamp01((since - index * 110) / 760))) * 0.8;
					move(row, "translate(" + round(shift - state.unit, 1) + "px," + round(rise, 3) + "em)");
				});
				break;
			}
			case "orbit": {
				// The song's motifs on tilted orbits, larger and brighter as they come round to the front.
				state.items.forEach((item, index) => {
					const { radius, speed, phase, spin, tilt } = item.orbit;
					const angle = ((phase + (speed * since) / 1000) * Math.PI) / 180;
					const near = (Math.sin(angle) + 1) / 2;
					const pop = easeOutBack(clamp01((since - index * 120) / 560));
					const scale = Math.max(0, pop * (0.75 + 0.4 * near) * (1 + (index % 2 ? beat * 0.3 : 0)));
					fade(item, (0.4 + 0.5 * near) * clamp01(pop));
					move(item, "translate(-50%,-50%) translate(" + round(Math.cos(angle) * radius) + "px," + round(Math.sin(angle) * radius * tilt) + "px) rotate("
						+ round((spin * since) / 1000 + phase, 1) + "deg) scale(" + round(scale, 3) + ")");
				});
				fade(state.halo, 0.5);
				move(state.halo, "translate(-50%,-50%) rotate(" + round((-since * 0.01) % 360, 2) + "deg) scale(" + round(1 + beat * 0.05, 3) + ")");
				break;
			}
			case "stripes": {
				const total = state.spacing * state.bands.length;
				const travel = (since / 1000) * W * 0.11;
				state.bands.forEach((band, index) => {
					const x = (((index * state.spacing + travel) % total) + total) % total;
					move(band, "translateX(" + round(x) + "px)");
					fade(band, 0.72 + (index % 2 ? beat * 0.28 : 0));
				});
				state.frames.forEach((frameEntry, index) => {
					const way = index ? -1 : 1;
					const k = easeOutExpo(clamp01((since - index * 160) / 700));
					move(frameEntry, "translate(-50%,-50%) rotate(" + round(way * since * 0.004, 2) + "deg) scale(" + round((0.6 + 0.4 * k) * (1 + way * beat * 0.05), 3) + ")");
					fade(frameEntry, k * 0.85);
				});
				break;
			}
			case "grid": {
				// The floor rushes at the camera half a cell a beat; it flares on the beat.
				const travel = (since / scene.beat) * state.cell * 0.5;
				move(state.lines, "translateY(" + round(travel % state.cell, 1) + "px)");
				fade(state.lines, 0.7 + beat * 0.3);
				const rise = easeOutCubic(clamp01(since / 1200));
				fade(state.sun, 0.62 * rise);
				move(state.sun, "translate(-50%," + round(-100 + (1 - rise) * 30, 1) + "%) scale(" + round(1 + beat * 0.04, 3) + ")");
				break;
			}
			case "count": {
				// The seconds to the lyrics, each filling up as it runs out.
				const target = scene.cue ?? scene.end;
				const left = target - time;
				const text = String(Math.max(0, Math.ceil(left / 1000)));
				for (const entry of [state.outline, state.fill]) write(entry.cache, "text", text, (value) => { entry.el.textContent = value; });
				const within = left > 0 ? 1 - (left % 1000) / 1000 : 1;
				const enter = easeOutExpo(clamp01(within * 4));
				const shape = "translateY(" + round((1 - enter) * 0.18, 3) + "em) scale(" + round(1 + beat * 0.03, 3) + ")";
				move(state.outline, shape);
				move(state.fill, shape);
				write(state.fill.cache, "clip", "inset(" + round((1 - within) * 100, 1) + "% -0.2em -0.2em -0.2em)", (value) => { state.fill.el.style.clipPath = value; });
				fade(state.outline, 0.25 + 0.75 * enter);
				move(state.track, "translateX(-50%) scaleX(" + round(clamp01(since / Math.max(1, target - scene.start)), 4) + ")");
				break;
			}
			case "wave":
			default: {
				state.waves.forEach((wave, index) => {
					const travel = ((since / 1000) * W * (0.05 + index * 0.025)) % wave.length;
					const lift = clamp(0.45 + 0.3 * Math.sin(time * 0.0009 * (index + 1) + index) + beat * (0.9 - index * 0.2), 0.15, 1.6);
					move(wave, "translate(" + round(index === 1 ? travel - wave.length : -travel) + "px,-50%) scaleY(" + round(lift, 3) + ")");
				});
				break;
			}
		}
	};

	const clearScenes = () => {
		for (const state of scenesShown.values()) state.el.remove();
		scenesShown.clear();
		cueEl?.remove();
		cueEl = null;
		cueCache = {};
	};

	/** The scenes due now, faded in and out at their ends, and the cue dots counting in the lyrics. */
	const paintInterludes = (time) => {
		if (!interlude) return;
		const plan = readPlan();
		const scenes = plan.interludes || [];
		const due = new Set();
		for (const scene of scenes) if (time >= scene.start - 30 && time <= scene.end + 30) due.add(scene.index);
		for (const [index, state] of scenesShown) {
			if (due.has(index)) continue;
			state.el.remove();
			scenesShown.delete(index);
		}
		for (const index of due) {
			const scene = scenes[index];
			let state = scenesShown.get(index);
			if (!state) {
				state = mountScene(scene);
				scenesShown.set(index, state);
				interlude.appendChild(state.el);
			}
			const level = round(Math.min(clamp01((time - scene.start) / SCENE_FADE_MS), clamp01((scene.end - time) / SCENE_FADE_MS)), 3);
			write(state.cache, "opacity", level, (value) => { state.el.style.opacity = String(value); });
			if (level > 0) paintScene(state, scene, time);
		}
		const cue = (plan.cues || []).find((entry) => time >= entry.from && time <= entry.at + 260);
		if (!cue) {
			if (cueEl) write(cueCache, "opacity", 0, () => { cueEl.style.opacity = "0"; });
			return;
		}
		if (!cueEl) {
			cueEl = node("div", "ivlyrics-motion-cue", interlude);
			cueEl.dots = Array.from({ length: CUE_BEATS }, () => ({ el: node("span", "ivlyrics-motion-cue-dot", cueEl), cache: {} }));
			cueCache = {};
		}
		const shown = easeOutCubic(clamp01((time - cue.from) / 300)) * (1 - clamp01((time - cue.at) / 260));
		write(cueCache, "opacity", round(shown, 3), (value) => { cueEl.style.opacity = String(value); });
		// One dot goes out on each beat; the lyrics come in as the last one does.
		const lit = clamp(Math.ceil((cue.at - time) / cue.step), 0, CUE_BEATS);
		cueEl.dots.forEach((dot, index) => {
			const on = index < lit;
			write(dot.cache, "lit", on, (value) => dot.el.classList.toggle("is-lit", value));
			const out = time - (cue.at - index * cue.step);
			write(dot.cache, "transform", on ? "none" : "scale(" + round(0.7 + 0.5 * Math.exp(-Math.max(0, out) / 160), 3) + ")", (value) => { dot.el.style.transform = value; });
		});
	};

	return { clearScenes, paintInterludes };
}
