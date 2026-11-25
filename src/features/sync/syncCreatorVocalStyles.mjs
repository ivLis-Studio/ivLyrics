export const SYNC_CREATOR_SPEAKER_OPTIONS = [
	'NORMAL',
	...Array.from({ length: 5 }, (_, index) => `MALE ${index + 1}`),
	...Array.from({ length: 5 }, (_, index) => `FEMALE ${index + 1}`),
	...Array.from({ length: 5 }, (_, index) => `DUET ${index + 1}`),
	'CUSTOM'
];
const SYNC_CREATOR_LEGACY_CUSTOM_SPEAKER_FALLBACKS = {
	'MALE CUSTOM': 'MALE 1',
	'FEMALE CUSTOM': 'FEMALE 1',
	'DUET CUSTOM': 'DUET 1'
};
export const SYNC_CREATOR_CUSTOM_FALLBACK_OPTIONS = ['MALE 1', 'FEMALE 1', 'DUET 1'];
export const SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK = 'MALE 1';
export const SYNC_CREATOR_BULK_SPEAKER_OPTIONS = [...SYNC_CREATOR_SPEAKER_OPTIONS];
const SYNC_CREATOR_SPEAKER_TEXT_COLORS = {
	'NORMAL': '#f2f4f7',
	'MALE 1': '#a8ccff',
	'MALE 2': '#9ae8d4',
	'MALE 3': '#bfe8ff',
	'MALE 4': '#7fb5e6',
	'MALE 5': '#6cb8b8',
	'FEMALE 1': '#ffb8c7',
	'FEMALE 2': '#ffd6b3',
	'FEMALE 3': '#f6c8ff',
	'FEMALE 4': '#e6b4d4',
	'FEMALE 5': '#f6e5a5',
	'DUET 1': '#e4d8ff',
	'DUET 2': '#d6e4ff',
	'DUET 3': '#ffddf2',
	'DUET 4': '#bfaeff',
	'DUET 5': '#9d8cf2'
};
export const SYNC_CREATOR_DEFAULT_SPEAKER = 'NORMAL';
export const SYNC_CREATOR_DEFAULT_KIND = 'vocal';

export const SYNC_CREATOR_KIND_OPTIONS = [
	['vocal', 'syncCreator.kindVocal'],
	['effect', 'syncCreator.kindEffect'],
	['adlib', 'syncCreator.kindAdlib'],
	['pulse', 'syncCreator.kindPulse'],
	['wave', 'syncCreator.kindWave'],
	['sparkle', 'syncCreator.kindSparkle'],
	['echo', 'syncCreator.kindEcho'],
	['whisper', 'syncCreator.kindWhisper'],
	['bounce', 'syncCreator.kindBounce'],
	['sway', 'syncCreator.kindSway'],
	['glow', 'syncCreator.kindGlow'],
	['glitch', 'syncCreator.kindGlitch'],
	['flicker', 'syncCreator.kindFlicker'],
	['float', 'syncCreator.kindFloat'],
	['blur', 'syncCreator.kindBlur'],
	['pop', 'syncCreator.kindPop']
];
const SYNC_CREATOR_KIND_LABELS = new Map(SYNC_CREATOR_KIND_OPTIONS);

export function createSyncCreatorVocalStyles({ getSpeakerColors, getActiveColor, translate }) {
	const normalizeSyncCreatorSpeakerToken = (value) => {
		const raw = String(value || '').trim();
		if (!raw) return '';
		return raw
			.replace(/[_-]+/g, ' ')
			.replace(/\s+/g, ' ')
			.toUpperCase();
	};

	const normalizeSyncCreatorSpeaker = (value) => {
		const normalized = normalizeSyncCreatorSpeakerToken(value);
		if (/^NORMAL(?:\s+1)?$/.test(normalized)) return 'NORMAL';
		if (normalized === 'CUSTOM' || SYNC_CREATOR_LEGACY_CUSTOM_SPEAKER_FALLBACKS[normalized]) return 'CUSTOM';
		return SYNC_CREATOR_SPEAKER_OPTIONS.includes(normalized) ? normalized : '';
	};

	const isSyncCreatorCustomSpeaker = (value) => (
		normalizeSyncCreatorSpeaker(value) === 'CUSTOM'
	);

	const normalizeSyncCreatorSpeakerFallback = (value) => {
		const normalized = normalizeSyncCreatorSpeakerToken(value);
		return SYNC_CREATOR_CUSTOM_FALLBACK_OPTIONS.includes(normalized) ? normalized : '';
	};

	const sanitizeSyncCreatorSpeakerFallback = (speaker, fallback, useDefault = false, sourceSpeaker = speaker) => {
		if (!isSyncCreatorCustomSpeaker(speaker)) return '';
		return normalizeSyncCreatorSpeakerFallback(fallback)
			|| SYNC_CREATOR_LEGACY_CUSTOM_SPEAKER_FALLBACKS[normalizeSyncCreatorSpeakerToken(sourceSpeaker)]
			|| (useDefault ? SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK : '');
	};

	const normalizeSyncCreatorSpeakerColor = (value) => {
		const rawColor = String(value || '').trim();
		const color = rawColor && !rawColor.startsWith('#') ? `#${rawColor}` : rawColor;
		const helperColor = getSpeakerColors()?.normalizeColor?.(color);
		if (helperColor) return helperColor;
		if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
		if (/^#[0-9a-f]{3}$/i.test(color)) {
			return `#${color.slice(1).split('').map(char => char + char).join('')}`.toLowerCase();
		}
		return '';
	};

	const getSyncCreatorCustomSpeakerDefaultColor = (value, fallback) => {
		const fallbackSpeaker = sanitizeSyncCreatorSpeakerFallback(value, fallback, true);
		return fallbackSpeaker
			? (SYNC_CREATOR_SPEAKER_TEXT_COLORS[fallbackSpeaker]
				|| getSpeakerColors()?.getTextColor?.(fallbackSpeaker)
				|| '#ffffff')
			: '';
	};

	const sanitizeSyncCreatorSpeakerColor = (speaker, color, useDefault = false, fallback = '') => {
		if (!isSyncCreatorCustomSpeaker(speaker)) return '';
		return normalizeSyncCreatorSpeakerColor(color)
			|| (useDefault ? getSyncCreatorCustomSpeakerDefaultColor(speaker, fallback) : '');
	};

	const resolveSyncCreatorSpeakerTransition = ({
		currentSpeaker,
		currentColor = '',
		currentFallback = '',
		nextSpeaker,
		remembered = {}
	}) => {
		const speaker = normalizeSyncCreatorSpeaker(nextSpeaker);
		if (!speaker) return null;

		let rememberedColor = normalizeSyncCreatorSpeakerColor(remembered.color);
		let rememberedFallback = normalizeSyncCreatorSpeakerFallback(remembered.fallback);
		if (isSyncCreatorCustomSpeaker(currentSpeaker)) {
			rememberedColor = normalizeSyncCreatorSpeakerColor(currentColor) || rememberedColor;
			rememberedFallback = normalizeSyncCreatorSpeakerFallback(currentFallback) || rememberedFallback;
		}

		if (!isSyncCreatorCustomSpeaker(speaker)) {
			return {
				speaker,
				color: '',
				fallback: '',
				remembered: {
					color: rememberedColor,
					fallback: rememberedFallback
				}
			};
		}

		const fallback = sanitizeSyncCreatorSpeakerFallback(
			speaker,
			rememberedFallback || currentFallback,
			true,
			nextSpeaker
		);
		const color = sanitizeSyncCreatorSpeakerColor(
			speaker,
			rememberedColor || currentColor,
			true,
			fallback
		);
		return {
			speaker,
			color,
			fallback,
			remembered: { color, fallback }
		};
	};

	const resolveSyncCreatorRememberedCustomSpeakerMeta = (remembered = {}, sticky = {}) => {
		const fallback = normalizeSyncCreatorSpeakerFallback(remembered.fallback)
			|| normalizeSyncCreatorSpeakerFallback(sticky.fallback)
			|| SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK;
		return {
			color: normalizeSyncCreatorSpeakerColor(remembered.color)
				|| normalizeSyncCreatorSpeakerColor(sticky.color)
				|| getSyncCreatorCustomSpeakerDefaultColor('CUSTOM', fallback),
			fallback
		};
	};

	const resolveSyncCreatorDraftSpeakerMeta = ({
		draft = {},
		source = {},
		inheritedSource = null,
		inheritSource = false
	} = {}) => {
		const baseSource = inheritSource && inheritedSource ? inheritedSource : source;
		const hasSpeakerDraft = Object.prototype.hasOwnProperty.call(draft, 'speaker');
		const sourceSpeaker = hasSpeakerDraft ? draft.speaker : baseSource?.speaker;
		const speaker = normalizeSyncCreatorSpeaker(sourceSpeaker) || SYNC_CREATOR_DEFAULT_SPEAKER;
		const hasColorDraft = Object.prototype.hasOwnProperty.call(draft, 'speaker-color');
		const hasFallbackDraft = Object.prototype.hasOwnProperty.call(draft, 'speaker-fallback');
		const speakerFallback = sanitizeSyncCreatorSpeakerFallback(
			speaker,
			hasFallbackDraft ? draft['speaker-fallback'] : baseSource?.['speaker-fallback'],
			true,
			sourceSpeaker
		);
		return {
			speaker,
			'speaker-fallback': speakerFallback,
			'speaker-color': sanitizeSyncCreatorSpeakerColor(
				speaker,
				hasColorDraft ? draft['speaker-color'] : baseSource?.['speaker-color'],
				true,
				speakerFallback
			)
		};
	};

	const resolveSyncCreatorBulkSpeakerMeta = (value, color = '', fallback = '') => {
		const speaker = normalizeSyncCreatorSpeaker(value);
		if (!speaker) return null;
		const speakerFallback = sanitizeSyncCreatorSpeakerFallback(speaker, fallback, true, value);
		return {
			speaker,
			color: sanitizeSyncCreatorSpeakerColor(speaker, color, true, speakerFallback),
			fallback: speakerFallback
		};
	};

	const applySyncCreatorSpeakerMeta = (target, speakerMeta) => {
		if (!target || !speakerMeta?.speaker) return target;
		const next = { ...target, speaker: speakerMeta.speaker };
		if (isSyncCreatorCustomSpeaker(speakerMeta.speaker)) {
			next['speaker-color'] = speakerMeta.color;
			next['speaker-fallback'] = speakerMeta.fallback;
		} else {
			delete next['speaker-color'];
			delete next['speaker-fallback'];
		}
		return next;
	};

	const isSyncCreatorSpeakerMetaComplete = (value) => {
		const speaker = normalizeSyncCreatorSpeaker(value?.speaker);
		if (!speaker) return false;
		return !isSyncCreatorCustomSpeaker(speaker)
			|| (
				!!sanitizeSyncCreatorSpeakerFallback(speaker, value?.['speaker-fallback'], false, value?.speaker)
				&& !!sanitizeSyncCreatorSpeakerColor(speaker, value?.['speaker-color'])
			);
	};

	const getSyncCreatorSpeakerTextColor = (value, speakerColor = '', speakerFallback = '') => {
		const speaker = normalizeSyncCreatorSpeaker(value);
		if (!speaker) return 'var(--spice-text)';
		const fallbackSpeaker = isSyncCreatorCustomSpeaker(speaker)
			? sanitizeSyncCreatorSpeakerFallback(speaker, speakerFallback, true, value)
			: speaker;
		const customColor = sanitizeSyncCreatorSpeakerColor(speaker, speakerColor);
		if (customColor) return customColor;
		// The lyric pages have no NORMAL palette entry: a NORMAL line is painted with
		// the listener's active lyric colour. Resolve the same value here so the
		// editor field shows the colour the preview and the app show, instead of the
		// hardcoded palette white the pages never use.
		if (fallbackSpeaker === 'NORMAL') {
			return getActiveColor() || 'var(--spice-text)';
		}
		return getSpeakerColors()?.getTextColor?.(fallbackSpeaker)
			|| SYNC_CREATOR_SPEAKER_TEXT_COLORS[fallbackSpeaker]
			|| 'var(--spice-text)';
	};

	const isSyncCreatorDuetSpeaker = (value, fallback = '') => (
		String(isSyncCreatorCustomSpeaker(value) ? fallback : value).trim().toUpperCase().startsWith('DUET ')
	);

	const getSyncCreatorKindLabel = (value) => {
		const labelKey = SYNC_CREATOR_KIND_LABELS.get(value);
		return labelKey ? (translate(labelKey) || value) : '';
	};

	const normalizeSyncCreatorKind = (value) => (
		SYNC_CREATOR_KIND_LABELS.has(value) ? value : ''
	);

	// Shared field-value normaliser for the per-line and per-part meta editors:
	// dispatches on the meta field name to the matching sanitiser, falling back to
	// a trimmed string.
	const normalizeSyncCreatorMetaFieldValue = (field, value) => {
		switch (field) {
			case 'speaker':
				return normalizeSyncCreatorSpeaker(value);
			case 'speaker-color':
				return normalizeSyncCreatorSpeakerColor(value);
			case 'speaker-fallback':
				return normalizeSyncCreatorSpeakerFallback(value);
			case 'kind':
				return normalizeSyncCreatorKind(value);
			default:
				return String(value || '').trim();
		}
	};

	const getSyncCreatorStyleRangeSpeakerMeta = (range = {}) => {
		const sourceSpeaker = range?.speaker;
		const speaker = normalizeSyncCreatorSpeaker(sourceSpeaker);
		if (!speaker) return null;
		const speakerFallback = sanitizeSyncCreatorSpeakerFallback(
			speaker,
			range?.['speaker-fallback'],
			true,
			sourceSpeaker
		);
		const speakerColor = sanitizeSyncCreatorSpeakerColor(
			speaker,
			range?.['speaker-color'],
			true,
			speakerFallback
		);
		return {
			speaker,
			...(speakerColor ? { 'speaker-color': speakerColor } : {}),
			...(speakerFallback ? { 'speaker-fallback': speakerFallback } : {})
		};
	};

	const getSyncCreatorStyleRangeKey = (range = {}) => [
		range?.kind || '',
		range?.speaker || '',
		range?.['speaker-color'] || '',
		range?.['speaker-fallback'] || ''
	].join('|');

	const normalizeSyncCreatorStyleRanges = (ranges, lineStart = 0, lineEnd = Number.MAX_SAFE_INTEGER) => {
		if (!Array.isArray(ranges)) return [];
		const normalized = ranges
			.map((range) => {
				const start = Number(range?.start);
				const end = Number(range?.end);
				if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
				const clippedStart = Math.max(lineStart, start);
				const clippedEnd = Math.min(lineEnd, end);
				if (clippedEnd < clippedStart) return null;
				const kind = normalizeSyncCreatorKind(range?.kind);
				const speakerMeta = getSyncCreatorStyleRangeSpeakerMeta(range);
				if (!kind && !speakerMeta) return null;
				return {
					start: clippedStart,
					end: clippedEnd,
					...(kind ? { kind } : {}),
					...(speakerMeta || {})
				};
			})
			.filter(Boolean)
			.sort((left, right) => left.start - right.start || left.end - right.end);

		const boundaries = new Set();
		for (const range of normalized) {
			boundaries.add(range.start);
			boundaries.add(range.end + 1);
		}
		const points = [...boundaries].sort((left, right) => left - right);
		const flattened = [];
		for (let index = 0; index < points.length - 1; index++) {
			const start = points[index];
			const end = points[index + 1] - 1;
			const covering = normalized.filter(range => range.start <= start && range.end >= end);
			if (!covering.length) continue;
			const reversed = [...covering].reverse();
			const kind = reversed.map(range => range.kind).find(Boolean) || '';
			const speakerRange = reversed.find(range => range.speaker) || null;
			if (!kind && !speakerRange) continue;
			const flattenedRange = {
				start,
				end,
				...(kind ? { kind } : {}),
				...(speakerRange ? {
					speaker: speakerRange.speaker,
					...(speakerRange['speaker-color'] ? { 'speaker-color': speakerRange['speaker-color'] } : {}),
					...(speakerRange['speaker-fallback'] ? { 'speaker-fallback': speakerRange['speaker-fallback'] } : {})
				} : {})
			};
			const previous = flattened[flattened.length - 1];
			if (previous && previous.end + 1 === start && getSyncCreatorStyleRangeKey(previous) === getSyncCreatorStyleRangeKey(flattenedRange)) {
				previous.end = end;
				continue;
			}
			flattened.push(flattenedRange);
		}
		return flattened;
	};

	const applySyncCreatorStyleRangePatch = (ranges, start, end, patch, lineStart, lineEnd) => {
		const selectionStart = Math.max(lineStart, Math.min(Number(start), Number(end)));
		const selectionEnd = Math.min(lineEnd, Math.max(Number(start), Number(end)));
		if (!Number.isInteger(selectionStart) || !Number.isInteger(selectionEnd) || selectionEnd < selectionStart) {
			return normalizeSyncCreatorStyleRanges(ranges, lineStart, lineEnd);
		}
		const source = normalizeSyncCreatorStyleRanges(ranges, lineStart, lineEnd);
		const boundaries = new Set([selectionStart, selectionEnd + 1]);
		for (const range of source) {
			boundaries.add(range.start);
			boundaries.add(range.end + 1);
		}
		const points = [...boundaries].sort((left, right) => left - right);
		const next = [];
		for (let index = 0; index < points.length - 1; index++) {
			const segmentStart = points[index];
			const segmentEnd = points[index + 1] - 1;
			if (segmentEnd < lineStart || segmentStart > lineEnd) continue;
			const sourceRange = source.find(range => range.start <= segmentStart && range.end >= segmentEnd);
			let kind = sourceRange?.kind || '';
			let speaker = sourceRange?.speaker || '';
			let speakerColor = sourceRange?.['speaker-color'] || '';
			let speakerFallback = sourceRange?.['speaker-fallback'] || '';
			if (segmentStart >= selectionStart && segmentEnd <= selectionEnd) {
				if (Object.prototype.hasOwnProperty.call(patch, 'kind')) {
					kind = patch.kind === null ? '' : normalizeSyncCreatorKind(patch.kind);
				}
				if (Object.prototype.hasOwnProperty.call(patch, 'speaker')) {
					const speakerMeta = patch.speaker === null ? null : getSyncCreatorStyleRangeSpeakerMeta(patch);
					speaker = speakerMeta?.speaker || '';
					speakerColor = speakerMeta?.['speaker-color'] || '';
					speakerFallback = speakerMeta?.['speaker-fallback'] || '';
				}
			}
			if (!kind && !speaker) continue;
			next.push({
				start: Math.max(lineStart, segmentStart),
				end: Math.min(lineEnd, segmentEnd),
				...(kind ? { kind } : {}),
				...(speaker ? { speaker } : {}),
				...(speakerColor ? { 'speaker-color': speakerColor } : {}),
				...(speakerFallback ? { 'speaker-fallback': speakerFallback } : {})
			});
		}
		return normalizeSyncCreatorStyleRanges(next, lineStart, lineEnd);
	};

	return {
		normalizeSyncCreatorSpeaker, isSyncCreatorCustomSpeaker,
		normalizeSyncCreatorSpeakerFallback, sanitizeSyncCreatorSpeakerFallback,
		normalizeSyncCreatorSpeakerColor, getSyncCreatorCustomSpeakerDefaultColor,
		sanitizeSyncCreatorSpeakerColor, resolveSyncCreatorSpeakerTransition,
		resolveSyncCreatorRememberedCustomSpeakerMeta, resolveSyncCreatorDraftSpeakerMeta,
		resolveSyncCreatorBulkSpeakerMeta, applySyncCreatorSpeakerMeta,
		isSyncCreatorSpeakerMetaComplete, getSyncCreatorSpeakerTextColor,
		isSyncCreatorDuetSpeaker, getSyncCreatorKindLabel, normalizeSyncCreatorKind,
		normalizeSyncCreatorMetaFieldValue, getSyncCreatorStyleRangeSpeakerMeta,
		normalizeSyncCreatorStyleRanges, applySyncCreatorStyleRangePatch,
	};
}
