const PAGES_IV_LYRICS_SPEAKER_CLASS_CONTRACT = Symbol.for("ivLyrics.speakerColors.classNameContract");

const KARAOKE_TEXT_EFFECT_KIND_CLASSES = new Set([
	"effect",
	"adlib",
	"pulse",
	"wave",
	"sparkle",
	"echo",
	"whisper",
	"bounce",
	"sway",
	"glow",
	"glitch",
	"flicker",
	"float",
	"blur",
	"pop",
]);

const splitRenderableKaraokeSyllables = (syllables) => {
	if (!Array.isArray(syllables) || syllables.length === 0) {
		return [];
	}

	return syllables.flatMap((syllable) => {
		const text = syllable?.text || "";
		if (!text || !/\s/.test(text) || text.trim() === "") {
			return syllable;
		}

		return text
			.split(/(\s+)/)
			.filter((part) => part !== "")
			.map((part) => ({
				...syllable,
				text: part,
			}));
	});
};

const hasKaraokeVocalRows = (line) => (
	Array.isArray(line?.vocals?.lead?.syllables)
	&& line.vocals.lead.syllables.length > 0
	&& Array.isArray(line.vocals.background)
	&& line.vocals.background.some((part) => Array.isArray(part?.syllables) && part.syllables.length > 0)
);

export function createKaraokeLinePresentation({ getSpeakerColors, getVisualSettings, prefersReducedLyricsMotion }) {
	const getKaraokeSpeakerPresentation = (speaker, speakerColor = "", speakerFallback = "") => {
		const presentation = getSpeakerColors()?.getPresentation?.(speaker, speakerColor, speakerFallback);
		if (presentation) return presentation;
		const normalized = String(speaker || "").trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").toUpperCase();
		const normalizedFallback = String(speakerFallback || "").trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").toUpperCase();
		const effectiveSpeaker = normalized === "CUSTOM"
			? (["MALE 1", "FEMALE 1", "DUET 1"].includes(normalizedFallback) ? normalizedFallback : "MALE 1")
			: ({
			"MALE CUSTOM": "MALE 1",
			"FEMALE CUSTOM": "FEMALE 1",
			"DUET CUSTOM": "DUET 1",
		}[normalized] || normalized);
		const normalizedColor = /^#[0-9a-f]{6}$/i.test(String(speakerColor || "").trim())
			? String(speakerColor).trim().toLowerCase()
			: "";
		const creatorColorEnabled = getVisualSettings()?.["sync-data-custom-speaker-colors-enabled"] !== false;
		return {
			speakerClass: String(effectiveSpeaker || "").trim().toLowerCase().replace(/[_\s]+/g, "-").replace(/[^a-z0-9-]/g, ""),
			creatorColor: (normalized === "CUSTOM" || normalized.endsWith(" CUSTOM")) && creatorColorEnabled ? normalizedColor : "",
		};
	};

	const normalizeKaraokeSpeakerClass = (speaker, speakerColor = "", speakerFallback = "") => {
		const helper = getSpeakerColors();
		const contract = helper?.[PAGES_IV_LYRICS_SPEAKER_CLASS_CONTRACT];
		const hasReferenceInput = (speaker !== null && (typeof speaker === "object" || typeof speaker === "function"))
			|| (speakerColor !== null && (typeof speakerColor === "object" || typeof speakerColor === "function"))
			|| (speakerFallback !== null && (typeof speakerFallback === "object" || typeof speakerFallback === "function"));
		if (!hasReferenceInput
			&& contract?.getPresentation === helper?.getPresentation
			&& typeof contract?.getClassName === "function") {
			return contract.getClassName(speaker, speakerFallback);
		}
		return getKaraokeSpeakerPresentation(speaker, speakerColor, speakerFallback).speakerClass;
	};

	// The shared speaker helper has no NORMAL palette entry, so a NORMAL range
	// resolves to an empty class. Keep an explicit class anyway: the range still
	// has to reset the line speaker's colour (style.css .speaker-normal), and
	// without a class the renderer drops the range entirely.
	const getKaraokeInlineSpeakerClass = (speaker, speakerColor = "", speakerFallback = "") => {
		const resolved = normalizeKaraokeSpeakerClass(speaker, speakerColor, speakerFallback);
		if (resolved) return resolved;
		return String(speaker || "").trim().toLowerCase().replace(/[_\s]+/g, "-").replace(/[^a-z0-9-]/g, "");
	};

	const getKaraokeSpeakerStyle = (speaker, speakerColor = "", speakerFallback = "") => {
		const creatorColor = getKaraokeSpeakerPresentation(speaker, speakerColor, speakerFallback).creatorColor;
		return creatorColor ? {
			"--lyrics-color-active": creatorColor,
			"--lyrics-color-inactive": `color-mix(in srgb, ${creatorColor} 50%, transparent)`,
		} : {};
	};

	const areKaraokeTextEffectsEnabled = () => (
		getVisualSettings()?.["karaoke-text-effects"] !== false && !prefersReducedLyricsMotion()
	);

	const getKaraokeKindClassParts = (kind) => {
		const kindClass = String(kind || "").trim().toLowerCase();
		if (!kindClass || (kindClass !== "vocal" && !KARAOKE_TEXT_EFFECT_KIND_CLASSES.has(kindClass))) {
			return [];
		}

		const classes = [kindClass];
		if (KARAOKE_TEXT_EFFECT_KIND_CLASSES.has(kindClass) && !areKaraokeTextEffectsEnabled()) {
			classes.push("text-effects-disabled");
		}
		return classes;
	};

	const getKaraokeLineMetaClass = (line) => {
		const classes = [];
		const speakerClass = normalizeKaraokeSpeakerClass(line?.speaker, line?.['speaker-color'], line?.['speaker-fallback']);
		if (speakerClass) classes.push(`speaker-${speakerClass}`);
		const hasInlineEffects = Array.isArray(line?.syllables)
			&& line.syllables.some(syllable => (
				syllable?.inlineStyle === true
				&& KARAOKE_TEXT_EFFECT_KIND_CLASSES.has(String(syllable?.styleKind || "").trim().toLowerCase())
			));
		if (line?.kind && !hasInlineEffects) classes.push(...getKaraokeKindClassParts(line.kind));
		return classes.join(" ");
	};

	const getKaraokeVocalRows = (line) => {
		if (!Array.isArray(line?.vocals?.lead?.syllables) || line.vocals.lead.syllables.length === 0) {
			return null;
		}

		const buildRow = (voice, fallbackKey, fallbackRole) => {
			const speaker = voice.speaker || "";
			const speakerColor = voice["speaker-color"] || "";
			const speakerFallback = voice["speaker-fallback"] || "";
			return {
				key: voice.id || fallbackKey,
				role: voice.role || fallbackRole,
				speaker,
				speakerColor,
				speakerFallback,
				kind: voice.kind || "vocal",
				speakerClass: normalizeKaraokeSpeakerClass(voice.speaker, voice["speaker-color"], voice["speaker-fallback"]),
				speakerStyle: getKaraokeSpeakerStyle(voice.speaker, voice["speaker-color"], voice["speaker-fallback"]),
				phonetic: voice.phonetic || "",
				phoneticUnits: voice.phoneticUnits || null,
				translation: voice.translation || "",
				text: voice.text || "",
				syllables: splitRenderableKaraokeSyllables(voice.syllables),
			};
		};
		const rows = [buildRow(line.vocals.lead, "lead", "lead")];

		if (Array.isArray(line.vocals.background)) {
			line.vocals.background.forEach((part, index) => {
				if (Array.isArray(part?.syllables) && part.syllables.length > 0) {
					rows.push(buildRow(part, `background-${index}`, "background"));
				}
			});
		}

		return rows.length > 1 ? rows : null;
	};

	return {
		getKaraokeInlineSpeakerClass, getKaraokeSpeakerStyle,
		getKaraokeKindClassParts, getKaraokeLineMetaClass, getKaraokeVocalRows,
	};
}

export { KARAOKE_TEXT_EFFECT_KIND_CLASSES, PAGES_IV_LYRICS_SPEAKER_CLASS_CONTRACT, hasKaraokeVocalRows };
