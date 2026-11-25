import { getKaraokeFillSoftEdge } from "./karaokeFill.mjs";

// Pronunciation fill (Settings > Karaoke mode). With pronunciation-first off,
// the pronunciation row of a karaoke line fills along its timed units (the
// part of the pronunciation sung during each karaoke unit). React owns each
// unit's pending/active/done state on the singing row; KaraokeLivePainter
// writes the active unit's fill edge every frame from the same clock as the
// lyric. No bounce, glow or other karaoke effect applies, and rows that are
// not singing keep their usual color.
const PHONETIC_FILL_ATTRIBUTE = "data-phonetic-fill";
const normalizePhoneticFillText = (value) => String(value ?? "").replace(/\s+/gu, " ").trim();

/** The units, if they spell exactly the pronunciation shown in the row. */
export const getPhoneticFillUnits = (units, text) => {
	if (!Array.isArray(units) || units.length === 0 || typeof text !== "string" || !text.trim()) return null;
	const joined = normalizePhoneticFillText(units.map((unit) => unit?.text ?? "").join(""));
	return joined === normalizePhoneticFillText(text) ? units : null;
};

// A fill unit inherits the range colour of the syllable it was sung on, so
// the pronunciation row keeps the line's multi-vocal and creator colours.
// Text effects are not repeated: the fill only paints colour.
export function createKaraokePhoneticFill({
	react, KaraokeLivePainter, paintKaraokeLiveEntry, getKaraokeLiveFill,
	getKaraokeInlineSpeakerClass, getKaraokeSpeakerStyle, getInactiveColor, now,
}) {
	const { useEffect, useRef } = react;

	const getPhoneticFillUnitColor = (unit) => {
		if (unit?.inlineStyle !== true) return null;
		const speaker = String(unit?.styleSpeaker || "").trim();
		if (!speaker) return null;
		// Same class the original text's range gets, so a NORMAL range inside a
		// coloured line resets the fill to the page colours as the text does.
		const speakerClass = getKaraokeInlineSpeakerClass(speaker, unit?.styleSpeakerColor, unit?.styleSpeakerFallback);
		if (!speakerClass) return null;
		return {
			className: "ivlyrics-karaoke-range-style speaker-" + speakerClass,
			style: getKaraokeSpeakerStyle(speaker, unit?.styleSpeakerColor, unit?.styleSpeakerFallback),
		};
	};

	const usePhoneticFillPainting = (liveClock, livePositionMap, rootRef, units) => {
		const entryRef = useRef(null);
		(react.useLayoutEffect || useEffect)(() => {
			const root = rootRef.current;
			if (!liveClock || !root || !Array.isArray(units) || units.length === 0) {
				if (entryRef.current) KaraokeLivePainter.release(entryRef.current);
				entryRef.current = null;
				return;
			}
			const entry = entryRef.current ??= { units: new Map(), data: null, lastPosition: NaN };
			entry.clock = liveClock;
			entry.mapPosition = livePositionMap;
			const next = new Map();
			for (const element of root.querySelectorAll("[" + PHONETIC_FILL_ATTRIBUTE + "]")) {
				const key = element.getAttribute(PHONETIC_FILL_ATTRIBUTE);
				const source = units[Number(key)];
				if (!source) continue;
				const previous = entry.units.get(key);
				next.set(key, previous && previous.elements[0] === element
					&& previous.fill.startTime === source.startTime && previous.fill.endTime === source.endTime
					? previous
					: {
						key, elements: [element], values: new Map(), profile: null, expressive: null,
						fill: { startTime: source.startTime, endTime: source.endTime, softEdge: 10 },
					});
			}
			entry.units = next;
			entry.lastPosition = NaN;
			KaraokeLivePainter.attach(entry);
			paintKaraokeLiveEntry(entry, now());
		});
		useEffect(() => () => {
			if (entryRef.current) KaraokeLivePainter.release(entryRef.current);
			entryRef.current = null;
		}, []);
	};

	const PhoneticFillText = react.memo(({ units, position = 0, active = false, liveClock = null, livePositionMap = null }) => {
		const rootRef = useRef(null);
		const live = active && liveClock ? liveClock : null;
		usePhoneticFillPainting(live, livePositionMap, rootRef, units);
		return react.createElement(
			"span",
			{ ref: rootRef, className: "lyrics-phonetic-fill" },
			units.map((unit, index) => {
				let state = "";
				let style = null;
				if (active) {
					if (position >= unit.endTime) {
						state = "done";
					} else if (position > unit.startTime) {
						state = "active";
						if (!live) {
							const fill = getKaraokeLiveFill(position, unit.startTime, unit.endTime) ?? 0;
							const softEdge = getKaraokeFillSoftEdge(fill, 10);
							style = {
								"--karaoke-char-fill": fill.toFixed(2) + "%",
								"--karaoke-char-fill-soft-start": Math.max(0, fill - softEdge).toFixed(2) + "%",
								"--karaoke-char-fill-soft-end": Math.min(100, fill + softEdge).toFixed(2) + "%",
							};
						}
					} else {
						state = "pending";
					}
				}
				const color = getPhoneticFillUnitColor(unit);
				const colorStyle = color?.style && Object.keys(color.style).length ? color.style : null;
				return react.createElement("span", {
					key: index,
					className: [
						"lyrics-phonetic-fill-unit",
						state ? "lyrics-phonetic-fill-unit--" + state : "",
						color?.className,
					].filter(Boolean).join(" "),
					[PHONETIC_FILL_ATTRIBUTE]: index,
					"data-text": state === "active" ? unit.text : undefined,
					style: colorStyle ? { ...colorStyle, ...(style || {}) } : style,
				}, unit.text);
			})
		);
	});

	const renderPhoneticFillSubLine = (units, position, active, liveClock, onContextMenu = null, singleLineScroll = false) => {
		const props = {
			className: "lyrics-lyricsContainer-LyricsLine-phonetic" + (singleLineScroll ? " ivlyrics-vinyl-lyric-scroll-viewport" : ""),
			style: { "--sub-lyric-color": getInactiveColor() },
		};
		if (onContextMenu) props.onContextMenu = onContextMenu;
		const content = react.createElement(PhoneticFillText, { units, position, active, liveClock });
		return react.createElement(
			"p",
			props,
			singleLineScroll
				? react.createElement("span", { className: "ivlyrics-vinyl-lyric-scroll-content" }, content)
				: content
		);
	};

	return { PhoneticFillText, renderPhoneticFillSubLine };
}
