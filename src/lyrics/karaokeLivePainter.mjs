import { getKaraokeFillSoftEdge } from "./karaokeFill.mjs";
import {
	createKaraokeMotionProfile, getKaraokeMotionProfile,
	getKaraokeExpressiveWordWindow, isKaraokeExpressiveEmphasisUnit,
} from "./karaokeMotion.mjs";

// Live karaoke painting.
// React owns every discrete glyph state (pending, active, done, bouncing). The
// values that change continuously while a glyph is sung (fill edge, bounce
// offset and scale, glow) are written here once per display frame, from the
// playback clock sampled at that frame's timestamp. Rendering them through React
// tied them to the 60 fps state cadence and to rounded fill/motion steps, so a
// 120 Hz display showed every fill step for two (sometimes four) frames while
// each step rebuilt and restyled the glyph's React element.
const KARAOKE_LIVE_ATTRIBUTE = "data-karaoke-live";
const KARAOKE_LIVE_QUIET_FRAMES = 30;
const KARAOKE_LIVE_BOUNCE_PROPERTIES = ["--karaoke-bounce-y", "--karaoke-bounce-scale", "--karaoke-motion-glow"];

export function createKaraokeLivePainter({
	useRef, useEffect, useLayoutEffect, getTrackPositionFPS, isSettingsOpen, getVisualSettings,
	prefersReducedLyricsMotion, getKaraokeLiveFill, splitKaraokeGraphemes, motion,
	requestFrame,
	now = () => performance.now(),
}) {
	const { clearKaraokeExpressiveMotion, getKaraokeExpressiveMotion, getKaraokeLiveBounce } = motion;

	const getKaraokeLiveTimes = (charInfo) => ({
		startTime: Number.isFinite(charInfo?.karaokeFillStartTime) ? charInfo.karaokeFillStartTime : charInfo?.startTime,
		endTime: Number.isFinite(charInfo?.karaokeFillEndTime) ? charInfo.karaokeFillEndTime : charInfo?.endTime,
	});

	// Units mirror the React builders: a glyph (character mode), a word (word mode
	// bounce) or a shaped text-run segment. Each keeps its element(s) and the last
	// values written to them, so an unchanged value is never written twice.
	const createKaraokeLiveUnit = (key, data) => {
		const [kind, first, second] = String(key).split(":");
		const startIndex = Number(first);
		if (!Number.isInteger(startIndex) || startIndex < 0) return null;
		// Expressive units carry their motion window instead of a bounce profile;
		// the painter steps their springs (keyed by the unit) every frame.
		const unit = { key, elements: [], values: new Map(), fill: null, profile: null, expressive: null };
		if (kind === "g") {
			const charInfo = data.timedChars?.[startIndex];
			if (!charInfo || data.wordTimed) return null;
			const { startTime, endTime } = getKaraokeLiveTimes(charInfo);
			if (Number.isFinite(startTime) && Number.isFinite(endTime)) unit.fill = { startTime, endTime, softEdge: 16 };
			const expressiveMode = data.expressive ? data.expressiveUnits?.charModes?.[startIndex] : null;
			if (expressiveMode === "word") return unit;
			if (expressiveMode && unit.fill) {
				unit.expressive = {
					startTime, endTime,
					emphasis: expressiveMode === "emphasis" || isKaraokeExpressiveEmphasisUnit(startTime, endTime),
				};
				return unit;
			}
			unit.profile = data.motionProfiles?.[startIndex] || null;
			return unit;
		}
		if (kind === "w") {
			const count = Number(second);
			const expressiveRange = data.expressiveUnits?.wordRanges?.get(startIndex);
			const expressiveWord = data.expressive === true && data.expressiveUnits?.wordStarts?.has(startIndex) === true
				&& (!expressiveRange || expressiveRange.charCount === count);
			if (!Number.isInteger(count) || count < 1 || (!data.wordTimed && !expressiveWord)) return null;
			if (data.expressive) {
				const { startTime, endTime } = getKaraokeExpressiveWordWindow(data.timedChars || [], startIndex, count, data.wordTimed);
				if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
				unit.expressive = { startTime, endTime, emphasis: false };
				return unit;
			}
			let startTime = Infinity;
			let endTime = -Infinity;
			for (const charInfo of (data.timedChars || []).slice(startIndex, startIndex + count)) {
				const times = getKaraokeLiveTimes(charInfo);
				if (Number.isFinite(times.startTime)) startTime = Math.min(startTime, times.startTime);
				if (Number.isFinite(times.endTime)) endTime = Math.max(endTime, times.endTime);
			}
			if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
			unit.profile = getKaraokeMotionProfile(data.timedChars, startIndex, count)
				|| createKaraokeMotionProfile(startTime, endTime, endTime - startTime);
			return unit;
		}
		if (kind === "s") {
			const segment = data.segmentsByStart?.get(startIndex);
			if (!segment) return null;
			const startTime = Number.isFinite(segment.startTime) ? segment.startTime : 0;
			const endTime = Number.isFinite(segment.endTime) ? segment.endTime : startTime;
			if (!data.wordTimed) unit.fill = { startTime, endTime, softEdge: 10 };
			if (data.expressive) {
				unit.expressive = { startTime, endTime, emphasis: false };
				return unit;
			}
			const charCount = Number.isFinite(segment.charCount) ? segment.charCount : splitKaraokeGraphemes(segment.text).length;
			unit.profile = getKaraokeMotionProfile(data.timedChars, segment.startIndex, charCount)
				|| createKaraokeMotionProfile(segment.startTime, segment.endTime, segment.endTime - segment.startTime);
			return unit;
		}
		return null;
	};

	const setKaraokeLiveValue = (unit, name, value) => {
		if (unit.values.get(name) === value) return;
		unit.values.set(name, value);
		for (const element of unit.elements) {
			if (value === null) element.style.removeProperty(name);
			else element.style.setProperty(name, value);
		}
	};

	const resetKaraokeLiveUnit = (unit) => {
		if (unit.expressive) clearKaraokeExpressiveMotion(unit);
		for (const name of KARAOKE_LIVE_BOUNCE_PROPERTIES) setKaraokeLiveValue(unit, name, null);
	};

	const paintKaraokeLiveUnit = (unit, position, frameTime) => {
		if (unit.fill) {
			const fill = getKaraokeLiveFill(position, unit.fill.startTime, unit.fill.endTime);
			if (fill !== null) {
				const softEdge = getKaraokeFillSoftEdge(fill, unit.fill.softEdge);
				setKaraokeLiveValue(unit, "--karaoke-char-fill", `${fill.toFixed(2)}%`);
				setKaraokeLiveValue(unit, "--karaoke-char-fill-soft-start", `${Math.max(0, fill - softEdge).toFixed(2)}%`);
				setKaraokeLiveValue(unit, "--karaoke-char-fill-soft-end", `${Math.min(100, fill + softEdge).toFixed(2)}%`);
			}
		}
		if (unit.expressive) {
			const { startTime, endTime, emphasis } = unit.expressive;
			const motion = getKaraokeExpressiveMotion(unit, position, startTime, endTime, emphasis,
				Number.isFinite(frameTime) ? frameTime : undefined);
			const moving = motion.active === true;
			setKaraokeLiveValue(unit, "--karaoke-bounce-y", moving ? `${motion.offsetY.toFixed(4)}em` : null);
			setKaraokeLiveValue(unit, "--karaoke-bounce-scale", moving ? motion.scale.toFixed(4) : null);
			setKaraokeLiveValue(unit, "--karaoke-motion-glow", moving ? motion.glow.toFixed(3) : null);
		} else if (unit.profile) {
			const bounce = getKaraokeLiveBounce(position, unit.profile);
			setKaraokeLiveValue(unit, "--karaoke-bounce-y", bounce ? `${bounce.offsetY.toFixed(3)}px` : null);
			setKaraokeLiveValue(unit, "--karaoke-bounce-scale", bounce ? bounce.scale.toFixed(4) : null);
			setKaraokeLiveValue(unit, "--karaoke-motion-glow", bounce ? bounce.glow.toFixed(3) : null);
		}
	};

	// Re-read the row's live elements after every commit. Units survive commits
	// while their element identities do, keeping their last written values.
	const hasSameKaraokeLiveValues = (before, after) => {
		if (before === after) return true;
		if (!before || !after) return false;
		const keys = Object.keys(after);
		return Object.keys(before).length === keys.length
			&& keys.every(key => Object.prototype.hasOwnProperty.call(before, key) && Object.is(before[key], after[key]));
	};

	const canRetainKaraokeLiveUnit = (unit, next, before, after) => {
		if (!before || !after || !next || before.wordTimed !== after.wordTimed || before.expressive !== after.expressive
			|| !hasSameKaraokeLiveValues(unit.fill, next.fill)
			|| !hasSameKaraokeLiveValues(unit.profile, next.profile)
			|| !hasSameKaraokeLiveValues(unit.expressive, next.expressive)) return false;
		const [kind, first, second] = unit.key.split(":");
		const start = Number(first);
		if (kind === "s") {
			const oldSegment = before.segmentsByStart?.get(start);
			const newSegment = after.segmentsByStart?.get(start);
			if (oldSegment?.text !== newSegment?.text || oldSegment?.charCount !== newSegment?.charCount) return false;
		}
		if (before.timedChars === after.timedChars) return true;
		const count = kind === "w" ? Number(second)
			: kind === "s" ? after.segmentsByStart?.get(start)?.charCount || 1 : 1;
		for (let index = start; index < start + count; index++) {
			if (before.timedChars?.[index]?.char !== after.timedChars?.[index]?.char) return false;
		}
		return true;
	};

	const syncKaraokeLiveEntry = (entry, root, clock, mapPosition, data) => {
		entry.clock = clock;
		entry.mapPosition = mapPosition;
		const previousData = entry.data;
		const dataChanged = previousData !== data;
		entry.data = data;
		const elementsByKey = new Map();
		for (const element of root.querySelectorAll(`[${KARAOKE_LIVE_ATTRIBUTE}]`)) {
			const key = element.getAttribute(KARAOKE_LIVE_ATTRIBUTE);
			const elements = elementsByKey.get(key);
			if (elements) elements.push(element);
			else elementsByKey.set(key, [element]);
		}
		for (const [key, unit] of entry.units) {
			const elements = elementsByKey.get(key);
			if (elements && (!dataChanged
				|| canRetainKaraokeLiveUnit(unit, createKaraokeLiveUnit(key, data), previousData, data))) {
				if (elements.length !== unit.elements.length
					|| elements.some((element, index) => element !== unit.elements[index])) {
					// Ruby or word supplements can legitimately introduce a wrapper.
					// Rebind the same timed unit, retaining its spring velocity/pose.
					for (const element of unit.elements) {
						for (const name of unit.values.keys()) element.style.removeProperty(name);
					}
					unit.elements = elements;
					unit.values.clear();
				}
				continue;
			}
			resetKaraokeLiveUnit(unit);
			entry.units.delete(key);
		}
		for (const [key, elements] of elementsByKey) {
			if (entry.units.has(key)) continue;
			const unit = createKaraokeLiveUnit(key, data);
			if (!unit) continue;
			unit.elements = elements;
			entry.units.set(key, unit);
		}
		entry.lastPosition = NaN;
	};

	const paintKaraokeLiveEntry = (entry, frameTime) => {
		const expressive = entry.data?.expressive === true;
		// A layout effect paints with performance.now(), which can be later than
		// the RAF timestamp still queued for that same frame. Feeding that older
		// sample to a spring looks like a backward seek and resets it to rest on
		// every React commit. Keep the newest paint; real seeks at a newer frame
		// timestamp still go through the normal motion/position reset path.
		if (expressive && Number.isFinite(frameTime) && Number.isFinite(entry.lastMotionFrameTime)
			&& frameTime < entry.lastMotionFrameTime) return false;
		const clockPosition = entry.clock?.getPosition?.(frameTime);
		if (!Number.isFinite(clockPosition)) return false;
		const position = entry.mapPosition ? entry.mapPosition(clockPosition) : clockPosition;
		if (expressive && Number.isFinite(frameTime)) entry.lastMotionFrameTime = frameTime;
		// Expressive settings also apply to a paused live row before React commits
		// its next structure. Classic retains its existing clock-only fast path.
		const bounce = expressive ? getVisualSettings()["karaoke-bounce"] : null;
		const effects = expressive ? getVisualSettings()["karaoke-text-effects"] : null;
		const style = expressive ? getVisualSettings()["karaoke-motion-style"] : null;
		const reduced = expressive ? prefersReducedLyricsMotion() : null;
		if (Object.is(position, entry.lastPosition) && (!expressive
			|| (entry.bounce === bounce && entry.effects === effects && entry.style === style && entry.reduced === reduced))) return false;
		entry.lastPosition = position;
		if (expressive) Object.assign(entry, { bounce, effects, style, reduced });
		for (const unit of entry.units.values()) paintKaraokeLiveUnit(unit, position, frameTime);
		return true;
	};

	const KaraokeLivePainter = {
		entries: new Set(),
		frameId: null,
		lastFrameTime: 0,
		quietFrames: 0,
		boundTick: null,

		attach(entry) {
			this.entries.add(entry);
			this.quietFrames = 0;
			this.schedule();
		},

		release(entry) {
			if (!this.entries.delete(entry)) return;
			for (const unit of entry.units.values()) resetKaraokeLiveUnit(unit);
		},

		schedule() {
			if (this.frameId !== null || this.entries.size === 0) return;
			this.boundTick ??= (timestamp) => this.tick(timestamp);
			this.frameId = requestFrame(this.boundTick);
		},

		tick(timestamp) {
			this.frameId = null;
			if (this.entries.size === 0) return;
			const settingsOpen = isSettingsOpen();
			// 60 fps or more follows the display refresh rate; an explicit lower
			// performance setting keeps its power-saving cap.
			const fps = getTrackPositionFPS();
			const minimumInterval = fps < 60 ? 1000 / fps - 1 : 0;
			let moved = false;
			if (!settingsOpen && !(timestamp - this.lastFrameTime < minimumInterval)) {
				this.lastFrameTime = timestamp;
				for (const entry of this.entries) moved = paintKaraokeLiveEntry(entry, timestamp) || moved;
			}
			this.quietFrames = moved ? 0 : this.quietFrames + 1;
			// Paused playback stops moving every value. The next React commit of a
			// live row re-attaches its entry and resumes the loop.
			if (this.quietFrames < KARAOKE_LIVE_QUIET_FRAMES) this.schedule();
		},
	};

	const useKaraokeLivePainting = (liveClock, livePositionMap, rootRef, dataRef) => {
		const entryRef = useRef(null);
		useLayoutEffect(() => {
			const data = liveClock ? dataRef.current : null;
			const root = rootRef.current;
			if (!data || !root) {
				if (entryRef.current) KaraokeLivePainter.release(entryRef.current);
				entryRef.current = null;
				return;
			}
			const entry = entryRef.current ??= { units: new Map(), data: null, lastPosition: NaN };
			syncKaraokeLiveEntry(entry, root, liveClock, livePositionMap, data);
			KaraokeLivePainter.attach(entry);
			// Paint the committed structure before the browser draws it.
			paintKaraokeLiveEntry(entry, now());
		});
		useEffect(() => () => {
			if (entryRef.current) KaraokeLivePainter.release(entryRef.current);
			entryRef.current = null;
		}, []);
	};

	return { KaraokeLivePainter, useKaraokeLivePainting, paintKaraokeLiveEntry };
}

export { KARAOKE_LIVE_ATTRIBUTE };
