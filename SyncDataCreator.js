/**
 * SyncDataCreator - 노래방 싱크 데이터 생성 UI
 */

const SYNC_CREATOR_RTL_STRONG_CHAR_REGEX = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/u;
const SYNC_CREATOR_LTR_STRONG_CHAR_REGEX = /[A-Za-z\u00C0-\u02AF\u0370-\u052F\u1E00-\u1EFF]/u;
const SYNC_CREATOR_JAPANESE_KANA_REGEX = /[\u3040-\u30ff\uff66-\uff9f]/u;
const SYNC_CREATOR_KANJI_REGEX = /[\u3400-\u4dbf\u4e00-\u9fff]/u;
const SYNC_CREATOR_JAPANESE_ATTACH_KANA_REGEX = /^[\u3041\u3043\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308e\u3093\u3095\u3096\u30a1\u30a3\u30a5\u30a7\u30a9\u30c3\u30e3\u30e5\u30e7\u30ee\u30f3\u30f5\u30f6\u30fc\uff67-\uff70\uff9d]$/u;
const SYNC_CREATOR_HANGUL_JAMO_ONLY_REGEX = /^[\u3131-\u3163\u1100-\u11ff]+$/u;
const SYNC_CREATOR_SPEAKER_OPTIONS = [
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
const SYNC_CREATOR_CUSTOM_FALLBACK_OPTIONS = ['MALE 1', 'FEMALE 1', 'DUET 1'];
const SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK = 'MALE 1';
const SYNC_CREATOR_BULK_SPEAKER_OPTIONS = [...SYNC_CREATOR_SPEAKER_OPTIONS];
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
const SYNC_CREATOR_DEFAULT_SPEAKER = 'NORMAL';
const SYNC_CREATOR_DEFAULT_KIND = 'vocal';
const SYNC_CREATOR_MAX_MERGED_LINES = 5;
const SYNC_CREATOR_SYNC_DATA_VERSION = 3;
const SYNC_CREATOR_PREVIEW_POSITION_UPDATE_INTERVAL_MS = 100;
const SYNC_CREATOR_RECORD_POSITION_UPDATE_INTERVAL_MS = 50;
const SYNC_CREATOR_IDLE_POSITION_UPDATE_INTERVAL_MS = 500;
const SYNC_CREATOR_POSITION_COMMIT_THRESHOLD_MS = 80;
const SYNC_CREATOR_RECORD_POSITION_COMMIT_THRESHOLD_MS = 35;
const SYNC_CREATOR_PROGRESS_COLOR = '#3182f6';
const SYNC_CREATOR_RECORDING_BACKGROUND = 'rgba(255, 152, 0, 0.6)';
const getSyncCreatorProgressGradient = (direction, percent, color = SYNC_CREATOR_PROGRESS_COLOR) => (
	`linear-gradient(${direction === 'rtl' ? 'to left' : 'to right'}, ${color} 0%, ${color} ${percent}%, var(--spice-subtext) ${percent}%, var(--spice-subtext) 100%)`
);
const normalizeSyncCreatorIsrc = (value) => {
	if (typeof value !== 'string') return '';
	const normalized = value.trim().replace(/[\s-]/g, '').toUpperCase();
	return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(normalized) ? normalized : '';
};
const SYNC_CREATOR_KIND_OPTIONS = [
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
const SYNC_CREATOR_PARALLEL_HINT_REGEX = /[()（）\/|／｜]/u;
const SYNC_CREATOR_LRC_METADATA_LINE_REGEX = /^\s*\[(?:ar|al|ti|au|length|by|offset|re|ve):[^\]]*\]\s*$/i;
const SYNC_CREATOR_HANGUL_CODA_BY_JAMO = new Map([
	['ㄱ', 1], ['ㄲ', 2], ['ㄳ', 3], ['ㄴ', 4], ['ㄵ', 5], ['ㄶ', 6], ['ㄷ', 7], ['ㄹ', 8],
	['ㄺ', 9], ['ㄻ', 10], ['ㄼ', 11], ['ㄽ', 12], ['ㄾ', 13], ['ㄿ', 14], ['ㅀ', 15], ['ㅁ', 16],
	['ㅂ', 17], ['ㅄ', 18], ['ㅅ', 19], ['ㅆ', 20], ['ㅇ', 21], ['ㅈ', 22], ['ㅊ', 23], ['ㅋ', 24],
	['ㅌ', 25], ['ㅍ', 26], ['ㅎ', 27]
]);

const mergeSyncCreatorPronunciationText = (base, addition) => {
	const baseText = String(base || '');
	let additionText = String(addition || '');
	if (!baseText || !additionText) return baseText + additionText;

	const firstAdditionChar = Array.from(additionText)[0] || '';
	const codaIndex = SYNC_CREATOR_HANGUL_CODA_BY_JAMO.get(firstAdditionChar);
	if (!codaIndex) {
		return baseText + additionText;
	}

	const baseChars = Array.from(baseText);
	const lastChar = baseChars[baseChars.length - 1] || '';
	const lastCode = lastChar.charCodeAt(0);
	const hangulOffset = lastCode - 0xac00;
	if (hangulOffset < 0 || hangulOffset >= 11172 || hangulOffset % 28 !== 0) {
		return baseText + additionText;
	}

	baseChars[baseChars.length - 1] = String.fromCharCode(lastCode + codaIndex);
	additionText = additionText.slice(firstAdditionChar.length);
	return baseChars.join('') + additionText;
};

const getSyncCreatorTextDirection = (text) => {
	const normalizedText = typeof text === 'string' ? text : '';
	let rtlCount = 0;
	let ltrCount = 0;

	for (const char of Array.from(normalizedText)) {
		if (SYNC_CREATOR_RTL_STRONG_CHAR_REGEX.test(char)) {
			rtlCount++;
			continue;
		}
		if (SYNC_CREATOR_LTR_STRONG_CHAR_REGEX.test(char)) {
			ltrCount++;
		}
	}

	return rtlCount > ltrCount ? 'rtl' : 'ltr';
};

const getSyncCreatorLineCharCountsFromText = (text) => (
	String(text || '')
		.normalize('NFC')
		.split('\n')
		.map(line => line.trim().normalize('NFC'))
		.filter(Boolean)
		.map(line => Array.from(line).length)
);

const hasExactSyncCreatorLineShape = (expectedCounts, actualCounts) => (
	Array.isArray(expectedCounts)
	&& Array.isArray(actualCounts)
	&& expectedCounts.length > 0
	&& expectedCounts.length === actualCounts.length
	&& expectedCounts.every((count, index) => Number(count) === Number(actualCounts[index]))
);

const findSyncCreatorSourceLinePrefix = (expectedCounts, actualCounts) => {
	if (hasExactSyncCreatorLineShape(expectedCounts, actualCounts)) return 0;
	if (!Array.isArray(expectedCounts) || !Array.isArray(actualCounts)) return -1;
	if (actualCounts.length === 0 || expectedCounts.length <= actualCounts.length) return -1;

	const maxPrefix = expectedCounts.length - actualCounts.length;
	for (let prefix = 1; prefix <= maxPrefix; prefix++) {
		const matches = actualCounts.every((count, index) => (
			Number(count) === Number(expectedCounts[prefix + index])
		));
		if (matches) return prefix;
	}

	return -1;
};

const getSyncCreatorLeadingCharOffset = (lineCounts, prefixLength) => (
	(Array.isArray(lineCounts) ? lineCounts.slice(0, prefixLength) : [])
		.reduce((sum, count) => sum + Math.max(0, Number(count) || 0), 0)
);

const getSyncCreatorLyricsFingerprintFromText = (text) => {
	const comparableText = String(text || '')
		.normalize('NFC')
		.split('\n')
		.map(line => line.trim().normalize('NFC'))
		.filter(Boolean)
		.join('\n');
	let hash = 2166136261;
	for (const char of Array.from(comparableText)) {
		hash ^= char.codePointAt(0) || 0;
		hash = Math.imul(hash, 16777619);
	}
	return `lrclib-${(hash >>> 0).toString(36)}-${Array.from(comparableText).length.toString(36)}`;
};

const shiftSyncCreatorRange = (range, charOffset) => {
	const start = Number(range?.start);
	const end = Number(range?.end);
	if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
	if (end < charOffset) return null;
	return {
		...range,
		start: Math.max(0, start - charOffset),
		end: Math.max(0, end - charOffset)
	};
};

const shiftSyncCreatorRanges = (ranges, charOffset) => (
	(Array.isArray(ranges) ? ranges : [])
		.map(range => shiftSyncCreatorRange(range, charOffset))
		.filter(Boolean)
);

const shiftSyncCreatorLineIndexes = (lines, charOffset) => {
	if (!charOffset) return lines;

	return (Array.isArray(lines) ? lines : [])
		.filter(line => Number(line?.end) >= charOffset)
		.map(line => {
			const shifted = {
				...line,
				start: Math.max(0, Number(line.start) - charOffset),
				end: Math.max(0, Number(line.end) - charOffset)
			};

			if (line?.parallel) {
				shifted.parallel = {
					...line.parallel,
					hiddenRanges: shiftSyncCreatorRanges(line.parallel.hiddenRanges, charOffset),
					parts: (Array.isArray(line.parallel.parts) ? line.parallel.parts : [])
						.map(part => ({
							...part,
							ranges: shiftSyncCreatorRanges(part.ranges, charOffset)
						}))
						.filter(part => part.ranges.length > 0)
				};
			}

			return shifted;
		});
};

const normalizeLoadedSyncCreatorBodyForLyrics = (syncBody, lyricsText) => {
	if (!syncBody || !Array.isArray(syncBody.lines)) return syncBody;

	const sourceLineCounts = Array.isArray(syncBody?.source?.lineCharCounts)
		? syncBody.source.lineCharCounts
		: null;
	if (!sourceLineCounts) return syncBody;
	const currentLineCounts = getSyncCreatorLineCharCountsFromText(lyricsText);
	const prefix = findSyncCreatorSourceLinePrefix(sourceLineCounts, currentLineCounts);
	if (prefix < 0) return null;
	if (prefix === 0 && syncBody?.source?.lyricsFingerprint) {
		const currentFingerprint = getSyncCreatorLyricsFingerprintFromText(lyricsText);
		if (syncBody.source.lyricsFingerprint !== currentFingerprint) return null;
	}
	if (prefix <= 0) return syncBody;

	const charOffset = getSyncCreatorLeadingCharOffset(sourceLineCounts, prefix);
	if (!charOffset) return syncBody;

	return {
		...syncBody,
		lines: shiftSyncCreatorLineIndexes(syncBody.lines, charOffset)
	};
};

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
	const helperColor = window.ivLyricsSpeakerColors?.normalizeColor?.(color);
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
			|| window.ivLyricsSpeakerColors?.getTextColor?.(fallbackSpeaker)
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
	return sanitizeSyncCreatorSpeakerColor(speaker, speakerColor)
		|| window.ivLyricsSpeakerColors?.getTextColor?.(fallbackSpeaker)
		|| SYNC_CREATOR_SPEAKER_TEXT_COLORS[fallbackSpeaker]
		|| 'var(--spice-text)';
};

const getSyncCreatorHexColorWithAlpha = (color, alpha) => {
	const normalized = String(color || '').trim();
	const match = /^#([0-9a-f]{6})$/i.exec(normalized);
	if (!match) return '';

	const hex = match[1];
	const red = parseInt(hex.slice(0, 2), 16);
	const green = parseInt(hex.slice(2, 4), 16);
	const blue = parseInt(hex.slice(4, 6), 16);
	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const isSyncCreatorDuetSpeaker = (value, fallback = '') => (
	String(isSyncCreatorCustomSpeaker(value) ? fallback : value).trim().toUpperCase().startsWith('DUET ')
);

const getSyncCreatorKindLabel = (value) => {
	const labelKey = SYNC_CREATOR_KIND_LABELS.get(value);
	return labelKey ? (I18n.t(labelKey) || value) : '';
};

const normalizeSyncCreatorKind = (value) => (
	SYNC_CREATOR_KIND_LABELS.has(value) ? value : ''
);

const getSyncCreatorParenthesisClose = (char) => {
	if (char === '(') return ')';
	if (char === '\uFF08') return '\uFF09';
	return '';
};

const isSyncCreatorParenthesisClose = (char) => char === ')' || char === '\uFF09';

const isSyncCreatorStandaloneParentheticalLine = (line) => {
	const chars = Array.from(String(line || '').trim());
	if (chars.length < 2 || !getSyncCreatorParenthesisClose(chars[0])) return false;

	const expectedStack = [];
	for (let index = 0; index < chars.length; index++) {
		const char = chars[index];
		const expectedClose = getSyncCreatorParenthesisClose(char);
		if (expectedClose) {
			expectedStack.push(expectedClose);
			continue;
		}
		if (isSyncCreatorParenthesisClose(char)) {
			if (!expectedStack.length || expectedStack[expectedStack.length - 1] !== char) {
				return false;
			}
			expectedStack.pop();
			if (expectedStack.length === 0 && index < chars.length - 1) {
				return false;
			}
		}
	}

	return expectedStack.length === 0;
};

const stripSyncCreatorStandaloneParentheticalLine = (line) => {
	let value = String(line || '').normalize('NFC').trim();
	let changed = false;

	while (isSyncCreatorStandaloneParentheticalLine(value)) {
		const chars = Array.from(value);
		value = chars.slice(1, -1).join('').trim();
		changed = true;
	}

	return changed ? value : String(line || '').normalize('NFC');
};

const trimSyncCreatorCharRangeWhitespace = (chars, start, end, pushHidden = () => {}) => {
	let nextStart = start;
	let nextEnd = end;

	while (nextStart <= nextEnd && /\s/u.test(chars[nextStart] || '')) {
		pushHidden(nextStart);
		nextStart++;
	}

	const trailingHiddenIndexes = [];
	while (nextEnd >= nextStart && /\s/u.test(chars[nextEnd] || '')) {
		trailingHiddenIndexes.push(nextEnd);
		nextEnd--;
	}
	trailingHiddenIndexes.reverse().forEach(pushHidden);

	return { start: nextStart, end: nextEnd };
};

const stripSyncCreatorStandaloneParentheticalCharRange = (chars, start, end, pushHidden = () => {}) => {
	const sourceChars = Array.isArray(chars) ? chars : [];
	if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end >= sourceChars.length || start > end) {
		return { start, end, changed: false };
	}

	let nextStart = start;
	let nextEnd = end;
	let changed = false;
	const pendingHiddenIndexes = [];
	const queueHidden = (index) => pendingHiddenIndexes.push(index);

	({ start: nextStart, end: nextEnd } = trimSyncCreatorCharRangeWhitespace(sourceChars, nextStart, nextEnd, queueHidden));
	while (
		nextStart < nextEnd
		&& isSyncCreatorStandaloneParentheticalLine(sourceChars.slice(nextStart, nextEnd + 1).join(''))
	) {
		queueHidden(nextStart);
		queueHidden(nextEnd);
		nextStart++;
		nextEnd--;
		changed = true;
		({ start: nextStart, end: nextEnd } = trimSyncCreatorCharRangeWhitespace(sourceChars, nextStart, nextEnd, queueHidden));
	}

	if (changed) {
		[...new Set(pendingHiddenIndexes)]
			.sort((a, b) => a - b)
			.forEach(pushHidden);
	}

	return { start: nextStart, end: nextEnd, changed };
};

const getSyncCreatorFlatLyricsCharsFromText = (text) => (
	String(text || '')
		.normalize('NFC')
		.split('\n')
		.map(line => line.trim().normalize('NFC'))
		.filter(Boolean)
		.flatMap(line => Array.from(line))
);

const getSyncCreatorFlatLyricsCharsFromLines = (lines) => (
	(Array.isArray(lines) ? lines : [])
		.map(line => String(line || '').trim().normalize('NFC'))
		.filter(Boolean)
		.flatMap(line => Array.from(line))
);

const stripSyncCreatorLeadingParenthesis = (line) => {
	const value = String(line || '').normalize('NFC');
	const chars = Array.from(value);
	const index = chars.findIndex(char => !/\s/u.test(char));
	if (index < 0 || !getSyncCreatorParenthesisClose(chars[index])) return value;
	return chars.slice(0, index).join('') + chars.slice(index + 1).join('');
};

const stripSyncCreatorTrailingParenthesis = (line, closeChar) => {
	const value = String(line || '').normalize('NFC');
	const chars = Array.from(value);
	for (let index = chars.length - 1; index >= 0; index--) {
		if (/\s/u.test(chars[index])) continue;
		if (chars[index] !== closeChar) return value;
		return chars.slice(0, index).join('') + chars.slice(index + 1).join('');
	}
	return value;
};

const normalizeSyncCreatorStandaloneParentheticalBlocks = (lines) => {
	const normalizedLines = Array.isArray(lines) ? [...lines] : [];

	for (let index = 0; index < normalizedLines.length; index++) {
		const trimmed = String(normalizedLines[index] || '').trim();
		if (!trimmed) continue;

		const openChar = Array.from(trimmed)[0] || '';
		const closeChar = getSyncCreatorParenthesisClose(openChar);
		if (!closeChar || trimmed.includes(closeChar)) continue;

		let closeLineIndex = -1;
		for (let candidate = index + 1; candidate < normalizedLines.length; candidate++) {
			const candidateTrimmed = String(normalizedLines[candidate] || '').trim();
			if (!candidateTrimmed) continue;
			if (candidateTrimmed.endsWith(closeChar)) {
				closeLineIndex = candidate;
				break;
			}
		}

		if (closeLineIndex < 0) continue;

		normalizedLines[index] = stripSyncCreatorLeadingParenthesis(normalizedLines[index]).trim();
		normalizedLines[closeLineIndex] = stripSyncCreatorTrailingParenthesis(normalizedLines[closeLineIndex], closeChar).trim();
	}

	return normalizedLines;
};

const normalizeSyncCreatorStandaloneParentheticalLines = (text) => (
	normalizeSyncCreatorStandaloneParentheticalBlocks(
		String(text || '')
			.normalize('NFC')
			.split('\n')
			.map(line => stripSyncCreatorStandaloneParentheticalLine(line))
	).join('\n')
);

const detectSyncCreatorParallelVocalHints = (text) => {
	const normalized = normalizeSyncCreatorStandaloneParentheticalLines(text);
	if (!normalized.trim()) return false;
	return normalized
		.split('\n')
		.some(line => {
			const trimmed = line.trim();
			return trimmed.length > 1 && SYNC_CREATOR_PARALLEL_HINT_REGEX.test(trimmed);
		});
};

const hasSyncCreatorRtlText = (text) => {
	const normalizedText = typeof text === 'string' ? text : '';
	return SYNC_CREATOR_RTL_STRONG_CHAR_REGEX.test(normalizedText);
};

const getSyncCreatorCodeUnitOffsets = (chars) => {
	const offsets = [0];
	let offset = 0;
	(Array.isArray(chars) ? chars : []).forEach((char) => {
		offset += String(char || '').length;
		offsets.push(offset);
	});
	return offsets;
};

const getSyncCreatorCharIndexFromCodeUnitOffset = (offsets, offset) => {
	if (!Array.isArray(offsets) || offsets.length < 2) {
		return 0;
	}

	const safeOffset = Math.max(0, Math.min(offset, offsets[offsets.length - 1]));
	for (let index = 0; index < offsets.length - 1; index++) {
		if (safeOffset >= offsets[index] && safeOffset < offsets[index + 1]) {
			return index;
		}
	}
	return Math.max(0, offsets.length - 2);
};

const getSyncCreatorCharacterPronunciationProgressInfo = (progress) => {
	if (!progress) return null;

	const total = Math.max(0, Number(progress.total) || 0);
	const completed = Math.max(0, Math.min(total, Number(progress.completed) || 0));
	const current = total > 0
		? Math.max(1, Math.min(total, Number(progress.current) || completed || 1))
		: 0;
	const remaining = total > 0
		? Math.max(0, Number.isFinite(Number(progress.remaining)) ? Number(progress.remaining) : total - completed)
		: 0;
	const percent = total > 0
		? Math.max(0, Math.min(100, Number.isFinite(Number(progress.percent)) ? Number(progress.percent) : Math.round((completed / total) * 100)))
		: 0;

	if (progress.phase === 'retry-split') {
		return {
			percent,
			buttonLabel: total > 0 ? `${current}/${total} (${percent}%)` : (I18n.t('syncCreator.characterPronunciationGenerating') || 'Generating AI pronunciation...'),
			label: progress.reason === 'format'
				? (I18n.t('syncCreator.characterPronunciationProgressRetryFormat') || 'Invalid AI alignment. Retrying with smaller chunks...')
				: (I18n.t('syncCreator.characterPronunciationProgressRetry') || 'Response was truncated. Splitting this chunk smaller...')
		};
	}

	if (progress.phase === 'chunk-error' || progress.phase === 'provider-error') {
		return {
			percent,
			buttonLabel: total > 0 ? `${current}/${total} (${percent}%)` : (I18n.t('syncCreator.characterPronunciationGenerating') || 'Generating AI pronunciation...'),
			label: progress.error || I18n.t('syncCreator.characterPronunciationProgressError') || 'AI pronunciation generation failed. Trying fallback...'
		};
	}

	if (total > 0) {
		return {
			percent,
			buttonLabel: `${current}/${total} (${percent}%)`,
			label: I18n.t('syncCreator.characterPronunciationProgress', {
				current,
				total,
				percent,
				remaining
			}) || `${current}/${total} chunks - ${percent}% - ${remaining} left`
		};
	}

	return {
		percent,
		buttonLabel: I18n.t('syncCreator.characterPronunciationGenerating') || 'Generating AI pronunciation...',
		label: I18n.t('syncCreator.characterPronunciationProgressPreparing') || 'Preparing pronunciation generation...'
	};
};

const normalizeSyncCreatorPronunciationUnits = (lineData, lineChars) => {
	const chars = Array.isArray(lineChars) ? lineChars : [];
	if (lineData?.unitMode && lineData.unitMode !== 'word') {
		return [];
	}

	const rawUnits = Array.isArray(lineData?.units)
		? lineData.units
		: (Array.isArray(lineData?.u) ? lineData.u : []);

	return rawUnits
		.map((unit) => {
			const start = Number(unit?.start ?? unit?.s);
			const end = Number(unit?.end ?? unit?.e);
			const pronunciation = typeof (unit?.pronunciation ?? unit?.p) === 'string'
				? (unit.pronunciation ?? unit.p).trim()
				: '';

			if (!pronunciation || !Number.isInteger(start) || !Number.isInteger(end)) {
				return null;
			}
			if (start < 0 || end < start || end >= chars.length) {
				return null;
			}

			return {
				start,
				end,
				pronunciation,
				text: chars.slice(start, end + 1).join('')
			};
		})
		.filter(Boolean)
		.sort((a, b) => a.start - b.start || a.end - b.end);
};

const buildSyncCreatorVisualPronunciationUnits = (lineChars, pronunciationMap) => {
	const chars = Array.isArray(lineChars) ? lineChars : [];
	if (!chars.length || !(pronunciationMap instanceof Map) || pronunciationMap.size === 0) {
		return [];
	}

	const lineText = chars.join('');
	if (!SYNC_CREATOR_JAPANESE_KANA_REGEX.test(lineText) && !SYNC_CREATOR_KANJI_REGEX.test(lineText)) {
		return [];
	}

	const units = [];
	const appendToPreviousUnit = (index, pronunciation = '') => {
		const previous = units[units.length - 1];
		if (!previous) return false;
		previous.end = index;
		previous.text += chars[index] || '';
		if (pronunciation) {
			previous.pronunciation = mergeSyncCreatorPronunciationText(previous.pronunciation, pronunciation);
		}
		return true;
	};

	for (let index = 0; index < chars.length; index++) {
		const char = chars[index] || '';
		const pronunciation = String(pronunciationMap.get(index) || '').trim();
		if (/\s/u.test(char)) {
			continue;
		}

		const shouldAttachToPrevious =
			SYNC_CREATOR_JAPANESE_ATTACH_KANA_REGEX.test(char) ||
			(SYNC_CREATOR_JAPANESE_KANA_REGEX.test(char) && SYNC_CREATOR_HANGUL_JAMO_ONLY_REGEX.test(pronunciation));

		if (shouldAttachToPrevious && appendToPreviousUnit(index, pronunciation)) {
			continue;
		}

		if (!pronunciation) {
			continue;
		}

		units.push({
			start: index,
			end: index,
			text: char,
			pronunciation
		});
	}

	return units.filter(unit => unit.pronunciation);
};

const SyncDataCreator = ({ trackInfo, initialData, onClose }) => {
	const { useState, useEffect, useRef, useCallback, useMemo } = react;

	const roundSyncTime = (time) => Math.round(time * 1000) / 1000;
	const SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC = 0.001;
	const SYNC_CREATOR_DRAG_INITIAL_BURST_STEPS = 3;
	const SYNC_CREATOR_DRAG_INTERVAL_MS = 27;
	const EDGE_INTERPOLATION_GAP_SEC = 0.045;
	const getSyncCreatorLineTimes = (line) => {
		const times = [];
		const appendTimes = (values) => {
			if (!Array.isArray(values)) return;
			values.forEach((value) => {
				if (typeof value === 'number' && Number.isFinite(value)) {
					times.push(value);
				}
			});
		};

		appendTimes(line?.chars);
		if (Array.isArray(line?.parallel?.parts)) {
			line.parallel.parts.forEach(part => appendTimes(part?.chars));
		}

		return times;
	};
	const SYNC_CREATOR_SHORTCUTS = {
		charForward: { primary: 'sync-creator-char-forward-key', secondary: 'sync-creator-char-forward-alt-key', defaultPrimary: 'right' },
		charBack: { primary: 'sync-creator-char-back-key', secondary: 'sync-creator-char-back-alt-key', defaultPrimary: 'left' },
		wordForward: { primary: 'sync-creator-word-forward-key', secondary: 'sync-creator-word-forward-alt-key', defaultPrimary: '.' },
		wordBack: { primary: 'sync-creator-word-back-key', secondary: 'sync-creator-word-back-alt-key', defaultPrimary: ',' },
		syllable: { primary: 'sync-creator-syllable-key', secondary: 'sync-creator-syllable-alt-key', defaultPrimary: ';' },
		drag: { primary: 'sync-creator-drag-key', secondary: 'sync-creator-drag-alt-key', defaultPrimary: '/', defaultSecondary: 'numpaddivide' },
	};
	const SYNC_CREATOR_AUTO_BOUNDARY_CHARS_KEY = 'sync-creator-auto-boundary-chars';
	const normalizeHotkeyToken = (value) => {
		if (value === null || value === undefined) return '';
		const normalized = String(value).trim().toLowerCase();
		if (!normalized) return '';

		const aliases = {
			arrowright: 'right',
			arrowleft: 'left',
			arrowup: 'up',
			arrowdown: 'down',
			' ': 'space',
			spacebar: 'space',
			escape: 'esc',
			return: 'enter',
			del: 'delete',
			slash: '/',
			divide: 'numpaddivide',
			'num /': 'numpaddivide',
			'num/': 'numpaddivide',
			control: 'ctrl',
			command: 'meta',
			cmd: 'meta',
		};

		return aliases[normalized] || normalized;
	};
	const readSyncCreatorShortcutSetting = (settingKey, fallback = '') => {
		try {
			const fullKey = `ivLyrics:visual:${settingKey}`;
			const stored = localStorage.getItem(fullKey) ?? Spicetify.LocalStorage?.get(fullKey);
			const effectiveValue = stored !== null && stored !== undefined ? stored : fallback;
			return normalizeHotkeyToken(effectiveValue);
		} catch (e) {
			return normalizeHotkeyToken(fallback);
		}
	};
	const readSyncCreatorBooleanSetting = (settingKey, fallback = true) => {
		try {
			const fullKey = `ivLyrics:visual:${settingKey}`;
			const stored = localStorage.getItem(fullKey)
				?? Spicetify.LocalStorage?.get(fullKey)
				?? window.CONFIG?.visual?.[settingKey];
			if (stored === null || stored === undefined) return fallback;
			if (typeof stored === 'boolean') return stored;
			const normalized = String(stored).trim().toLowerCase();
			if (!normalized) return fallback;
			return !['false', '0', 'off', 'no'].includes(normalized);
		} catch (e) {
			return fallback;
		}
	};
	const getSyncCreatorShortcutBindings = () => Object.entries(SYNC_CREATOR_SHORTCUTS).reduce((acc, [action, config]) => {
		const primary = readSyncCreatorShortcutSetting(config.primary, config.defaultPrimary);
		const secondary = readSyncCreatorShortcutSetting(config.secondary, config.defaultSecondary || '');
		acc[action] = [primary, secondary].filter(Boolean);
		return acc;
	}, {});
	const getNormalizedHotkeyFromEvent = (event) => {
		const parts = [];
		if (event.ctrlKey) parts.push('ctrl');
		if (event.altKey) parts.push('alt');
		if (event.shiftKey && normalizeHotkeyToken(event.key) !== 'shift') parts.push('shift');
		if (event.metaKey) parts.push('meta');

		const baseKey = event.code === 'NumpadDivide'
			? 'numpaddivide'
			: normalizeHotkeyToken(event.key);
		if (!['ctrl', 'alt', 'shift', 'meta'].includes(baseKey)) {
			parts.push(baseKey);
		}
		return parts.join('+');
	};
	const isSyncCreatorDragHotkeyEvent = (event, normalizedHotkey = getNormalizedHotkeyFromEvent(event)) => {
		if (normalizedHotkey === '/' || normalizedHotkey === 'numpaddivide') return true;
		if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return false;
		return event.code === 'Slash' || event.code === 'NumpadDivide';
	};
	const formatHotkeyToken = (value) => {
		const token = normalizeHotkeyToken(value);
		const displayMap = {
			right: '→',
			left: '←',
			up: '↑',
			down: '↓',
			enter: 'Enter',
			backspace: '⌫',
			space: 'Space',
			esc: 'Esc',
			ctrl: 'Ctrl',
			alt: 'Alt',
			shift: 'Shift',
			meta: 'Meta',
			'/': 'Slash',
			numpaddivide: 'Num /',
		};
		if (displayMap[token]) return displayMap[token];
		return token.length === 1 ? token.toUpperCase() : token;
	};
	const formatHotkeyBinding = (binding) => binding
		.split('+')
		.filter(Boolean)
		.map(formatHotkeyToken)
		.join('+');
	const getSyncCreatorShortcutDisplay = (action) => {
		const bindings = getSyncCreatorShortcutBindings()[action] || [];
		return bindings.length ? bindings.map(formatHotkeyBinding).join(' / ') : '';
	};

	const isWordChar = (ch) => !!ch && /[\p{L}\p{N}]/u.test(ch);
	const isLatinChar = (ch) => !!ch && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(ch);
	const isLatinVowel = (ch) => !!ch && /[AEIOUYaeiouyÀ-ÖØ-öø-ÿ]/.test(ch);
	const isInternalJoiner = (chars, index) => {
		const ch = chars[index];
		if (!ch || !/['’"]/u.test(ch)) return false;
		return isWordChar(chars[index - 1]) && isWordChar(chars[index + 1]);
	};
	const isWordBoundary = (chars, index) => {
		const ch = chars[index];
		if (!ch) return false;
		if (isInternalJoiner(chars, index)) return false;
		return /[\s\-–—]/u.test(ch);
	};
	const isLeadingChar = (chars, index) => {
		const ch = chars[index];
		if (!ch) return false;
		if (isInternalJoiner(chars, index)) return false;
		return /[\(\[\{「『【〈《¿¡'"“”‘’]/u.test(ch);
	};
	const isTrailingChar = (chars, index) => {
		const ch = chars[index];
		if (!ch) return false;
		if (isInternalJoiner(chars, index)) return false;
		return /[\s!?\.,;:\)\]\}」』】〉》'"“”‘’]/u.test(ch);
	};
	const isValidOnsetCluster = (cluster) => /^(bl|br|ch|chr|cl|cr|dr|fl|fr|gl|gr|ph|pl|pr|qu|sc|sch|scr|sh|sk|sl|sm|sn|sp|spl|spr|st|str|sw|th|thr|tr|tw|wh|wr)$/i.test(cluster);
	const edgeInterpolation = (progress) => {
		if (progress <= 0) return 0;
		if (progress >= 1) return 1;
		if (progress < 0.5) {
			const scaled = progress * 2;
			return 0.5 * (1 - Math.pow(1 - scaled, 3));
		}
		const scaled = (progress - 0.5) * 2;
		return 0.5 + (0.5 * Math.pow(scaled, 3));
	};
	const smoothStepInterpolation = (progress) => {
		if (progress <= 0) return 0;
		if (progress >= 1) return 1;
		return progress * progress * (3 - (2 * progress));
	};
	const applyInterpolatedRangeToCharTimes = (target, startIdx, endIdx, startTime, endTime, interpolationFn = edgeInterpolation) => {
		if (!target || startIdx > endIdx || startIdx < 0) return;
		const count = endIdx - startIdx + 1;
		const safeEndTime = Math.max(startTime, endTime);
		if (count <= 1) {
			target[startIdx] = roundSyncTime(startTime);
			return;
		}
		for (let i = 0; i < count; i++) {
			const progress = count === 1 ? 1 : i / (count - 1);
			target[startIdx + i] = roundSyncTime(startTime + ((safeEndTime - startTime) * interpolationFn(progress)));
		}
	};
	const getLastRecordedSyncIndex = (target) => {
		if (!Array.isArray(target)) return -1;
		for (let index = target.length - 1; index >= 0; index--) {
			if (typeof target[index] === 'number') return index;
		}
		return -1;
	};
	const getPreviousRecordedSyncTime = (target, beforeIndex) => {
		if (!Array.isArray(target)) return null;
		for (let index = Math.min(beforeIndex - 1, target.length - 1); index >= 0; index--) {
			if (typeof target[index] === 'number') return target[index];
		}
		return null;
	};
	const getSequentialSyncTime = (rawTime, previousTime = null) => {
		const safeRawTime = Number.isFinite(rawTime) ? rawTime : 0;
		if (typeof previousTime !== 'number' || !Number.isFinite(previousTime)) {
			return roundSyncTime(safeRawTime);
		}
		return roundSyncTime(Math.max(safeRawTime, previousTime + SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC));
	};
	const estimateSegmentDuration = (startIdx, endIdx, scale = 0.055, maxDuration = 0.26) =>
		Math.min(maxDuration, Math.max(0.07, (endIdx - startIdx + 1) * scale));
	const estimateWordInterpolationDuration = (startIdx, endIdx) => {
		const charCount = Math.max(1, endIdx - startIdx + 1);
		const preferredDuration = charCount * 0.085;
		const minimumDuration = 0.11 + Math.max(0, charCount - 1) * 0.05;
		return Math.min(0.42, Math.max(minimumDuration, preferredDuration));
	};
	const buildLatinWordSyllables = (chars, wordStart, wordEnd) => {
		const nuclei = [];
		let index = wordStart;

		while (index <= wordEnd) {
			if (!isLatinVowel(chars[index])) {
				index++;
				continue;
			}

			const nucleusStart = index;
			index++;
			while (index <= wordEnd && isLatinVowel(chars[index])) {
				index++;
			}
			nuclei.push({ start: nucleusStart, end: index - 1 });
		}

		if (nuclei.length > 1) {
			const lastNucleus = nuclei[nuclei.length - 1];
			if (lastNucleus.start === lastNucleus.end &&
				lastNucleus.end === wordEnd &&
				/[eE]/.test(chars[lastNucleus.start]) &&
				isWordChar(chars[lastNucleus.start - 1])) {
				nuclei.pop();
			}
		}

		if (!nuclei.length) {
			return [{ start: wordStart, end: wordEnd }];
		}

		const syllables = [];
		let currentStart = wordStart;

		for (let i = 0; i < nuclei.length; i++) {
			const nucleus = nuclei[i];
			const nextNucleus = nuclei[i + 1];

			if (!nextNucleus) {
				syllables.push({ start: currentStart, end: wordEnd });
				break;
			}

			const consonantRunStart = nucleus.end + 1;
			const consonantRunEnd = nextNucleus.start - 1;
			let splitAfter = nucleus.end;

			if (consonantRunEnd >= consonantRunStart) {
				const runLength = consonantRunEnd - consonantRunStart + 1;
				if (runLength === 1) {
					splitAfter = nucleus.end;
				} else {
					splitAfter = consonantRunEnd - 1;
					const onsetCluster = chars.slice(splitAfter + 1, consonantRunEnd + 1).join('').toLowerCase();
					if (runLength > 2 && isValidOnsetCluster(onsetCluster)) {
						splitAfter = consonantRunStart - 1;
					}
				}
			}

			syllables.push({ start: currentStart, end: splitAfter });
			currentStart = splitAfter + 1;
		}

		return syllables.filter(segment => segment.start <= segment.end);
	};
	const buildLineSyllableSegments = (chars) => {
		if (!Array.isArray(chars) || !chars.length) return [];
		const segments = [];
		let index = 0;
		let pendingPrefixStart = 0;

		while (index < chars.length) {
			while (index < chars.length && isWordBoundary(chars, index)) {
				index++;
			}

			if (index >= chars.length) {
				break;
			}

			const prefixStart = pendingPrefixStart;
			let wordStart = index;
			while (wordStart < chars.length && isLeadingChar(chars, wordStart) && !isWordBoundary(chars, wordStart)) {
				wordStart++;
			}

			let wordEnd = wordStart;
			while (wordEnd < chars.length && !isWordBoundary(chars, wordEnd)) {
				wordEnd++;
			}
			wordEnd--;

			if (wordEnd < wordStart) {
				index++;
				pendingPrefixStart = index;
				continue;
			}

			let trailingEnd = wordEnd;
			while (trailingEnd >= wordStart && isTrailingChar(chars, trailingEnd) && !isInternalJoiner(chars, trailingEnd)) {
				trailingEnd--;
			}

			const coreEnd = Math.max(wordStart, trailingEnd);
			let wordSegments;

			if (!isLatinChar(chars[wordStart])) {
				wordSegments = [];
				for (let i = wordStart; i <= coreEnd; i++) {
					wordSegments.push({ start: i, end: i });
				}
			} else if (chars.slice(wordStart, coreEnd + 1).every(ch => isLatinChar(ch) || /['’]/u.test(ch))) {
				wordSegments = buildLatinWordSyllables(chars, wordStart, coreEnd);
			} else {
				wordSegments = [];
				for (let i = wordStart; i <= coreEnd; i++) {
					wordSegments.push({ start: i, end: i });
				}
			}

			if (!wordSegments.length) {
				wordSegments = [{ start: wordStart, end: coreEnd }];
			}

			wordSegments = wordSegments.map((segment, segmentIndex) => ({
				start: segmentIndex === 0 ? prefixStart : segment.start,
				end: segmentIndex === wordSegments.length - 1 ? wordEnd : segment.end,
			}));

			segments.push(...wordSegments.filter(segment => segment.start <= segment.end));
			index = wordEnd + 1;
			pendingPrefixStart = index;
		}

		if (!segments.length && chars.length) {
			segments.push({ start: 0, end: chars.length - 1 });
		}

		return segments;
	};

	const rangesToCharRefs = (ranges, lineChars, lineStart = 0) => {
		if (!Array.isArray(ranges) || !Array.isArray(lineChars)) return [];
		const refs = [];
		ranges.forEach((range) => {
			const start = Math.max(lineStart, Number(range?.start));
			const end = Math.min(lineStart + lineChars.length - 1, Number(range?.end));
			if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) return;
			for (let index = start; index <= end; index++) {
				refs.push({ absoluteIndex: index, localIndex: index - lineStart, char: lineChars[index - lineStart] || '' });
			}
		});
		return refs;
	};

	const getSyncCreatorParallelJoinText = (joinMode) => {
		const mode = Number(joinMode);
		return mode === 1 || mode === 2 ? ' ' : '';
	};

	const getSyncCreatorParallelPartText = (part, lineChars, lineStart = 0) => {
		if (!part || !Array.isArray(part.ranges) || !Array.isArray(lineChars)) return '';
		let text = '';
		part.ranges.forEach((range, rangeIndex) => {
			if (rangeIndex > 0) {
				text += getSyncCreatorParallelJoinText(Array.isArray(part.join) ? part.join[rangeIndex - 1] : 1);
			}
			const start = Math.max(lineStart, Number(range?.start));
			const end = Math.min(lineStart + lineChars.length - 1, Number(range?.end));
			if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) return;
			text += lineChars.slice(start - lineStart, end - lineStart + 1).join('');
		});
		return text.trim();
	};

	const getSyncCreatorParallelPartDisplayItems = (part, lineChars, lineStart = 0) => {
		if (!part || !Array.isArray(part.ranges) || !Array.isArray(lineChars)) return [];
		const items = [];
		let charIndex = 0;
		part.ranges.forEach((range, rangeIndex) => {
			if (rangeIndex > 0) {
				const separator = getSyncCreatorParallelJoinText(Array.isArray(part.join) ? part.join[rangeIndex - 1] : 1);
				if (separator) {
					items.push({ type: 'separator', text: separator, key: `join-${rangeIndex}` });
				}
			}
			const start = Math.max(lineStart, Number(range?.start));
			const end = Math.min(lineStart + lineChars.length - 1, Number(range?.end));
			if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) return;
			for (let index = start; index <= end; index++) {
				items.push({
					type: 'char',
					key: `char-${index}`,
					charIndex,
					absoluteIndex: index,
					localIndex: index - lineStart,
					char: lineChars[index - lineStart] || ''
				});
				charIndex++;
			}
		});
		return items;
	};

	const formatSyncCreatorParallelPreviewLines = (parallel, lineChars, lineStart = 0) => (
		Array.isArray(parallel?.parts)
			? parallel.parts
				.map(part => getSyncCreatorParallelPartText(part, lineChars, lineStart))
				.filter(Boolean)
			: []
	);

	const countRangeChars = (ranges) => (Array.isArray(ranges) ? ranges : []).reduce((sum, range) => {
		const start = Number(range?.start);
		const end = Number(range?.end);
		return Number.isInteger(start) && Number.isInteger(end) && end >= start ? sum + end - start + 1 : sum;
	}, 0);

	const pushSyncCreatorRange = (ranges, start, end, lineStart) => {
		if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return;
		ranges.push({ start: lineStart + start, end: lineStart + end });
	};

	const normalizeSyncCreatorHiddenRanges = (ranges) => {
		if (!Array.isArray(ranges)) return [];
		const normalizedRanges = ranges
			.map((range) => {
				const start = Number(range?.start);
				const end = Number(range?.end);
				return Number.isInteger(start) && Number.isInteger(end) && end >= start
					? { start, end }
					: null;
			})
			.filter(Boolean)
			.sort((a, b) => a.start - b.start || a.end - b.end);

		return normalizedRanges.reduce((merged, range) => {
			const previous = merged[merged.length - 1];
			if (previous && range.start <= previous.end + 1) {
				previous.end = Math.max(previous.end, range.end);
			} else {
				merged.push(range);
			}
			return merged;
		}, []);
	};

	const isSyncCreatorRangeGapFullyHidden = (hiddenRanges, gapStart, gapEnd) => {
		if (gapStart > gapEnd || !Array.isArray(hiddenRanges) || hiddenRanges.length === 0) return false;

		let cursor = gapStart;
		for (const hiddenRange of hiddenRanges) {
			const start = Number(hiddenRange?.start);
			const end = Number(hiddenRange?.end);
			if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return false;
			if (end < cursor) continue;
			if (start > cursor) return false;
			cursor = Math.max(cursor, end + 1);
			if (cursor > gapEnd) return true;
		}

		return false;
	};

	const getNextSyncCreatorPartId = (usedIds) => {
		for (const label of 'abcdefghijklmnopqrstuvwxyz') {
			if (!usedIds.has(label)) {
				usedIds.add(label);
				return label;
			}
		}

		let index = 1;
		while (index <= 16) {
			const id = `p${index}`;
			if (!usedIds.has(id)) {
				usedIds.add(id);
				return id;
			}
			index++;
		}

		return null;
	};

	const splitSyncCreatorHiddenDelimitedParallelPart = (part, hiddenRanges, usedIds) => {
		if (
			!part
			|| typeof part !== 'object'
			|| part.role !== 'background'
			|| typeof part.id !== 'string'
			|| !Array.isArray(part.ranges)
			|| part.ranges.length < 2
			|| !Array.isArray(part.join)
			|| part.join.length !== part.ranges.length - 1
			|| !part.join.every(joinMode => Number.isInteger(joinMode) && joinMode >= 0 && joinMode <= 2)
		) {
			return null;
		}

		const hasSyncedChars = Array.isArray(part.chars);
		if (hasSyncedChars && part.chars.length !== countRangeChars(part.ranges)) {
			return null;
		}
		if (part.join.some(joinMode => Number(joinMode) === 2)) {
			return null;
		}

		for (let index = 0; index < part.ranges.length; index++) {
			const range = part.ranges[index];
			const start = Number(range?.start);
			const end = Number(range?.end);
			if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
			if (index > 0) {
				const previousRange = part.ranges[index - 1];
				const previousEnd = Number(previousRange?.end);
				if (!Number.isInteger(previousEnd) || start <= previousEnd) return null;
				if (!isSyncCreatorRangeGapFullyHidden(hiddenRanges, previousEnd + 1, start - 1)) {
					return null;
				}
			}
		}

		const splitParts = [];
		let charOffset = 0;
		for (let index = 0; index < part.ranges.length; index++) {
			const range = part.ranges[index];
			const charCount = range.end - range.start + 1;
			const id = index === 0 ? part.id : getNextSyncCreatorPartId(usedIds);
			if (!id) return null;

			const splitPart = {
				...part,
				id,
				ranges: [{ ...range }],
				join: []
			};
			if (hasSyncedChars) {
				splitPart.chars = part.chars.slice(charOffset, charOffset + charCount);
			} else {
				delete splitPart.chars;
			}
			splitParts.push(splitPart);
			charOffset += charCount;
		}

		return splitParts;
	};

	const splitSyncCreatorHiddenDelimitedParallelParts = (parallel, options = {}) => {
		if (!parallel || typeof parallel !== 'object' || !Array.isArray(parallel.parts) || !Array.isArray(parallel.hiddenRanges)) {
			return parallel;
		}
		if (options.splitHiddenDelimitedBackgroundParts === false) {
			return parallel;
		}

		const usedIds = new Set(parallel.parts
			.map(part => (typeof part?.id === 'string' ? part.id : null))
			.filter(Boolean));
		const parts = [];
		let changed = false;

		parallel.parts.forEach((part) => {
			const splitParts = splitSyncCreatorHiddenDelimitedParallelPart(part, parallel.hiddenRanges, usedIds);
			if (splitParts) {
				changed = true;
				parts.push(...splitParts);
			} else {
				parts.push(part);
			}
		});

		return changed && parts.length <= 16 ? { ...parallel, parts } : parallel;
	};

	const sanitizeSyncCreatorParallel = (parallel, options = {}) => {
		if (!parallel || typeof parallel !== 'object') return parallel;
		const nextParallel = { ...parallel };
		if (Array.isArray(nextParallel.parts)) {
			nextParallel.parts = nextParallel.parts.map((part) => {
				if (!part || typeof part !== 'object') return part;
				const nextPart = { ...part };
				const sourceSpeaker = nextPart.speaker;
				const speaker = normalizeSyncCreatorSpeaker(sourceSpeaker);
				if (speaker) nextPart.speaker = speaker;
				const speakerFallback = sanitizeSyncCreatorSpeakerFallback(
					speaker,
					nextPart['speaker-fallback'],
					true,
					sourceSpeaker
				);
				if (speakerFallback) nextPart['speaker-fallback'] = speakerFallback;
				else delete nextPart['speaker-fallback'];
				const speakerColor = sanitizeSyncCreatorSpeakerColor(
					speaker,
					nextPart['speaker-color'],
					true,
					speakerFallback
				);
				if (speakerColor) nextPart['speaker-color'] = speakerColor;
				else delete nextPart['speaker-color'];
				return nextPart;
			});
		}
		const hiddenRanges = normalizeSyncCreatorHiddenRanges(nextParallel.hiddenRanges);
		if (hiddenRanges.length > 0) {
			nextParallel.hiddenRanges = hiddenRanges;
		} else {
			delete nextParallel.hiddenRanges;
		}
		return splitSyncCreatorHiddenDelimitedParallelParts(nextParallel, options);
	};

	const normalizeSyncCreatorParentheticalParallelRanges = (parallel, fullTextChars) => {
		const sourceChars = Array.isArray(fullTextChars) ? fullTextChars : [];
		if (!parallel || typeof parallel !== 'object' || !Array.isArray(parallel.parts) || sourceChars.length === 0) {
			return { parallel: sanitizeSyncCreatorParallel(parallel), changed: false };
		}

		const hiddenRanges = Array.isArray(parallel.hiddenRanges) ? [...parallel.hiddenRanges] : [];
		let changed = false;
		const parts = parallel.parts.map((part) => {
			if (!part || !Array.isArray(part.ranges) || part.ranges.length !== 1 || !Array.isArray(part.chars)) {
				return part;
			}

			const range = part.ranges[0];
			const start = Number(range?.start);
			const end = Number(range?.end);
			if (
				!Number.isInteger(start)
				|| !Number.isInteger(end)
				|| start < 0
				|| end < start
				|| end >= sourceChars.length
				|| part.chars.length !== end - start + 1
			) {
				return part;
			}

			const localChars = sourceChars.slice(start, end + 1);
			const hiddenLocalIndexes = [];
			const stripped = stripSyncCreatorStandaloneParentheticalCharRange(
				localChars,
				0,
				localChars.length - 1,
				index => hiddenLocalIndexes.push(index)
			);
			if (!stripped.changed || stripped.start > stripped.end) return part;

			const nextChars = part.chars.slice(stripped.start, stripped.end + 1);
			if (nextChars.length !== stripped.end - stripped.start + 1) return part;

			changed = true;
			hiddenLocalIndexes.forEach(index => {
				const absoluteIndex = start + index;
				hiddenRanges.push({ start: absoluteIndex, end: absoluteIndex });
			});

			return {
				...part,
				ranges: [{ ...range, start: start + stripped.start, end: start + stripped.end }],
				chars: nextChars
			};
		});

		if (!changed) {
			return { parallel: sanitizeSyncCreatorParallel(parallel), changed: false };
		}

		return {
			parallel: sanitizeSyncCreatorParallel({
				...parallel,
				hiddenRanges,
				parts
			}),
			changed: true
		};
	};

	const sanitizeSyncCreatorSyncData = (data, fullTextChars = null) => {
		if (!data || !Array.isArray(data.lines)) return data;
		let migratedParallelRanges = false;
		const lines = data.lines.map((line) => {
			const nextLine = { ...line };
			const sourceSpeaker = nextLine.speaker;
			const speaker = normalizeSyncCreatorSpeaker(sourceSpeaker);
			if (speaker) nextLine.speaker = speaker;
			const speakerFallback = sanitizeSyncCreatorSpeakerFallback(
				speaker,
				nextLine['speaker-fallback'],
				true,
				sourceSpeaker
			);
			if (speakerFallback) nextLine['speaker-fallback'] = speakerFallback;
			else delete nextLine['speaker-fallback'];
			const speakerColor = sanitizeSyncCreatorSpeakerColor(
				speaker,
				nextLine['speaker-color'],
				true,
				speakerFallback
			);
			if (speakerColor) nextLine['speaker-color'] = speakerColor;
			else delete nextLine['speaker-color'];
			if (nextLine.parallel) {
				const normalized = normalizeSyncCreatorParentheticalParallelRanges(nextLine.parallel, fullTextChars);
				nextLine.parallel = normalized.parallel;
				migratedParallelRanges = migratedParallelRanges || normalized.changed;
			}
			const hiddenRanges = normalizeSyncCreatorHiddenRanges(nextLine.hiddenRanges);
			if (hiddenRanges.length > 0) {
				nextLine.hiddenRanges = hiddenRanges;
			} else {
				delete nextLine.hiddenRanges;
			}
			return nextLine;
		});
		const hasParallelLines = lines.some(line => Array.isArray(line?.parallel?.parts) && line.parallel.parts.length > 1);
		const version = Number(data.version);

		return {
			...data,
			...(hasParallelLines || migratedParallelRanges
				? { version: Math.max(Number.isFinite(version) ? version : 1, SYNC_CREATOR_SYNC_DATA_VERSION) }
				: {}),
			lines
		};
	};

	const buildParentheticalParallelTemplate = (lineChars, lineStart = 0, options = {}) => {
		const chars = Array.isArray(lineChars) ? lineChars : [];
		if (!chars.length) return null;

		const groupBackgroundParts = options.groupBackgroundParts === true;
		const speakerLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
		const buildPart = (index, ranges, role = index === 0 ? 'lead' : 'background', joinMode = 1) => ({
			id: speakerLabels[index]?.toLowerCase() || `p${index + 1}`,
			role,
			speaker: SYNC_CREATOR_DEFAULT_SPEAKER,
			kind: SYNC_CREATOR_DEFAULT_KIND,
			ranges,
			join: ranges.length > 1 ? new Array(ranges.length - 1).fill(joinMode) : []
		});

		const buildSeparatorTemplate = () => {
			const partRanges = [];
			const hiddenRanges = [];
			let depth = 0;
			let partIndex = 0;
			let runStart = null;

			const pushHidden = (index) => {
				const previous = hiddenRanges[hiddenRanges.length - 1];
				const absoluteIndex = lineStart + index;
				if (previous && previous.end + 1 === absoluteIndex) {
					previous.end = absoluteIndex;
				} else {
					hiddenRanges.push({ start: absoluteIndex, end: absoluteIndex });
				}
			};

			const flushRun = (endIndex) => {
				if (runStart !== null && endIndex >= runStart) {
					while (runStart <= endIndex && /\s/u.test(chars[runStart] || '')) {
						pushHidden(runStart);
						runStart++;
					}
					const originalEndIndex = endIndex;
					while (endIndex >= runStart && /\s/u.test(chars[endIndex] || '')) {
						endIndex--;
					}
					for (let index = endIndex + 1; index <= originalEndIndex; index++) {
						pushHidden(index);
					}
				}
				if (runStart !== null && endIndex >= runStart) {
					if (!partRanges[partIndex]) partRanges[partIndex] = [];
					pushSyncCreatorRange(partRanges[partIndex], runStart, endIndex, lineStart);
				}
				runStart = null;
			};

			for (let index = 0; index < chars.length; index++) {
				const char = chars[index] || '';
				if (char === '(' || char === '（') depth++;
				if (char === ')' || char === '）') depth = Math.max(0, depth - 1);

				if ((char === '/' || char === '|' || char === '／' || char === '｜') && depth === 0) {
					flushRun(index - 1);
					pushHidden(index);
					partIndex++;
					continue;
				}

				if (/\s/u.test(char) && runStart === null) {
					pushHidden(index);
					continue;
				}

				if (runStart === null) {
					runStart = index;
				}
			}

			flushRun(chars.length - 1);

			const parts = partRanges
				.filter(ranges => Array.isArray(ranges) && ranges.length > 0)
				.map((ranges, index) => buildPart(index, ranges));

			if (parts.length < 2) return null;

			return sanitizeSyncCreatorParallel({
				layout: 'stack',
				parts,
				hiddenRanges
			});
		};

		const separatorTemplate = buildSeparatorTemplate();
		if (separatorTemplate) return separatorTemplate;

		const leadRanges = [];
		const backgroundRangeGroups = [];
		const hiddenRanges = [];
		let depth = 0;
		let runStart = null;
		let runPart = null;

		const flushRun = (endIndex) => {
			if (runStart !== null && endIndex >= runStart) {
				while (runStart <= endIndex && /\s/u.test(chars[runStart] || '')) {
					pushHidden(runStart);
					runStart++;
				}
				const originalEndIndex = endIndex;
				while (endIndex >= runStart && /\s/u.test(chars[endIndex] || '')) {
					endIndex--;
				}
				for (let index = endIndex + 1; index <= originalEndIndex; index++) {
					pushHidden(index);
				}
			}
			if (runStart !== null && endIndex >= runStart) {
				if (runPart === 'background') {
					const ranges = [];
					pushSyncCreatorRange(ranges, runStart, endIndex, lineStart);
					if (ranges.length > 0) backgroundRangeGroups.push(ranges);
				} else {
					pushSyncCreatorRange(leadRanges, runStart, endIndex, lineStart);
				}
			}
			runStart = null;
			runPart = null;
		};

		const pushHidden = (index) => {
			const previous = hiddenRanges[hiddenRanges.length - 1];
			const absoluteIndex = lineStart + index;
			if (previous && previous.end + 1 === absoluteIndex) {
				previous.end = absoluteIndex;
			} else {
				hiddenRanges.push({ start: absoluteIndex, end: absoluteIndex });
			}
		};

		for (let index = 0; index < chars.length; index++) {
			const char = chars[index] || '';
			const isOpen = char === '(' || char === '（';
			const isClose = char === ')' || char === '）';
			const isHidden = isOpen || isClose;

			if (isOpen || isClose) {
				flushRun(index - 1);
				pushHidden(index);
				depth = isOpen ? depth + 1 : Math.max(0, depth - 1);
				continue;
			}

			if (isHidden) {
				flushRun(index - 1);
				pushHidden(index);
				continue;
			}

			const part = depth > 0 ? 'background' : 'lead';
			if (runStart === null) {
				runStart = index;
				runPart = part;
			} else if (runPart !== part) {
				flushRun(index - 1);
				runStart = index;
				runPart = part;
			}
		}
		flushRun(chars.length - 1);

		if (!leadRanges.length || !backgroundRangeGroups.length) return null;
		const orderedRangeGroups = [
			{ role: 'lead', ranges: leadRanges, joinMode: 1 },
			...(groupBackgroundParts
				? [{ role: 'background', ranges: backgroundRangeGroups.flat(), joinMode: 2 }]
				: backgroundRangeGroups.map(ranges => ({ role: 'background', ranges, joinMode: 1 })))
		]
			.filter(group => group.ranges.length > 0)
			.sort((a, b) => a.ranges[0].start - b.ranges[0].start);

		return sanitizeSyncCreatorParallel({
			layout: 'stack',
			parts: orderedRangeGroups.map((group, index) =>
				buildPart(index, group.ranges, group.role, group.joinMode)
			),
			hiddenRanges
		}, {
			splitHiddenDelimitedBackgroundParts: !groupBackgroundParts
		});
	};

	const buildManualParallelTemplate = (lineChars, lineStart = 0, splitPoints = []) => {
		const chars = Array.isArray(lineChars) ? lineChars : [];
		if (chars.length < 2 || !Array.isArray(splitPoints) || splitPoints.length === 0) return null;

		const normalizedSplitPoints = [...new Set(splitPoints
			.map(value => Number(value))
			.filter(value => Number.isInteger(value) && value > 0 && value < chars.length))]
			.sort((a, b) => a - b);
		if (normalizedSplitPoints.length === 0) return null;

		const speakerLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
		const hiddenRanges = [];
		const parts = [];

		const pushHidden = (index) => {
			const absoluteIndex = lineStart + index;
			const previous = hiddenRanges[hiddenRanges.length - 1];
			if (previous && previous.end + 1 === absoluteIndex) {
				previous.end = absoluteIndex;
			} else {
				hiddenRanges.push({ start: absoluteIndex, end: absoluteIndex });
			}
		};

		const boundaries = [0, ...normalizedSplitPoints, chars.length];
		for (let boundaryIndex = 0; boundaryIndex < boundaries.length - 1; boundaryIndex++) {
			let start = boundaries[boundaryIndex];
			let end = boundaries[boundaryIndex + 1] - 1;

			while (start <= end && /\s/u.test(chars[start] || '')) {
				pushHidden(start);
				start++;
			}
			const trailingHiddenIndexes = [];
			while (end >= start && /\s/u.test(chars[end] || '')) {
				trailingHiddenIndexes.push(end);
				end--;
			}
			trailingHiddenIndexes.reverse().forEach(pushHidden);
			if (start > end) continue;

			const stripped = stripSyncCreatorStandaloneParentheticalCharRange(chars, start, end, pushHidden);
			if (stripped.changed) {
				start = stripped.start;
				end = stripped.end;
				if (start > end) continue;
			}

			parts.push({
				id: speakerLabels[parts.length]?.toLowerCase() || `p${parts.length + 1}`,
				role: parts.length === 0 ? 'lead' : 'background',
				speaker: SYNC_CREATOR_DEFAULT_SPEAKER,
				kind: SYNC_CREATOR_DEFAULT_KIND,
				ranges: [{ start: lineStart + start, end: lineStart + end }],
				join: []
			});
		}

		if (parts.length < 2) return null;
		return sanitizeSyncCreatorParallel({
			layout: 'stack',
			parts,
			hiddenRanges
		});
	};

	const mergeSyncCreatorParallelTemplate = (template, existingParallel) => {
		if (!template) return null;
		const existingParts = Array.isArray(existingParallel?.parts) ? existingParallel.parts : [];
		return sanitizeSyncCreatorParallel({
			layout: existingParallel?.layout || template.layout || 'stack',
			hiddenRanges: Array.isArray(existingParallel?.hiddenRanges) ? existingParallel.hiddenRanges : template.hiddenRanges,
			parts: template.parts.map((part) => {
				const existing = existingParts.find(item => item?.id === part.id);
				const sourceSpeaker = existing?.speaker || part.speaker;
				const speaker = normalizeSyncCreatorSpeaker(sourceSpeaker) || SYNC_CREATOR_DEFAULT_SPEAKER;
				const speakerFallback = sanitizeSyncCreatorSpeakerFallback(
					speaker,
					existing?.['speaker-fallback'] || part['speaker-fallback'],
					true,
					sourceSpeaker
				);
				return {
						...part,
						role: existing?.role || part.role,
						speaker,
						...(speakerFallback ? { 'speaker-fallback': speakerFallback } : {}),
						'speaker-color': sanitizeSyncCreatorSpeakerColor(
							speaker,
							existing?.['speaker-color'] || part['speaker-color'],
							true,
							speakerFallback
						) || undefined,
						kind: normalizeSyncCreatorKind(existing?.kind || part.kind) || SYNC_CREATOR_DEFAULT_KIND,
						chars: Array.isArray(existing?.chars) ? existing.chars : undefined
					};
				})
		});
	};

	// 상태 관리
	const [provider, setProvider] = useState('');   // 상세 provider (sync-data 매칭용, 예: spotify-MusixMatch)
	const [addonId, setAddonId] = useState('');     // 실제 addon ID (가사 로드용, 예: spotify)
	const [lyrics, setLyrics] = useState(null);
	const [lyricsText, setLyricsText] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);
	const [currentLineIndex, setCurrentLineIndex] = useState(0);
	const [activeParallelPartId, setActiveParallelPartId] = useState('full');
	const [parallelPartMetaDrafts, setParallelPartMetaDrafts] = useState({});
	const [manualParallelSplitDrafts, setManualParallelSplitDrafts] = useState({});
	const [parentheticalLayoutDrafts, setParentheticalLayoutDrafts] = useState({});
	const [pendingParentheticalLayoutDecision, setPendingParentheticalLayoutDecision] = useState(null);
	const [mergedLineDrafts, setMergedLineDrafts] = useState({});
	const [isParallelSplitCollapsed, setIsParallelSplitCollapsed] = useState(false);
	const [lineMetaDrafts, setLineMetaDrafts] = useState({});
	const [multiVocalMode, setMultiVocalMode] = useState(false);
	const [pendingMultiVocalDecision, setPendingMultiVocalDecision] = useState(null);
	const [syncData, setSyncData] = useState(null);
	const [furiganaRevision, setFuriganaRevision] = useState(0);
	const [characterPronunciations, setCharacterPronunciations] = useState(null);
	const [showCharacterPronunciations, setShowCharacterPronunciations] = useState(false);
	const [isCharacterPronunciationPrimary, setIsCharacterPronunciationPrimary] = useState(false);
	const [isGeneratingCharacterPronunciations, setIsGeneratingCharacterPronunciations] = useState(false);
	const [characterPronunciationProgress, setCharacterPronunciationProgress] = useState(null);
	const [showCharacterPronunciationConsent, setShowCharacterPronunciationConsent] = useState(false);
	const [mode, setMode] = useState('idle');
	const [position, setPosition] = useState(0);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [recordingCharIndex, setRecordingCharIndex] = useState(-1);
	const [recordingLockIndex, setRecordingLockIndex] = useState(-1);
	const [dragStartTime, setDragStartTime] = useState(null);
	const [dragStartCharIndex, setDragStartCharIndex] = useState(-1);
	const [isDragging, setIsDragging] = useState(false);
	const [globalOffset, setGlobalOffset] = useState(0);
	const [availableProviders, setAvailableProviders] = useState([]);
	const [lrclibCandidates, setLrclibCandidates] = useState([]);
	const [selectedLrclibCandidateKey, setSelectedLrclibCandidateKey] = useState('');
	const [selectedLrclibSource, setSelectedLrclibSource] = useState(null);
	const [previewLrclibCandidateKey, setPreviewLrclibCandidateKey] = useState('');
	const [lrclibSearchMeta, setLrclibSearchMeta] = useState(null);
	const [showLrclibCandidates, setShowLrclibCandidates] = useState(true);
	const [lrclibIdInput, setLrclibIdInput] = useState('');
	const [isLoadingLrclibId, setIsLoadingLrclibId] = useState(false);
	const [lrclibSearchQuery, setLrclibSearchQuery] = useState('');
	const [isSearchingLrclib, setIsSearchingLrclib] = useState(false);
	const [showBulkCustomSpeakerDialog, setShowBulkCustomSpeakerDialog] = useState(false);
	const [bulkCustomSpeakerFallback, setBulkCustomSpeakerFallback] = useState(SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK);
	const [bulkCustomSpeakerColor, setBulkCustomSpeakerColor] = useState(() => (
		getSyncCreatorCustomSpeakerDefaultColor('CUSTOM', SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK)
	));

	// Refs
	const containerRef = useRef(null);
	const lyricsScrollRef = useRef(null);
	const positionUpdateTimerRef = useRef(null);
	const charTimesRef = useRef([]);
	const charElementsRef = useRef([]);
	const charHitBoxesRef = useRef([]);
	const charScrollMetricsRef = useRef([]);
	const rtlTextRunRef = useRef(null);
	const recordingCharIndexRef = useRef(-1);
	const recordingLockIndexRef = useRef(-1);
	const lastPaintedRecordingIndexRef = useRef(-1);
	const recordingVisualIndexRef = useRef(-1);
	const recordingVisualTargetIndexRef = useRef(-1);
	const recordingVisualFrameRef = useRef(null);
	const recordingVisualFrameTimeRef = useRef(0);
	const lastPaintedPlaybackIndexRef = useRef(-1);
	const preventNextTrackRef = useRef(false);
	const providerRef = useRef(provider);
	const selectedLrclibSourceRef = useRef(selectedLrclibSource);
	const customSpeakerMetaMemoryRef = useRef(new Map());

	const setProviderValue = useCallback((nextProvider = '') => {
		const normalizedProvider = nextProvider || '';
		providerRef.current = normalizedProvider;
		setProvider(normalizedProvider);
	}, []);

	const setSelectedLrclibSourceValue = useCallback((nextSource = null) => {
		const normalizedSource = nextSource || null;
		selectedLrclibSourceRef.current = normalizedSource;
		setSelectedLrclibSource(normalizedSource);
	}, []);

	const setRecordingLockIndexValue = useCallback((index) => {
		const safeIndex = Number.isInteger(index) && index >= 0 ? index : -1;
		recordingLockIndexRef.current = safeIndex;
		setRecordingLockIndex(safeIndex);
	}, []);

	const clearRecordingLock = useCallback(() => {
		recordingLockIndexRef.current = -1;
		setRecordingLockIndex(-1);
	}, []);

	// 트랙 정보
	const trackUri = trackInfo?.uri || Spicetify.Player?.data?.item?.uri;
	const trackId = Utils.extractTrackId(trackUri) || '';
	const spotifyDataForTrack = (() => {
		try {
			return window.SpotifyDataHelper?.extractSpotifyData?.(trackUri || (trackId ? `spotify:track:${trackId}` : '')) || null;
		} catch (e) {
			return null;
		}
	})();
	const trackIsrc = normalizeSyncCreatorIsrc(
		trackInfo?.external_ids?.isrc
		|| trackInfo?.externalIds?.isrc
		|| trackInfo?.metadata?.isrc
		|| trackInfo?.item?.metadata?.isrc
		|| spotifyDataForTrack?.isrc
		|| window.SyncDataService?.getTrackIsrc?.(trackId, trackInfo)
	);
	const trackName = trackInfo?.name || Spicetify.Player?.data?.item?.name || '';
	const artistName = trackInfo?.artists?.map(a => a.name).join(', ') ||
		Spicetify.Player?.data?.item?.artists?.map(a => a.name).join(', ') || '';
	const albumName = trackInfo?.album?.name ||
		Spicetify.Player?.data?.item?.album?.name ||
		spotifyDataForTrack?.album ||
		spotifyDataForTrack?.albumName ||
		'';
	const trackDurationMs = Math.max(0, Math.round(Number(
		trackInfo?.duration?.milliseconds
		|| trackInfo?.durationMs
		|| trackInfo?.duration_ms
		|| trackInfo?.duration
		|| Spicetify.Player?.data?.item?.duration?.milliseconds
		|| Spicetify.Player?.getDuration?.()
		|| 0
	) || 0));
	const isVirtualKaraokeSource =
		lyrics?.karaokeSource === 'spotify-audio-analysis' ||
		lyrics?.karaokeSource === 'audio-analysis-pseudo' ||
		lyrics?.karaokeSource === 'line-timing-pseudo';
	const albumArt = trackInfo?.album?.images?.[0]?.url ||
		Spicetify.Player?.data?.item?.album?.images?.[0]?.url || '';

	const stripLrclibTimestamp = useCallback((text) => {
		if (!text || typeof text !== 'string') return '';
		const trimmed = text.trim();
		if (SYNC_CREATOR_LRC_METADATA_LINE_REGEX.test(trimmed)) return '';
		return trimmed.replace(/^\[\d+:\d+(?:[.,]\d+)?\]\s*/, '').trim();
	}, []);

	const extractLyricsText = useCallback((lyricsSource) => {
		let text = '';

		if (Array.isArray(lyricsSource)) {
			text = lyricsSource.map(line => {
				if (typeof line === 'string') return line;
				if (line.originalText && typeof line.originalText === 'string' && line.originalText.trim().length > 0) return line.originalText;
				if (line.text) return typeof line.text === 'string' ? line.text : '';
				return '';
			}).filter(t => t.trim().length > 0).join('\n');
		} else if (typeof lyricsSource === 'string') {
			text = lyricsSource;
		}

		return text ? normalizeSyncCreatorStandaloneParentheticalLines(text) : '';
	}, []);

	const buildLineObjectsFromText = useCallback((text) => {
		if (!text || typeof text !== 'string') return [];
		return text
			.split('\n')
			.map(line => line.trim())
			.filter(Boolean)
			.map(line => ({ text: line.normalize('NFC') }));
	}, []);

	const getLrclibCandidateText = useCallback((candidate) => {
		if (!candidate) return '';

		const usePlain = candidate.preferredLyricsSource === 'plain' && candidate.plainLyrics;
		const sourceText = usePlain
			? candidate.plainLyrics
			: (candidate.syncedLyrics || candidate.plainLyrics || '');

		if (!sourceText) return '';

		if (usePlain || !candidate.syncedLyrics) {
			return normalizeSyncCreatorStandaloneParentheticalLines(sourceText
				.split('\n')
				.map(line => stripLrclibTimestamp(line))
				.filter(Boolean)
				.join('\n'));
		}

		return normalizeSyncCreatorStandaloneParentheticalLines(sourceText
			.split('\n')
			.map(line => stripLrclibTimestamp(line))
			.filter(Boolean)
			.join('\n'));
	}, [stripLrclibTimestamp]);

	const getSyncCreatorLyricsFingerprint = useCallback((text) => {
		const value = String(text || '').normalize('NFC');
		let hash = 2166136261;
		for (const char of Array.from(value)) {
			hash ^= char.codePointAt(0) || 0;
			hash = Math.imul(hash, 16777619);
		}
		return `lrclib-${(hash >>> 0).toString(36)}-${Array.from(value).length.toString(36)}`;
	}, []);

	const buildLrclibSyncSource = useCallback((candidate) => {
		if (!candidate) return null;
		const text = getLrclibCandidateText(candidate).normalize('NFC');
		const comparableLines = text
			.split('\n')
			.map(line => line.trim().normalize('NFC'))
			.filter(Boolean);
		const comparableText = comparableLines.join('\n');
		const lineCharCounts = comparableLines
			.map(line => Array.from(line).length);
		const preferredLyricsSource = candidate.preferredLyricsSource
			|| (candidate.syncedLyrics ? 'synced' : (candidate.plainLyrics ? 'plain' : 'unknown'));

		return {
			provider: 'lrclib',
			lrclibId: candidate.id ?? null,
			searchSource: candidate.searchSource || '',
			preferredLyricsSource,
			trackName: candidate.trackName || candidate.name || '',
			artistName: candidate.artistName || '',
			albumName: candidate.albumName || '',
			duration: Number(candidate.duration || 0) || 0,
			lyricsFingerprint: getSyncCreatorLyricsFingerprint(comparableText),
			lineCharCounts,
			lineCount: lineCharCounts.length,
			textCharCount: Array.from(comparableLines.join('')).length
		};
	}, [getLrclibCandidateText, getSyncCreatorLyricsFingerprint]);

	const buildSyntheticLrclibResult = useCallback((candidate) => {
		const text = getLrclibCandidateText(candidate);
		const lines = buildLineObjectsFromText(text);
		return {
			provider: 'lrclib',
			lrclibSource: buildLrclibSyncSource(candidate),
			synced: candidate?.preferredLyricsSource === 'synced' ? lines : null,
			unsynced: lines
		};
	}, [buildLineObjectsFromText, buildLrclibSyncSource, getLrclibCandidateText]);

	const clearLrclibCandidateState = useCallback(() => {
		setLrclibCandidates([]);
		setSelectedLrclibCandidateKey('');
		setSelectedLrclibSourceValue(null);
		setPreviewLrclibCandidateKey('');
		setLrclibSearchMeta(null);
	}, [setSelectedLrclibSourceValue]);

	const applyLoadedLyricsResult = useCallback(async (result, usedProvider) => {
		let finalProvider = result.provider || usedProvider;
		let loadedSyncBody = null;

		setManualParallelSplitDrafts({});
		setParentheticalLayoutDrafts({});
		setPendingParentheticalLayoutDecision(null);
		setMergedLineDrafts({});
		if ((finalProvider === 'Spotify' || finalProvider === 'spotify') && result.spotifyLyricsProvider) {
			finalProvider = `spotify-${result.spotifyLyricsProvider}`;
		}

		setProviderValue(finalProvider);
		setAddonId(usedProvider);
		setLyrics(result);
		setSelectedLrclibSourceValue(finalProvider === 'lrclib' ? (result?.lrclibSource || null) : null);

		if (window.SyncDataService && trackId) {
			try {
				const existingSyncData = await window.SyncDataService.getSyncData(trackId, finalProvider, {
					isrc: trackIsrc || undefined,
					title: trackName,
					artist: artistName,
					album: albumName
				});
				if (existingSyncData && existingSyncData.syncData && existingSyncData.syncData.lines) {
					window.__ivLyricsDebugLog?.('[SyncDataCreator] Found matching existing sync data');
					loadedSyncBody = existingSyncData.syncData;
				}
			} catch (e) {
				console.warn('[SyncDataCreator] Failed to load existing sync data:', e);
			}
		}

		const text = extractLyricsText(result.synced || result.unsynced);
		if (loadedSyncBody) {
			const normalizedLoadedSyncBody = normalizeLoadedSyncCreatorBodyForLyrics(loadedSyncBody, text);
			if (normalizedLoadedSyncBody !== loadedSyncBody) {
				window.__ivLyricsDebugLog?.('[SyncDataCreator] Trimmed leading sync-data source lines for current lyrics');
			}
			loadedSyncBody = sanitizeSyncCreatorSyncData(
				normalizedLoadedSyncBody,
				getSyncCreatorFlatLyricsCharsFromText(text)
			);
			if (loadedSyncBody) {
				setSyncData(loadedSyncBody);
				Toast.success(I18n.t('syncCreator.loadedExistingSyncData') || 'Loaded existing sync data');
			}
		}
		if (text.trim().length > 0) {
			const existingHasParallel = Array.isArray(loadedSyncBody?.lines)
				&& loadedSyncBody.lines.some(line => Array.isArray(line?.parallel?.parts) && line.parallel.parts.length > 1);
			const detectedParallel = detectSyncCreatorParallelVocalHints(text);
			if (!existingHasParallel && detectedParallel) {
				setPendingMultiVocalDecision({
					text,
					preview: text.split('\n').find(line => SYNC_CREATOR_PARALLEL_HINT_REGEX.test(line.trim())) || ''
				});
				setError(null);
				return;
			}
			const shouldUseMultiVocalMode = existingHasParallel;
			setMultiVocalMode(shouldUseMultiVocalMode);
			setActiveParallelPartId(shouldUseMultiVocalMode ? '' : 'full');
			setLyricsText(text);
			setError(null);
		} else {
			setPendingMultiVocalDecision(null);
			setMultiVocalMode(false);
			setError(I18n.t('syncCreator.noLyrics'));
		}
	}, [extractLyricsText, trackId, trackIsrc, trackName, artistName, albumName, setProviderValue, setSelectedLrclibSourceValue]);

	const resolveMultiVocalDecision = useCallback((useMultiVocalMode) => {
		if (!pendingMultiVocalDecision) return;
		setPendingMultiVocalDecision(null);
		setManualParallelSplitDrafts({});
		setParentheticalLayoutDrafts({});
		setPendingParentheticalLayoutDecision(null);
		setMergedLineDrafts({});
		setMultiVocalMode(useMultiVocalMode);
		setActiveParallelPartId(useMultiVocalMode ? '' : 'full');
		setLyricsText(pendingMultiVocalDecision.text);
		setError(null);
	}, [pendingMultiVocalDecision]);

	const previewLrclibCandidate = useMemo(() => {
		if (!lrclibCandidates.length) return null;
		return lrclibCandidates.find(candidate => candidate.candidateKey === previewLrclibCandidateKey)
			|| lrclibCandidates.find(candidate => candidate.candidateKey === selectedLrclibCandidateKey)
			|| lrclibCandidates[0]
			|| null;
	}, [lrclibCandidates, previewLrclibCandidateKey, selectedLrclibCandidateKey]);

	const applySelectedLrclibCandidate = useCallback(async (candidateKey) => {
		const candidate = lrclibCandidates.find(item => item.candidateKey === candidateKey);
		if (!candidate) return;

		setIsLoading(true);
		setError(null);
		setLyrics(null);
		setLyricsText('');
		setSyncData(null);
		setCurrentLineIndex(0);
		setMultiVocalMode(false);
		setManualParallelSplitDrafts({});
		setParentheticalLayoutDrafts({});
		setPendingParentheticalLayoutDecision(null);
		setMergedLineDrafts({});
		setPendingMultiVocalDecision(null);
		setActiveParallelPartId('full');
		setMode('idle');

		try {
			const syntheticResult = buildSyntheticLrclibResult(candidate);
			await applyLoadedLyricsResult(syntheticResult, 'lrclib');
			setSelectedLrclibCandidateKey(candidate.candidateKey);
			setSelectedLrclibSourceValue(syntheticResult.lrclibSource || buildLrclibSyncSource(candidate));
			setPreviewLrclibCandidateKey(candidate.candidateKey);
		} catch (e) {
			console.error('[SyncDataCreator] Failed to apply LRCLIB candidate:', e);
			setError(I18n.t('syncCreator.loadError'));
		}

		setIsLoading(false);
	}, [applyLoadedLyricsResult, buildLrclibSyncSource, buildSyntheticLrclibResult, lrclibCandidates, setSelectedLrclibSourceValue]);

	const buildLrclibIdCandidate = useCallback((candidate, requestedId) => {
		if (!candidate) return null;
		const preferredLyricsSource = candidate.syncedLyrics ? 'synced' : (candidate.plainLyrics ? 'plain' : 'unknown');
		const baseCandidate = {
			...candidate,
			id: candidate.id ?? requestedId,
			preferredLyricsSource,
			searchSource: 'id'
		};
		const previewText = getLrclibCandidateText(baseCandidate);
		const previewLines = previewText
			.split('\n')
			.map(line => line.trim())
			.filter(Boolean);
		const durationMs = Number(
			trackInfo?.duration?.milliseconds
			|| Spicetify.Player?.data?.item?.duration?.milliseconds
			|| 0
		);
		const trackDurationSec = durationMs > 0 ? durationMs / 1000 : 0;

		return {
			...baseCandidate,
			candidateKey: `id:0:${candidate.id ?? requestedId}:${getSyncCreatorLyricsFingerprint(previewText)}`,
			trackName: candidate.trackName || candidate.name || trackName,
			artistName: candidate.artistName || artistName,
			albumName: candidate.albumName || '',
			previewText,
			previewLineCount: previewLines.length,
			hasSyncedLyrics: !!candidate.syncedLyrics,
			hasPlainLyrics: !!candidate.plainLyrics,
			artistScore: 1,
			titleScore: 1,
			durationDiff: trackDurationSec > 0 ? Math.abs(Number(candidate.duration || 0) - trackDurationSec) : 0,
			isSelectedByDefault: true
		};
	}, [artistName, getLrclibCandidateText, getSyncCreatorLyricsFingerprint, trackInfo, trackName]);

	const buildLrclibSearchCandidate = useCallback((candidate, index, sourceLabel = 'manual') => {
		const requestedId = candidate?.id ?? `manual-${index}`;
		const baseCandidate = buildLrclibIdCandidate(candidate, requestedId);
		if (!baseCandidate) return null;
		const previewText = baseCandidate.previewText || getLrclibCandidateText(baseCandidate);
		return {
			...baseCandidate,
			candidateKey: `${sourceLabel}:${index}:${candidate?.id ?? requestedId}:${getSyncCreatorLyricsFingerprint(previewText)}`,
			searchSource: sourceLabel,
			isSelectedByDefault: index === 0
		};
	}, [buildLrclibIdCandidate, getLrclibCandidateText, getSyncCreatorLyricsFingerprint]);

	const loadLrclibById = useCallback(async () => {
		const lrclibId = String(lrclibIdInput || '').trim();
		if (!/^\d+$/.test(lrclibId)) {
			Toast.error(I18n.t('syncCreator.lrclibIdInvalid') || 'Enter a valid LRCLIB ID.');
			return;
		}

		setIsLoadingLrclibId(true);
		setIsLoading(true);
		setError(null);
		setLyrics(null);
		setLyricsText('');
		setSyncData(null);
		setCurrentLineIndex(0);
		setMultiVocalMode(false);
		setManualParallelSplitDrafts({});
		setParentheticalLayoutDrafts({});
		setPendingParentheticalLayoutDecision(null);
		setMergedLineDrafts({});
		setPendingMultiVocalDecision(null);
		setActiveParallelPartId('full');
		setMode('idle');
		clearLrclibCandidateState();

		try {
			const response = await fetch(`https://lrclib.net/api/get/${encodeURIComponent(lrclibId)}`, {
				headers: {
					'x-user-agent': `spicetify v${Spicetify.Config?.version || 'unknown'}`
				}
			});
			if (!response.ok) {
				throw new Error(`LRCLIB ${response.status}`);
			}

			const candidate = await response.json();
			if (!candidate || (!candidate.syncedLyrics && !candidate.plainLyrics)) {
				throw new Error('No lyrics found');
			}

			const decoratedCandidate = buildLrclibIdCandidate(candidate, lrclibId);
			if (!decoratedCandidate || !getLrclibCandidateText(decoratedCandidate).trim()) {
				throw new Error('No lyrics found');
			}

			const syntheticResult = buildSyntheticLrclibResult(decoratedCandidate);
			setAddonId('lrclib');
			setProviderValue('lrclib');
			setLrclibCandidates([decoratedCandidate]);
			setSelectedLrclibCandidateKey(decoratedCandidate.candidateKey);
			setPreviewLrclibCandidateKey(decoratedCandidate.candidateKey);
			setLrclibSearchMeta({
				success: true,
				totalResults: 1,
				selectedCandidateKey: decoratedCandidate.candidateKey,
				selectedSource: 'id',
				searchMode: 'id',
				directLrclibId: lrclibId
			});
			setShowLrclibCandidates(true);
			await applyLoadedLyricsResult(syntheticResult, 'lrclib');
			setSelectedLrclibSourceValue(syntheticResult.lrclibSource || buildLrclibSyncSource(decoratedCandidate));
			Toast.success(I18n.t('syncCreator.lrclibIdLoadSuccess') || 'Loaded lyrics from LRCLIB ID.');
		} catch (e) {
			console.error('[SyncDataCreator] Failed to load LRCLIB ID:', e);
			setError(I18n.t('syncCreator.lrclibIdLoadError') || 'Failed to load lyrics from LRCLIB ID.');
			Toast.error((I18n.t('syncCreator.lrclibIdLoadError') || 'Failed to load lyrics from LRCLIB ID.') + ': ' + e.message);
		}

		setIsLoading(false);
		setIsLoadingLrclibId(false);
	}, [
		applyLoadedLyricsResult,
		buildLrclibIdCandidate,
		buildLrclibSyncSource,
		buildSyntheticLrclibResult,
		clearLrclibCandidateState,
		getLrclibCandidateText,
		lrclibIdInput,
		setProviderValue,
		setSelectedLrclibSourceValue
	]);

	const searchLrclibByQuery = useCallback(async () => {
		const query = String(lrclibSearchQuery || '').trim();
		if (!query) {
			Toast.error(I18n.t('syncCreator.lrclibSearchQueryRequired') || 'Enter a LRCLIB search query.');
			return;
		}

		setIsSearchingLrclib(true);
		setError(null);
		try {
			const params = new URLSearchParams({ q: query });
			const response = await fetch(`https://lrclib.net/api/search?${params.toString()}`, {
				headers: {
					'x-user-agent': `spicetify v${Spicetify.Config?.version || 'unknown'}`
				}
			});
			if (!response.ok) {
				throw new Error(`LRCLIB ${response.status}`);
			}

			const body = await response.json();
			const candidates = (Array.isArray(body) ? body : [])
				.map((candidate, index) => buildLrclibSearchCandidate(candidate, index, 'manual'))
				.filter(candidate => candidate && getLrclibCandidateText(candidate).trim().length > 0);
			setLrclibCandidates(candidates);
			setPreviewLrclibCandidateKey(candidates[0]?.candidateKey || '');
			setSelectedLrclibCandidateKey(prev => (
				candidates.some(candidate => candidate.candidateKey === prev) ? prev : ''
			));
			setLrclibSearchMeta({
				success: candidates.length > 0,
				totalResults: candidates.length,
				selectedCandidateKey: candidates[0]?.candidateKey || null,
				selectedSource: 'manual',
				searchMode: 'manual',
				manualQuery: query,
				error: candidates.length > 0 ? null : (I18n.t('syncCreator.lrclibNoCandidates') || 'No LRCLIB candidates found')
			});
			setShowLrclibCandidates(true);
		} catch (e) {
			console.error('[SyncDataCreator] Failed to search LRCLIB:', e);
			setLrclibCandidates([]);
			setPreviewLrclibCandidateKey('');
			setLrclibSearchMeta({
				success: false,
				totalResults: 0,
				selectedCandidateKey: null,
				selectedSource: 'manual',
				searchMode: 'manual',
				manualQuery: query,
				error: (I18n.t('syncCreator.lrclibSearchError') || 'Failed to search LRCLIB') + ': ' + e.message
			});
			setShowLrclibCandidates(true);
		}
		setIsSearchingLrclib(false);
	}, [buildLrclibSearchCandidate, getLrclibCandidateText, lrclibSearchQuery]);

	// 가사를 줄 단위로 파싱
	// NFC 정규화를 적용하여 결합 문자(NFD)를 합성 문자로 변환
	// 예: "e" + 결합 액센트 -> "é" (1개 코드포인트)
	const lyricsLines = useMemo(() => {
		if (!lyricsText) return [];
		return lyricsText.split('\n')
			.filter(line => line.trim().length > 0)
			.map(line => line.normalize('NFC'));
	}, [lyricsText]);
	const lyricsFullTextChars = useMemo(
		() => getSyncCreatorFlatLyricsCharsFromLines(lyricsLines),
		[lyricsLines]
	);

	useEffect(() => {
		setCharacterPronunciations(null);
		setShowCharacterPronunciations(false);
		setIsGeneratingCharacterPronunciations(false);
	}, [lyricsText]);

	const totalChars = useMemo(() => {
		// NFC 정규화된 lyricsLines를 사용하므로 Array.from()이 정확한 문자 수를 반환
		return lyricsLines.reduce((sum, line) => sum + Array.from(line).length, 0);
	}, [lyricsLines]);

	const syncedChars = useMemo(() => {
		if (!syncData || !syncData.lines) return 0;
		return syncData.lines.reduce((sum, line) => sum + (line.chars?.length || 0), 0);
	}, [syncData]);

	const lineCharOffsets = useMemo(() => {
		const offsets = [];
		let total = 0;
		lyricsLines.forEach((line) => {
			offsets.push(total);
			total += Array.from(line).length;
		});
		return offsets;
	}, [lyricsLines]);
	const lineIndexByStart = useMemo(() => {
		const map = new Map();
		lineCharOffsets.forEach((start, index) => map.set(start, index));
		return map;
	}, [lineCharOffsets]);

	const currentLineStart = lineCharOffsets[currentLineIndex] ?? 0;
	const currentBaseLineChars = useMemo(() => {
		if (currentLineIndex < 0 || currentLineIndex >= lyricsLines.length) return [];
		return Array.from(lyricsLines[currentLineIndex]);
	}, [lyricsLines, currentLineIndex]);
	const currentExistingLineData = useMemo(() => {
		if (!Array.isArray(syncData?.lines)) return null;
		return syncData.lines.find(line => line.start === currentLineStart) || null;
	}, [syncData, currentLineStart]);
	const getLineEndAtIndex = useCallback((index) => {
		if (index < 0 || index >= lyricsLines.length) return -1;
		const lineStart = lineCharOffsets[index];
		const lineChars = Array.from(lyricsLines[index] || '');
		return Number.isInteger(lineStart) && lineChars.length > 0
			? lineStart + lineChars.length - 1
			: -1;
	}, [lineCharOffsets, lyricsLines]);
	const normalizeMergedLineDraftStarts = useCallback((value) => {
		const rawStarts = Array.isArray(value)
			? value
			: Number.isInteger(Number(value))
				? [Number(value)]
				: [];
		return [...new Set(rawStarts
			.map(start => Number(start))
			.filter(start => Number.isInteger(start)))]
			.sort((a, b) => a - b)
			.slice(0, SYNC_CREATOR_MAX_MERGED_LINES - 1);
	}, []);
	const lineHasParallelRangeOverlapping = useCallback((line, lineStart, lineEnd) => (
		Array.isArray(line?.parallel?.parts)
		&& line.parallel.parts.some(part =>
			Array.isArray(part?.ranges)
			&& part.ranges.some((range) => {
				const rangeStart = Number(range?.start);
				const rangeEnd = Number(range?.end);
				return Number.isInteger(rangeStart)
					&& Number.isInteger(rangeEnd)
					&& rangeStart <= lineEnd
					&& rangeEnd >= lineStart;
			})
		)
	), []);
	const getMergedLineIndexesForStart = useCallback((startIndex, linesByStartOverride = null) => {
		if (startIndex < 0 || startIndex >= lyricsLines.length) return [];
		const lineStart = lineCharOffsets[startIndex];
		if (!Number.isInteger(lineStart)) return [startIndex];

		const getIndexesFromMergedStarts = (mergedStarts) => {
			const indexes = [startIndex];
			for (let index = startIndex + 1; index < lyricsLines.length && indexes.length < SYNC_CREATOR_MAX_MERGED_LINES; index++) {
				const nextStart = lineCharOffsets[index];
				if (mergedStarts.includes(nextStart)) {
					indexes.push(index);
					continue;
				}
				break;
			}
			return indexes;
		};

		const draftStarts = normalizeMergedLineDraftStarts(mergedLineDrafts[lineStart]);
		if (draftStarts.length > 0) return getIndexesFromMergedStarts(draftStarts);

		const linesByStart = linesByStartOverride
			|| new Map((Array.isArray(syncData?.lines) ? syncData.lines : []).map(line => [line.start, line]));
		const lineData = linesByStart.get(lineStart);
		if (!lineData) return [startIndex];

		const persistedMergedStarts = normalizeMergedLineDraftStarts(lineData.mergedLineContinuationStarts);
		if (persistedMergedStarts.length > 0) {
			const indexes = getIndexesFromMergedStarts(persistedMergedStarts);
			if (indexes.length > 1) return indexes;
		}

		if (!Array.isArray(lineData.parallel?.parts)) return [startIndex];

		const indexes = [startIndex];
		for (let index = startIndex + 1; index < lyricsLines.length && indexes.length < SYNC_CREATOR_MAX_MERGED_LINES; index++) {
			const nextStart = lineCharOffsets[index];
			const nextEnd = getLineEndAtIndex(index);
			if (!Number.isInteger(nextStart) || nextEnd < nextStart || Number(lineData.end) < nextEnd) break;
			if (!lineHasParallelRangeOverlapping(lineData, nextStart, nextEnd)) break;
			indexes.push(index);
		}
		return indexes;
	}, [
		getLineEndAtIndex,
		lineCharOffsets,
		lineHasParallelRangeOverlapping,
		lyricsLines.length,
		mergedLineDrafts,
		normalizeMergedLineDraftStarts,
		syncData
	]);
	const findMergedOwnerLineIndex = useCallback((index, linesByStartOverride = null) => {
		if (index <= 0 || index >= lyricsLines.length) return -1;
		const minIndex = Math.max(0, index - SYNC_CREATOR_MAX_MERGED_LINES + 1);
		for (let ownerIndex = index - 1; ownerIndex >= minIndex; ownerIndex--) {
			const mergedIndexes = getMergedLineIndexesForStart(ownerIndex, linesByStartOverride);
			if (mergedIndexes.includes(index)) return ownerIndex;
		}
		return -1;
	}, [getMergedLineIndexesForStart, lyricsLines.length]);
	const currentMergedLineIndexes = useMemo(
		() => getMergedLineIndexesForStart(currentLineIndex),
		[getMergedLineIndexesForStart, currentLineIndex]
	);
	const currentLineMergedWithNext = currentMergedLineIndexes.length > 1;
	const isLineCoveredByMergedPrevious = useCallback((index, linesByStartOverride = null) => {
		return findMergedOwnerLineIndex(index, linesByStartOverride) >= 0;
	}, [findMergedOwnerLineIndex]);
	const currentLineCoveredByPrevious = useMemo(
		() => isLineCoveredByMergedPrevious(currentLineIndex),
		[isLineCoveredByMergedPrevious, currentLineIndex]
	);
	const findNavigableLineIndex = useCallback((fromIndex, direction) => {
		const step = direction < 0 ? -1 : 1;
		for (let index = fromIndex + step; index >= 0 && index < lyricsLines.length; index += step) {
			if (!isLineCoveredByMergedPrevious(index)) return index;
		}
		return -1;
	}, [lyricsLines.length, isLineCoveredByMergedPrevious]);
	const previousNavigableLineIndex = useMemo(
		() => findNavigableLineIndex(currentLineIndex, -1),
		[findNavigableLineIndex, currentLineIndex]
	);
	const nextNavigableLineIndex = useMemo(
		() => findNavigableLineIndex(currentLineIndex, 1),
		[findNavigableLineIndex, currentLineIndex]
	);
	const currentFullLineChars = useMemo(() => {
		if (!currentLineMergedWithNext) return currentBaseLineChars;
		return currentMergedLineIndexes.flatMap(index => Array.from(lyricsLines[index] || ''));
	}, [currentBaseLineChars, currentLineMergedWithNext, currentMergedLineIndexes, lyricsLines]);
	const getAutoMergeSplitPointsForLine = useCallback((lineStart) => {
		const startIndex = lineCharOffsets.indexOf(lineStart);
		if (startIndex < 0) return [];
		const mergedIndexes = getMergedLineIndexesForStart(startIndex);
		if (mergedIndexes.length <= 1) return [];

		const splitPoints = [];
		let offset = 0;
		for (let index = 0; index < mergedIndexes.length - 1; index++) {
			offset += Array.from(lyricsLines[mergedIndexes[index]] || '').length;
			if (offset > 0) splitPoints.push(offset);
		}
		return splitPoints;
	}, [getMergedLineIndexesForStart, lineCharOffsets, lyricsLines]);
	const currentAutoMergeSplitPoints = useMemo(
		() => getAutoMergeSplitPointsForLine(currentLineStart),
		[getAutoMergeSplitPointsForLine, currentLineStart]
	);
	const currentAutoMergeSplitPointSet = useMemo(
		() => new Set(currentAutoMergeSplitPoints),
		[currentAutoMergeSplitPoints]
	);
	const currentNextMergeLineIndex = currentMergedLineIndexes.length > 0
		? currentMergedLineIndexes[currentMergedLineIndexes.length - 1] + 1
		: currentLineIndex + 1;
	const canMergeCurrentLineWithNext = !currentLineCoveredByPrevious
		&& currentMergedLineIndexes.length < SYNC_CREATOR_MAX_MERGED_LINES
		&& currentNextMergeLineIndex < lyricsLines.length;
	const currentLineMeta = useMemo(() => {
		const draft = lineMetaDrafts[currentLineStart] || {};
		const speakerMeta = resolveSyncCreatorDraftSpeakerMeta({
			draft,
			source: currentExistingLineData
		});
		return {
			...speakerMeta,
			kind: normalizeSyncCreatorKind(draft.kind || currentExistingLineData?.kind) || SYNC_CREATOR_DEFAULT_KIND
		};
	}, [lineMetaDrafts, currentLineStart, currentExistingLineData]);
	const getParallelTemplateForLine = useCallback((lineChars, lineStart) => {
		const splitPoints = [
			...getAutoMergeSplitPointsForLine(lineStart),
			...(Array.isArray(manualParallelSplitDrafts[lineStart]) ? manualParallelSplitDrafts[lineStart] : [])
		];
		const manualTemplate = buildManualParallelTemplate(lineChars, lineStart, splitPoints);
		if (manualTemplate) return manualTemplate;
		return buildParentheticalParallelTemplate(lineChars, lineStart, {
			groupBackgroundParts: parentheticalLayoutDrafts[lineStart] === 'grouped'
		});
	}, [getAutoMergeSplitPointsForLine, manualParallelSplitDrafts, parentheticalLayoutDrafts]);
	const getParallelTemplateForLineData = useCallback((lineData, lineChars, lineStart, isMergedWithNext = false) => {
		const hasManualDraft = Array.isArray(manualParallelSplitDrafts[lineStart])
			&& manualParallelSplitDrafts[lineStart].length > 0;
		if (!hasManualDraft && Array.isArray(lineData?.parallel?.parts) && lineData.parallel.parts.length > 1) {
			const textTemplate = getParallelTemplateForLine(lineChars, lineStart);
			if (textTemplate && textTemplate.parts.length > lineData.parallel.parts.length) {
				return textTemplate;
			}
			return lineData.parallel;
		}

		return getParallelTemplateForLine(lineChars, lineStart)
			|| (isMergedWithNext ? lineData?.parallel : null);
	}, [getParallelTemplateForLine, manualParallelSplitDrafts]);
	const currentParallelTemplate = useMemo(() => {
		if (!multiVocalMode) return null;
		return getParallelTemplateForLineData(
			currentExistingLineData,
			currentFullLineChars,
			currentLineStart,
			currentLineMergedWithNext
		);
	}, [multiVocalMode, getParallelTemplateForLineData, currentFullLineChars, currentLineStart, currentLineMergedWithNext, currentExistingLineData]);
	const currentParallelData = useMemo(() => {
		const merged = mergeSyncCreatorParallelTemplate(currentParallelTemplate, currentExistingLineData?.parallel);
		if (!merged) return null;
		const existingParts = Array.isArray(currentExistingLineData?.parallel?.parts)
			? currentExistingLineData.parallel.parts
			: [];
		const currentLineDraft = lineMetaDrafts[currentLineStart] || {};
		const hasExplicitLineSpeaker = Object.prototype.hasOwnProperty.call(currentLineDraft, 'speaker')
			|| Object.prototype.hasOwnProperty.call(currentExistingLineData || {}, 'speaker');
		return {
			...merged,
			parts: merged.parts.map((part) => {
				const draft = parallelPartMetaDrafts[`${currentLineStart}:${part.id}`] || {};
				const existingPart = existingParts.find(item => item?.id === part.id);
				const speakerMeta = resolveSyncCreatorDraftSpeakerMeta({
					draft,
					source: part,
					inheritedSource: currentLineMeta,
					inheritSource: hasExplicitLineSpeaker && !existingPart
				});
				return {
					...part,
					...speakerMeta,
					kind: normalizeSyncCreatorKind(draft.kind || part.kind) || SYNC_CREATOR_DEFAULT_KIND
				};
			})
		};
	}, [
		currentParallelTemplate,
		currentExistingLineData,
		parallelPartMetaDrafts,
		lineMetaDrafts,
		currentLineStart,
		currentLineMeta
	]);
	const currentParallelParts = currentParallelData?.parts || [];
	const hasCurrentParallelParts = currentParallelParts.length > 1;
	const currentParentheticalLayoutCandidate = useMemo(() => {
		if (
			!multiVocalMode
			|| pendingMultiVocalDecision
			|| currentLineCoveredByPrevious
			|| currentLineMergedWithNext
			|| currentFullLineChars.length < 2
			|| Object.prototype.hasOwnProperty.call(parentheticalLayoutDrafts, currentLineStart)
			|| (Array.isArray(manualParallelSplitDrafts[currentLineStart]) && manualParallelSplitDrafts[currentLineStart].length > 0)
			|| (Array.isArray(currentExistingLineData?.parallel?.parts) && currentExistingLineData.parallel.parts.length > 1)
		) {
			return null;
		}

		const separateTemplate = buildParentheticalParallelTemplate(currentFullLineChars, currentLineStart, {
			groupBackgroundParts: false
		});
		const groupedTemplate = buildParentheticalParallelTemplate(currentFullLineChars, currentLineStart, {
			groupBackgroundParts: true
		});
		const groupedBackgroundPart = groupedTemplate?.parts?.find(part =>
			part.role === 'background'
			&& Array.isArray(part.ranges)
			&& part.ranges.length > 1
		);
		if (
			!separateTemplate
			|| !groupedTemplate
			|| !groupedBackgroundPart
			|| !Array.isArray(separateTemplate.parts)
			|| !Array.isArray(groupedTemplate.parts)
			|| separateTemplate.parts.length <= groupedTemplate.parts.length
		) {
			return null;
		}

		return {
			lineStart: currentLineStart,
			lineIndex: currentLineIndex,
			original: currentFullLineChars.join(''),
			separatePreview: formatSyncCreatorParallelPreviewLines(separateTemplate, currentFullLineChars, currentLineStart),
			groupedPreview: formatSyncCreatorParallelPreviewLines(groupedTemplate, currentFullLineChars, currentLineStart)
		};
	}, [
		multiVocalMode,
		pendingMultiVocalDecision,
		currentLineCoveredByPrevious,
		currentLineMergedWithNext,
		currentFullLineChars,
		currentLineStart,
		currentLineIndex,
		parentheticalLayoutDrafts,
		manualParallelSplitDrafts,
		currentExistingLineData
	]);
	useEffect(() => {
		if (!currentParentheticalLayoutCandidate || pendingParentheticalLayoutDecision) return;
		setPendingParentheticalLayoutDecision(currentParentheticalLayoutCandidate);
	}, [currentParentheticalLayoutCandidate, pendingParentheticalLayoutDecision]);
	const activeParallelPart = hasCurrentParallelParts
		? currentParallelParts.find(part => part.id === activeParallelPartId) || currentParallelParts[0] || null
		: null;
	const activeParallelTargetId = activeParallelPart?.id || (hasCurrentParallelParts ? currentParallelParts[0]?.id || 'full' : 'full');
	useEffect(() => {
		if (multiVocalMode && hasCurrentParallelParts) {
			const hasActivePart = currentParallelParts.some(part => part.id === activeParallelPartId);
			if (!hasActivePart) {
				setActiveParallelPartId(currentParallelParts[0]?.id || 'full');
			}
			return;
		}
		setActiveParallelPartId('full');
	}, [multiVocalMode, hasCurrentParallelParts, currentParallelParts, activeParallelPartId, currentLineIndex, lyricsText]);
	const getIncompleteParallelPartId = useCallback((lineData) => {
		if (!multiVocalMode || !currentParallelData || currentParallelParts.length <= 1) return null;
		const existingParts = Array.isArray(lineData?.parallel?.parts) ? lineData.parallel.parts : [];
		for (const part of currentParallelParts) {
			const existingPart = existingParts.find(item => item.id === part.id);
			const expectedChars = countRangeChars(part.ranges);
			if (!existingPart || !Array.isArray(existingPart.chars) || existingPart.chars.length !== expectedChars) {
				return part.id;
			}
			if (!isSyncCreatorSpeakerMetaComplete(existingPart) || !(normalizeSyncCreatorKind(existingPart.kind) || SYNC_CREATOR_DEFAULT_KIND)) {
				return part.id;
			}
		}
		return null;
	}, [multiVocalMode, currentParallelData, currentParallelParts]);
	const isCurrentSyncTargetMetaComplete = useMemo(() => {
		if (!multiVocalMode) return true;
		if (hasCurrentParallelParts) {
			const targetPart = activeParallelPart || currentParallelParts[0] || null;
			return !!(isSyncCreatorSpeakerMetaComplete(targetPart) && normalizeSyncCreatorKind(targetPart?.kind));
		}
		return !!(isSyncCreatorSpeakerMetaComplete(currentLineMeta) && normalizeSyncCreatorKind(currentLineMeta.kind));
	}, [multiVocalMode, hasCurrentParallelParts, activeParallelPart, currentParallelParts, currentLineMeta]);
	const showMissingMetaToast = useCallback(() => {
		Toast.error(I18n.t('syncCreator.multiVocalMetaRequired') || 'Select SPEAKER and text effect for the current vocal first.');
	}, []);
	const advanceAfterCompletedTarget = useCallback((lineData) => {
		const nextPartId = getIncompleteParallelPartId(lineData);
		if (nextPartId) {
			setActiveParallelPartId(nextPartId);
			recordingCharIndexRef.current = -1;
			setRecordingCharIndex(-1);
			clearRecordingLock();
			charTimesRef.current = [];
			if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
			return;
		}

		const nextIndex = findNavigableLineIndex(currentLineIndex, 1);
		if (nextIndex >= 0) {
			clearRecordingLock();
			setCurrentLineIndex(nextIndex);
			if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
		}
	}, [getIncompleteParallelPartId, currentLineIndex, findNavigableLineIndex, clearRecordingLock]);
	const currentLineCharRefs = useMemo(() => {
		if (activeParallelPart) {
			return rangesToCharRefs(activeParallelPart.ranges, currentFullLineChars, currentLineStart);
		}
		return currentFullLineChars.map((char, index) => ({
			absoluteIndex: currentLineStart + index,
			localIndex: index,
			char
		}));
	}, [activeParallelPart, currentFullLineChars, currentLineStart]);
	const currentLineChars = useMemo(
		() => currentLineCharRefs.map(ref => ref.char),
		[currentLineCharRefs]
	);
	const getCurrentSyncTargetSavedChars = useCallback(() => {
		const expectedLength = currentLineChars.length;
		if (!expectedLength) return [];

		let savedChars = null;
		if (activeParallelPart) {
			const savedPart = currentExistingLineData?.parallel?.parts?.find(part => part.id === activeParallelTargetId);
			if (Array.isArray(savedPart?.chars)) savedChars = savedPart.chars;
		} else if (Array.isArray(currentExistingLineData?.chars)) {
			savedChars = currentExistingLineData.chars;
		}

		if (!Array.isArray(savedChars)) return new Array(expectedLength).fill(null);
		return Array.from({ length: expectedLength }, (_, index) => {
			const time = Number(savedChars[index]);
			return Number.isFinite(time) ? time : null;
		});
	}, [activeParallelPart, activeParallelTargetId, currentExistingLineData, currentLineChars.length]);
	const getActiveRecordingLockIndex = useCallback(() => {
		const lockIndex = recordingLockIndexRef.current;
		if (!Number.isInteger(lockIndex) || lockIndex < 0 || currentLineChars.length === 0) return -1;
		return Math.min(lockIndex, currentLineChars.length - 1);
	}, [currentLineChars.length]);
	const buildLockedCharTimes = useCallback((lockIndex = getActiveRecordingLockIndex()) => {
		const nextCharTimes = new Array(currentLineChars.length).fill(null);
		const safeLockIndex = Number.isInteger(lockIndex)
			? Math.min(lockIndex, currentLineChars.length - 1)
			: -1;
		if (safeLockIndex < 0) return nextCharTimes;

		const savedChars = getCurrentSyncTargetSavedChars();
		for (let i = 0; i <= safeLockIndex; i++) {
			nextCharTimes[i] = savedChars[i];
		}
		return nextCharTimes;
	}, [currentLineChars.length, getActiveRecordingLockIndex, getCurrentSyncTargetSavedChars]);
	const currentLineText = currentLineChars.join('');
	const currentLineDirection = useMemo(
		() => getSyncCreatorTextDirection(currentLineText),
		[currentLineText]
	);
	const isCurrentLineRtl = currentLineDirection === 'rtl';
	const useCurrentLineTextRun = useMemo(
		() => hasSyncCreatorRtlText(currentLineText),
		[currentLineText]
	);
	const currentLineCodeUnitOffsets = useMemo(
		() => getSyncCreatorCodeUnitOffsets(currentLineChars),
		[currentLineChars]
	);

	const currentLineSyllableSegments = useMemo(
		() => buildLineSyllableSegments(currentLineChars),
		[currentLineChars]
	);

	const lyricsLanguage = useMemo(() => {
		if (!lyricsLines.length) return null;

		const lyricObjects = lyricsLines.map(text => ({ text }));
		const detected = window.LyricsService?.detectLanguage?.(lyricObjects)
			|| Utils?.detectLanguage?.(lyricObjects)
			|| null;

		if (detected) return detected;
		return SYNC_CREATOR_JAPANESE_KANA_REGEX.test(`${lyricsLines.join('\n')} ${trackName} ${artistName}`) ? 'ja' : null;
	}, [lyricsLines, trackName, artistName]);
	const shouldShowSyncCreatorFurigana = useMemo(() => {
		if (lyricsLanguage !== 'ja') return false;
		if (!lyricsLines.some(line => SYNC_CREATOR_KANJI_REGEX.test(line))) return false;
		return typeof window.FuriganaConverter?.convertToFurigana === 'function';
	}, [lyricsLanguage, lyricsLines, furiganaRevision]);
	const getSyncCreatorFuriganaMap = useCallback((lineText) => {
		if (!shouldShowSyncCreatorFurigana || !lineText || !SYNC_CREATOR_KANJI_REGEX.test(lineText)) {
			return new Map();
		}

		try {
			const converted = window.FuriganaConverter.convertToFurigana(lineText);
			if (!converted || converted === lineText || !converted.includes('<ruby>')) {
				return new Map();
			}
			return Utils?.parseFuriganaMapping?.(converted) || new Map();
		} catch (e) {
			return new Map();
		}
	}, [shouldShowSyncCreatorFurigana, furiganaRevision]);
	const getSyncCreatorFuriganaReact = useCallback((lineText) => {
		if (!shouldShowSyncCreatorFurigana || !lineText || !SYNC_CREATOR_KANJI_REGEX.test(lineText)) {
			return lineText;
		}

		try {
			const converted = window.FuriganaConverter.convertToFurigana(lineText);
			if (!converted || converted === lineText || !converted.includes('<ruby>')) {
				return lineText;
			}
			return Utils?.rubyTextToReact?.(converted) || lineText;
		} catch (e) {
			return lineText;
		}
	}, [shouldShowSyncCreatorFurigana, furiganaRevision]);
	const currentLineFuriganaMap = useMemo(
		() => getSyncCreatorFuriganaMap(currentLineText),
		[getSyncCreatorFuriganaMap, currentLineText]
	);
	const hasCurrentLineFurigana = currentLineFuriganaMap.size > 0;
	const currentLineCharacterPronunciationData = useMemo(() => {
		if (!showCharacterPronunciations || !Array.isArray(characterPronunciations?.lines)) {
			return null;
		}

		return characterPronunciations.lines.find(line => Number(line?.index) === currentLineIndex)
			|| characterPronunciations.lines[currentLineIndex]
			|| null;
	}, [showCharacterPronunciations, characterPronunciations, currentLineIndex]);
	const currentLinePronunciationUnits = useMemo(
		() => activeParallelPart ? [] : normalizeSyncCreatorPronunciationUnits(currentLineCharacterPronunciationData, currentLineChars),
		[activeParallelPart, currentLineCharacterPronunciationData, currentLineChars]
	);
	const currentLineEffectiveSyllableSegments = useMemo(() => {
		if (currentLinePronunciationUnits.length > 0) {
			return currentLinePronunciationUnits.map(unit => ({
				start: unit.start,
				end: unit.end
			}));
		}
		return currentLineSyllableSegments;
	}, [currentLinePronunciationUnits, currentLineSyllableSegments]);
	const currentLineCharacterPronunciationMap = useMemo(() => {
		const lineData = currentLineCharacterPronunciationData;
		if (!Array.isArray(lineData?.chars)) {
			return new Map();
		}

		const partIndexMap = activeParallelPart
			? new Map(currentLineCharRefs.map((ref, displayIndex) => [ref.localIndex, displayIndex]))
			: null;
		const map = new Map();
		lineData.chars.forEach((item, fallbackIndex) => {
			const sourceIndex = Number.isInteger(Number(item?.i)) ? Number(item.i) : fallbackIndex;
			const index = partIndexMap ? partIndexMap.get(sourceIndex) : sourceIndex;
			const pronunciation = typeof item?.pronunciation === 'string' ? item.pronunciation.trim() : '';
			if (pronunciation && Number.isInteger(index)) {
				map.set(index, pronunciation);
			}
		});
		return map;
	}, [activeParallelPart, currentLineCharacterPronunciationData, currentLineCharRefs]);
	const hasCurrentLineCharacterPronunciation = currentLineCharacterPronunciationMap.size > 0 || currentLinePronunciationUnits.length > 0;
	const usePrimaryCharacterPronunciation = isCharacterPronunciationPrimary && hasCurrentLineCharacterPronunciation;
	const currentLineRenderedPronunciationUnits = useMemo(() => {
		if (currentLinePronunciationUnits.length > 0) {
			return currentLinePronunciationUnits;
		}
		return buildSyncCreatorVisualPronunciationUnits(currentLineChars, currentLineCharacterPronunciationMap);
	}, [
		currentLinePronunciationUnits,
		currentLineChars,
		currentLineCharacterPronunciationMap
	]);
	const currentLineRenderedPronunciationUnitByStart = useMemo(() => {
		const map = new Map();
		currentLineRenderedPronunciationUnits.forEach(unit => map.set(unit.start, unit));
		return map;
	}, [currentLineRenderedPronunciationUnits]);
	const currentLineRenderedPronunciationCoveredIndexes = useMemo(() => {
		const set = new Set();
		currentLineRenderedPronunciationUnits.forEach(unit => {
			for (let i = unit.start + 1; i <= unit.end; i++) {
				set.add(i);
			}
		});
		return set;
	}, [currentLineRenderedPronunciationUnits]);
	const useFixedPrimaryCharacterCells = usePrimaryCharacterPronunciation
		&& currentLineRenderedPronunciationUnits.length === 0
		&& /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/u.test(currentLineText);
	const characterPronunciationProgressInfo = useMemo(
		() => getSyncCreatorCharacterPronunciationProgressInfo(characterPronunciationProgress),
		[characterPronunciationProgress]
	);

	const completedLines = useMemo(() => {
		if (!syncData || !syncData.lines) return 0;
		if (multiVocalMode) {
			const linesByStart = new Map(syncData.lines.map(line => [line.start, line]));
			return lyricsLines.reduce((count, lineText, index) => {
				if (isLineCoveredByMergedPrevious(index, linesByStart)) {
					const ownerIndex = findMergedOwnerLineIndex(index, linesByStart);
					const previousLine = ownerIndex >= 0 ? linesByStart.get(lineCharOffsets[ownerIndex]) : null;
					const previousParts = Array.isArray(previousLine?.parallel?.parts) ? previousLine.parallel.parts : [];
					const previousComplete = previousParts.length > 1 && previousParts.every(part =>
						Array.isArray(part.chars)
						&& part.chars.length === countRangeChars(part.ranges)
						&& (normalizeSyncCreatorSpeaker(part.speaker) || SYNC_CREATOR_DEFAULT_SPEAKER)
						&& (normalizeSyncCreatorKind(part.kind) || SYNC_CREATOR_DEFAULT_KIND)
					);
					return count + (previousComplete ? 1 : 0);
				}
				const lineStart = lineCharOffsets[index];
				const lineData = linesByStart.get(lineStart);
				if (!lineData) return count;
				const mergedIndexes = getMergedLineIndexesForStart(index, linesByStart);
				const isMergedWithNext = mergedIndexes.length > 1;
				const templateChars = isMergedWithNext
					? mergedIndexes.flatMap(lineIndex => Array.from(lyricsLines[lineIndex] || ''))
					: Array.from(lineText || '');
				const template = getParallelTemplateForLineData(lineData, templateChars, lineStart, isMergedWithNext);
				if (template?.parts?.length > 1) {
					const existingParts = Array.isArray(lineData.parallel?.parts) ? lineData.parallel.parts : [];
					const isComplete = template.parts.every(part => {
						const existingPart = existingParts.find(item => item.id === part.id);
						return existingPart
							&& Array.isArray(existingPart.chars)
							&& existingPart.chars.length === countRangeChars(part.ranges)
							&& (normalizeSyncCreatorSpeaker(existingPart.speaker) || SYNC_CREATOR_DEFAULT_SPEAKER)
							&& (normalizeSyncCreatorKind(existingPart.kind) || SYNC_CREATOR_DEFAULT_KIND);
					});
					return count + (isComplete ? 1 : 0);
				}
				return count + ((normalizeSyncCreatorSpeaker(lineData.speaker) || SYNC_CREATOR_DEFAULT_SPEAKER) && (normalizeSyncCreatorKind(lineData.kind) || SYNC_CREATOR_DEFAULT_KIND) ? 1 : 0);
			}, 0);
		}
		return syncData.lines.length;
	}, [syncData, multiVocalMode, lyricsLines, lineCharOffsets, getParallelTemplateForLineData, isLineCoveredByMergedPrevious, findMergedOwnerLineIndex, getMergedLineIndexesForStart]);

	// 현재 줄이 싱크되어 있는지
	const isCurrentLineSynced = useMemo(() => {
		if (currentLineCoveredByPrevious) return true;
		if (!syncData || !syncData.lines) return false;
		const lineStart = lineCharOffsets[currentLineIndex];
		const line = syncData.lines.find(l => l.start === lineStart);
		if (!line) return false;
		if (activeParallelPart) {
			const part = line.parallel?.parts?.find(item => item.id === activeParallelPart.id);
			return !!(part?.chars?.length === currentLineChars.length);
		}
		return true;
	}, [currentLineCoveredByPrevious, syncData, lineCharOffsets, currentLineIndex, activeParallelPart, currentLineChars.length]);

	// Visibility tracking for robust lock handling
	const isVisibleRef = useRef(false);

	useEffect(() => {
		const handleFuriganaReady = () => setFuriganaRevision(value => value + 1);

		window.addEventListener('furigana-ready', handleFuriganaReady);
		if (typeof window.FuriganaConverter?.init === 'function' && !window.FuriganaConverter?.isAvailable?.()) {
			window.FuriganaConverter.init().then(handleFuriganaReady).catch(() => {});
		}

		return () => window.removeEventListener('furigana-ready', handleFuriganaReady);
	}, []);

	const handleCharacterPronunciationToggle = useCallback(async (options = {}) => {
		if (characterPronunciations) {
			setShowCharacterPronunciations(value => !value);
			return;
		}

		if (!lyricsLines.length) {
			return;
		}

		if (typeof window.AIAddonManager?.generateCharacterPronunciation !== 'function') {
			Toast.error(I18n.t('syncCreator.characterPronunciationNoProvider') || 'No AI provider supports character-level pronunciation.');
			return;
		}

		if (options?.skipConsent !== true) {
			setShowCharacterPronunciationConsent(true);
			return;
		}

		setIsGeneratingCharacterPronunciations(true);
		setCharacterPronunciationProgress({
			phase: 'prepared',
			total: 0,
			current: 0,
			completed: 0,
			remaining: 0,
			percent: 0
		});
		Toast.progress?.(
			I18n.t('syncCreator.characterPronunciationProgressPreparing') || 'Preparing pronunciation generation...',
			0
		);

		try {
			const handleProgress = (progress) => {
				const nextProgress = progress || null;
				setCharacterPronunciationProgress(nextProgress);
				const progressInfo = getSyncCreatorCharacterPronunciationProgressInfo(nextProgress);
				if (progressInfo) {
					Toast.progress?.(progressInfo.label, progressInfo.percent);
				}
			};
			const result = await window.AIAddonManager.generateCharacterPronunciation({
				trackId,
				title: trackName,
				artist: artistName,
				lines: lyricsLines,
				sourceLang: lyricsLanguage || 'auto',
				lang: 'ko',
				onProgress: handleProgress
			});
			const hasAnyPronunciation = result?.lines?.some(line =>
				(Array.isArray(line?.chars) && line.chars.some(item => item?.pronunciation))
				|| (Array.isArray(line?.units) && line.units.some(item => item?.pronunciation))
			);

			setCharacterPronunciations(result);
			setShowCharacterPronunciations(true);

			if (hasAnyPronunciation) {
				Toast.success(I18n.t('syncCreator.characterPronunciationGenerated') || 'Generated AI character pronunciation.');
			} else {
				Toast.warning(I18n.t('syncCreator.characterPronunciationEmpty') || 'Generated character pronunciation is empty.');
			}
		} catch (e) {
			console.error('[SyncDataCreator] Character pronunciation generation failed:', e);
			Toast.error((I18n.t('syncCreator.characterPronunciationError') || 'Failed to generate character pronunciation') + ': ' + (e?.message || e));
		} finally {
			setIsGeneratingCharacterPronunciations(false);
			setCharacterPronunciationProgress(null);
			Toast.dismissProgress?.();
		}
	}, [characterPronunciations, lyricsLines, lyricsLanguage, trackId, trackName, artistName]);

	// Visibility Observer
	useEffect(() => {
		if (!containerRef.current) return;

		const observer = new IntersectionObserver(([entry]) => {
			isVisibleRef.current = entry.isIntersecting;
			preventNextTrackRef.current = entry.isIntersecting;
			// console.log("[SyncDataCreator] Visibility changed:", entry.isIntersecting);
		}, { threshold: 0 });

		observer.observe(containerRef.current);

		return () => observer.disconnect();
	}, []);

	// 다음 곡 방지 - 싱크 생성기가 보일 때만 활성화
	useEffect(() => {
		// 초기 마운트/업데이트 시 visibility 상태 동기화
		preventNextTrackRef.current = isVisibleRef.current;

		const handleSongChange = () => {
			// 화면에 보이지 않으면 동작하지 않음
			if (!isVisibleRef.current) return;
			// preventNextTrackRef가 false여도 동작하지 않음 (이중 체크)
			if (!preventNextTrackRef.current) return;

			const currentTrackUri = Spicetify.Player?.data?.item?.uri;
			if (currentTrackUri && currentTrackUri !== trackUri) {
				Spicetify.Player.playUri(trackUri);
			}
		};

		const handleProgress = () => {
			// 화면에 보이지 않으면 동작하지 않음
			if (!isVisibleRef.current) return;
			if (!preventNextTrackRef.current) return;

			const duration = Spicetify.Player?.data?.item?.duration?.milliseconds || 0;
			const progress = Spicetify.Player.getProgress();
			if (duration > 0 && progress >= duration - 250) {
				Spicetify.Player.seek(0);
			}
		};

		const progressInterval = setInterval(handleProgress, 200);
		Spicetify.Player.addEventListener('songchange', handleSongChange);

		return () => {
			// 언마운트 시 해제 (단, 숨김 상태일 뿐이면 observer가 false로 설정함)
			preventNextTrackRef.current = false;
			clearInterval(progressInterval);
			Spicetify.Player.removeEventListener('songchange', handleSongChange);
		};
	}, [trackUri]);

	// Provider 목록 로드 (활성화된 Provider만, 사용자 설정 순서대로)
	useEffect(() => {
		const loadProviders = () => {
			if (window.LyricsAddonManager) {
				const enabledAddons = window.LyricsAddonManager.getEnabledProviders();
				setAvailableProviders(enabledAddons);
			} else {
				setAvailableProviders([]);
			}
		};
		loadProviders();

		// 리스너 등록 (Addon이 나중에 로드될 수 있음, 활성화 상태/순서 변경도 반영)
		if (window.LyricsAddonManager) {
			const unsub1 = window.LyricsAddonManager.on('addon:registered', loadProviders);
			const unsub2 = window.LyricsAddonManager.on('provider:enabled:changed', loadProviders);
			const unsub3 = window.LyricsAddonManager.on('provider:order:changed', loadProviders);
			return () => { unsub1(); unsub2(); unsub3(); };
		}
	}, []);

	// 가사 로드 (Spotify -> LRCLIB 순서로 자동 시도)
	// 가사 로드 (Spotify -> LRCLIB 순서로 자동 시도)
	const loadLyrics = useCallback(async (preferredProvider = null) => {
		setIsLoading(true);
		setError(null);
		setLyrics(null);
		setLyricsText('');
		setSyncData(null);
		setCurrentLineIndex(0);
		setMultiVocalMode(false);
		setManualParallelSplitDrafts({});
		setParentheticalLayoutDrafts({});
		setPendingParentheticalLayoutDecision(null);
		setMergedLineDrafts({});
		setPendingMultiVocalDecision(null);
		setActiveParallelPartId('full');
		setMode('idle');
		clearLrclibCandidateState();

		try {
			const firstArtist = trackInfo?.artists?.[0]?.name ||
				Spicetify.Player?.data?.item?.artists?.[0]?.name ||
				artistName.split(',')[0].trim();

			// 만약 preferredProvider가 지정되어 있다면 그것만 시도, 아니면 LyricsAddonManager의 순서대로
			let providersToTry = preferredProvider ? [preferredProvider] : [];

			if (!preferredProvider) {
				if (window.LyricsAddonManager) {
					// 활성화된 Provider 순서대로 시도
					const addons = window.LyricsAddonManager.getEnabledProviders();
					providersToTry = addons.map(addon => addon.id);
				} else {
					// Manager가 없으면 빈 배열 (또는 로드될 때까지 대기해야 함)
					providersToTry = [];
				}
			}

			let result = null;
			let usedProvider = null;

			for (const tryProvider of providersToTry) {
				const info = {
					uri: trackInfo?.uri || Spicetify.Player?.data?.item?.uri,
					title: trackName,
					name: trackName,
					artist: tryProvider === 'lrclib' ? firstArtist : artistName,
					album: trackInfo?.album?.name || Spicetify.Player?.data?.item?.album?.name || '',
					duration: Spicetify.Player?.data?.item?.duration?.milliseconds || 0
				};

				// Provider ID 그대로 사용
				let realProvider = tryProvider;

				// Legacy compatibility for spotify-xxx IDs if needed, but per user request, we trust the ID.
				// However, if the old Providers object is used, we might need adjustment. 
				// But we prioritize LyricsAddonManager now.

				window.__ivLyricsDebugLog?.('[SyncDataCreator] Trying provider:', tryProvider);

				try {
					if (realProvider === 'lrclib' && window.LyricsAddonManager?.getAddon) {
						const lrclibAddon = window.LyricsAddonManager.getAddon(realProvider);
						if (typeof lrclibAddon?.searchCandidates === 'function') {
							const searchResult = await lrclibAddon.searchCandidates(info);
							if (!searchResult?.success) {
								throw new Error(searchResult?.error || 'No lyrics found');
							}

							const candidates = Array.isArray(searchResult.candidates) ? searchResult.candidates : [];
							const selectedCandidate = candidates.find(candidate => candidate.candidateKey === searchResult.selectedCandidateKey)
								|| candidates[0]
								|| null;

							if (!selectedCandidate) {
								throw new Error('No ranked LRCLIB candidates');
							}

							setLrclibCandidates(candidates);
							setSelectedLrclibCandidateKey(selectedCandidate.candidateKey);
							setPreviewLrclibCandidateKey(selectedCandidate.candidateKey);
							setLrclibSearchMeta(searchResult);
							setShowLrclibCandidates(true);
							result = buildSyntheticLrclibResult(selectedCandidate);
						} else {
							result = await window.LyricsAddonManager.getLyricsFrom(realProvider, info);
						}
						if (result && result.error) throw new Error(result.error);
					} else if (window.LyricsAddonManager) {
						result = await window.LyricsAddonManager.getLyricsFrom(realProvider, info);
						if (result && result.error) throw new Error(result.error);
					} else if (typeof Providers !== 'undefined' && Providers[realProvider]) {
						result = await Providers[realProvider](info);
					} else if (typeof LyricsService !== 'undefined' && LyricsService.getLyrics) {
						result = await LyricsService.getLyrics(info, realProvider);
					}

					if (result && (result.synced || result.unsynced)) {
						usedProvider = tryProvider;
						window.__ivLyricsDebugLog?.('[SyncDataCreator] Found lyrics from:', tryProvider);
						break;
					}
				} catch (providerError) {
					window.__ivLyricsDebugLog?.('[SyncDataCreator] Provider', tryProvider, 'failed:', providerError.message);
				}
			}

			if (result && (result.synced || result.unsynced)) {
				await applyLoadedLyricsResult(result, usedProvider);
			} else {
				// 만약 수동 선택했는데 실패했으면 provider는 그 선택한걸로 유지해서 UI에 보여줌? 
				// 아니면 실패 메시지 띄우고 provider는 유지
				if (preferredProvider) setProviderValue(preferredProvider);
				setError(I18n.t('syncCreator.noLyrics'));
			}
		} catch (e) {
			console.error('[SyncDataCreator] Load lyrics error:', e);
			setError(I18n.t('syncCreator.loadError'));
		}

		setIsLoading(false);
	}, [trackInfo, trackName, artistName, albumName, applyLoadedLyricsResult, buildSyntheticLrclibResult, clearLrclibCandidateState, setProviderValue]);



	// 컴포넌트 마운트 시 자동 가사 로드 + 기존 싱크 데이터 불러오기
	useEffect(() => {
		const initWithExistingSyncData = async () => {
			// 생성기 진입만으로는 가사를 자동 로드하지 않음. 사용자가 직접 provider를 선택하고 로드해야 함.
			if (false && initialData && initialData.provider && initialData.lyrics) {
				window.__ivLyricsDebugLog?.('[SyncDataCreator] Using initial data:', initialData.provider);
				let finalProvider = initialData.provider;
				const inputLyrics = initialData.lyrics;

				// Spotify provider normalization
				if ((finalProvider === 'Spotify' || finalProvider === 'spotify') && inputLyrics.spotifyLyricsProvider) {
					finalProvider = `spotify-${inputLyrics.spotifyLyricsProvider}`;
				}

				let lyricsSource;

				// inputLyrics가 배열이면(LyricsContainer에서 직접 넘긴 경우) 객체로 감쌈
				if (Array.isArray(inputLyrics)) {
					setLyrics({
						provider: finalProvider,
						synced: inputLyrics,
						unsynced: inputLyrics
					});
					lyricsSource = inputLyrics;
				} else {
					setLyrics(inputLyrics);
					lyricsSource = inputLyrics.synced || inputLyrics.unsynced;
				}

				setProviderValue(finalProvider);

				let text = '';

				if (Array.isArray(lyricsSource)) {
					text = lyricsSource.map(line => {
						if (typeof line === 'string') return line;
						if (line.originalText && typeof line.originalText === 'string' && line.originalText.trim().length > 0) return line.originalText;
						if (line.text) return typeof line.text === 'string' ? line.text : '';
						return '';
					}).filter(t => t.trim().length > 0).join('\n');
				} else if (typeof lyricsSource === 'string') {
					text = lyricsSource;
				}

				// NFC 정규화 적용
				text = text ? normalizeSyncCreatorStandaloneParentheticalLines(text) : '';

				if (text.trim().length > 0) {
					setLyricsText(text);
				} else {
					setError(I18n.t('syncCreator.noLyrics'));
				}

				// 기존 싱크 데이터가 있는지 확인
				if (window.SyncDataService && trackId) {
					try {
						const existingSyncData = await window.SyncDataService.getSyncData(trackId, finalProvider, {
							isrc: trackIsrc || undefined,
							title: trackName,
							artist: artistName,
							album: albumName
						});
						if (existingSyncData && existingSyncData.syncData && existingSyncData.syncData.lines) {
							window.__ivLyricsDebugLog?.('[SyncDataCreator] Found matching existing sync data');
							const normalizedSyncBody = normalizeLoadedSyncCreatorBodyForLyrics(existingSyncData.syncData, text);
							const sanitizedSyncBody = sanitizeSyncCreatorSyncData(
								normalizedSyncBody,
								getSyncCreatorFlatLyricsCharsFromText(text)
							);
							if (sanitizedSyncBody) {
								setSyncData(sanitizedSyncBody);
								Toast.success(I18n.t('syncCreator.loadedExistingSyncData') || 'Loaded existing sync data');
							}
						}
					} catch (e) {
						console.warn('[SyncDataCreator] Failed to load existing sync data:', e);
					}
				}
				return;
			}

			// initialData가 없으면 자동으로 로드하지 않음 (유저가 '로드' 버튼을 눌러야 함)
		};

		initWithExistingSyncData();
	}, []);

	// 재생 위치 업데이트 + 미리보기 자동 줄 이동
	useEffect(() => {
		let lastCommittedPosition = -1;

		const updatePosition = () => {
			const pos = Number(Spicetify.Player?.getProgress?.() || 0);
			if (!Number.isFinite(pos)) return;
			const commitThreshold = mode === 'record'
				? SYNC_CREATOR_RECORD_POSITION_COMMIT_THRESHOLD_MS
				: SYNC_CREATOR_POSITION_COMMIT_THRESHOLD_MS;

			if (
				lastCommittedPosition < 0
				|| Math.abs(pos - lastCommittedPosition) >= commitThreshold
				|| pos === 0
			) {
				lastCommittedPosition = pos;
				setPosition(pos);
			}

			if (mode === 'preview' && syncData && syncData.lines) {
				const currentTimeSec = pos / 1000;

				for (let i = syncData.lines.length - 1; i >= 0; i--) {
					const lineData = syncData.lines[i];
					if (lineData.chars && lineData.chars[0] <= currentTimeSec) {
						const lineIdx = lineIndexByStart.get(lineData.start) ?? -1;

						if (lineIdx >= 0 && lineIdx !== currentLineIndex) {
							setCurrentLineIndex(lineIdx);
							if (lyricsScrollRef.current) {
								lyricsScrollRef.current.scrollLeft = 0;
							}
						}
						break;
					}
				}
			}
		};

		updatePosition();
		const intervalMs = mode === 'preview'
			? SYNC_CREATOR_PREVIEW_POSITION_UPDATE_INTERVAL_MS
			: mode === 'record'
				? SYNC_CREATOR_RECORD_POSITION_UPDATE_INTERVAL_MS
				: SYNC_CREATOR_IDLE_POSITION_UPDATE_INTERVAL_MS;
		positionUpdateTimerRef.current = setInterval(updatePosition, intervalMs);

		return () => {
			if (positionUpdateTimerRef.current) {
				clearInterval(positionUpdateTimerRef.current);
				positionUpdateTimerRef.current = null;
			}
		};
	}, [mode, syncData, lineIndexByStart, currentLineIndex]);

	const autoScroll = useCallback((charIndex) => {
		if (!lyricsScrollRef.current || charIndex < 0) return;
		const scrollContainer = lyricsScrollRef.current;
		const numericIndex = Number(charIndex);
		if (!Number.isFinite(numericIndex)) return;
		const maxScrollLeft = Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth);
		if (maxScrollLeft <= 0) return;

		if (useCurrentLineTextRun && currentLineChars.length > 0) {
			const progress = Math.max(0, Math.min(1, numericIndex / Math.max(1, currentLineChars.length - 1)));
			scrollContainer.scrollLeft = isCurrentLineRtl ? -maxScrollLeft * progress : maxScrollLeft * progress;
			return;
		}

		let metrics = charScrollMetricsRef.current;
		if (!Array.isArray(metrics) || metrics.length !== charElementsRef.current.length || metrics.length === 0) {
			metrics = charElementsRef.current.map((el) => {
				if (!el) return null;
				const width = el.offsetWidth || 0;
				return {
					center: (el.offsetLeft || 0) + (width / 2)
				};
			});
			charScrollMetricsRef.current = metrics;
		}

		const lowerIndex = Math.max(0, Math.min(metrics.length - 1, Math.floor(numericIndex)));
		const upperIndex = Math.max(0, Math.min(metrics.length - 1, Math.ceil(numericIndex)));
		const lower = metrics[lowerIndex];
		const upper = metrics[upperIndex] || lower;
		if (!lower) return;

		const ratio = Math.max(0, Math.min(1, numericIndex - lowerIndex));
		const center = lower.center + (((upper?.center ?? lower.center) - lower.center) * ratio);
		const targetScrollLeft = Math.max(0, Math.min(maxScrollLeft, center - (scrollContainer.clientWidth / 2)));

		if (Math.abs(scrollContainer.scrollLeft - targetScrollLeft) > 1) {
			scrollContainer.scrollLeft = targetScrollLeft;
		}
	}, [currentLineChars.length, isCurrentLineRtl, useCurrentLineTextRun]);

	const applyRecordingProgressVisual = useCallback((nextIndex) => {
		const numericIndex = Number(nextIndex);
		const normalizedIndex = Number.isFinite(numericIndex) ? Math.max(-1, Math.floor(numericIndex)) : -1;
		const previousIndex = lastPaintedRecordingIndexRef.current;
		if (previousIndex === normalizedIndex) return;
		lastPaintedRecordingIndexRef.current = normalizedIndex;

		if (useCurrentLineTextRun && rtlTextRunRef.current) {
			const percent = currentLineChars.length > 0 && normalizedIndex >= 0
				? Math.max(0, Math.min(100, ((normalizedIndex + 1) / currentLineChars.length) * 100))
				: 0;
			rtlTextRunRef.current.style.backgroundImage = getSyncCreatorProgressGradient(
				currentLineDirection,
				percent,
				SYNC_CREATOR_RECORDING_BACKGROUND
			);
			autoScroll(normalizedIndex);
			return;
		}

		const completedIndex = normalizedIndex;

		const paintChar = (index) => {
			const el = charElementsRef.current[index];
			if (!el) return;
			const baseBackground = el.dataset.ivSyncCreatorBaseBackground || '';
			if (normalizedIndex >= 0 && index <= completedIndex) {
				el.style.background = SYNC_CREATOR_RECORDING_BACKGROUND;
				el.style.color = 'var(--spice-text)';
			} else {
				el.style.background = baseBackground;
				el.style.color = el.dataset.ivSyncCreatorBaseColor || '';
			}
		};

		if (previousIndex < -1.5 || normalizedIndex < 0) {
			for (let index = 0; index < currentLineChars.length; index++) {
				paintChar(index);
			}
			autoScroll(normalizedIndex);
			return;
		}

		const previousCompletedIndex = previousIndex;
		const minChangedIndex = Math.max(0, Math.min(
			completedIndex,
			previousCompletedIndex
		));
		const maxChangedIndex = Math.min(currentLineChars.length - 1, Math.max(
			completedIndex,
			previousCompletedIndex
		));

		for (let index = minChangedIndex; index <= maxChangedIndex; index++) {
			paintChar(index);
		}

		autoScroll(normalizedIndex);
	}, [autoScroll, currentLineChars.length, currentLineDirection, useCurrentLineTextRun]);

	const cancelRecordingProgressAnimation = useCallback(() => {
		if (recordingVisualFrameRef.current === null) return;
		if (typeof cancelAnimationFrame === 'function') {
			cancelAnimationFrame(recordingVisualFrameRef.current);
		} else {
			clearTimeout(recordingVisualFrameRef.current);
		}
		recordingVisualFrameRef.current = null;
		recordingVisualFrameTimeRef.current = 0;
	}, []);

	const scheduleRecordingProgressAnimation = useCallback(() => {
		if (recordingVisualFrameRef.current !== null) return;

		const requestFrame = typeof requestAnimationFrame === 'function'
			? requestAnimationFrame
			: (callback) => setTimeout(() => callback(Date.now()), 16);

		const paint = (timestamp) => {
			recordingVisualFrameRef.current = null;

			const targetIndex = recordingVisualTargetIndexRef.current;
			let visualIndex = Number(recordingVisualIndexRef.current);
			if (!Number.isFinite(visualIndex)) {
				visualIndex = targetIndex >= 0 ? Math.max(-1, targetIndex - 1) : -1;
			}

			if (targetIndex < 0 || mode !== 'record') {
				visualIndex = targetIndex;
			} else {
				const previousTimestamp = recordingVisualFrameTimeRef.current || timestamp;
				const deltaMs = Math.min(50, Math.max(8, timestamp - previousTimestamp));
				const distance = targetIndex - visualIndex;
				const maxStep = Math.max(0.18, deltaMs / 22);

				if (Math.abs(distance) <= maxStep) {
					visualIndex = targetIndex;
				} else {
					visualIndex += Math.sign(distance) * maxStep;
				}
				recordingVisualFrameTimeRef.current = timestamp;
			}

			recordingVisualIndexRef.current = visualIndex;
			applyRecordingProgressVisual(visualIndex);

			if (mode === 'record' && Math.abs(recordingVisualTargetIndexRef.current - visualIndex) > 0.01) {
				recordingVisualFrameRef.current = requestFrame(paint);
			} else {
				recordingVisualFrameTimeRef.current = 0;
			}
		};

		recordingVisualFrameRef.current = requestFrame(paint);
	}, [applyRecordingProgressVisual, mode]);

	const setRecordingProgressIndex = useCallback((nextIndex, options = {}) => {
		const normalizedIndex = Number.isInteger(nextIndex) ? nextIndex : -1;
		recordingCharIndexRef.current = normalizedIndex;
		recordingVisualTargetIndexRef.current = normalizedIndex;
		if (mode === 'record') {
			lastPaintedPlaybackIndexRef.current = -2;
		}

		const shouldAnimate = mode === 'record'
			&& normalizedIndex >= 0
			&& options.animate !== false
			&& normalizedIndex >= recordingVisualIndexRef.current;

		if (shouldAnimate) {
			if (recordingVisualIndexRef.current < -0.5) {
				recordingVisualIndexRef.current = Math.max(-1, normalizedIndex - 1);
			}
			scheduleRecordingProgressAnimation();
		} else {
			cancelRecordingProgressAnimation();
			recordingVisualIndexRef.current = normalizedIndex;
			applyRecordingProgressVisual(normalizedIndex);
		}

		if (options.commitState !== false) {
			setRecordingCharIndex(normalizedIndex);
		}
	}, [applyRecordingProgressVisual, cancelRecordingProgressAnimation, mode, scheduleRecordingProgressAnimation]);

	useEffect(() => {
		cancelRecordingProgressAnimation();
		const nextVisualIndex = mode === 'record' ? recordingCharIndexRef.current : -1;
		recordingVisualTargetIndexRef.current = nextVisualIndex;
		recordingVisualIndexRef.current = nextVisualIndex;
		lastPaintedRecordingIndexRef.current = -2;
		applyRecordingProgressVisual(nextVisualIndex);
	}, [mode, currentLineIndex, activeParallelTargetId, lyricsText, applyRecordingProgressVisual, cancelRecordingProgressAnimation]);

	useEffect(() => () => {
		cancelRecordingProgressAnimation();
	}, [cancelRecordingProgressAnimation]);

	const cacheCharHitBoxes = useCallback(() => {
		if (useCurrentLineTextRun) {
			charHitBoxesRef.current = [];
			charScrollMetricsRef.current = [];
			return;
		}

		const nextHitBoxes = [];
		const nextScrollMetrics = [];
		for (let index = 0; index < charElementsRef.current.length; index++) {
			const el = charElementsRef.current[index];
			if (!el) {
				nextHitBoxes.push(null);
				nextScrollMetrics.push(null);
				continue;
			}
			const rect = el.getBoundingClientRect();
			nextHitBoxes.push({
				left: rect.left,
				right: rect.right,
				top: rect.top,
				bottom: rect.bottom,
				centerX: rect.left + (rect.width / 2)
			});
			const width = el.offsetWidth || rect.width || 0;
			nextScrollMetrics.push({
				center: (el.offsetLeft || 0) + (width / 2)
			});
		}
		charHitBoxesRef.current = nextHitBoxes;
		charScrollMetricsRef.current = nextScrollMetrics;
	}, [useCurrentLineTextRun]);

	const getCharIndexFromPoint = useCallback((clientX, clientY) => {
		if (useCurrentLineTextRun && rtlTextRunRef.current && currentLineChars.length > 0) {
			const textEl = rtlTextRunRef.current;
			const resolveTextOffset = (node, offset) => {
				if (!node || !textEl.contains(node)) return null;
				if (node.nodeType === Node.TEXT_NODE) {
					let totalOffset = 0;
					const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
					let textNode = walker.nextNode();
					while (textNode) {
						if (textNode === node) {
							return totalOffset + offset;
						}
						totalOffset += textNode.nodeValue?.length || 0;
						textNode = walker.nextNode();
					}
				}
				return null;
			};

			let textOffset = null;
			if (typeof document.caretPositionFromPoint === 'function') {
				const caretPosition = document.caretPositionFromPoint(clientX, clientY);
				textOffset = resolveTextOffset(caretPosition?.offsetNode, caretPosition?.offset || 0);
			}
			if (textOffset === null && typeof document.caretRangeFromPoint === 'function') {
				const caretRange = document.caretRangeFromPoint(clientX, clientY);
				textOffset = resolveTextOffset(caretRange?.startContainer, caretRange?.startOffset || 0);
			}
			if (textOffset !== null) {
				return getSyncCreatorCharIndexFromCodeUnitOffset(currentLineCodeUnitOffsets, textOffset);
			}

			const rect = textEl.getBoundingClientRect();
			if (rect.width > 0) {
				const rawRatio = isCurrentLineRtl
					? (rect.right - clientX) / rect.width
					: (clientX - rect.left) / rect.width;
				const ratio = Math.max(0, Math.min(1, rawRatio));
				return Math.max(0, Math.min(currentLineChars.length - 1, Math.floor(ratio * currentLineChars.length)));
			}
		}

		const cachedHitBoxes = charHitBoxesRef.current;
		if (cachedHitBoxes.length > 0) {
			for (let i = 0; i < cachedHitBoxes.length; i++) {
				const rect = cachedHitBoxes[i];
				if (!rect) continue;
				if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
					return i;
				}
			}

			let firstRect = null;
			let firstIndex = -1;
			for (let i = 0; i < cachedHitBoxes.length; i++) {
				if (cachedHitBoxes[i]) {
					firstRect = cachedHitBoxes[i];
					firstIndex = i;
					break;
				}
			}
			let lastRect = null;
			let lastIndex = -1;
			for (let i = cachedHitBoxes.length - 1; i >= 0; i--) {
				if (cachedHitBoxes[i]) {
					lastRect = cachedHitBoxes[i];
					lastIndex = i;
					break;
				}
			}
			if (firstRect && lastRect) {
				if (clientX < firstRect.left) return firstIndex;
				if (clientX > lastRect.right) return lastIndex;

				let closestIndex = 0;
				let closestDist = Infinity;
				for (let i = 0; i < cachedHitBoxes.length; i++) {
					const rect = cachedHitBoxes[i];
					if (!rect) continue;
					const dist = Math.abs(clientX - rect.centerX);
					if (dist < closestDist) {
						closestDist = dist;
						closestIndex = i;
					}
				}
				return closestIndex;
			}
		}

		for (let i = 0; i < charElementsRef.current.length; i++) {
			const el = charElementsRef.current[i];
			if (!el) continue;
			const rect = el.getBoundingClientRect();
			if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
				return i;
			}
		}

		if (charElementsRef.current.length > 0) {
			const firstEl = charElementsRef.current[0];
			const lastEl = charElementsRef.current[charElementsRef.current.length - 1];
			if (firstEl && lastEl) {
				const firstRect = firstEl.getBoundingClientRect();
				const lastRect = lastEl.getBoundingClientRect();
				if (clientX < firstRect.left) return 0;
				if (clientX > lastRect.right) return charElementsRef.current.length - 1;

				let closestIndex = 0;
				let closestDist = Infinity;
				for (let i = 0; i < charElementsRef.current.length; i++) {
					const el = charElementsRef.current[i];
					if (!el) continue;
					const rect = el.getBoundingClientRect();
					const centerX = rect.left + rect.width / 2;
					const dist = Math.abs(clientX - centerX);
					if (dist < closestDist) {
						closestDist = dist;
						closestIndex = i;
					}
				}
				return closestIndex;
			}
		}
		return 0;
	}, [currentLineChars.length, currentLineCodeUnitOffsets, isCurrentLineRtl, useCurrentLineTextRun]);

	const handleDragStart = useCallback((charIndex, e) => {
		if (mode !== 'record' || currentLineIndex >= lyricsLines.length) return;
		e.preventDefault();
		e.stopPropagation();
		cacheCharHitBoxes();

		const currentTime = Spicetify.Player.getProgress() / 1000;
		const lockIndex = getActiveRecordingLockIndex();
		if (lockIndex >= currentLineChars.length - 1) {
			Toast.error(I18n.t('syncCreator.syncLockNoEditableChars') || 'Right-click an earlier character so there is something left to re-sync.');
			return;
		}
		const firstEditableIndex = Math.max(0, lockIndex + 1);
		const startIndex = Math.max(charIndex < 0 ? 0 : charIndex, firstEditableIndex);
		const hasKeyboardProgress = isKeyboardSyncingRef.current
			&& Array.isArray(charTimesRef.current)
			&& charTimesRef.current.length === currentLineChars.length;
		const nextCharTimes = hasKeyboardProgress
			? [...charTimesRef.current]
			: buildLockedCharTimes(lockIndex);

		if (hasKeyboardProgress) {
			if (pendingWordSyncRef.current && interpolationEnabledRef.current) {
				const { startIdx, endIdx, startTime } = pendingWordSyncRef.current;
				const wordEndTime = Math.max(startTime, currentTime - (WORD_GAP_MS / 1000));
				applyInterpolatedRangeToCharTimes(nextCharTimes, startIdx, endIdx, startTime, wordEndTime, smoothStepInterpolation);
			}
			if (pendingSyllableSyncRef.current && interpolationEnabledRef.current) {
				const { startIdx, endIdx, startTime } = pendingSyllableSyncRef.current;
				const endTime = Math.max(startTime, currentTime - EDGE_INTERPOLATION_GAP_SEC);
				applyInterpolatedRangeToCharTimes(nextCharTimes, startIdx, endIdx, startTime, endTime);
			}
			if (lockIndex >= 0) {
				const lockedCharTimes = buildLockedCharTimes(lockIndex);
				for (let i = 0; i <= lockIndex; i++) {
					nextCharTimes[i] = lockedCharTimes[i];
				}
			}
		}

		setDragStartTime(currentTime);
		setDragStartCharIndex(startIndex);
		setRecordingProgressIndex(startIndex, { commitState: false });
		setIsDragging(true);

		if (hasKeyboardProgress) {
			const lastRecordedIndex = getLastRecordedSyncIndex(nextCharTimes);
			if (startIndex <= lastRecordedIndex) {
				for (let i = firstEditableIndex; i < nextCharTimes.length; i++) {
					nextCharTimes[i] = null;
				}
				nextCharTimes[startIndex] = getSequentialSyncTime(currentTime, getPreviousRecordedSyncTime(nextCharTimes, startIndex));
			} else {
				let previousTime = getPreviousRecordedSyncTime(nextCharTimes, startIndex + 1);
				for (let i = lastRecordedIndex + 1; i <= startIndex; i++) {
					nextCharTimes[i] = getSequentialSyncTime(currentTime, previousTime);
					previousTime = nextCharTimes[i];
				}
			}
			isKeyboardSyncingRef.current = false;
			keyboardCharIndexRef.current = -1;
			pendingWordSyncRef.current = null;
			pendingSyllableSyncRef.current = null;
			if (isKeyboardDraggingRef.current) {
				isKeyboardDraggingRef.current = false;
			}
			if (keyboardDragIntervalRef.current) {
				clearInterval(keyboardDragIntervalRef.current);
				keyboardDragIntervalRef.current = null;
			}
			if (keyboardDragWarmupTimerRef.current) {
				clearTimeout(keyboardDragWarmupTimerRef.current);
				keyboardDragWarmupTimerRef.current = null;
			}
		} else {
			let previousTime = getPreviousRecordedSyncTime(nextCharTimes, firstEditableIndex);
			for (let i = firstEditableIndex; i <= startIndex; i++) {
				nextCharTimes[i] = getSequentialSyncTime(currentTime, previousTime);
				previousTime = nextCharTimes[i];
			}
		}
		charTimesRef.current = nextCharTimes;
	}, [mode, currentLineIndex, lyricsLines.length, currentLineChars.length, setRecordingProgressIndex, cacheCharHitBoxes, getActiveRecordingLockIndex, buildLockedCharTimes]);

	const handleDragMove = useCallback((charIndex, e) => {
		if (mode !== 'record' || !isDragging || dragStartTime === null) return;
		e.preventDefault();
		const currentTime = Spicetify.Player.getProgress() / 1000;
		const previousRecordingCharIndex = recordingCharIndexRef.current;

		// 마우스를 너무 위/아래로 움직였거나 영역을 벗어났을 때도 처리가 필요할 수 있음
		// 현재는 index 기반으로만 처리

		if (charIndex < 0) {
			// 영역 왼쪽 밖으로 나감 - 전체 취소 아님, 그냥 인덱스 0 처리?
			// 아니면 드래그 시작점보다 왼쪽으로 가면 그만큼 취소
			// 여기서는 -1이면 아무것도 안함
			return;
		}

		const lockIndex = getActiveRecordingLockIndex();
		const firstEditableIndex = Math.max(0, lockIndex + 1);
		if (charIndex < firstEditableIndex) {
			for (let i = firstEditableIndex; i <= previousRecordingCharIndex; i++) {
				charTimesRef.current[i] = null;
			}
			setRecordingProgressIndex(lockIndex, { commitState: false });
			return;
		}

		if (charIndex >= previousRecordingCharIndex) {
			// 정방향 진행
			for (let i = previousRecordingCharIndex + 1; i <= charIndex; i++) {
				if (charTimesRef.current[i] === null) {
					charTimesRef.current[i] = currentTime;
				}
			}
			setRecordingProgressIndex(charIndex, { commitState: false });
		} else {
			// 역방향 진행 (취소)
			// 현재 recordingCharIndex에서 charIndex+1 까지의 기록을 지움
			for (let i = Math.max(charIndex + 1, firstEditableIndex); i <= previousRecordingCharIndex; i++) {
				charTimesRef.current[i] = null;
			}
			setRecordingProgressIndex(Math.max(charIndex, lockIndex), { commitState: false });
		}
	}, [mode, isDragging, dragStartTime, setRecordingProgressIndex, getActiveRecordingLockIndex]);

	// Commit-time normalization keeps the client aligned with backend validation:
	// chars must be non-decreasing and a line must not start before the previous line ends.
	const normalizeCommittedLineChars = useCallback((rawChars, previousLineEndTime = -1) => {
		const normalizedChars = [];
		let minimumAllowedTime = previousLineEndTime >= 0 ? previousLineEndTime : 0;

		for (let i = 0; i < rawChars.length; i++) {
			const rawTime = typeof rawChars[i] === 'number' ? rawChars[i] : minimumAllowedTime;
			const minimumForChar = i === 0
				? minimumAllowedTime
				: minimumAllowedTime + SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC;
			const normalizedTime = roundSyncTime(Math.max(minimumForChar, rawTime));
			normalizedChars.push(normalizedTime);
			minimumAllowedTime = normalizedTime;
		}

		return normalizedChars;
	}, []);

	const mergeCurrentLineWithNext = useCallback(() => {
		if (!canMergeCurrentLineWithNext) return;

		const currentStart = lineCharOffsets[currentLineIndex] ?? 0;
		const nextStart = lineCharOffsets[currentNextMergeLineIndex];
		const nextEnd = getLineEndAtIndex(currentNextMergeLineIndex);
		if (!Number.isInteger(currentStart) || !Number.isInteger(nextStart) || nextEnd < nextStart) return;

		const nextMergedLineIndexes = [...currentMergedLineIndexes, currentNextMergeLineIndex]
			.filter((index, position, indexes) => indexes.indexOf(index) === position)
			.sort((a, b) => a - b)
			.slice(0, SYNC_CREATOR_MAX_MERGED_LINES);
		const mergedEnd = getLineEndAtIndex(nextMergedLineIndexes[nextMergedLineIndexes.length - 1]);
		const partIds = 'abcdefghijklmnopqrstuvwxyz'.split('');

		setSyncData(prev => {
			if (!prev || !Array.isArray(prev.lines)) return prev;

			const linesByStart = new Map(prev.lines.map(line => [line.start, line]));
			const currentLineData = linesByStart.get(currentStart);
			const previousLine = prev.lines.reduce((best, line) => {
				if (line.start >= currentStart || !Array.isArray(line.chars) || !line.chars.length) return best;
				return !best || line.start > best.start ? line : best;
			}, null);
			const previousLineEndTime = previousLine?.chars?.[previousLine.chars.length - 1] ?? -1;

			const getPartSnapshot = (lineIndex) => {
				const lineStart = lineCharOffsets[lineIndex];
				const lineEnd = getLineEndAtIndex(lineIndex);
				const lineChars = Array.from(lyricsLines[lineIndex] || '');
				if (!Number.isInteger(lineStart) || lineEnd < lineStart || lineChars.length === 0) return null;

				const directLine = linesByStart.get(lineStart);
				const existingPart = currentLineData?.parallel?.parts?.find(part =>
					Array.isArray(part?.ranges)
					&& part.ranges.some(range =>
						Number(range?.start) <= lineStart
						&& Number(range?.end) >= lineEnd
					)
				);
				const mergedOffsetStart = lineStart - currentStart;
				const mergedOffsetEnd = mergedOffsetStart + lineChars.length;
				const chars = Array.isArray(directLine?.chars) && directLine.chars.length === lineChars.length
					? directLine.chars
					: Array.isArray(existingPart?.chars) && existingPart.chars.length === lineChars.length
						? existingPart.chars
						: Array.isArray(currentLineData?.chars) && currentLineData.chars.length >= mergedOffsetEnd
							? currentLineData.chars.slice(mergedOffsetStart, mergedOffsetEnd)
							: null;
				if (!Array.isArray(chars) || chars.length !== lineChars.length) return null;

				const sourceSpeaker = directLine?.speaker || existingPart?.speaker || currentLineData?.speaker;
				const speaker = normalizeSyncCreatorSpeaker(sourceSpeaker) || SYNC_CREATOR_DEFAULT_SPEAKER;
				const speakerFallback = sanitizeSyncCreatorSpeakerFallback(
					speaker,
					directLine?.['speaker-fallback'] || existingPart?.['speaker-fallback'] || currentLineData?.['speaker-fallback'],
					true,
					sourceSpeaker
				);
				return {
					start: lineStart,
					end: lineEnd,
					chars,
					speaker,
					...(speakerFallback ? { 'speaker-fallback': speakerFallback } : {}),
					'speaker-color': sanitizeSyncCreatorSpeakerColor(
						speaker,
						directLine?.['speaker-color'] || existingPart?.['speaker-color'] || currentLineData?.['speaker-color'],
						true,
						speakerFallback
					),
					kind: normalizeSyncCreatorKind(directLine?.kind || existingPart?.kind || currentLineData?.kind) || SYNC_CREATOR_DEFAULT_KIND
				};
			};

			const snapshots = nextMergedLineIndexes.map(getPartSnapshot);
			const mergedLine = snapshots.every(Boolean)
				? {
					start: currentStart,
					end: mergedEnd,
					chars: normalizeCommittedLineChars(snapshots.flatMap(snapshot => snapshot.chars), previousLineEndTime),
					speaker: snapshots[0].speaker,
					...(snapshots[0]['speaker-fallback'] ? { 'speaker-fallback': snapshots[0]['speaker-fallback'] } : {}),
					...(snapshots[0]['speaker-color'] ? { 'speaker-color': snapshots[0]['speaker-color'] } : {}),
					kind: snapshots[0].kind,
					mergedLineContinuationStarts: nextMergedLineIndexes.slice(1).map(index => lineCharOffsets[index]),
					parallel: sanitizeSyncCreatorParallel({
						layout: 'stack',
						parts: snapshots.map((snapshot, index) => ({
							id: partIds[index] || `p${index + 1}`,
							role: index === 0 ? 'lead' : 'background',
							speaker: snapshot.speaker,
							...(snapshot['speaker-fallback'] ? { 'speaker-fallback': snapshot['speaker-fallback'] } : {}),
							...(snapshot['speaker-color'] ? { 'speaker-color': snapshot['speaker-color'] } : {}),
							kind: snapshot.kind,
							ranges: [{ start: snapshot.start, end: snapshot.end }],
							join: [],
							chars: snapshot.chars
						}))
					})
				}
				: null;
			if (!mergedLine) return prev;

			const lines = prev.lines
				.filter(line => line.start < currentStart || line.start > mergedEnd);

			lines.push(mergedLine);

			lines.sort((a, b) => a.start - b.start);
			return lines.length > 0 ? {
				...prev,
				version: SYNC_CREATOR_SYNC_DATA_VERSION,
				lines
			} : null;
		});

		setMultiVocalMode(true);
		setActiveParallelPartId('a');
		setMergedLineDrafts(prev => ({
			...prev,
			[currentStart]: nextMergedLineIndexes.slice(1).map(index => lineCharOffsets[index])
		}));
		setMode(prev => prev === 'record' ? prev : 'idle');
		setRecordingProgressIndex(-1);
		charTimesRef.current = [];
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
		Toast.success(I18n.t('syncCreator.mergedWithNextLine') || 'Merged with the next line as separate vocal parts.');
	}, [
		canMergeCurrentLineWithNext,
		currentLineIndex,
		currentMergedLineIndexes,
		currentNextMergeLineIndex,
		getLineEndAtIndex,
		lineCharOffsets,
		lyricsLines,
		normalizeCommittedLineChars,
		setRecordingProgressIndex
	]);

	const commitCurrentLineSync = useCallback((rawChars) => {
		if (multiVocalMode && !isCurrentSyncTargetMetaComplete) {
			showMissingMetaToast();
			return null;
		}
		if (multiVocalMode && hasCurrentParallelParts && !activeParallelPart) {
			setActiveParallelPartId(currentParallelParts[0]?.id || 'full');
			Toast.error(I18n.t('syncCreator.selectVocalPartFirst') || 'Select the vocal part to sync first.');
			return null;
		}
		const lineStart = currentLineStart;
		const lineEnd = lineStart + currentFullLineChars.length - 1;
		const fullCharCount = currentFullLineChars.length;
		const nextLines = syncData?.lines
			? syncData.lines.map((line) => ({
				...line,
				chars: Array.isArray(line.chars) ? [...line.chars] : [],
				parallel: line.parallel ? sanitizeSyncCreatorParallel({
					...line.parallel,
					parts: Array.isArray(line.parallel.parts)
						? line.parallel.parts.map(part => ({
							...part,
							ranges: Array.isArray(part.ranges) ? part.ranges.map(range => ({ ...range })) : [],
							join: Array.isArray(part.join) ? [...part.join] : [],
							chars: Array.isArray(part.chars) ? [...part.chars] : undefined
						}))
						: []
				}) : undefined
			}))
			: [];
		const existingIndex = nextLines.findIndex((line) => line.start === lineStart);
		const existingLine = existingIndex >= 0 ? nextLines[existingIndex] : null;
		const previousLine = nextLines.reduce((best, line) => {
			if (line.start >= lineStart) return best;
			if (!best || line.start > best.start) return line;
			return best;
		}, null);
		const previousLineEndTime = previousLine?.chars?.[previousLine.chars.length - 1] ?? -1;
		const normalizedRawChars = normalizeCommittedLineChars(rawChars, previousLineEndTime);

		const buildFullLineChars = () => {
			if (!activeParallelPart) {
				return normalizeCommittedLineChars(rawChars, previousLineEndTime);
			}

			const fullChars = Array.isArray(existingLine?.chars) && existingLine.chars.length === fullCharCount
				? [...existingLine.chars]
				: new Array(fullCharCount).fill(null);

			currentLineCharRefs.forEach((ref, index) => {
				if (ref.localIndex >= 0 && ref.localIndex < fullChars.length) {
					fullChars[ref.localIndex] = normalizedRawChars[index];
				}
			});

			const firstKnown = fullChars.find(time => typeof time === 'number');
			for (let index = 0; index < fullChars.length; index++) {
				if (typeof fullChars[index] === 'number') continue;
				const previous = index > 0 && typeof fullChars[index - 1] === 'number' ? fullChars[index - 1] : null;
				const next = fullChars.slice(index + 1).find(time => typeof time === 'number');
				fullChars[index] = previous ?? next ?? firstKnown ?? 0;
			}

			return normalizeCommittedLineChars(fullChars, previousLineEndTime);
		};

		const fullLineChars = buildFullLineChars();
			const lineData = {
				...(existingLine || {}),
				start: lineStart,
				end: lineEnd,
				chars: fullLineChars.map((time) => roundSyncTime(time))
			};
		const leadMetaPart = currentParallelData?.parts?.find(part => part.role === 'lead') || currentParallelData?.parts?.[0] || activeParallelPart;
		const lineMetaDraft = lineMetaDrafts[lineStart] || {};
		const hasLineSpeakerDraft = Object.prototype.hasOwnProperty.call(lineMetaDraft, 'speaker');
		const hasLineSpeakerColorDraft = Object.prototype.hasOwnProperty.call(lineMetaDraft, 'speaker-color');
		const hasLineSpeakerFallbackDraft = Object.prototype.hasOwnProperty.call(lineMetaDraft, 'speaker-fallback');
		const hasLineKindDraft = Object.prototype.hasOwnProperty.call(lineMetaDraft, 'kind');
		const draftLineSpeaker = normalizeSyncCreatorSpeaker(lineMetaDraft.speaker);
		const draftLineKind = normalizeSyncCreatorKind(lineMetaDraft.kind);
		const existingLineSpeaker = normalizeSyncCreatorSpeaker(existingLine?.speaker);
		const existingLineKind = normalizeSyncCreatorKind(existingLine?.kind);
		const lineSpeaker = hasLineSpeakerDraft
			? draftLineSpeaker || SYNC_CREATOR_DEFAULT_SPEAKER
			: currentLineMeta.speaker || existingLineSpeaker || leadMetaPart?.speaker || SYNC_CREATOR_DEFAULT_SPEAKER;
		const lineKind = hasLineKindDraft
			? draftLineKind || SYNC_CREATOR_DEFAULT_KIND
			: currentLineMeta.kind || existingLineKind || leadMetaPart?.kind || SYNC_CREATOR_DEFAULT_KIND;
		const lineSpeakerFallback = sanitizeSyncCreatorSpeakerFallback(
			lineSpeaker,
			hasLineSpeakerFallbackDraft
				? lineMetaDraft['speaker-fallback']
				: currentLineMeta['speaker-fallback'] || existingLine?.['speaker-fallback'] || leadMetaPart?.['speaker-fallback'],
			true,
			hasLineSpeakerDraft ? lineMetaDraft.speaker : existingLine?.speaker || leadMetaPart?.speaker || lineSpeaker
		);
		const lineSpeakerColor = sanitizeSyncCreatorSpeakerColor(
			lineSpeaker,
			hasLineSpeakerColorDraft
				? lineMetaDraft['speaker-color']
				: currentLineMeta['speaker-color'] || existingLine?.['speaker-color'] || leadMetaPart?.['speaker-color'],
			true,
			lineSpeakerFallback
		);
		const shouldPersistLineSpeaker = multiVocalMode || lineSpeaker !== SYNC_CREATOR_DEFAULT_SPEAKER;
		const shouldPersistLineKind = multiVocalMode || lineKind !== SYNC_CREATOR_DEFAULT_KIND;
		if (lineSpeaker && shouldPersistLineSpeaker) {
			lineData.speaker = lineSpeaker;
		} else {
			delete lineData.speaker;
		}
		if (lineSpeakerFallback) {
			lineData['speaker-fallback'] = lineSpeakerFallback;
		} else {
			delete lineData['speaker-fallback'];
		}
		if (lineSpeakerColor) {
			lineData['speaker-color'] = lineSpeakerColor;
		} else {
			delete lineData['speaker-color'];
		}
		if (lineKind && shouldPersistLineKind) {
			lineData.kind = lineKind;
		} else {
			delete lineData.kind;
		}

		if (activeParallelPart && currentParallelData) {
			const existingParts = Array.isArray(existingLine?.parallel?.parts) ? existingLine.parallel.parts : [];
			const parts = currentParallelData.parts
				.map((part) => {
					const existingPart = existingParts.find(item => item.id === part.id);
					const partSpeakerFallback = sanitizeSyncCreatorSpeakerFallback(
						part.speaker,
						part['speaker-fallback'],
						true,
						existingPart?.speaker || part.speaker
					);
					const partSpeakerColor = sanitizeSyncCreatorSpeakerColor(
						part.speaker,
						part['speaker-color'],
						true,
						partSpeakerFallback
					);
					const expectedChars = countRangeChars(part.ranges);
					const syncedChars = part.id === activeParallelPart.id
						? normalizedRawChars.map((time) => roundSyncTime(time))
						: (Array.isArray(existingPart?.chars) ? existingPart.chars : undefined);
					if (part.id === activeParallelPart.id && (!Array.isArray(syncedChars) || syncedChars.length !== expectedChars)) {
						return null;
					}
					const nextPart = {
						id: part.id,
						role: part.role,
						speaker: part.speaker,
						...(partSpeakerFallback
							? { 'speaker-fallback': partSpeakerFallback }
							: {}),
						...(partSpeakerColor
							? { 'speaker-color': partSpeakerColor }
							: {}),
						kind: part.kind,
						ranges: part.ranges,
						join: part.join || []
					};
					if (Array.isArray(syncedChars) && syncedChars.length === expectedChars) {
						nextPart.chars = syncedChars;
					}
					return nextPart;
				})
				.filter(Boolean);

			if (parts.length > 0) {
				lineData.parallel = sanitizeSyncCreatorParallel({
					layout: currentParallelData.layout || 'stack',
					hiddenRanges: currentParallelData.hiddenRanges || [],
					parts
				});
			} else {
				delete lineData.parallel;
			}
		}

		if (existingIndex >= 0) {
			nextLines[existingIndex] = lineData;
		} else {
			nextLines.push(lineData);
		}

		nextLines.sort((a, b) => a.start - b.start);

		const committedLineIndex = nextLines.findIndex((line) => line.start === lineStart);
		const previousSortedLine = committedLineIndex > 0 ? nextLines[committedLineIndex - 1] : null;
		const previousSortedLineEndTime = previousSortedLine?.chars?.[previousSortedLine.chars.length - 1] ?? -1;
		const normalizedLineData = {
			...lineData,
			chars: normalizeCommittedLineChars(lineData.chars, previousSortedLineEndTime)
		};
		const normalizedLastCharTime = normalizedLineData.chars[normalizedLineData.chars.length - 1];

		nextLines[committedLineIndex] = normalizedLineData;

		const mergedLineComplete = currentLineMergedWithNext
			&& Array.isArray(currentParallelData?.parts)
			&& currentParallelData.parts.length > 1
			&& Array.isArray(normalizedLineData.parallel?.parts)
			&& currentParallelData.parts.every(part => {
				const savedPart = normalizedLineData.parallel.parts.find(item => item.id === part.id);
				return Array.isArray(savedPart?.chars) && savedPart.chars.length === countRangeChars(part.ranges);
			});
		const candidateLines = mergedLineComplete
			? nextLines.filter(line => line.start <= lineStart || line.start > lineEnd)
			: nextLines;
		const updatedCommittedLineIndex = candidateLines.findIndex((line) => line.start === lineStart);

		const validLines = candidateLines.filter((line, index) => {
			if (index <= updatedCommittedLineIndex) return true;
			return !(line.chars && line.chars[0] < normalizedLastCharTime);
		});

		setSyncData(validLines.length > 0 ? { version: SYNC_CREATOR_SYNC_DATA_VERSION, lines: validLines } : null);
		return normalizedLineData;
	}, [
		syncData,
		currentLineStart,
		currentFullLineChars.length,
		currentLineCharRefs,
		activeParallelPart,
		hasCurrentParallelParts,
		currentParallelData,
		currentParallelParts,
		currentLineMeta,
		lineMetaDrafts,
		multiVocalMode,
		currentLineMergedWithNext,
		isCurrentSyncTargetMetaComplete,
		showMissingMetaToast,
		normalizeCommittedLineChars
	]);

	const handleDragEnd = useCallback((e) => {
		const endCharIndex = recordingCharIndexRef.current;
		if (mode !== 'record' || !isDragging || dragStartTime === null || endCharIndex === -1) {
			setIsDragging(false);
			return;
		}

		e.preventDefault();

		// 드래그가 시작점보다 왼쪽에서 끝났으면 취소로 간주할 수도 있으나,
		// 여기서는 recordingCharIndex가 유효한 마지막 지점이므로 거기까지만 저장

		const endTime = Spicetify.Player.getProgress() / 1000;
		const charCount = currentLineChars.length;
		const lockIndex = getActiveRecordingLockIndex();
		if (lockIndex >= 0 && endCharIndex <= lockIndex) {
			setDragStartTime(null);
			setDragStartCharIndex(-1);
			setRecordingProgressIndex(lockIndex, { commitState: false });
			setIsDragging(false);
			charTimesRef.current = buildLockedCharTimes(lockIndex);
			charHitBoxesRef.current = [];
			charScrollMetricsRef.current = [];
			return;
		}

		// 유효성 체크: 만약 드래그 시작하자마자 바로 끝나거나 이상한 경우
		if (endCharIndex < dragStartCharIndex) {
			// 시작점보다 뒤로 가서 끝났으면 해당 부분은 싱크 안함 (혹은 이전 싱크 유지)
			// 여기서는 그냥 저장 진행 (지워진 상태로)
			// 만약 전체를 취소하고 싶다면 별도 처리가 필요하지만, 
			// UX상 왼쪽으로 가서 놓으면 그 부분은 싱크가 안 된 상태가 됨.
		}

		const chars = [];
		for (let i = 0; i < charCount; i++) {
			let time;
			if (charTimesRef.current[i] !== null) {
				time = charTimesRef.current[i];
			} else if (i <= endCharIndex) {
				// 중간에 빈 곳이 있으면 채움 (보간)
				const prevTime = chars[chars.length - 1] || dragStartTime;
				time = prevTime + 0.02;
			} else {
				// 끝부분 이후는 자동 채움 (보간)
				const remainingCount = charCount - endCharIndex - 1;
				const perCharDuration = 0.5 / Math.max(1, remainingCount);
				time = endTime + ((i - endCharIndex) * perCharDuration);
			}
			// 소수점 3자리로 반올림
			chars.push(Math.round(time * 1000) / 1000);
		}

		const committedLine = commitCurrentLineSync(chars);
		if (!committedLine) {
			setDragStartTime(null);
			setDragStartCharIndex(-1);
			setRecordingProgressIndex(-1);
			setIsDragging(false);
			charTimesRef.current = [];
			charHitBoxesRef.current = [];
			charScrollMetricsRef.current = [];
			return;
		}

		const isComplete = endCharIndex >= charCount - 1;
		if (isComplete) {
			advanceAfterCompletedTarget(committedLine);
		}

		clearRecordingLock();
		setDragStartTime(null);
		setDragStartCharIndex(-1);
		setRecordingProgressIndex(-1);
		setIsDragging(false);
		charTimesRef.current = [];
		charHitBoxesRef.current = [];
		charScrollMetricsRef.current = [];
	}, [mode, isDragging, dragStartTime, currentLineIndex, currentLineChars, lyricsLines.length, dragStartCharIndex, commitCurrentLineSync, advanceAfterCompletedTarget, setRecordingProgressIndex, getActiveRecordingLockIndex, buildLockedCharTimes, clearRecordingLock]);

	// 키보드 싱크 상태 ref (isDragging과 별개로 키보드용)
	const isKeyboardSyncingRef = useRef(false);
	const keyboardCharIndexRef = useRef(-1);

	// 드래그 키(/) 연속 입력을 위한 인터벌 ref
	const keyboardDragIntervalRef = useRef(null);
	const keyboardDragWarmupTimerRef = useRef(null);
	const isKeyboardDraggingRef = useRef(false);

	// 이전 라인 인덱스 추적 (라인 변경 감지용)
	const prevLineIndexRef = useRef(currentLineIndex);
	const prevKeyboardTargetRef = useRef(activeParallelTargetId);

	// 동적 보간 모드를 위한 ref
	// pendingWordSync: 이전 단어의 시작 시간과 인덱스 범위를 저장
	// 다음 단어가 탭되면 이전 단어의 글자들에 보간된 시간 적용
	const pendingWordSyncRef = useRef(null);
	const pendingSyllableSyncRef = useRef(null);
	// 단어 간 최소 간격 (ms) - 단어가 즉시 전환되지 않도록
	const WORD_GAP_MS = 80;
	// 단어 내 보간 활성화 여부
	const interpolationEnabledRef = useRef(true);

	const resetCurrentSyncInput = useCallback(() => {
		isKeyboardSyncingRef.current = false;
		keyboardCharIndexRef.current = -1;
		charTimesRef.current = [];
		pendingWordSyncRef.current = null;
		pendingSyllableSyncRef.current = null;
		clearRecordingLock();
		setDragStartTime(null);
		setDragStartCharIndex(-1);
		setRecordingProgressIndex(-1);
		setIsDragging(false);
		charHitBoxesRef.current = [];
		charScrollMetricsRef.current = [];
		if (keyboardDragIntervalRef.current) {
			clearInterval(keyboardDragIntervalRef.current);
			keyboardDragIntervalRef.current = null;
		}
		if (keyboardDragWarmupTimerRef.current) {
			clearTimeout(keyboardDragWarmupTimerRef.current);
			keyboardDragWarmupTimerRef.current = null;
		}
		isKeyboardDraggingRef.current = false;
	}, [setRecordingProgressIndex, clearRecordingLock]);

	const handleCharacterContextMenu = useCallback((charIndex, e) => {
		e.preventDefault();
		e.stopPropagation();

		if (mode !== 'record' || currentLineIndex >= lyricsLines.length || !currentLineChars.length) return;
		if (!isCurrentSyncTargetMetaComplete) {
			showMissingMetaToast();
			return;
		}

		const safeIndex = Math.max(0, Math.min(charIndex, currentLineChars.length - 1));
		if (recordingLockIndexRef.current === safeIndex) {
			clearRecordingLock();
			isKeyboardSyncingRef.current = false;
			keyboardCharIndexRef.current = -1;
			charTimesRef.current = [];
			pendingWordSyncRef.current = null;
			pendingSyllableSyncRef.current = null;
			setDragStartTime(null);
			setDragStartCharIndex(-1);
			setRecordingProgressIndex(-1);
			setIsDragging(false);
			Toast.success(I18n.t('syncCreator.syncLockCleared') || 'Sync lock cleared.');
			return;
		}

		if (safeIndex >= currentLineChars.length - 1) {
			Toast.error(I18n.t('syncCreator.syncLockNoEditableChars') || 'Right-click an earlier character so there is something left to re-sync.');
			return;
		}

		const savedChars = getCurrentSyncTargetSavedChars();
		const missingSavedIndex = savedChars.findIndex((time, index) => index <= safeIndex && typeof time !== 'number');
		if (missingSavedIndex >= 0) {
			Toast.error(I18n.t('syncCreator.syncLockRequiresTiming') || 'Sync this line once before locking part of it.');
			return;
		}

		isKeyboardSyncingRef.current = false;
		keyboardCharIndexRef.current = safeIndex;
		pendingWordSyncRef.current = null;
		pendingSyllableSyncRef.current = null;
		isKeyboardDraggingRef.current = false;
		if (keyboardDragIntervalRef.current) {
			clearInterval(keyboardDragIntervalRef.current);
			keyboardDragIntervalRef.current = null;
		}
		if (keyboardDragWarmupTimerRef.current) {
			clearTimeout(keyboardDragWarmupTimerRef.current);
			keyboardDragWarmupTimerRef.current = null;
		}
		setRecordingLockIndexValue(safeIndex);
		charTimesRef.current = buildLockedCharTimes(safeIndex);
		setDragStartTime(null);
		setDragStartCharIndex(-1);
		setRecordingProgressIndex(safeIndex, { commitState: false });
		setIsDragging(false);
		Toast.success(I18n.t('syncCreator.syncLockSet') || 'Locked timing up to the selected character.');
	}, [
		mode,
		currentLineIndex,
		lyricsLines.length,
		currentLineChars.length,
		isCurrentSyncTargetMetaComplete,
		showMissingMetaToast,
		clearRecordingLock,
		getCurrentSyncTargetSavedChars,
		setRecordingLockIndexValue,
		buildLockedCharTimes,
		setRecordingProgressIndex
	]);

	useEffect(() => () => {
		if (keyboardDragIntervalRef.current) {
			clearInterval(keyboardDragIntervalRef.current);
			keyboardDragIntervalRef.current = null;
		}
		if (keyboardDragWarmupTimerRef.current) {
			clearTimeout(keyboardDragWarmupTimerRef.current);
			keyboardDragWarmupTimerRef.current = null;
		}
		isKeyboardDraggingRef.current = false;
	}, []);

	const selectParallelPart = useCallback((partId) => {
		if (!partId) return;
		if (activeParallelTargetId !== partId) {
			resetCurrentSyncInput();
		}
		setActiveParallelPartId(partId);
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [activeParallelTargetId, resetCurrentSyncInput]);

	// 키보드 이벤트 리스너 등록
	useEffect(() => {
		// 라인이 변경되었는지 확인
		const lineChanged = prevLineIndexRef.current !== currentLineIndex;
		if (lineChanged) {
			prevLineIndexRef.current = currentLineIndex;
		}
		const targetChanged = prevKeyboardTargetRef.current !== activeParallelTargetId;
		if (targetChanged) {
			prevKeyboardTargetRef.current = activeParallelTargetId;
		}

		// record 모드가 아니거나 라인이 변경되면 키보드 싱크 상태 초기화
		const shouldReset = mode !== 'record' || lineChanged || targetChanged;
		if (shouldReset && recordingLockIndexRef.current >= 0) {
			clearRecordingLock();
		}
		if (shouldReset && (isKeyboardSyncingRef.current || isKeyboardDraggingRef.current)) {
			window.__ivLyricsDebugLog?.('[SyncDataCreator] Resetting keyboard sync state, mode:', mode, 'lineChanged:', lineChanged, 'targetChanged:', targetChanged);
			// 진행 중인 키보드 싱크 초기화
			isKeyboardSyncingRef.current = false;
			keyboardCharIndexRef.current = -1;
			charTimesRef.current = [];
			pendingWordSyncRef.current = null; // 보간 대기 상태도 초기화
			pendingSyllableSyncRef.current = null;
			setDragStartTime(null);
			setRecordingProgressIndex(-1);
			// 드래그 모드도 초기화
			if (isKeyboardDraggingRef.current) {
				isKeyboardDraggingRef.current = false;
				if (keyboardDragIntervalRef.current) {
					clearInterval(keyboardDragIntervalRef.current);
					keyboardDragIntervalRef.current = null;
				}
			}
			if (keyboardDragWarmupTimerRef.current) {
				clearTimeout(keyboardDragWarmupTimerRef.current);
				keyboardDragWarmupTimerRef.current = null;
			}
		}

		const finishKeyboardSync = () => {
			if (!isKeyboardSyncingRef.current) return;

			const endTime = Spicetify.Player.getProgress() / 1000;
			const endCharIndex = keyboardCharIndexRef.current;
			const charCount = currentLineChars.length;

			const chars = [];
			const startTime = charTimesRef.current[0] || endTime;
			for (let i = 0; i < charCount; i++) {
				let time;
				if (charTimesRef.current[i] !== null) {
					time = charTimesRef.current[i];
				} else if (i <= endCharIndex) {
					const prevTime = chars[chars.length - 1] || startTime;
					time = prevTime + 0.02;
				} else {
					const remainingCount = charCount - endCharIndex - 1;
					const perCharDuration = 0.5 / Math.max(1, remainingCount);
					time = endTime + ((i - endCharIndex) * perCharDuration);
				}
				chars.push(Math.round(time * 1000) / 1000);
			}

			const committedLine = commitCurrentLineSync(chars);

			// 다음 라인으로 이동
			if (committedLine) {
				advanceAfterCompletedTarget(committedLine);
			}

			// 키보드 싱크 상태 초기화
			isKeyboardSyncingRef.current = false;
			keyboardCharIndexRef.current = -1;
			charTimesRef.current = [];
			pendingWordSyncRef.current = null;
			pendingSyllableSyncRef.current = null;
			clearRecordingLock();
			setDragStartTime(null);
			setRecordingProgressIndex(-1);
		};

		const handleKeyDown = (e) => {
			const normalizedHotkey = getNormalizedHotkeyFromEvent(e);
			const isDragHotkey = isSyncCreatorDragHotkeyEvent(e, normalizedHotkey);
			const shortcutBindings = getSyncCreatorShortcutBindings();
			const shortcutAction = Object.entries(shortcutBindings)
				.find(([, bindings]) => bindings.includes(normalizedHotkey))?.[0] || null;
			const staticHotkeys = new Set(['enter', 'backspace', 'space', 'z', 'x']);
			if (!shortcutAction && !isDragHotkey && !staticHotkeys.has(normalizedHotkey)) return;

			// record 모드가 아니면 처리하지 않음
			if (mode !== 'record') return;
			if (!isCurrentSyncTargetMetaComplete) {
				showMissingMetaToast();
				return;
			}

			window.__ivLyricsDebugLog?.('[SyncDataCreator] KeyDown:', e.key, 'normalized:', normalizedHotkey, 'mode:', mode, 'lineIndex:', currentLineIndex);

			if (currentLineIndex >= lyricsLines.length) return;
			if (!currentLineChars.length) return;
			const shouldAutoAdvanceBoundaryChars = readSyncCreatorBooleanSetting(SYNC_CREATOR_AUTO_BOUNDARY_CHARS_KEY, true);

			const consumeKeyboardEvent = () => {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
			};

			// 한 글자 앞으로 진행하는 헬퍼 함수
			const advanceOneChar = (currentTime) => {
				if (!isKeyboardSyncingRef.current) {
					const lockIndex = getActiveRecordingLockIndex();
					if (lockIndex >= currentLineChars.length - 1) {
						Toast.error(I18n.t('syncCreator.syncLockNoEditableChars') || 'Right-click an earlier character so there is something left to re-sync.');
						return -1;
					}
					// 키보드 싱크 시작
					isKeyboardSyncingRef.current = true;
					let startIndex = Math.max(0, lockIndex + 1);
					charTimesRef.current = buildLockedCharTimes(lockIndex);
					pendingWordSyncRef.current = null;
					pendingSyllableSyncRef.current = null;
					charTimesRef.current[startIndex] = currentTime;

					// 첫 글자가 여는 괄호면 다음 글자까지 포함
					if (shouldAutoAdvanceBoundaryChars && isLeadingChar(currentLineChars, startIndex)) {
						while (startIndex + 1 < currentLineChars.length && isLeadingChar(currentLineChars, startIndex)) {
							startIndex++;
							charTimesRef.current[startIndex] = currentTime;
						}
					}

					// 다음 글자가 구두점/닫는괄호/공백이면 함께 처리
					if (shouldAutoAdvanceBoundaryChars) {
						while (startIndex + 1 < currentLineChars.length && isTrailingChar(currentLineChars, startIndex + 1)) {
							startIndex++;
							charTimesRef.current[startIndex] = currentTime;
						}
					}

					keyboardCharIndexRef.current = startIndex;
					setDragStartTime(currentTime);
					setRecordingProgressIndex(startIndex, { commitState: false });
					window.__ivLyricsDebugLog?.('[SyncDataCreator] Started keyboard sync, chars:', currentLineChars.length, 'startIndex:', startIndex);
					return startIndex;
				} else {
					// 다음 글자로 진행
					const lockIndex = getActiveRecordingLockIndex();
					let nextIndex = Math.max(keyboardCharIndexRef.current + 1, lockIndex + 1);
					if (nextIndex < currentLineChars.length) {
						charTimesRef.current[nextIndex] = currentTime;

						// 현재 글자가 여는 괄호면 다음 글자까지 포함
						if (shouldAutoAdvanceBoundaryChars) {
							while (nextIndex + 1 < currentLineChars.length && isLeadingChar(currentLineChars, nextIndex)) {
								nextIndex++;
								charTimesRef.current[nextIndex] = currentTime;
							}
						}

						// 다음 글자가 구두점/닫는괄호/공백이면 함께 처리
						if (shouldAutoAdvanceBoundaryChars) {
							while (nextIndex + 1 < currentLineChars.length && isTrailingChar(currentLineChars, nextIndex + 1)) {
								nextIndex++;
								charTimesRef.current[nextIndex] = currentTime;
							}
						}

						keyboardCharIndexRef.current = nextIndex;
						setRecordingProgressIndex(nextIndex, { commitState: false });
						window.__ivLyricsDebugLog?.('[SyncDataCreator] Advanced to char:', nextIndex);
					}

					// 마지막 글자면 라인 완료
					if (keyboardCharIndexRef.current >= currentLineChars.length - 1) {
						finishKeyboardSync();
						window.__ivLyricsDebugLog?.('[SyncDataCreator] Line completed');
						return -1; // 완료됨
					}
					return keyboardCharIndexRef.current;
				}
			};

			// 이전 단어에 보간 적용하는 헬퍼 함수
			const applyInterpolationToPendingWord = (nextWordStartTime) => {
				if (!pendingWordSyncRef.current || !interpolationEnabledRef.current) return;

				const { startIdx, endIdx, startTime } = pendingWordSyncRef.current;
				const charCount = endIdx - startIdx + 1;

				if (charCount <= 1) {
					// 한 글자 단어는 보간 불필요
					pendingWordSyncRef.current = null;
					return;
				}

				// 단어 간 최소 간격을 뺀 시간 내에서 보간
				const wordEndTime = nextWordStartTime - (WORD_GAP_MS / 1000);
				const duration = Math.max(0, wordEndTime - startTime);

				applyInterpolatedRangeToCharTimes(
					charTimesRef.current,
					startIdx,
					endIdx,
					startTime,
					startTime + duration,
					smoothStepInterpolation
				);

				window.__ivLyricsDebugLog?.('[SyncDataCreator] Applied interpolation to word:', startIdx, '-', endIdx, 'duration:', duration.toFixed(3));
				pendingWordSyncRef.current = null;
			};

			const applyInterpolationToPendingSyllable = (nextSyllableStartTime) => {
				if (!pendingSyllableSyncRef.current || !interpolationEnabledRef.current) return;

				const { startIdx, endIdx, startTime } = pendingSyllableSyncRef.current;
				const endTime = Math.max(startTime, nextSyllableStartTime - EDGE_INTERPOLATION_GAP_SEC);
				applyInterpolatedRangeToCharTimes(
					charTimesRef.current,
					startIdx,
					endIdx,
					startTime,
					endTime
				);

				window.__ivLyricsDebugLog?.('[SyncDataCreator] Applied interpolation to syllable:', startIdx, '-', endIdx, 'duration:', (endTime - startTime).toFixed(3));
				pendingSyllableSyncRef.current = null;
			};

			// 한 단어 앞으로 진행하는 헬퍼 함수
			const advanceOneWord = (currentTime) => {
				// 싱크가 시작되지 않은 경우: 첫 단어만 처리
				if (!isKeyboardSyncingRef.current) {
					const lockIndex = getActiveRecordingLockIndex();
					if (lockIndex >= currentLineChars.length - 1) {
						Toast.error(I18n.t('syncCreator.syncLockNoEditableChars') || 'Right-click an earlier character so there is something left to re-sync.');
						return;
					}
					isKeyboardSyncingRef.current = true;
					charTimesRef.current = buildLockedCharTimes(lockIndex);
					setDragStartTime(currentTime);

					let startIdx = Math.max(0, lockIndex + 1);
					const wordStartIdx = startIdx;
					charTimesRef.current[startIdx] = currentTime;

					// 첫 글자가 여는 괄호면 다음 글자까지 포함
					while (startIdx + 1 < currentLineChars.length && isLeadingChar(currentLineChars, startIdx)) {
						startIdx++;
						charTimesRef.current[startIdx] = currentTime;
					}

					// 첫 단어의 끝까지 진행 (단어 경계 만나면 멈춤)
					let endIdx = startIdx;
					while (endIdx + 1 < currentLineChars.length &&
						!isWordBoundary(currentLineChars, endIdx + 1) &&
						!isTrailingChar(currentLineChars, endIdx + 1)) {
						endIdx++;
						charTimesRef.current[endIdx] = currentTime;
					}

					// trailing 문자들(구두점 등) 포함
					while (endIdx + 1 < currentLineChars.length &&
						isTrailingChar(currentLineChars, endIdx + 1) &&
						!isWordBoundary(currentLineChars, endIdx + 1)) {
						endIdx++;
						charTimesRef.current[endIdx] = currentTime;
					}

					keyboardCharIndexRef.current = endIdx;
					setRecordingProgressIndex(endIdx, { commitState: false });

					window.__ivLyricsDebugLog?.('[SyncDataCreator] Word sync started, first word ends at:', endIdx);

					// 마지막 글자면 라인 완료 (보간 적용 후)
					if (keyboardCharIndexRef.current >= currentLineChars.length - 1) {
						// 첫 단어이자 마지막 단어인 경우에도 보간 적용
						if (interpolationEnabledRef.current && endIdx > wordStartIdx) {
							const duration = estimateWordInterpolationDuration(wordStartIdx, endIdx);
							applyInterpolatedRangeToCharTimes(charTimesRef.current, wordStartIdx, endIdx, currentTime, currentTime + duration, smoothStepInterpolation);
							window.__ivLyricsDebugLog?.('[SyncDataCreator] Applied interpolation to single word line');
						}
						finishKeyboardSync();
						window.__ivLyricsDebugLog?.('[SyncDataCreator] Line completed by word');
					} else {
						// 보간을 위해 현재 단어 정보 저장 (보간 활성화 시)
						if (interpolationEnabledRef.current) {
							pendingWordSyncRef.current = {
								startIdx: wordStartIdx,
								endIdx: endIdx,
								startTime: currentTime
							};
						}
					}
					return;
				}

				// 이미 싱크 중인 경우: 이전 단어에 보간 적용 후 다음 단어로 진행
				applyInterpolationToPendingWord(currentTime);

				const lockIndex = getActiveRecordingLockIndex();
				const startIdx = Math.max(keyboardCharIndexRef.current, lockIndex);
				let endIdx = startIdx + 1;

				// 먼저 현재 공백들 건너뛰기
				while (endIdx < currentLineChars.length && isWordBoundary(currentLineChars, endIdx)) {
					// 공백에는 이전 단어 끝 시간 + 갭 적용
					charTimesRef.current[endIdx] = currentTime - (WORD_GAP_MS / 2000);
					endIdx++;
				}

				// 다음 단어의 시작 인덱스
				const nextWordStartIdx = endIdx;

				// 다음 단어 경계까지 진행
				while (endIdx < currentLineChars.length && !isWordBoundary(currentLineChars, endIdx) && !isTrailingChar(currentLineChars, endIdx)) {
					charTimesRef.current[endIdx] = currentTime;
					endIdx++;
				}

				// trailing 문자들도 함께 처리
				while (endIdx < currentLineChars.length && isTrailingChar(currentLineChars, endIdx) && !isWordBoundary(currentLineChars, endIdx)) {
					charTimesRef.current[endIdx] = currentTime;
					endIdx++;
				}

				// 최소 한 글자는 진행했는지 확인
				if (endIdx <= startIdx + 1) {
					endIdx = Math.min(startIdx + 1, currentLineChars.length - 1);
					charTimesRef.current[endIdx] = currentTime;
				}

				// endIdx는 마지막으로 처리된 글자의 다음 인덱스이므로 -1
				const finalEndIdx = endIdx - 1;
				keyboardCharIndexRef.current = Math.max(0, finalEndIdx);

				setRecordingProgressIndex(keyboardCharIndexRef.current, { commitState: false });

				// 보간을 위해 현재 단어 정보 저장
				if (interpolationEnabledRef.current && nextWordStartIdx < currentLineChars.length) {
					pendingWordSyncRef.current = {
						startIdx: nextWordStartIdx,
						endIdx: keyboardCharIndexRef.current,
						startTime: currentTime
					};
				}

				window.__ivLyricsDebugLog?.('[SyncDataCreator] Word advanced to char:', keyboardCharIndexRef.current);

				// 마지막 글자면 라인 완료
				if (keyboardCharIndexRef.current >= currentLineChars.length - 1) {
					// 마지막 단어에도 보간 적용 (현재 시간 기준으로 약간의 지속시간 부여)
					if (pendingWordSyncRef.current && interpolationEnabledRef.current) {
						const { startIdx, endIdx, startTime } = pendingWordSyncRef.current;
						const charCount = endIdx - startIdx + 1;
						if (charCount > 1) {
							// 마지막 단어는 시작 시간으로부터 글자 수에 비례한 짧은 지속시간 부여
							const duration = estimateWordInterpolationDuration(startIdx, endIdx);
							applyInterpolatedRangeToCharTimes(charTimesRef.current, startIdx, endIdx, startTime, startTime + duration, smoothStepInterpolation);
							window.__ivLyricsDebugLog?.('[SyncDataCreator] Applied interpolation to last word:', startIdx, '-', endIdx);
						}
					}
					pendingWordSyncRef.current = null;
					finishKeyboardSync();
					window.__ivLyricsDebugLog?.('[SyncDataCreator] Line completed by word');
				}
			};

			// 한 단어 뒤로 취소하는 헬퍼 함수 (첫 글자도 취소 가능)
			const revertOneWord = () => {
				if (!isKeyboardSyncingRef.current || keyboardCharIndexRef.current < 0) return;
				const lockIndex = getActiveRecordingLockIndex();
				if (keyboardCharIndexRef.current <= lockIndex) return;

				// 보간 대기 중인 단어 취소
				pendingWordSyncRef.current = null;

				let targetIdx = keyboardCharIndexRef.current - 1;

				// trailing 문자들 건너뛰기
				while (targetIdx > lockIndex && isTrailingChar(currentLineChars, targetIdx)) {
					charTimesRef.current[targetIdx + 1] = null;
					targetIdx--;
				}

				// 단어 경계까지 뒤로 가기
				while (targetIdx > lockIndex && !isWordBoundary(currentLineChars, targetIdx)) {
					charTimesRef.current[targetIdx + 1] = null;
					targetIdx--;
				}

				// 공백들 건너뛰기
				while (targetIdx > lockIndex && isWordBoundary(currentLineChars, targetIdx)) {
					charTimesRef.current[targetIdx + 1] = null;
					targetIdx--;
				}

				// 현재 위치부터 targetIdx+1까지의 타임 null 처리
				for (let i = Math.max(targetIdx + 1, lockIndex + 1); i <= keyboardCharIndexRef.current; i++) {
					charTimesRef.current[i] = null;
				}

				keyboardCharIndexRef.current = Math.max(targetIdx, lockIndex);
				setRecordingProgressIndex(keyboardCharIndexRef.current, { commitState: false });
				window.__ivLyricsDebugLog?.('[SyncDataCreator] Word reverted to char:', keyboardCharIndexRef.current);

				// 모든 글자 취소시 싱크 상태 초기화
				if (keyboardCharIndexRef.current <= lockIndex) {
					isKeyboardSyncingRef.current = false;
					setDragStartTime(null);
					window.__ivLyricsDebugLog?.('[SyncDataCreator] All chars reverted by word, sync reset');
				}
			};

			// 오른쪽 방향키: 한 글자 싱크
			if (shortcutAction === 'charForward') {
				consumeKeyboardEvent();
				const currentTime = Spicetify.Player.getProgress() / 1000;
				advanceOneChar(currentTime);
				return;
			}

			// 왼쪽 방향키: 한 글자 취소 (첫 글자도 취소 가능)
			if (shortcutAction === 'charBack') {
				consumeKeyboardEvent();
				if (isKeyboardSyncingRef.current && keyboardCharIndexRef.current >= 0) {
					const lockIndex = getActiveRecordingLockIndex();
					if (keyboardCharIndexRef.current <= lockIndex) return;
					pendingWordSyncRef.current = null;
					pendingSyllableSyncRef.current = null;
					charTimesRef.current[keyboardCharIndexRef.current] = null;
					keyboardCharIndexRef.current--;
					setRecordingProgressIndex(keyboardCharIndexRef.current, { commitState: false });
					window.__ivLyricsDebugLog?.('[SyncDataCreator] Reverted to char:', keyboardCharIndexRef.current);
					// 모든 글자 취소시 싱크 상태 초기화
					if (keyboardCharIndexRef.current <= lockIndex) {
						isKeyboardSyncingRef.current = false;
						setDragStartTime(null);
						window.__ivLyricsDebugLog?.('[SyncDataCreator] All chars reverted, sync reset');
					}
				}
				return;
			}

			// . (> 키): 한 단어 싱크
			if (shortcutAction === 'wordForward') {
				consumeKeyboardEvent();
				const currentTime = Spicetify.Player.getProgress() / 1000;
				advanceOneWord(currentTime);
				return;
			}

			// , (< 키): 한 단어 취소
			if (shortcutAction === 'wordBack') {
				consumeKeyboardEvent();
				pendingSyllableSyncRef.current = null;
				revertOneWord();
				return;
			}

			// ; 키: 음절 단위 싱크 (다음 모음까지 진행)
			if (shortcutAction === 'syllable') {
				consumeKeyboardEvent();
				const currentTime = Spicetify.Player.getProgress() / 1000;

				if (!currentLineEffectiveSyllableSegments.length) {
					return;
				}

				if (!isKeyboardSyncingRef.current) {
					const lockIndex = getActiveRecordingLockIndex();
					if (lockIndex >= currentLineChars.length - 1) {
						Toast.error(I18n.t('syncCreator.syncLockNoEditableChars') || 'Right-click an earlier character so there is something left to re-sync.');
						return;
					}
					isKeyboardSyncingRef.current = true;
					charTimesRef.current = buildLockedCharTimes(lockIndex);
					pendingSyllableSyncRef.current = null;
					setDragStartTime(currentTime);
					pendingWordSyncRef.current = null;

					const firstSegment = currentLineEffectiveSyllableSegments.find(segment => segment.end > lockIndex);
					if (!firstSegment) {
						isKeyboardSyncingRef.current = false;
						keyboardCharIndexRef.current = lockIndex;
						return;
					}
					const segmentStart = Math.max(firstSegment.start, lockIndex + 1);
					for (let i = segmentStart; i <= firstSegment.end; i++) {
						charTimesRef.current[i] = currentTime;
					}

					keyboardCharIndexRef.current = firstSegment.end;
					setRecordingProgressIndex(firstSegment.end, { commitState: false });
					window.__ivLyricsDebugLog?.('[SyncDataCreator] Syllable sync started, segment:', firstSegment.start, '-', firstSegment.end);

					if (firstSegment.end >= currentLineChars.length - 1) {
						const duration = estimateSegmentDuration(segmentStart, firstSegment.end, 0.05, 0.22);
						applyInterpolatedRangeToCharTimes(charTimesRef.current, segmentStart, firstSegment.end, currentTime, currentTime + duration);
						finishKeyboardSync();
						window.__ivLyricsDebugLog?.('[SyncDataCreator] Line completed by syllable');
						return;
					}

					pendingSyllableSyncRef.current = {
						startIdx: segmentStart,
						endIdx: firstSegment.end,
						startTime: currentTime
					};
					return;
				}

				const currentSegmentIndex = currentLineEffectiveSyllableSegments.findIndex(
					(segment) => keyboardCharIndexRef.current >= segment.start && keyboardCharIndexRef.current <= segment.end
				);
				const nextSegment = currentLineEffectiveSyllableSegments[(currentSegmentIndex >= 0 ? currentSegmentIndex : -1) + 1];

				if (!nextSegment) {
					applyInterpolationToPendingSyllable(currentTime);
					finishKeyboardSync();
					return;
				}

				applyInterpolationToPendingSyllable(currentTime);
				const lockIndex = getActiveRecordingLockIndex();
				const segmentStart = Math.max(nextSegment.start, lockIndex + 1);
				for (let i = segmentStart; i <= nextSegment.end; i++) {
					charTimesRef.current[i] = currentTime;
				}

				keyboardCharIndexRef.current = nextSegment.end;
				setRecordingProgressIndex(nextSegment.end, { commitState: false });
				window.__ivLyricsDebugLog?.('[SyncDataCreator] Syllable advanced to segment:', nextSegment.start, '-', nextSegment.end);

				if (nextSegment.end >= currentLineChars.length - 1) {
					const duration = estimateSegmentDuration(segmentStart, nextSegment.end, 0.05, 0.22);
					applyInterpolatedRangeToCharTimes(charTimesRef.current, segmentStart, nextSegment.end, currentTime, currentTime + duration);
					pendingSyllableSyncRef.current = null;
					finishKeyboardSync();
					window.__ivLyricsDebugLog?.('[SyncDataCreator] Line completed by syllable');
					return;
				}

				pendingSyllableSyncRef.current = {
					startIdx: segmentStart,
					endIdx: nextSegment.end,
					startTime: currentTime
				};
				return;
			}

			const startKeyboardDrag = () => {
				consumeKeyboardEvent();

				// 이미 드래그 중이면 무시
				if (isKeyboardDraggingRef.current) return;

				isKeyboardDraggingRef.current = true;

				const stopKeyboardDragLoop = () => {
					isKeyboardDraggingRef.current = false;
					if (keyboardDragIntervalRef.current) {
						clearInterval(keyboardDragIntervalRef.current);
						keyboardDragIntervalRef.current = null;
					}
					if (keyboardDragWarmupTimerRef.current) {
						clearTimeout(keyboardDragWarmupTimerRef.current);
						keyboardDragWarmupTimerRef.current = null;
					}
				};

				const runKeyboardDragStep = () => {
					if (!isKeyboardDraggingRef.current) {
						stopKeyboardDragLoop();
						return -1;
					}

					const time = Spicetify.Player.getProgress() / 1000;
					const result = advanceOneChar(time);
					if (result === -1) {
						stopKeyboardDragLoop();
					}
					return result;
				};

				// 첫 keydown 안에서 여러 글자를 바로 전진시켜 우측 화살표 1회처럼 멈칫하지 않게 한다.
				for (let index = 0; index < SYNC_CREATOR_DRAG_INITIAL_BURST_STEPS; index++) {
					if (runKeyboardDragStep() === -1) {
						return;
					}
				}

				keyboardDragIntervalRef.current = setInterval(runKeyboardDragStep, SYNC_CREATOR_DRAG_INTERVAL_MS);
			};

			// 드래그 모드 시작 (누르고 있으면 연속으로 빠르게 진행)
			if (shortcutAction === 'drag' || isDragHotkey) {
				startKeyboardDrag();
				return;
			}

			// Enter: 현재 라인 완료 (중간에서도 완료 가능, 키보드 싱크 중일 때만)
			if (normalizedHotkey === 'enter') {
				// 키보드 싱크 중일 때만 처리 (글자를 하나라도 맞췄을 때)
				if (isKeyboardSyncingRef.current && keyboardCharIndexRef.current >= 0) {
					consumeKeyboardEvent();
					finishKeyboardSync();
				}
				// 싱크 중이 아닐 때는 기본 동작 허용 (다른 버튼 클릭 등)
				return;
			}

			// Backspace: 현재 라인 싱크 취소
			if (normalizedHotkey === 'backspace') {
				consumeKeyboardEvent();
				if (isKeyboardSyncingRef.current) {
					isKeyboardSyncingRef.current = false;
					keyboardCharIndexRef.current = -1;
					charTimesRef.current = [];
					pendingWordSyncRef.current = null;
					pendingSyllableSyncRef.current = null;
					clearRecordingLock();
					setDragStartTime(null);
					setRecordingProgressIndex(-1);

					// 드래그 모드도 취소
					if (isKeyboardDraggingRef.current) {
						isKeyboardDraggingRef.current = false;
						if (keyboardDragIntervalRef.current) {
							clearInterval(keyboardDragIntervalRef.current);
							keyboardDragIntervalRef.current = null;
						}
						if (keyboardDragWarmupTimerRef.current) {
							clearTimeout(keyboardDragWarmupTimerRef.current);
							keyboardDragWarmupTimerRef.current = null;
						}
					}
				}
				return;
			}

			if (normalizedHotkey === 'space') {
				consumeKeyboardEvent();
				if (typeof Spicetify.Player?.togglePlay === 'function') {
					Spicetify.Player.togglePlay();
				} else if (Spicetify.Player?.isPlaying?.()) {
					Spicetify.Player.pause?.();
				} else {
					Spicetify.Player?.play?.();
				}
				return;
			}

			// z: 3초 뒤로
			if (normalizedHotkey === 'z') {
				consumeKeyboardEvent();
				const currentPos = Spicetify.Player.getProgress();
				Spicetify.Player.seek(Math.max(0, currentPos - 3000));
				return;
			}

			// x: 3초 앞으로
			if (normalizedHotkey === 'x') {
				consumeKeyboardEvent();
				const currentPos = Spicetify.Player.getProgress();
				const duration = Spicetify.Player.getDuration();
				Spicetify.Player.seek(Math.min(duration, currentPos + 3000));
				return;
			}
		};

		const handleKeyPress = (e) => {
			const normalizedHotkey = getNormalizedHotkeyFromEvent(e);
			const shortcutBindings = getSyncCreatorShortcutBindings();
			const isConfiguredDragHotkey = (shortcutBindings.drag || []).includes(normalizedHotkey);
			if (!isConfiguredDragHotkey && !isSyncCreatorDragHotkeyEvent(e, normalizedHotkey)) return;

			// 일부 WebView/IME 조합에서 첫 keydown을 놓치는 경우가 있어 문자 입력 단계에서도 즉시 시작한다.
			handleKeyDown(e);
		};

		// / 키 keyup 이벤트 핸들러 (드래그 종료)
		const handleKeyUp = (e) => {
			const normalizedHotkey = getNormalizedHotkeyFromEvent(e);
			const shortcutBindings = getSyncCreatorShortcutBindings();
			const isConfiguredDragHotkey = (shortcutBindings.drag || []).includes(normalizedHotkey);
			if (isConfiguredDragHotkey || isSyncCreatorDragHotkeyEvent(e, normalizedHotkey)) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();

				isKeyboardDraggingRef.current = false;
				if (keyboardDragIntervalRef.current) {
					clearInterval(keyboardDragIntervalRef.current);
					keyboardDragIntervalRef.current = null;
				}
				if (keyboardDragWarmupTimerRef.current) {
					clearTimeout(keyboardDragWarmupTimerRef.current);
					keyboardDragWarmupTimerRef.current = null;
				}
			}
		};

		window.__ivLyricsDebugLog?.('[SyncDataCreator] Registering keydown/keyup listeners, mode:', mode);
		document.addEventListener('keydown', handleKeyDown, true); // capture phase
		document.addEventListener('keypress', handleKeyPress, true); // fallback for IME/WebView first-press handling
		document.addEventListener('keyup', handleKeyUp, true); // capture phase
		return () => {
			window.__ivLyricsDebugLog?.('[SyncDataCreator] Removing keydown/keyup listeners');
			document.removeEventListener('keydown', handleKeyDown, true);
			document.removeEventListener('keypress', handleKeyPress, true);
			document.removeEventListener('keyup', handleKeyUp, true);
		};
	}, [mode, currentLineIndex, activeParallelTargetId, lyricsLines.length, currentLineChars, currentLineEffectiveSyllableSegments, lineCharOffsets, commitCurrentLineSync, advanceAfterCompletedTarget, isCurrentSyncTargetMetaComplete, showMissingMetaToast, setRecordingProgressIndex, getActiveRecordingLockIndex, buildLockedCharTimes, clearRecordingLock]);

	const handleContainerMouseDown = useCallback((e) => {
		if (mode !== 'record' || currentLineIndex >= lyricsLines.length) return;
		if (e.button === 2) return;
		if (!isCurrentSyncTargetMetaComplete) {
			showMissingMetaToast();
			return;
		}
		const touch = e.touches ? e.touches[0] : e;
		const charIndex = getCharIndexFromPoint(touch.clientX, touch.clientY);
		if (charIndex >= 0) handleDragStart(charIndex, e);
	}, [mode, currentLineIndex, lyricsLines.length, getCharIndexFromPoint, handleDragStart, isCurrentSyncTargetMetaComplete, showMissingMetaToast]);

	useEffect(() => {
		if (!isDragging) return;

		const handleGlobalMove = (e) => {
			if (!isDragging) return;
			const touch = e.touches ? e.touches[0] : e;
			const charIndex = getCharIndexFromPoint(touch.clientX, touch.clientY);
			if (charIndex !== null) handleDragMove(charIndex, e);
		};

		const handleGlobalEnd = (e) => {
			if (isDragging) handleDragEnd(e);
		};

		document.addEventListener('mousemove', handleGlobalMove);
		document.addEventListener('mouseup', handleGlobalEnd);
		document.addEventListener('touchmove', handleGlobalMove, { passive: false });
		document.addEventListener('touchend', handleGlobalEnd);

		return () => {
			document.removeEventListener('mousemove', handleGlobalMove);
			document.removeEventListener('mouseup', handleGlobalEnd);
			document.removeEventListener('touchmove', handleGlobalMove);
			document.removeEventListener('touchend', handleGlobalEnd);
		};
	}, [isDragging, getCharIndexFromPoint, handleDragMove, handleDragEnd]);

	// 현재 줄 싱크 삭제
	const deleteCurrentLineSync = useCallback(() => {
		if (!syncData || !syncData.lines) return;
		const lineStart = lineCharOffsets[currentLineIndex];

		setSyncData(prev => {
			const newLines = prev.lines.filter(l => l.start !== lineStart);
			return newLines.length > 0 ? { ...prev, lines: newLines } : null;
		});
		clearRecordingLock();
	}, [syncData, lineCharOffsets, currentLineIndex, clearRecordingLock]);

	const updateParallelPartMeta = useCallback((partId, field, value) => {
		const safeValue = field === 'speaker'
			? normalizeSyncCreatorSpeaker(value)
			: field === 'speaker-color'
				? normalizeSyncCreatorSpeakerColor(value)
			: field === 'speaker-fallback'
				? normalizeSyncCreatorSpeakerFallback(value)
			: field === 'kind'
				? normalizeSyncCreatorKind(value)
				: String(value || '').trim();
		const shouldDelete = (field === 'speaker-color' || field === 'speaker-fallback') && !safeValue;
		if (!partId || !field || (!safeValue && !shouldDelete)) return;
		const lineStart = lineCharOffsets[currentLineIndex];
		const draftKey = `${lineStart}:${partId}`;
		setParallelPartMetaDrafts(prev => ({
			...prev,
			[draftKey]: {
				...(prev[draftKey] || {}),
				[field]: shouldDelete ? '' : safeValue
			}
		}));

		setSyncData(prev => {
			if (!prev || !Array.isArray(prev.lines)) return prev;
			return {
				...prev,
				lines: prev.lines.map(line => {
					if (line.start !== lineStart || !Array.isArray(line.parallel?.parts)) return line;
					return {
						...line,
						parallel: {
							...line.parallel,
							parts: line.parallel.parts.map(part => {
								if (part.id !== partId) return part;
								const nextPart = { ...part };
								if (shouldDelete) delete nextPart[field];
								else nextPart[field] = safeValue;
								return nextPart;
							})
						}
					};
				})
			};
		});
	}, [lineCharOffsets, currentLineIndex]);

	const updateCurrentLineMeta = useCallback((field, value) => {
		const safeValue = field === 'speaker'
			? normalizeSyncCreatorSpeaker(value)
			: field === 'speaker-color'
				? normalizeSyncCreatorSpeakerColor(value)
			: field === 'speaker-fallback'
				? normalizeSyncCreatorSpeakerFallback(value)
			: field === 'kind'
				? normalizeSyncCreatorKind(value)
				: String(value || '').trim();
		const shouldDelete = (field === 'speaker-color' || field === 'speaker-fallback') && !safeValue;
		if (!field || (!safeValue && !shouldDelete)) return;
		const lineStart = lineCharOffsets[currentLineIndex];
		const shouldOmitDefaultValue = !multiVocalMode && (
			(field === 'speaker' && safeValue === SYNC_CREATOR_DEFAULT_SPEAKER)
			|| (field === 'kind' && safeValue === SYNC_CREATOR_DEFAULT_KIND)
		);
		setLineMetaDrafts(prev => ({
			...prev,
			[lineStart]: {
				...(prev[lineStart] || {}),
				[field]: shouldDelete ? '' : safeValue
			}
		}));

		setSyncData(prev => {
			if (!prev || !Array.isArray(prev.lines)) return prev;
			return {
				...prev,
				lines: prev.lines.map(line => {
					if (line.start !== lineStart) return line;
					if (!shouldOmitDefaultValue && !shouldDelete) {
						return { ...line, [field]: safeValue };
					}
					const nextLine = { ...line };
					delete nextLine[field];
					return nextLine;
				})
			};
		});
	}, [lineCharOffsets, currentLineIndex, multiVocalMode]);

	const applySongVocalSpeaker = useCallback((value, customMeta = {}) => {
		const speakerMeta = resolveSyncCreatorBulkSpeakerMeta(
			value,
			customMeta.color,
			customMeta.fallback
		);
		if (!speakerMeta || !lyricsLines.length) return;
		const { speaker, color: speakerColor, fallback: speakerFallback } = speakerMeta;
		const isCustomSpeaker = isSyncCreatorCustomSpeaker(speaker);
		const rememberedCustomMeta = { color: speakerColor, fallback: speakerFallback };

		const syncLinesByStart = new Map((Array.isArray(syncData?.lines) ? syncData.lines : []).map(line => [line.start, line]));
		const nextLineMetaDrafts = {};
		const nextParallelPartMetaDrafts = {};

		lyricsLines.forEach((lineText, index) => {
			const lineStart = lineCharOffsets[index];
			if (!Number.isInteger(lineStart)) return;
			nextLineMetaDrafts[lineStart] = {
				...(lineMetaDrafts[lineStart] || {}),
				speaker,
				'speaker-color': speakerColor,
				'speaker-fallback': speakerFallback
			};
			if (isCustomSpeaker) {
				customSpeakerMetaMemoryRef.current.set(
					`${trackId || 'track'}:${lineStart}:line`,
					rememberedCustomMeta
				);
			}

			if (isLineCoveredByMergedPrevious(index, syncLinesByStart)) {
				return;
			}

			const lineData = syncLinesByStart.get(lineStart);
			const mergedIndexes = getMergedLineIndexesForStart(index, syncLinesByStart);
			const isMergedWithNext = mergedIndexes.length > 1;
			const templateChars = isMergedWithNext
				? mergedIndexes.flatMap(lineIndex => Array.from(lyricsLines[lineIndex] || ''))
				: Array.from(lineText || '');
			const template = getParallelTemplateForLineData(lineData, templateChars, lineStart, isMergedWithNext);
			if (Array.isArray(template?.parts)) {
				template.parts.forEach(part => {
					if (!part?.id) return;
					nextParallelPartMetaDrafts[`${lineStart}:${part.id}`] = {
						...(parallelPartMetaDrafts[`${lineStart}:${part.id}`] || {}),
						speaker,
						'speaker-color': speakerColor,
						'speaker-fallback': speakerFallback
					};
					if (isCustomSpeaker) {
						customSpeakerMetaMemoryRef.current.set(
							`${trackId || 'track'}:${lineStart}:${part.id}`,
							rememberedCustomMeta
						);
					}
				});
			}
		});

		setLineMetaDrafts(prev => ({
			...prev,
			...nextLineMetaDrafts
		}));
		setParallelPartMetaDrafts(prev => ({
			...prev,
			...nextParallelPartMetaDrafts
		}));
		setSyncData(prev => {
			if (!prev || !Array.isArray(prev.lines)) return prev;
			return {
				...prev,
				lines: prev.lines.map(line => {
					const nextLine = applySyncCreatorSpeakerMeta({
						...line,
						parallel: line.parallel ? {
							...line.parallel,
							parts: Array.isArray(line.parallel.parts)
								? line.parallel.parts.map(part => applySyncCreatorSpeakerMeta(part, speakerMeta))
								: line.parallel.parts
						} : line.parallel
					}, speakerMeta);
					return nextLine;
				})
			};
		});
		Toast.success(I18n.t('syncCreator.bulkVocalApplied') || 'Applied the vocal speaker to the whole song.');
	}, [
		lyricsLines,
		lineCharOffsets,
		syncData,
		lineMetaDrafts,
		parallelPartMetaDrafts,
		trackId,
		isLineCoveredByMergedPrevious,
		getMergedLineIndexesForStart,
		getParallelTemplateForLineData
	]);
	const requestSongVocalSpeaker = useCallback((value, customSeed = {}) => {
		const speaker = normalizeSyncCreatorSpeaker(value);
		if (!speaker) return;
		if (!isSyncCreatorCustomSpeaker(speaker)) {
			setShowBulkCustomSpeakerDialog(false);
			applySongVocalSpeaker(speaker);
			return;
		}

		const fallback = normalizeSyncCreatorSpeakerFallback(customSeed.fallback)
			|| normalizeSyncCreatorSpeakerFallback(bulkCustomSpeakerFallback)
			|| SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK;
		const color = normalizeSyncCreatorSpeakerColor(customSeed.color)
			|| normalizeSyncCreatorSpeakerColor(bulkCustomSpeakerColor)
			|| getSyncCreatorCustomSpeakerDefaultColor('CUSTOM', fallback);
		setBulkCustomSpeakerFallback(fallback);
		setBulkCustomSpeakerColor(color);
		setShowBulkCustomSpeakerDialog(true);
	}, [applySongVocalSpeaker, bulkCustomSpeakerColor, bulkCustomSpeakerFallback]);
	const applyBulkCustomSpeaker = useCallback(() => {
		const color = normalizeSyncCreatorSpeakerColor(bulkCustomSpeakerColor);
		if (!color) {
			Toast.error(I18n.t('syncCreator.speakerCustomColorInvalid') || 'Enter a valid HEX color.');
			return;
		}
		const fallback = normalizeSyncCreatorSpeakerFallback(bulkCustomSpeakerFallback)
			|| SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK;
		setBulkCustomSpeakerColor(color);
		setBulkCustomSpeakerFallback(fallback);
		applySongVocalSpeaker('CUSTOM', { color, fallback });
		setShowBulkCustomSpeakerDialog(false);
	}, [applySongVocalSpeaker, bulkCustomSpeakerColor, bulkCustomSpeakerFallback]);

	const currentManualSplitPoints = useMemo(() => {
		const splitPoints = manualParallelSplitDrafts[currentLineStart];
		return [...new Set([
			...currentAutoMergeSplitPoints,
			...(Array.isArray(splitPoints) ? splitPoints : [])
		]
				.map(value => Number(value))
				.filter(value => Number.isInteger(value) && value > 0 && value < currentFullLineChars.length))]
			.sort((a, b) => a - b);
	}, [manualParallelSplitDrafts, currentLineStart, currentFullLineChars.length, currentAutoMergeSplitPoints]);
	const currentManualSplitPointSet = useMemo(
		() => new Set(currentManualSplitPoints),
		[currentManualSplitPoints]
	);
	const hasManualParallelSplit = currentManualSplitPoints.length > 0;
	const hasManualDraftSplit = Array.isArray(manualParallelSplitDrafts[currentLineStart])
		&& manualParallelSplitDrafts[currentLineStart].length > 0;
	const resetCurrentLineManualSplit = useCallback(() => {
		const lineStart = lineCharOffsets[currentLineIndex];
		setManualParallelSplitDrafts(prev => {
			if (!Object.prototype.hasOwnProperty.call(prev, lineStart)) return prev;
			const next = { ...prev };
			delete next[lineStart];
			return next;
		});
		setMode(prev => prev === 'record' ? prev : 'idle');
		setRecordingProgressIndex(-1);
		clearRecordingLock();
		charTimesRef.current = [];
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [lineCharOffsets, currentLineIndex, setRecordingProgressIndex, clearRecordingLock]);
	const unmergeCurrentLine = useCallback(() => {
		if (!currentLineMergedWithNext || currentMergedLineIndexes.length <= 1) return;
		const lineStart = lineCharOffsets[currentLineIndex];
		const mergedEnd = getLineEndAtIndex(currentMergedLineIndexes[currentMergedLineIndexes.length - 1]);

		setSyncData(prev => {
			if (!prev || !Array.isArray(prev.lines)) return prev;
			const mergedLine = prev.lines.find(line => line.start === lineStart);
			if (!mergedLine || Number(mergedLine.end) < mergedEnd) return prev;

			const restoredLines = currentMergedLineIndexes
				.map((lineIndex) => {
					const start = lineCharOffsets[lineIndex];
					const end = getLineEndAtIndex(lineIndex);
					const lineChars = Array.from(lyricsLines[lineIndex] || '');
					if (!Number.isInteger(start) || end < start || lineChars.length === 0) return null;

					const part = mergedLine.parallel?.parts?.find(item =>
						Array.isArray(item?.ranges)
						&& item.ranges.some(range =>
							Number(range?.start) <= start
							&& Number(range?.end) >= end
						)
					);
					const sliceStart = start - lineStart;
					const sliceEnd = sliceStart + lineChars.length;
					const chars = Array.isArray(part?.chars) && part.chars.length === lineChars.length
						? part.chars
						: Array.isArray(mergedLine.chars) && mergedLine.chars.length >= sliceEnd
							? mergedLine.chars.slice(sliceStart, sliceEnd)
							: null;
					if (!Array.isArray(chars) || chars.length !== lineChars.length) return null;

					const speaker = normalizeSyncCreatorSpeaker(part?.speaker || mergedLine.speaker) || SYNC_CREATOR_DEFAULT_SPEAKER;
					const kind = normalizeSyncCreatorKind(part?.kind || mergedLine.kind) || SYNC_CREATOR_DEFAULT_KIND;
					return { start, end, chars, speaker, kind };
				})
				.filter(Boolean);
			if (restoredLines.length !== currentMergedLineIndexes.length) return prev;

			const lines = prev.lines
				.filter(line => line.start < lineStart || line.start > mergedEnd);
			lines.push(...restoredLines);
			lines.sort((a, b) => a.start - b.start);
			return lines.length > 0
				? { ...prev, version: lines.some(line => line.parallel) ? SYNC_CREATOR_SYNC_DATA_VERSION : (prev.version || 1), lines }
				: null;
		});

		setMergedLineDrafts(prev => {
			if (!Object.prototype.hasOwnProperty.call(prev, lineStart)) return prev;
			const next = { ...prev };
			delete next[lineStart];
			return next;
		});
		setManualParallelSplitDrafts(prev => {
			if (!Object.prototype.hasOwnProperty.call(prev, lineStart)) return prev;
			const next = { ...prev };
			delete next[lineStart];
			return next;
		});
		setActiveParallelPartId('full');
		setMode(prev => prev === 'record' ? prev : 'idle');
		setRecordingProgressIndex(-1);
		clearRecordingLock();
		charTimesRef.current = [];
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [
		currentLineIndex,
		currentLineMergedWithNext,
		currentMergedLineIndexes,
		getLineEndAtIndex,
		lineCharOffsets,
		lyricsLines,
		setRecordingProgressIndex,
		clearRecordingLock
	]);
	const toggleManualParallelSplitPoint = useCallback((splitPoint) => {
		if (!multiVocalMode || currentFullLineChars.length < 2) return;
		const normalizedSplitPoint = Number(splitPoint);
		if (!Number.isInteger(normalizedSplitPoint) || normalizedSplitPoint <= 0 || normalizedSplitPoint >= currentFullLineChars.length) {
			return;
		}
		if (currentAutoMergeSplitPointSet.has(normalizedSplitPoint)) {
			unmergeCurrentLine();
			return;
		}

		const lineStart = lineCharOffsets[currentLineIndex];
		setManualParallelSplitDrafts(prev => {
			const current = new Set(Array.isArray(prev[lineStart]) ? prev[lineStart] : []);
			if (current.has(normalizedSplitPoint)) {
				current.delete(normalizedSplitPoint);
			} else {
				current.add(normalizedSplitPoint);
			}

			const nextSplitPoints = [...current]
				.filter(value => Number.isInteger(value) && value > 0 && value < currentFullLineChars.length)
				.sort((a, b) => a - b);
			const next = { ...prev };
			if (nextSplitPoints.length > 0) {
				next[lineStart] = nextSplitPoints;
			} else {
				delete next[lineStart];
			}
			return next;
		});
		setMode(prev => prev === 'record' ? prev : 'idle');
		setRecordingProgressIndex(-1);
		clearRecordingLock();
		charTimesRef.current = [];
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [
		multiVocalMode,
		currentFullLineChars.length,
		currentAutoMergeSplitPointSet,
		unmergeCurrentLine,
		lineCharOffsets,
		currentLineIndex,
		setRecordingProgressIndex,
		clearRecordingLock
	]);
	const resolveParentheticalLayoutDecision = useCallback((layoutMode) => {
		const decision = pendingParentheticalLayoutDecision;
		if (!decision || !Number.isInteger(Number(decision.lineStart))) return;
		const safeMode = layoutMode === 'grouped' ? 'grouped' : 'separate';
		const lineStart = Number(decision.lineStart);

		setParentheticalLayoutDrafts(prev => ({
			...prev,
			[lineStart]: safeMode
		}));
		setPendingParentheticalLayoutDecision(null);
		setMode(prev => prev === 'record' ? prev : 'idle');
		setRecordingProgressIndex(-1);
		clearRecordingLock();
		charTimesRef.current = [];
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [pendingParentheticalLayoutDecision, setRecordingProgressIndex, clearRecordingLock]);
	const enableManualMultiVocalMode = useCallback(() => {
		setMultiVocalMode(true);
		setActiveParallelPartId('');
		setMode(prev => prev === 'record' ? prev : 'idle');
		setRecordingProgressIndex(-1);
		clearRecordingLock();
		charTimesRef.current = [];
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [setRecordingProgressIndex, clearRecordingLock]);

	const toggleMode = useCallback((newMode) => {
		if (mode === newMode) {
			setMode('idle');
		} else {
			if (newMode === 'record' && !isCurrentSyncTargetMetaComplete) {
				showMissingMetaToast();
				return;
			}
			setMode(newMode);
			if (newMode === 'preview') Spicetify.Player.seek(0);
			if (!Spicetify.Player.isPlaying()) Spicetify.Player.play();
		}
	}, [mode, isCurrentSyncTargetMetaComplete, showMissingMetaToast]);

	const adjustGlobalOffset = useCallback((deltaMs) => {
		const deltaSec = deltaMs / 1000;

		setSyncData(prev => {
			if (!prev || !prev.lines) return prev;
			return {
				...prev,
				lines: prev.lines.map(line => ({
					...line,
					chars: line.chars.map(t => Math.round((t + deltaSec) * 1000) / 1000),
					parallel: line.parallel ? {
						...line.parallel,
						parts: Array.isArray(line.parallel.parts)
							? line.parallel.parts.map(part => ({
								...part,
								chars: Array.isArray(part.chars)
									? part.chars.map(t => Math.round((t + deltaSec) * 1000) / 1000)
									: part.chars
							}))
							: line.parallel.parts
					} : line.parallel
				}))
			};
		});
		setGlobalOffset(prev => prev + deltaMs);
	}, []);

	const adjustCurrentLineOffset = useCallback((deltaMs) => {
		const requestedDeltaSec = deltaMs / 1000;
		resetCurrentSyncInput();

		setSyncData(prev => {
			if (!prev || !Array.isArray(prev.lines) || !Number.isInteger(currentLineStart)) return prev;

			const targetIndex = prev.lines.findIndex(line => line.start === currentLineStart);
			if (targetIndex < 0) return prev;

			const targetLine = prev.lines[targetIndex];
			const targetTimes = getSyncCreatorLineTimes(targetLine);
			if (targetTimes.length === 0) return prev;

			const firstTime = Math.min(...targetTimes);
			const lastTime = Math.max(...targetTimes);
			const previousLine = prev.lines
				.filter(line => line.start < currentLineStart)
				.sort((a, b) => b.start - a.start)[0] || null;
			const nextLine = prev.lines
				.filter(line => line.start > currentLineStart)
				.sort((a, b) => a.start - b.start)[0] || null;
			const previousTimes = getSyncCreatorLineTimes(previousLine);
			const nextTimes = getSyncCreatorLineTimes(nextLine);
			const minFirstTime = previousTimes.length > 0
				? Math.max(...previousTimes) + SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC
				: 0;
			const maxLastTime = nextTimes.length > 0
				? Math.min(...nextTimes) - SYNC_CREATOR_MIN_SEQUENTIAL_STEP_SEC
				: Infinity;
			const minDeltaSec = minFirstTime - firstTime;
			const maxDeltaSec = Number.isFinite(maxLastTime) ? maxLastTime - lastTime : Infinity;
			if (Number.isFinite(maxDeltaSec) && maxDeltaSec < minDeltaSec) return prev;

			const boundedDeltaSec = Math.min(Math.max(requestedDeltaSec, minDeltaSec), maxDeltaSec);
			if ((requestedDeltaSec > 0 && boundedDeltaSec <= 0) || (requestedDeltaSec < 0 && boundedDeltaSec >= 0)) return prev;
			if (!Number.isFinite(boundedDeltaSec) || Math.abs(boundedDeltaSec) < 0.0005) return prev;

			const shiftTimes = (values) => Array.isArray(values)
				? values.map(time => (
					typeof time === 'number' && Number.isFinite(time)
						? roundSyncTime(Math.max(0, time + boundedDeltaSec))
						: time
				))
				: values;
			const shiftLine = (line) => ({
				...line,
				chars: shiftTimes(line.chars),
				parallel: line.parallel ? {
					...line.parallel,
					parts: Array.isArray(line.parallel.parts)
						? line.parallel.parts.map(part => ({
							...part,
							chars: shiftTimes(part.chars)
						}))
						: line.parallel.parts
				} : line.parallel
			});

			return {
				...prev,
				lines: prev.lines.map((line, index) => index === targetIndex ? shiftLine(line) : line)
			};
		});
	}, [currentLineStart, resetCurrentSyncInput]);

	const resetFromStart = useCallback(() => {
		const confirmed = window.confirm(
			I18n.t('syncCreator.resetConfirm')
			|| '현재 작업 중인 싱크 데이터가 모두 삭제됩니다.\n정말 처음부터 다시 시작할까요?'
		);
		if (!confirmed) return;

		setCurrentLineIndex(0);
		setSyncData(null);
		setManualParallelSplitDrafts({});
		setParentheticalLayoutDrafts({});
		setPendingParentheticalLayoutDecision(null);
		setMergedLineDrafts({});
		setGlobalOffset(0);
		setMode('idle');
		Spicetify.Player.seek(0);
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, []);

	const goToPrevLine = useCallback(() => {
		if (previousNavigableLineIndex >= 0) {
			setCurrentLineIndex(previousNavigableLineIndex);
			if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
		}
	}, [previousNavigableLineIndex]);

	const goToNextLine = useCallback(() => {
		if (nextNavigableLineIndex >= 0) {
			setCurrentLineIndex(nextNavigableLineIndex);
			if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
		}
	}, [nextNavigableLineIndex]);

	const goToFirstLine = useCallback(() => {
		setCurrentLineIndex(0);
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, []);

	const handleSeek = useCallback((e) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
		const percent = Math.max(0, Math.min(1, x / rect.width));
		const duration = Spicetify.Player?.data?.item?.duration?.milliseconds || 0;
		Spicetify.Player.seek(duration * percent);
	}, []);

	const handleSeekOffset = useCallback((offsetMs) => {
		Spicetify.Player.seek(Math.max(0, Spicetify.Player.getProgress() + offsetMs));
	}, []);

	const attachSelectedLrclibSource = useCallback((data) => {
		const sanitized = sanitizeSyncCreatorSyncData(data, lyricsFullTextChars);
		if (!sanitized) {
			return sanitized;
		}

		const currentProvider = providerRef.current;
		const currentLrclibSource = selectedLrclibSourceRef.current;
		if (currentProvider !== 'lrclib' || !currentLrclibSource) {
			if (Object.prototype.hasOwnProperty.call(sanitized, 'source')) {
				const { source, ...withoutSource } = sanitized;
				return withoutSource;
			}
			return sanitized;
		}
		return {
			...sanitized,
			source: {
				...currentLrclibSource,
				provider: 'lrclib'
			}
		};
	}, [lyricsFullTextChars]);

	const clearLyricsCachesAfterSyncSubmit = useCallback(async (resolvedIsrc = '') => {
		const cacheIsrc = normalizeSyncCreatorIsrc(resolvedIsrc) || trackIsrc;
		window.SyncDataService?.clearCache?.(cacheIsrc || trackId, cacheIsrc ? { isrc: cacheIsrc } : {});
		const dispatchSyncDataUpdated = () => window.dispatchEvent(new CustomEvent('ivLyrics:sync-data-updated', {
			detail: {
				isrc: cacheIsrc || null,
				trackId,
				trackUri: trackId ? `spotify:track:${trackId}` : null,
				provider
			}
		}));
		try {
			await window.LyricsService?.clearTrackCache?.(trackId);
		} catch (error) {
			console.warn('[SyncDataCreator] Failed to clear lyrics cache after sync-data submit:', error);
		} finally {
			dispatchSyncDataUpdated();
		}
	}, [trackId, trackIsrc, provider]);

	const handleSubmit = useCallback(async () => {
		if (!syncData || !syncData.lines || syncData.lines.length === 0) {
			Toast.error(I18n.t('syncCreator.noSyncData'));
			return;
		}

		if (multiVocalMode) {
			const linesByStart = new Map(syncData.lines.map(line => [line.start, line]));
			for (let index = 0; index < lyricsLines.length; index++) {
				if (isLineCoveredByMergedPrevious(index, linesByStart)) {
					continue;
				}
				const lineText = lyricsLines[index] || '';
				const lineStart = lineCharOffsets[index];
				const lineData = linesByStart.get(lineStart);
				if (!lineData) {
					Toast.error(I18n.t('syncCreator.lineMissingSync', { line: index + 1 }) || `Line ${index + 1} has no sync yet.`);
					return;
				}

				const mergedIndexes = getMergedLineIndexesForStart(index, linesByStart);
				const isMergedWithNext = mergedIndexes.length > 1;
				const lineChars = isMergedWithNext
					? mergedIndexes.flatMap(lineIndex => Array.from(lyricsLines[lineIndex] || ''))
					: Array.from(lineText);
				const template = getParallelTemplateForLineData(lineData, lineChars, lineStart, isMergedWithNext);
				if (template?.parts?.length > 1) {
					const existingParts = Array.isArray(lineData.parallel?.parts) ? lineData.parallel.parts : [];
					for (const part of template.parts) {
						const existingPart = existingParts.find(item => item.id === part.id);
						const expectedChars = countRangeChars(part.ranges);
						if (!existingPart || !Array.isArray(existingPart.chars) || existingPart.chars.length !== expectedChars) {
							Toast.error(I18n.t('syncCreator.lineAllPartsMissingSync', { line: index + 1 }) || `Sync every vocal part on line ${index + 1}.`);
							return;
						}
						if (!isSyncCreatorSpeakerMetaComplete(existingPart) || !(normalizeSyncCreatorKind(existingPart.kind) || SYNC_CREATOR_DEFAULT_KIND)) {
							Toast.error(I18n.t('syncCreator.linePartMetaRequired', { line: index + 1 }) || `Select SPEAKER and text effect for every vocal part on line ${index + 1}.`);
							return;
						}
					}
				} else if (!isSyncCreatorSpeakerMetaComplete({
					speaker: normalizeSyncCreatorSpeaker(lineData.speaker) || SYNC_CREATOR_DEFAULT_SPEAKER,
					'speaker-fallback': sanitizeSyncCreatorSpeakerFallback(
						lineData.speaker,
						lineData['speaker-fallback'],
						false,
						lineData.speaker
					),
					'speaker-color': lineData['speaker-color']
				}) || !(normalizeSyncCreatorKind(lineData.kind) || SYNC_CREATOR_DEFAULT_KIND)) {
					Toast.error(I18n.t('syncCreator.lineMetaRequired', { line: index + 1 }) || `Select SPEAKER and text effect for line ${index + 1}.`);
					return;
				}
			}
		}

		const coveredLineCount = lyricsLines.reduce((count, _, index) => (
			count + (isLineCoveredByMergedPrevious(index, new Map(syncData.lines.map(line => [line.start, line]))) ? 1 : 0)
		), 0);
		if (syncData.lines.length + coveredLineCount < lyricsLines.length) {
			if (!confirm(I18n.t('syncCreator.incompleteConfirm'))) return;
		}

		const syncDataToSubmit = attachSelectedLrclibSource({
			...syncData,
			...(trackDurationMs > 0 ? { trackDurationMs } : {}),
			lines: syncData.lines.map(line => {
				const speaker = normalizeSyncCreatorSpeaker(line.speaker) || SYNC_CREATOR_DEFAULT_SPEAKER;
				const kind = normalizeSyncCreatorKind(line.kind) || SYNC_CREATOR_DEFAULT_KIND;
				const speakerFallback = sanitizeSyncCreatorSpeakerFallback(
					speaker,
					line['speaker-fallback'],
					true,
					line.speaker
				);
				const speakerColor = sanitizeSyncCreatorSpeakerColor(
					speaker,
					line['speaker-color'],
					true,
					speakerFallback
				);
				const nextLine = {
					...line,
					parallel: line.parallel ? sanitizeSyncCreatorParallel({
						...line.parallel,
						parts: Array.isArray(line.parallel.parts)
							? line.parallel.parts.map(part => {
								const partSpeaker = normalizeSyncCreatorSpeaker(part.speaker) || SYNC_CREATOR_DEFAULT_SPEAKER;
								const partSpeakerFallback = sanitizeSyncCreatorSpeakerFallback(
									partSpeaker,
									part['speaker-fallback'],
									true,
									part.speaker
								);
								const partSpeakerColor = sanitizeSyncCreatorSpeakerColor(
									partSpeaker,
									part['speaker-color'],
									true,
									partSpeakerFallback
								);
								const nextPart = {
									...part,
									speaker: partSpeaker,
									kind: normalizeSyncCreatorKind(part.kind) || SYNC_CREATOR_DEFAULT_KIND
								};
								if (partSpeakerFallback) nextPart['speaker-fallback'] = partSpeakerFallback;
								else delete nextPart['speaker-fallback'];
								if (partSpeakerColor) nextPart['speaker-color'] = partSpeakerColor;
								else delete nextPart['speaker-color'];
								return nextPart;
							})
							: line.parallel.parts
					}) : line.parallel
				};

				if (multiVocalMode || speaker !== SYNC_CREATOR_DEFAULT_SPEAKER) {
					nextLine.speaker = speaker;
				} else {
					delete nextLine.speaker;
				}
				if (speakerFallback) nextLine['speaker-fallback'] = speakerFallback;
				else delete nextLine['speaker-fallback'];
				if (speakerColor) nextLine['speaker-color'] = speakerColor;
				else delete nextLine['speaker-color'];
				if (multiVocalMode || kind !== SYNC_CREATOR_DEFAULT_KIND) {
					nextLine.kind = kind;
				} else {
					delete nextLine.kind;
				}
				return nextLine;
			})
		});

		const resolvedTrackIsrc = trackIsrc
			|| await window.SyncDataService?.resolveTrackIsrc?.(trackId, {
				...trackInfo,
				title: trackName,
				artist: artistName,
				album: albumName
			})
			|| '';

		if (!resolvedTrackIsrc) {
			Toast.error('이 곡의 ISRC를 확인할 수 없어 sync-data를 등록할 수 없습니다.');
			return;
		}

		setIsSubmitting(true);

		try {
			const submitMetadata = {
				isrc: resolvedTrackIsrc,
				title: trackName,
				artist: artistName,
				album: albumName,
				...(trackDurationMs > 0 ? { durationMs: trackDurationMs } : {})
			};
			if (typeof SyncDataService !== 'undefined' && SyncDataService.submitSyncData) {
				const result = await SyncDataService.submitSyncData(trackId, provider, syncDataToSubmit, submitMetadata);
				if (result) {
					Toast.success(I18n.t('syncCreator.submitSuccess'));
					// 캐시 무효화
					await clearLyricsCachesAfterSyncSubmit(resolvedTrackIsrc);
					// 가사 페이지 새로고침
					setTimeout(() => {
						if (typeof window.reloadLyrics === 'function') {
							window.reloadLyrics(true);
						} else if (typeof window.lyricContainer?.reloadLyrics === 'function') {
							window.lyricContainer.reloadLyrics(true);
						}
					}, 500);
					if (onClose) onClose();
				} else {
					Toast.error(I18n.t('syncCreator.submitError'));
				}
			} else {
				const fallbackPayload = {
					isrc: resolvedTrackIsrc,
					'request-version': '20260701',
					provider,
					syncData: syncDataToSubmit,
					...submitMetadata,
					...(trackId ? { trackId } : {})
				};
				const response = await fetch('https://lyrics.api.ivl.is/lyrics/sync-data', {
					method: 'POST',
					headers: Utils.getApiHeaders({ 'Content-Type': 'application/json' }),
					body: JSON.stringify(fallbackPayload)
				});

				if (response.ok) {
					Toast.success(I18n.t('syncCreator.submitSuccess'));
					// 캐시 무효화
					await clearLyricsCachesAfterSyncSubmit(resolvedTrackIsrc);
					// 가사 페이지 새로고침
					setTimeout(() => {
						if (typeof window.reloadLyrics === 'function') {
							window.reloadLyrics(true);
						} else if (typeof window.lyricContainer?.reloadLyrics === 'function') {
							window.lyricContainer.reloadLyrics(true);
						}
					}, 500);
					if (onClose) onClose();
				} else {
					Toast.error((await response.json()).error || I18n.t('syncCreator.submitError'));
				}
			}
		} catch (e) {
			console.error('[SyncDataCreator] Submit error:', e);
			Toast.error(e?.message || I18n.t('syncCreator.submitError'));
		}

		setIsSubmitting(false);
	}, [syncData, lyricsLines, lineCharOffsets, multiVocalMode, trackId, trackIsrc, provider, trackName, artistName, albumName, trackInfo, onClose, attachSelectedLrclibSource, clearLyricsCachesAfterSyncSubmit, getParallelTemplateForLineData, getMergedLineIndexesForStart, isLineCoveredByMergedPrevious]);

	// 싱크 데이터 내보내기 (JSON 파일로 저장)
	const exportSyncData = useCallback(async () => {
		if (!syncData || !syncData.lines || syncData.lines.length === 0) {
			Toast.error(I18n.t('syncCreator.noSyncData') || 'No sync data to export');
			return;
		}

		try {
			const fileName = `sync-${trackId}-${Date.now()}.json`;
			const saveTarget = await Utils.requestSaveFileTarget(fileName, {
				description: 'ivLyrics Sync Data',
				mimeType: 'application/json',
				extensions: ['.json'],
			});
			if (saveTarget.canceled) return;

			const exportData = attachSelectedLrclibSource(syncData);
			const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
			await Utils.saveBlobAs(blob, fileName, saveTarget);

			Toast.success(I18n.t('syncCreator.exportSuccess') || 'Exported sync data');
		} catch (error) {
			console.error('[SyncDataCreator] Export error:', error);
			Toast.error(error?.message || I18n.t('syncCreator.submitError'));
		}
	}, [attachSelectedLrclibSource, syncData, trackId]);

	// 싱크 데이터 불러오기 (JSON 파일에서)
	const importSyncData = useCallback(() => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.onchange = async (e) => {
			const file = e.target.files[0];
			if (!file) return;

			try {
				const text = await file.text();
				const importedData = JSON.parse(text);

				// 형식 검증 - lines 배열이 있는지 확인
				if (!importedData.lines || !Array.isArray(importedData.lines)) {
					throw new Error('Invalid sync data format');
				}

				// 싱크 데이터 적용
				const sanitizedData = sanitizeSyncCreatorSyncData(importedData, lyricsFullTextChars);
				setSyncData(sanitizedData);
				setSelectedLrclibSourceValue(sanitizedData?.source?.provider === 'lrclib' ? sanitizedData.source : null);

				Toast.success(I18n.t('syncCreator.importSuccess') || 'Imported sync data');
			} catch (err) {
				console.error('[SyncDataCreator] Import error:', err);
				Toast.error((I18n.t('syncCreator.importError') || 'Import failed') + ': ' + err.message);
			}
		};
		input.click();
	}, [lyricsFullTextChars, setSelectedLrclibSourceValue]);

	// 가사 전체 복사
	const copyAllLyrics = useCallback(async () => {
		if (!lyricsText) {
			Toast.error(I18n.t('syncCreator.noLyrics') || 'No lyrics to copy');
			return;
		}

		try {
			await navigator.clipboard.writeText(lyricsText);
			Toast.success(I18n.t('syncCreator.lyricsCopied') || 'Copied lyrics to clipboard');
		} catch (err) {
			console.error('[SyncDataCreator] Copy error:', err);
			Toast.error((I18n.t('syncCreator.copyError') || 'Copy failed') + ': ' + err.message);
		}
	}, [lyricsText]);

	const getLrclibCandidateId = useCallback((candidate) => {
		const id = candidate?.id ?? candidate?.lrclibId;
		if (id === undefined || id === null) return '';
		return String(id).trim();
	}, []);

	const copyLrclibCandidateId = useCallback(async (candidateOrId, event = null) => {
		event?.preventDefault?.();
		event?.stopPropagation?.();

		const id = typeof candidateOrId === 'object'
			? getLrclibCandidateId(candidateOrId)
			: String(candidateOrId || '').trim();
		if (!id) return;

		try {
			await navigator.clipboard.writeText(id);
			Toast.success(I18n.t('syncCreator.lrclibIdCopied') || 'Copied LRCLIB ID');
		} catch (err) {
			console.error('[SyncDataCreator] LRCLIB ID copy error:', err);
			Toast.error((I18n.t('syncCreator.copyError') || 'Copy failed') + ': ' + err.message);
		}
	}, [getLrclibCandidateId]);

	const formatTime = useCallback((ms) => {
		const totalSeconds = Math.floor(ms / 1000);
		return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
	}, []);

	const formatSeconds = useCallback((seconds) => `${seconds.toFixed(1)}s`, []);
	const syncLinesByStart = useMemo(() => {
		if (!Array.isArray(syncData?.lines) || syncData.lines.length === 0) return null;
		return new Map(syncData.lines.map((line) => [line.start, line]));
	}, [syncData]);

	const isCharSynced = useCallback((lineIndex, charIndex) => {
		if (!syncLinesByStart) return false;
		const lineStart = lineCharOffsets[lineIndex];
		const lineData = syncLinesByStart.get(lineStart);
		if (activeParallelPart) {
			const part = lineData?.parallel?.parts?.find(item => item.id === activeParallelPart.id);
			return !!(part && part.chars && part.chars.length > charIndex);
		}
		return lineData && lineData.chars && lineData.chars.length > charIndex;
	}, [syncLinesByStart, lineCharOffsets, activeParallelPart]);

	const getCharSyncTime = useCallback((lineIndex, charIndex) => {
		if (!syncLinesByStart) return null;
		const lineStart = lineCharOffsets[lineIndex];
		const lineData = syncLinesByStart.get(lineStart);
		if (activeParallelPart) {
			const part = lineData?.parallel?.parts?.find(item => item.id === activeParallelPart.id);
			return part?.chars?.[charIndex] ?? null;
		}
		return lineData?.chars?.[charIndex] ?? null;
	}, [syncLinesByStart, lineCharOffsets, activeParallelPart]);

	const getPreviewProgressIndexAtTime = useCallback((lineIndex, currentTimeSec) => {
		if (!syncLinesByStart) return -1;
		const lineStart = lineCharOffsets[lineIndex];
		const lineData = syncLinesByStart.get(lineStart);
		const chars = activeParallelPart
			? lineData?.parallel?.parts?.find(item => item.id === activeParallelPart.id)?.chars
			: lineData?.chars;
		if (!lineData || !Array.isArray(chars) || chars.length === 0) return -1;
		if (currentTimeSec < chars[0]) return -1;

		for (let i = chars.length - 1; i >= 0; i--) {
			if (currentTimeSec < chars[i]) continue;
			if (i >= chars.length - 1) return i;

			const currentCharTime = Number(chars[i]);
			const nextCharTime = Number(chars[i + 1]);
			if (!Number.isFinite(currentCharTime) || !Number.isFinite(nextCharTime) || nextCharTime <= currentCharTime) {
				return i;
			}

			const ratio = Math.max(0, Math.min(1, (currentTimeSec - currentCharTime) / (nextCharTime - currentCharTime)));
			return i + ratio;
		}

		return -1;
	}, [syncLinesByStart, lineCharOffsets, activeParallelPart]);

	const getPreviewProgressIndex = useCallback((lineIndex) => {
		const progressIndex = getPreviewProgressIndexAtTime(lineIndex, position / 1000);
		return Number.isFinite(progressIndex) ? Math.floor(progressIndex) : -1;
	}, [getPreviewProgressIndexAtTime, position]);

	const applyPlaybackProgressVisual = useCallback((nextIndex) => {
		const numericIndex = Number(nextIndex);
		const normalizedIndex = Number.isFinite(numericIndex) ? Math.max(-1, Math.floor(numericIndex)) : -1;
		const previousIndex = lastPaintedPlaybackIndexRef.current;
		if (previousIndex === normalizedIndex) return;
		lastPaintedPlaybackIndexRef.current = normalizedIndex;

		if (useCurrentLineTextRun && rtlTextRunRef.current) {
			const percent = currentLineChars.length > 0 && normalizedIndex >= 0
				? Math.max(0, Math.min(100, ((normalizedIndex + 1) / currentLineChars.length) * 100))
				: 0;
			rtlTextRunRef.current.style.backgroundImage = getSyncCreatorProgressGradient(
				currentLineDirection,
				percent,
				SYNC_CREATOR_PROGRESS_COLOR
			);
			return;
		}

		const completedIndex = normalizedIndex;

		const paintChar = (index) => {
			const el = charElementsRef.current[index];
			if (!el) return;

			const isSynced = el.dataset.ivSyncCreatorSynced === '1';
			if (isSynced && normalizedIndex >= 0 && index <= completedIndex) {
				el.style.background = SYNC_CREATOR_PROGRESS_COLOR;
				el.style.color = '#fff';
			} else {
				el.style.background = isSynced ? 'rgba(49, 130, 246, 0.20)' : '';
				el.style.color = '';
			}
		};

		if (previousIndex < -1.5 || normalizedIndex < 0) {
			for (let index = 0; index < currentLineChars.length; index++) {
				paintChar(index);
			}
			return;
		}

		const previousCompletedIndex = previousIndex;
		const minChangedIndex = Math.max(0, Math.min(
			completedIndex,
			previousCompletedIndex
		));
		const maxChangedIndex = Math.min(currentLineChars.length - 1, Math.max(
			completedIndex,
			previousCompletedIndex
		));

		for (let index = minChangedIndex; index <= maxChangedIndex; index++) {
			paintChar(index);
		}
	}, [currentLineChars.length, currentLineDirection, useCurrentLineTextRun]);

	useEffect(() => {
		charElementsRef.current = [];
		charHitBoxesRef.current = [];
		charScrollMetricsRef.current = [];
		lastPaintedPlaybackIndexRef.current = -2;
	}, [currentLineIndex, lyricsText, activeParallelPartId]);

	useEffect(() => {
		if (mode === 'record') {
			lastPaintedPlaybackIndexRef.current = -2;
		}
	}, [mode, position, currentLineIndex, activeParallelPartId]);

	useEffect(() => {
		if (!syncLinesByStart || currentLineIndex >= lyricsLines.length) {
			applyPlaybackProgressVisual(-1);
			return;
		}

		let frameId = 0;
		let disposed = false;
		const scheduleFrame = typeof requestAnimationFrame === 'function'
			? requestAnimationFrame
			: (callback) => setTimeout(() => callback(Date.now()), 16);
		const cancelFrame = typeof cancelAnimationFrame === 'function'
			? cancelAnimationFrame
			: clearTimeout;

		lastPaintedPlaybackIndexRef.current = -2;
		const paint = () => {
			if (disposed) return;
			if (!(mode === 'record' && recordingCharIndexRef.current >= 0)) {
				const pos = Number(Spicetify.Player?.getProgress?.() || 0);
				const nextIndex = Number.isFinite(pos)
					? getPreviewProgressIndexAtTime(currentLineIndex, pos / 1000)
					: -1;
				applyPlaybackProgressVisual(nextIndex);
			}
			frameId = scheduleFrame(paint);
		};

		frameId = scheduleFrame(paint);
		return () => {
			disposed = true;
			if (frameId) cancelFrame(frameId);
		};
	}, [
		mode,
		syncLinesByStart,
		currentLineIndex,
		lyricsLines.length,
		getPreviewProgressIndexAtTime,
		applyPlaybackProgressVisual
	]);

	const TOSS_BLUE = '#3182f6';
	const TOSS_BLUE_DEEP = '#1b64da';
	const TOSS_BLUE_SOFT = 'rgba(49, 130, 246, 0.14)';
	const TOSS_BLUE_BORDER = 'rgba(49, 130, 246, 0.42)';
	const TOSS_BLUE_RING = 'rgba(49, 130, 246, 0.18)';
	const TOSS_SURFACE = 'rgba(15, 19, 28, 0.82)';
	const TOSS_SURFACE_STRONG = 'rgba(19, 24, 35, 0.92)';
	const TOSS_BORDER = 'rgba(255,255,255,0.08)';

	const getModeStyle = () => {
		if (mode === 'record') return { background: 'rgba(255, 93, 93, 0.14)', color: '#ff8a8a', borderColor: 'rgba(255, 93, 93, 0.36)' };
		if (mode === 'preview') return { background: TOSS_BLUE_SOFT, color: '#8fc1ff', borderColor: TOSS_BLUE_BORDER };
		return { background: 'rgba(255,255,255,0.06)', color: 'var(--spice-subtext)', borderColor: TOSS_BORDER };
	};

	const getModeLabel = () => {
		if (mode === 'record') return I18n.t('syncCreator.recordMode');
		if (mode === 'preview') return I18n.t('syncCreator.previewMode');
		return I18n.t('syncCreator.idleMode');
	};

	// 스타일
	const s = {
		overlay: {
			position: 'fixed', inset: 0,
			background: `radial-gradient(140% 90% at 50% -10%, ${TOSS_BLUE_RING} 0%, rgba(13, 17, 26, 0.98) 46%, rgba(7, 9, 14, 0.995) 100%)`,
			color: 'var(--spice-text)',
			zIndex: 'var(--iv-layer-modal, 2147483647)',
			display: 'flex', flexDirection: 'column',
			overflow: 'hidden',
			fontFamily: 'var(--font-family, inherit)',
			letterSpacing: '-0.005em'
		},
		header: {
			display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px',
			padding: '14px clamp(150px, 18vw, 260px)',
			background: 'linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.012) 100%)',
			borderBottom: `1px solid ${TOSS_BORDER}`,
			backdropFilter: 'blur(24px) saturate(180%)',
			WebkitBackdropFilter: 'blur(24px) saturate(180%)',
			flexShrink: 0,
			position: 'relative', zIndex: 3
		},
		backBtn: {
			background: 'rgba(255,255,255,0.055)',
			border: `1px solid ${TOSS_BORDER}`,
			color: 'var(--spice-text)', cursor: 'pointer',
			padding: '8px 14px', borderRadius: '999px',
			display: 'inline-flex', alignItems: 'center', gap: '6px',
			fontSize: '12px', fontWeight: '600',
			letterSpacing: '-0.005em'
		},
		title: { fontSize: '15px', fontWeight: '700', margin: 0, color: 'var(--spice-text)', letterSpacing: '-0.01em' },
		modeBadge: {
			padding: '5px 12px', borderRadius: '999px',
			fontSize: '10.5px', fontWeight: '700',
			textTransform: 'uppercase', letterSpacing: '0.06em',
			border: '1px solid transparent'
		},
		submitBtn: {
			background: TOSS_BLUE, color: '#fff',
			border: 'none', padding: '10px 22px', borderRadius: '999px',
			fontWeight: '700', cursor: 'pointer', fontSize: '13px',
			letterSpacing: '-0.005em',
			boxShadow: `0 8px 22px ${TOSS_BLUE_RING}`
		},
		trackRow: {
			display: 'flex', alignItems: 'center', gap: '14px',
			padding: '14px 28px',
			background: 'linear-gradient(180deg, rgba(255,255,255,0.024) 0%, rgba(255,255,255,0.006) 100%)',
			borderBottom: `1px solid ${TOSS_BORDER}`,
			flexShrink: 0
		},
		albumArt: {
			width: '52px', height: '52px', borderRadius: '10px', objectFit: 'cover',
			boxShadow: '0 8px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05)'
		},
		trackMeta: { flex: 1, minWidth: 0 },
		trackName: { fontSize: '14px', fontWeight: '700', color: 'var(--spice-text)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
		artistName: { fontSize: '12px', color: 'var(--spice-subtext)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
		providerRow: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' },
		bulkVocalControl: {
			display: 'inline-flex',
			alignItems: 'center',
			gap: '6px',
			padding: '4px 6px',
			borderRadius: '10px',
			background: 'rgba(255,255,255,0.035)',
			border: `1px solid ${TOSS_BORDER}`
		},
		bulkVocalLabel: { fontSize: '10.5px', color: 'var(--spice-subtext)', fontWeight: '800', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' },
		virtualKaraokeBadge: {
			background: TOSS_BLUE_SOFT, color: '#8fc1ff',
			border: `1px solid ${TOSS_BLUE_BORDER}`,
			borderRadius: '999px', padding: '5px 11px',
			fontSize: '10.5px', fontWeight: '700', whiteSpace: 'nowrap',
			letterSpacing: '0.02em'
		},
		select: {
			background: 'rgba(255,255,255,0.055)', color: 'var(--spice-text)',
			border: `1px solid ${TOSS_BORDER}`, borderRadius: '10px',
			padding: '7px 12px', fontSize: '12px', fontWeight: '500',
			cursor: 'pointer', outline: 'none'
		},
		loadBtn: {
			background: TOSS_BLUE_SOFT, color: '#d8eaff',
			border: `1px solid ${TOSS_BLUE_BORDER}`,
			padding: '7px 14px', borderRadius: '999px',
			fontWeight: '600', cursor: 'pointer', fontSize: '12px',
			letterSpacing: '-0.005em'
		},
		candidatePanelHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', gridColumn: '1 / -1' },
		candidatePanelTitle: { fontSize: '12px', fontWeight: '700', color: 'var(--spice-text)', letterSpacing: '0.02em', textTransform: 'uppercase', opacity: 0.8 },
		candidatePanel: {
			display: 'grid', gridTemplateColumns: 'minmax(260px, 360px) minmax(0, 1fr)',
			gap: '14px', padding: '16px 28px',
			background: 'rgba(255,255,255,0.014)',
			borderBottom: `1px solid ${TOSS_BORDER}`,
			flexShrink: 0,
			minHeight: 0,
			overflow: 'hidden'
		},
		candidateList: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '230px', overflowY: 'auto', overflowX: 'hidden', paddingRight: '4px', minWidth: 0 },
		candidateItem: {
			background: TOSS_SURFACE,
			border: `1px solid ${TOSS_BORDER}`,
			borderRadius: '12px', padding: '11px 14px',
			cursor: 'pointer', textAlign: 'left',
			color: 'var(--spice-text)'
		},
		candidateItemActive: {
			border: `1px solid ${TOSS_BLUE_BORDER}`,
			background: TOSS_BLUE_SOFT,
			boxShadow: `0 0 0 3px ${TOSS_BLUE_RING}`
		},
		candidateItemApplied: { background: 'rgba(49, 130, 246, 0.18)', borderColor: TOSS_BLUE_BORDER },
		candidateTitleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: 0 },
		candidateTitle: { fontSize: '13px', fontWeight: '700', color: 'var(--spice-text)', letterSpacing: '-0.005em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
		candidateSubtitle: { fontSize: '11px', color: 'var(--spice-subtext)', marginTop: '3px' },
		candidateMetaRow: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' },
		candidateBadge: {
			display: 'inline-flex', alignItems: 'center',
			padding: '3px 9px', borderRadius: '999px',
			fontSize: '10px', fontWeight: '700',
			background: 'rgba(49, 130, 246, 0.11)',
			color: '#d8eaff',
			letterSpacing: '0.02em', textTransform: 'uppercase'
		},
		candidateIdBadge: {
			display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
			flexShrink: 0, padding: '3px 8px', borderRadius: '999px',
			fontSize: '10px', fontWeight: '800',
			background: 'rgba(49, 130, 246, 0.16)',
			border: `1px solid ${TOSS_BLUE_BORDER}`,
			color: '#8fc1ff', cursor: 'copy',
			letterSpacing: '0', textTransform: 'none', lineHeight: 1.2
		},
		candidatePreview: {
			minHeight: '0',
			background: TOSS_SURFACE_STRONG,
			border: `1px solid ${TOSS_BORDER}`,
			borderRadius: '14px', padding: '16px 18px',
			display: 'flex', flexDirection: 'column', gap: '12px',
			maxHeight: '230px', overflow: 'hidden', minWidth: 0
		},
		candidatePreviewHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' },
		candidatePreviewTitle: { fontSize: '14px', fontWeight: '700', color: 'var(--spice-text)', letterSpacing: '-0.01em' },
		candidatePreviewSubtitle: { fontSize: '11px', color: 'var(--spice-subtext)', marginTop: '3px' },
		candidatePreviewActions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
		candidateIdButton: {
			display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
			flexShrink: 0, padding: '7px 11px', borderRadius: '999px',
			fontSize: '11px', fontWeight: '800',
			background: 'rgba(49, 130, 246, 0.16)',
			border: `1px solid ${TOSS_BLUE_BORDER}`,
			color: '#8fc1ff', cursor: 'copy',
			letterSpacing: '0', lineHeight: 1
		},
		candidatePreviewText: {
			margin: 0, whiteSpace: 'pre-wrap',
			fontSize: '12px', lineHeight: 1.6,
			color: 'var(--spice-text)',
			maxHeight: '140px', overflowY: 'auto',
			padding: '10px 12px',
			background: 'rgba(0,0,0,0.22)',
			border: '1px solid rgba(255,255,255,0.04)',
			borderRadius: '10px'
		},
		candidateEmpty: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '180px', fontSize: '12px', color: 'var(--spice-subtext)', opacity: 0.7 },
		secondaryBtn: {
			background: 'rgba(255,255,255,0.055)', color: 'var(--spice-text)',
			border: `1px solid ${TOSS_BORDER}`,
			padding: '8px 14px', borderRadius: '999px',
			fontWeight: '600', cursor: 'pointer', fontSize: '12px',
			letterSpacing: '-0.005em'
		},
		characterPronunciationProgress: {
			display: 'flex', flexDirection: 'column', gap: '5px',
			width: '220px', maxWidth: 'min(220px, 100%)',
			padding: '8px 12px', borderRadius: '12px',
			border: `1px solid ${TOSS_BLUE_BORDER}`,
			background: TOSS_BLUE_SOFT,
			boxSizing: 'border-box'
		},
		characterPronunciationProgressText: { fontSize: '11px', lineHeight: 1.3, color: 'var(--spice-subtext)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
		characterPronunciationProgressTrack: { width: '100%', height: '4px', borderRadius: '999px', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
		characterPronunciationProgressFill: { height: '100%', borderRadius: '999px', background: TOSS_BLUE, transition: 'width 160ms ease', boxShadow: `0 0 8px ${TOSS_BLUE_RING}` },
		playbackRow: {
			display: 'flex', alignItems: 'center', gap: '10px',
			padding: '12px 28px',
			background: 'rgba(255,255,255,0.015)',
			borderBottom: '1px solid rgba(255,255,255,0.04)',
			flexShrink: 0
		},
		playbackTime: { fontSize: '11px', color: 'var(--spice-subtext)', minWidth: '42px', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"', fontWeight: '500' },
		playbackBar: {
			flex: 1, height: '6px',
			background: 'rgba(255,255,255,0.08)',
			borderRadius: '999px', cursor: 'pointer',
			overflow: 'hidden', position: 'relative'
		},
		playbackFill: { height: '100%', background: `linear-gradient(90deg, ${TOSS_BLUE_DEEP}, ${TOSS_BLUE})`, borderRadius: '999px', boxShadow: `0 0 12px ${TOSS_BLUE_RING}` },
		seekBtn: {
			background: 'rgba(255,255,255,0.06)', color: 'var(--spice-text)',
			border: '1px solid rgba(255,255,255,0.08)',
			padding: '5px 10px', borderRadius: '999px',
			fontSize: '10.5px', fontWeight: '600', cursor: 'pointer',
			letterSpacing: '-0.005em', fontVariantNumeric: 'tabular-nums'
		},
		offsetRow: {
			display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
			padding: '10px 28px',
			background: 'rgba(255,255,255,0.01)',
			borderBottom: '1px solid rgba(255,255,255,0.04)',
			flexShrink: 0
		},
		offsetLabel: { fontSize: '11px', color: 'var(--spice-subtext)', fontWeight: '600', letterSpacing: '0.02em', textTransform: 'uppercase', opacity: 0.8 },
		offsetValue: {
			fontSize: '12px', color: 'var(--spice-text)', fontWeight: '700',
			minWidth: '64px', textAlign: 'center',
			padding: '4px 10px', borderRadius: '999px',
			background: TOSS_BLUE_SOFT,
			border: `1px solid ${TOSS_BLUE_BORDER}`,
			fontVariantNumeric: 'tabular-nums'
		},
		offsetBtn: {
			background: 'rgba(255,255,255,0.06)', color: 'var(--spice-text)',
			border: '1px solid rgba(255,255,255,0.08)',
			padding: '4px 10px', borderRadius: '999px',
			fontSize: '10.5px', fontWeight: '600', cursor: 'pointer',
			fontVariantNumeric: 'tabular-nums'
		},
		lineOffsetBox: {
			display: 'flex',
			flexDirection: 'column',
			gap: '8px',
			marginTop: '10px',
			padding: '10px',
			borderRadius: '10px',
			background: 'rgba(255,255,255,0.032)',
			border: `1px solid ${TOSS_BORDER}`
		},
		lineOffsetHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
		lineOffsetLabel: { fontSize: '11px', color: 'var(--spice-subtext)', fontWeight: '800', letterSpacing: '0.04em', textTransform: 'uppercase' },
		lineOffsetValue: {
			fontSize: '11px',
			color: 'var(--spice-text)',
			fontWeight: '800',
			fontVariantNumeric: 'tabular-nums',
			padding: '3px 8px',
			borderRadius: '999px',
			background: TOSS_BLUE_SOFT,
			border: `1px solid ${TOSS_BLUE_BORDER}`
		},
		lineOffsetButtonRow: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px' },
		lineOffsetBtn: {
			background: 'rgba(255,255,255,0.06)',
			color: 'var(--spice-text)',
			border: '1px solid rgba(255,255,255,0.08)',
			borderRadius: '999px',
			height: '28px',
			padding: '0 8px',
			fontSize: '10.5px',
			fontWeight: '800',
			cursor: 'pointer',
			fontVariantNumeric: 'tabular-nums'
		},
		lyricsArea: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', padding: '20px 28px', overflow: 'hidden', position: 'relative', zIndex: 1 },
		lineNav: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '18px' },
		navBtn: {
			background: 'rgba(255,255,255,0.05)', color: 'var(--spice-text)',
			border: '1px solid rgba(255,255,255,0.08)',
			width: '40px', height: '40px', borderRadius: '999px',
			cursor: 'pointer',
			display: 'flex', alignItems: 'center', justifyContent: 'center',
			fontSize: '14px', fontWeight: '600'
		},
		lineInfo: { textAlign: 'center', minWidth: '120px' },
		lineCount: { fontSize: '22px', fontWeight: '700', color: 'var(--spice-text)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' },
		lineStatus: { fontSize: '11px', color: 'var(--spice-subtext)', marginTop: '2px', fontWeight: '500' },
		multiVocalSwitchRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', margin: '-6px 0 12px' },
		multiVocalSwitchBtn: {
			background: TOSS_BLUE_SOFT,
			border: `1px solid ${TOSS_BLUE_BORDER}`,
			color: 'var(--spice-text)',
			padding: '7px 13px',
			borderRadius: '999px',
			fontSize: '11px',
			fontWeight: '800',
			cursor: 'pointer',
			letterSpacing: '-0.005em'
		},
		multiVocalBanner: {
			alignSelf: 'center',
			margin: '-6px 0 12px',
			padding: '7px 12px',
			borderRadius: '999px',
			background: TOSS_BLUE_SOFT,
			border: `1px solid ${TOSS_BLUE_BORDER}`,
			color: 'var(--spice-text)',
			fontSize: '11px',
			fontWeight: '700',
			letterSpacing: '-0.005em'
		},
		parallelSplitEditor: {
			alignSelf: 'stretch',
			maxWidth: '920px',
			width: '100%',
			margin: '-2px auto 12px',
			padding: '10px 12px',
			borderRadius: '14px',
			background: 'rgba(255,255,255,0.025)',
			border: '1px solid rgba(255,255,255,0.06)',
			boxSizing: 'border-box'
		},
		parallelSplitHeader: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' },
		parallelSplitTitle: { fontSize: '11px', color: 'var(--spice-subtext)', fontWeight: '800', letterSpacing: '0.04em', textTransform: 'uppercase' },
		parallelSplitBadge: {
			padding: '3px 8px',
			borderRadius: '999px',
			background: TOSS_BLUE_SOFT,
			border: `1px solid ${TOSS_BLUE_BORDER}`,
			color: 'var(--spice-text)',
			fontSize: '10px',
			fontWeight: '800',
			fontVariantNumeric: 'tabular-nums'
		},
		parallelSplitResetBtn: {
			background: 'rgba(255,255,255,0.055)',
			border: '1px solid rgba(255,255,255,0.08)',
			color: 'var(--spice-text)',
			padding: '4px 9px',
			borderRadius: '999px',
			fontSize: '10px',
			fontWeight: '800',
			cursor: 'pointer'
		},
		parallelSplitToggleBtn: {
			background: 'rgba(255,255,255,0.055)',
			border: '1px solid rgba(255,255,255,0.08)',
			color: 'var(--spice-text)',
			padding: '4px 9px',
			borderRadius: '999px',
			fontSize: '10px',
			fontWeight: '800',
			cursor: 'pointer'
		},
		parallelSplitBody: {
			maxHeight: 'min(220px, 24vh)',
			overflowY: 'auto',
			overflowX: 'hidden',
			overscrollBehavior: 'contain',
			scrollbarWidth: 'thin',
			padding: '2px 4px 4px'
		},
		parallelSplitTape: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'stretch', gap: '2px 0', lineHeight: 1.2 },
		parallelSplitChar: {
			display: 'inline-flex',
			alignItems: 'center',
			justifyContent: 'center',
			minWidth: '12px',
			padding: '5px 1px',
			color: 'var(--spice-text)',
			fontSize: '17px',
			fontWeight: '700',
			boxSizing: 'border-box'
		},
		parallelSplitBoundary: {
			width: '12px',
			minWidth: '12px',
			margin: '0 -2px',
			padding: 0,
			border: 'none',
			borderRadius: '999px',
			background: 'transparent',
			color: 'rgba(255,255,255,0.28)',
			cursor: 'pointer',
			fontSize: '14px',
			fontWeight: '900',
			lineHeight: 1
		},
		parallelSplitBoundaryActive: {
			background: 'rgba(49, 130, 246, 0.24)',
			color: 'var(--spice-text)',
			boxShadow: `0 0 0 1px ${TOSS_BLUE_BORDER}`
		},
		parallelPartRow: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' },
		parallelPartBtn: {
			background: 'rgba(255,255,255,0.05)', color: 'var(--spice-text)',
			border: '1px solid rgba(255,255,255,0.08)',
			padding: '7px 12px', borderRadius: '999px',
			fontSize: '11px', fontWeight: '700', cursor: 'pointer',
			fontVariantNumeric: 'tabular-nums'
		},
		parallelPartBtnActive: {
			background: 'rgba(49, 130, 246, 0.20)',
			borderColor: TOSS_BLUE_BORDER,
			color: 'var(--spice-text)'
		},
		parallelMetaRow: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', margin: '-4px 0 12px', flexWrap: 'wrap' },
		parallelMetaLabel: { fontSize: '11px', color: 'var(--spice-subtext)', fontWeight: '700', letterSpacing: '0.02em', textTransform: 'uppercase' },
		parallelMetaSelect: {
			background: 'rgba(255,255,255,0.05)', color: 'var(--spice-text)',
			border: '1px solid rgba(255,255,255,0.08)',
			padding: '6px 10px', borderRadius: '8px',
			fontSize: '11px', fontWeight: '700', outline: 'none'
		},
		parallelMetaSelectDuet: {
			color: '#d9c7ff',
			background: 'rgba(156, 92, 255, 0.10)',
			borderColor: 'rgba(190, 150, 255, 0.38)'
		},
		parallelMetaOptionDuet: { color: '#c9a7ff', background: '#1b1424' },
		inspectorBlock: {
			width: 'min(940px, 100%)',
			margin: '-2px auto 14px',
			padding: '14px',
			borderRadius: '18px',
			background: TOSS_SURFACE_STRONG,
			border: `1px solid ${TOSS_BORDER}`,
			boxShadow: '0 14px 36px rgba(0,0,0,0.20)',
			boxSizing: 'border-box'
		},
		inspectorTitle: {
			fontSize: '11px',
			fontWeight: '850',
			color: 'var(--spice-subtext)',
			letterSpacing: '0.06em',
			textTransform: 'uppercase',
			margin: '0 0 10px'
		},
		inspectorGrid: {
			display: 'grid',
			gridTemplateColumns: 'minmax(260px, 0.8fr) minmax(360px, 1.2fr)',
			gap: '14px',
			alignItems: 'start'
		},
		speakerGroups: { display: 'flex', flexDirection: 'column', gap: '11px' },
		speakerGroupTitle: { fontSize: '10px', fontWeight: '850', color: 'var(--spice-subtext)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' },
		speakerGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '7px' },
		speakerChoice: {
			minHeight: '38px',
			borderRadius: '10px',
			border: `1px solid ${TOSS_BORDER}`,
			background: 'rgba(255,255,255,0.04)',
			color: 'var(--spice-text)',
			display: 'inline-flex',
			alignItems: 'center',
			gap: '8px',
			padding: '0 11px',
			fontSize: '11px',
			fontWeight: '850',
			cursor: 'pointer',
			textAlign: 'left',
			letterSpacing: '0.01em',
			outline: 'none'
		},
		speakerDot: { width: '8px', height: '8px', borderRadius: '999px', flexShrink: 0 },
		customSpeakerColorEditor: {
			display: 'grid',
			gridTemplateColumns: '42px minmax(0, 1fr)',
			gap: '10px',
			alignItems: 'start',
			marginTop: '12px',
			padding: '12px',
			borderRadius: '10px',
			border: `1px solid ${TOSS_BORDER}`,
			background: 'rgba(255,255,255,0.035)'
		},
		customSpeakerColorPicker: {
			width: '42px',
			height: '42px',
			padding: '3px',
			borderRadius: '8px',
			border: `1px solid ${TOSS_BORDER}`,
			background: 'transparent',
			cursor: 'pointer'
		},
		customSpeakerColorFields: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 },
		customSpeakerColorLabel: { fontSize: '11px', fontWeight: '850', color: 'var(--spice-text)' },
		customSpeakerColorDescription: { fontSize: '10px', lineHeight: 1.45, color: 'var(--spice-subtext)' },
		customSpeakerColorText: {
			width: '100%',
			minHeight: '34px',
			boxSizing: 'border-box',
			borderRadius: '8px',
			border: `1px solid ${TOSS_BORDER}`,
			background: 'rgba(0,0,0,0.18)',
			color: 'var(--spice-text)',
			fontFamily: 'monospace',
			fontSize: '12px',
			padding: '0 10px',
			outline: 'none'
		},
		effectGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '9px' },
		effectCard: {
			minHeight: '86px',
			borderRadius: '12px',
			border: `1px solid ${TOSS_BORDER}`,
			background: 'rgba(255,255,255,0.04)',
			color: 'var(--spice-text)',
			display: 'inline-flex',
			alignItems: 'center',
			justifyContent: 'center',
			padding: '12px 8px',
			cursor: 'pointer',
			overflow: 'visible',
			boxSizing: 'border-box',
			outline: 'none'
		},
		effectLabel: {
			minWidth: 0,
			maxWidth: '100%',
			overflow: 'visible',
			whiteSpace: 'nowrap',
			fontSize: '22px',
			lineHeight: 1.1,
			fontWeight: '900',
			color: 'var(--spice-text)',
			transformOrigin: 'center',
			letterSpacing: 0
		},
		parallelStack: { width: '100%', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'stretch' },
		parallelStackLine: {
			width: '100%',
			flexShrink: 0,
			background: 'rgba(255,255,255,0.025)',
			color: 'var(--spice-text)',
			border: '1px solid rgba(255,255,255,0.07)',
			borderRadius: '12px',
			padding: '12px 14px 10px',
			display: 'flex',
			flexDirection: 'column',
			alignItems: 'center',
			gap: '7px',
			textAlign: 'center',
			cursor: mode === 'record' ? 'pointer' : 'default',
			boxSizing: 'border-box'
		},
		parallelStackLineActive: {
			background: TOSS_BLUE_SOFT,
			borderColor: TOSS_BLUE_BORDER,
			boxShadow: `inset 0 0 0 1px ${TOSS_BLUE_RING}`
		},
		parallelStackLineDuet: {
			background: 'rgba(156, 92, 255, 0.055)',
			borderColor: 'rgba(190, 150, 255, 0.20)'
		},
		parallelStackLineDuetActive: {
			background: 'rgba(156, 92, 255, 0.13)',
			borderColor: 'rgba(200, 168, 255, 0.52)'
		},
		parallelStackMeta: {
			color: 'var(--spice-subtext)',
			fontSize: '10px',
			fontWeight: '800',
			letterSpacing: '0.04em',
			textTransform: 'uppercase',
			fontVariantNumeric: 'tabular-nums',
			lineHeight: 1
		},
		parallelStackMetaDuet: { color: '#d9c7ff' },
		parallelStackText: { display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'stretch', gap: '0px', maxWidth: '100%' },
		parallelStackJoinSeparator: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '14px', minWidth: '14px', flexShrink: 0, color: 'transparent', pointerEvents: 'none' },
		parallelStackChar: {
			padding: '6px 1px',
			borderRadius: '4px',
			fontSize: '28px',
			fontWeight: '600',
			minWidth: '6px',
			boxSizing: 'border-box',
			textAlign: 'center',
			flexShrink: 0,
			color: 'var(--spice-text)',
			letterSpacing: 0,
			lineHeight: 1.15
		},
		parallelStackCharSynced: { background: 'rgba(49, 130, 246, 0.18)' },
		lyricsBox: {
			background: 'linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.015) 100%)',
			border: '1px solid rgba(255,255,255,0.06)',
			borderRadius: '18px',
			padding: '36px 20px',
			display: 'flex', flexDirection: 'column', alignItems: 'center',
			cursor: mode === 'record' ? 'pointer' : 'default',
			userSelect: 'none', marginBottom: '14px',
			boxShadow: '0 20px 48px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04)'
		},
		lyricsBoxParallelScrollable: {
			alignItems: 'stretch',
			maxHeight: 'min(430px, 44vh)',
			overflowY: 'auto',
			overflowX: 'hidden',
			overscrollBehavior: 'contain',
			scrollbarWidth: 'thin',
			paddingRight: '14px',
			paddingLeft: '14px',
			touchAction: 'pan-y'
		},
		lyricsScroll: { width: '100%', overflowX: 'auto', overflowY: 'hidden', paddingBottom: '28px', display: 'flex', justifyContent: 'center' },
		lyricsLine: { display: 'inline-flex', flexWrap: 'nowrap', gap: '0px', paddingLeft: '32px', paddingRight: '32px', justifyContent: 'center', alignItems: usePrimaryCharacterPronunciation ? 'flex-start' : 'stretch' },
		rtlLyricsLine: { display: 'block', width: '100%', paddingLeft: '32px', paddingRight: '32px', textAlign: 'center', direction: 'rtl', unicodeBidi: 'plaintext' },
		rtlTextRun: { display: 'inline-block', maxWidth: '100%', padding: '10px 1px', fontSize: '32px', fontWeight: '600', lineHeight: 1.45, letterSpacing: 0, whiteSpace: 'pre', cursor: mode === 'record' ? 'pointer' : 'default', color: 'transparent', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' },
		charSpan: { padding: usePrimaryCharacterPronunciation ? '4px 4px 6px' : `${hasCurrentLineFurigana ? 18 : 10}px 1px ${(hasCurrentLineCharacterPronunciation && currentLineRenderedPronunciationUnits.length === 0) ? 26 : 10}px`, borderRadius: '4px', cursor: mode === 'record' ? 'pointer' : 'default', position: 'relative', fontSize: usePrimaryCharacterPronunciation ? '15px' : '32px', fontWeight: '600', minWidth: usePrimaryCharacterPronunciation ? '18px' : '6px', minHeight: usePrimaryCharacterPronunciation ? '68px' : undefined, boxSizing: 'border-box', textAlign: 'center', flexShrink: 0, color: 'var(--spice-text)', letterSpacing: 0, lineHeight: usePrimaryCharacterPronunciation ? 1.05 : 1.15 },
		charJoinSeparator: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: usePrimaryCharacterPronunciation ? '12px' : '16px', minWidth: usePrimaryCharacterPronunciation ? '12px' : '16px', padding: 0, flexShrink: 0, color: 'transparent', pointerEvents: 'none' },
		charSpanPronunciationPrimary: { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '2px' },
		charWordGroup: { display: 'inline-flex', position: 'relative', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', flexShrink: 0, borderRadius: '4px', padding: '0 0 3px', boxSizing: 'border-box' },
		charWordGroupPrimary: { flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', minHeight: '68px', padding: '2px 3px 6px', boxSizing: 'border-box' },
		charWordOriginalRow: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: usePrimaryCharacterPronunciation ? '30px' : 'auto', whiteSpace: 'nowrap' },
		charWordSpace: { display: 'inline-flex', width: usePrimaryCharacterPronunciation ? '10px' : '12px', minWidth: usePrimaryCharacterPronunciation ? '10px' : '12px', padding: 0, margin: 0, flexShrink: 0, color: 'transparent', background: 'transparent', pointerEvents: mode === 'record' ? 'auto' : 'none', boxSizing: 'border-box' },
		charSpanInWord: { padding: `${hasCurrentLineFurigana ? 18 : 10}px 1px 8px`, minWidth: '6px', minHeight: undefined },
		charSpanInWordPrimary: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 'auto', width: 'auto', minHeight: '24px', padding: '4px 0 0', fontSize: '14px', lineHeight: 1, letterSpacing: 0 },
		charWordPronunciation: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '13px', marginTop: '1px', fontSize: '10px', fontWeight: '700', color: 'var(--spice-subtext)', opacity: 0.9, lineHeight: 1, whiteSpace: 'nowrap', letterSpacing: 0, pointerEvents: 'none' },
		charWordPronunciationPrimary: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '28px', fontSize: '24px', fontWeight: '700', color: 'inherit', lineHeight: 1.05, whiteSpace: 'nowrap', letterSpacing: 0, pointerEvents: 'none' },
		charFixedPrimaryCell: { width: '28px', minWidth: '28px', maxWidth: '28px', padding: '4px 0 6px', overflow: 'visible' },
		charFuriganaWrap: { position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '1em', lineHeight: 'inherit' },
		charFuriganaText: { position: 'absolute', left: '50%', bottom: '100%', transform: 'translateX(-50%)', marginBottom: '1px', fontSize: `${Number(window.CONFIG?.visual?.["furigana-font-size"]) || 11}px`, fontWeight: window.CONFIG?.visual?.["furigana-font-weight"] || '500', color: 'inherit', opacity: (Number(window.CONFIG?.visual?.["furigana-opacity"]) || 80) / 100, lineHeight: 1, letterSpacing: 0, whiteSpace: 'nowrap', pointerEvents: 'none' },
		charPronunciation: { position: 'absolute', bottom: '7px', left: '50%', transform: 'translateX(-50%)', fontSize: '10px', fontWeight: '600', color: 'var(--spice-subtext)', opacity: 0.9, lineHeight: 1, whiteSpace: 'nowrap', letterSpacing: 0, pointerEvents: 'none' },
		charOriginalSmall: { display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: '30px', minWidth: '100%', fontSize: '14px', fontWeight: '600', color: 'inherit', opacity: 0.82, lineHeight: 1, letterSpacing: 0 },
		charPronunciationPrimary: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '26px', fontSize: '24px', fontWeight: '700', color: 'inherit', lineHeight: 1.05, whiteSpace: 'nowrap', letterSpacing: 0 },
		charPronunciationPrimaryFixed: { position: 'absolute', left: '50%', bottom: '7px', transform: 'translateX(-50%)', width: 'max-content', minWidth: '100%', textAlign: 'center', pointerEvents: 'none' },
		charSynced: { background: 'rgba(49, 130, 246, 0.20)' },
		charPlayed: { background: TOSS_BLUE, color: '#fff' },
		charRecording: { background: 'rgba(255, 152, 0, 0.6)' },
		charLocked: { boxShadow: `inset 0 -3px 0 ${TOSS_BLUE}` },
		charTime: { position: 'absolute', bottom: usePrimaryCharacterPronunciation ? '-18px' : (hasCurrentLineCharacterPronunciation ? '-16px' : '-20px'), left: '50%', transform: 'translateX(-50%)', fontSize: '9px', color: 'var(--spice-subtext)', whiteSpace: 'nowrap' },
		nextLineBox: { textAlign: 'center', padding: '10px 8px', opacity: 0.55 },
		nextLineLabel: { fontSize: '10px', color: 'var(--spice-subtext)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: '700' },
		nextLineText: { fontSize: '14px', color: 'var(--spice-subtext)', lineHeight: 1.7, letterSpacing: '-0.005em' },
		hint: { fontSize: '12px', color: 'var(--spice-subtext)', textAlign: 'center', padding: '10px 8px', fontStyle: 'italic', opacity: 0.8 },
		progressRow: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px', padding: '8px 28px', fontSize: '12px', color: 'var(--spice-subtext)', flexShrink: 0, fontWeight: '500', fontVariantNumeric: 'tabular-nums' },
		controls: {
			display: 'flex', flexWrap: 'wrap', gap: '10px',
			padding: '16px 28px',
			justifyContent: 'center',
			borderTop: '1px solid rgba(255,255,255,0.06)',
			background: 'linear-gradient(180deg, rgba(255,255,255,0.005) 0%, rgba(255,255,255,0.025) 100%)',
			backdropFilter: 'blur(18px) saturate(160%)',
			WebkitBackdropFilter: 'blur(18px) saturate(160%)',
			flexShrink: 0
		},
		ctrlBtn: {
			background: 'rgba(255,255,255,0.05)', color: 'var(--spice-text)',
			border: '1px solid rgba(255,255,255,0.08)',
			padding: '10px 18px', borderRadius: '999px',
			fontWeight: '600', cursor: 'pointer', fontSize: '13px',
			letterSpacing: '-0.005em'
		},
		modeBtn: {
			border: '1px solid transparent',
			padding: '12px 26px', borderRadius: '999px',
			fontWeight: '700', cursor: 'pointer', fontSize: '13px',
			minWidth: '110px', letterSpacing: '-0.005em'
		},
		deleteBtn: {
			background: 'rgba(244, 67, 54, 0.08)',
			color: '#ff6b60',
			border: '1px solid rgba(244, 67, 54, 0.45)',
			padding: '10px 18px', borderRadius: '999px',
			fontWeight: '600', cursor: 'pointer', fontSize: '13px',
			letterSpacing: '-0.005em'
		},
		loading: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--spice-subtext)', fontSize: '13px', fontWeight: '500' },
		error: { textAlign: 'center', padding: '40px', color: '#ff7a72', fontSize: '13px', fontWeight: '500' },
		// 공통 모달 스타일
		lrcLibModal: {
			position: 'fixed', inset: 0,
			background: 'rgba(0,0,0,0.55)',
			backdropFilter: 'blur(12px) saturate(160%)',
			WebkitBackdropFilter: 'blur(12px) saturate(160%)',
			zIndex: 'var(--iv-layer-modal, 2147483647)',
			display: 'flex', alignItems: 'center', justifyContent: 'center',
			padding: '24px'
		},
		lrcLibContent: {
			background: 'rgba(20, 22, 26, 0.96)',
			backdropFilter: 'blur(40px) saturate(180%)',
			WebkitBackdropFilter: 'blur(40px) saturate(180%)',
			border: '1px solid rgba(255,255,255,0.08)',
			borderRadius: '18px', padding: '26px',
			width: '90%', maxWidth: '620px', maxHeight: '85vh',
			display: 'flex', flexDirection: 'column', gap: '14px',
			boxShadow: '0 24px 64px rgba(0,0,0,0.5)'
		},
		lrcLibTitle: { fontSize: '18px', fontWeight: '700', color: 'var(--spice-text)', margin: 0, letterSpacing: '-0.015em' },
		lrcLibDesc: { fontSize: '13px', color: 'var(--spice-subtext)', lineHeight: 1.55 },
		multiVocalDecisionPreview: {
			fontSize: '13px',
			lineHeight: 1.55,
			color: 'var(--spice-text)',
			padding: '12px 14px',
			background: 'rgba(255,255,255,0.045)',
			border: '1px solid rgba(255,255,255,0.08)',
			borderRadius: '12px',
			whiteSpace: 'nowrap',
			overflow: 'hidden',
			textOverflow: 'ellipsis'
		},
		parentheticalLayoutOriginal: {
			fontSize: '12px',
			lineHeight: 1.55,
			color: 'var(--spice-subtext)',
			padding: '10px 12px',
			background: 'rgba(255,255,255,0.035)',
			border: '1px solid rgba(255,255,255,0.07)',
			borderRadius: '10px',
			whiteSpace: 'pre-wrap',
			wordBreak: 'break-word'
		},
		parentheticalLayoutGrid: {
			display: 'grid',
			gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
			gap: '10px'
		},
		parentheticalLayoutOption: {
			background: 'rgba(255,255,255,0.045)',
			border: '1px solid rgba(255,255,255,0.09)',
			borderRadius: '12px',
			padding: '13px',
			color: 'var(--spice-text)',
			textAlign: 'left',
			cursor: 'pointer',
			display: 'flex',
			flexDirection: 'column',
			gap: '9px',
			minWidth: 0
		},
		parentheticalLayoutOptionPrimary: {
			background: TOSS_BLUE_SOFT,
			border: `1px solid ${TOSS_BLUE_BORDER}`,
			boxShadow: `0 0 0 3px ${TOSS_BLUE_RING}`
		},
		parentheticalLayoutOptionTitle: { fontSize: '13px', fontWeight: '800', letterSpacing: '-0.005em' },
		parentheticalLayoutOptionDesc: { fontSize: '11.5px', color: 'var(--spice-subtext)', lineHeight: 1.45 },
		parentheticalLayoutPreview: {
			display: 'flex',
			flexDirection: 'column',
			gap: '4px',
			padding: '10px',
			borderRadius: '9px',
			background: 'rgba(0,0,0,0.22)',
			border: '1px solid rgba(255,255,255,0.07)',
			fontSize: '13px',
			fontWeight: '700',
			lineHeight: 1.35,
			whiteSpace: 'pre-wrap',
			wordBreak: 'break-word'
		},
		lrcLibBtnRow: { display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: '4px' },
		lrcLibBtn: {
			background: TOSS_BLUE, color: '#fff',
			border: 'none', padding: '11px 22px', borderRadius: '999px',
			fontWeight: '700', cursor: 'pointer', fontSize: '13px',
			letterSpacing: '-0.005em',
			boxShadow: `0 8px 22px ${TOSS_BLUE_RING}`
		},
		lrcLibBtnSecondary: {
			background: 'rgba(255,255,255,0.06)', color: 'var(--spice-text)',
			border: '1px solid rgba(255,255,255,0.08)',
			padding: '11px 22px', borderRadius: '999px',
			fontWeight: '600', cursor: 'pointer', fontSize: '13px'
		},
		lrcLibBtnCancel: {
			background: 'transparent', color: 'var(--spice-subtext)',
			border: '1px solid rgba(255,255,255,0.12)',
			padding: '11px 22px', borderRadius: '999px',
			fontWeight: '600', cursor: 'pointer', fontSize: '13px'
		},
		// 키보드 단축키 스타일
		shortcutsContainer: {
			display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: '10px 12px',
			padding: '14px 18px',
			background: TOSS_SURFACE,
			border: `1px solid ${TOSS_BORDER}`,
			borderRadius: '14px', marginTop: '14px'
		},
		shortcutItem: { display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '11px', color: 'var(--spice-subtext)', fontWeight: '500' },
		shortcutKey: {
			display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
			minWidth: '26px', height: '24px', padding: '0 7px',
			background: 'linear-gradient(180deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.06) 100%)',
			color: 'var(--spice-text)', borderRadius: '6px',
			fontSize: '10.5px', fontWeight: '700',
			fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
			border: '1px solid rgba(255,255,255,0.14)',
			boxShadow: '0 2px 0 rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)'
		},
		shortcutDesc: { color: 'var(--spice-subtext)' },
		workspace: {
			flex: 1,
			minHeight: 0,
			display: 'grid',
			gridTemplateColumns: '320px minmax(0, 1fr) 390px',
			gap: '12px',
			padding: '12px',
			overflow: 'hidden'
		},
		sideRail: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '2px' },
		centerRail: { minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '10px' },
		rightRail: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '2px' },
		panel: {
			background: TOSS_SURFACE,
			border: `1px solid ${TOSS_BORDER}`,
			borderRadius: '8px',
			padding: '12px',
			boxShadow: '0 10px 28px rgba(0,0,0,0.16)'
		},
		panelTight: { padding: '10px' },
		panelTitle: { fontSize: '12px', fontWeight: '850', color: 'var(--spice-text)', marginBottom: '10px', letterSpacing: '-0.01em' },
		panelSubtitle: { fontSize: '11px', color: 'var(--spice-subtext)', lineHeight: 1.35, marginTop: '-6px', marginBottom: '10px' },
		sourceTrack: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', minWidth: 0 },
		sourceAlbumArt: { width: '52px', height: '52px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0, boxShadow: '0 8px 24px rgba(0,0,0,0.36)' },
		sourceControls: { display: 'flex', flexDirection: 'column', gap: '8px' },
		sourceButtonRow: { display: 'grid', gridTemplateColumns: '1fr', gap: '8px' },
		fullWidthButton: { width: '100%', justifyContent: 'center' },
		lrclibIdBox: {
			display: 'flex',
			flexDirection: 'column',
			gap: '6px',
			padding: '10px',
			borderRadius: '8px',
			background: 'rgba(49, 130, 246, 0.07)',
			border: `1px solid ${TOSS_BLUE_BORDER}`
		},
		lrclibIdLabel: {
			fontSize: '10.5px',
			fontWeight: '850',
			color: '#8fc1ff',
			letterSpacing: '0.06em',
			textTransform: 'uppercase'
		},
		lrclibIdRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px' },
		lrclibSearchBox: {
			gridColumn: '1 / -1',
			display: 'flex',
			flexDirection: 'column',
			gap: '6px',
			padding: '10px',
			borderRadius: '8px',
			background: 'rgba(49, 130, 246, 0.055)',
			border: `1px solid ${TOSS_BORDER}`
		},
		lrclibSearchRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px' },
		lrclibIdInput: {
			minWidth: 0,
			background: 'rgba(0,0,0,0.22)',
			color: 'var(--spice-text)',
			border: `1px solid ${TOSS_BORDER}`,
			borderRadius: '999px',
			padding: '7px 12px',
			fontSize: '12px',
			fontWeight: '700',
			outline: 'none',
			boxSizing: 'border-box'
		},
		bulkVocalPanelRow: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '8px', alignItems: 'center' },
		statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' },
		statCard: { background: 'rgba(255,255,255,0.045)', border: `1px solid ${TOSS_BORDER}`, borderRadius: '8px', padding: '12px' },
		statValue: { fontSize: '20px', fontWeight: '900', color: 'var(--spice-text)', fontVariantNumeric: 'tabular-nums' },
		statLabel: { fontSize: '11px', color: 'var(--spice-subtext)', marginTop: '4px', fontWeight: '700' },
		actionGrid: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
		stagePanel: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '12px', overflow: 'hidden' },
		stageBody: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', overflow: 'hidden' },
		stageLyricsBox: { flex: 1, minHeight: '360px', marginBottom: '14px' },
		transportPanel: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 12px' },
		transportRow: { display: 'flex', alignItems: 'center', gap: '10px' },
		offsetCompactRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' },
		rightActionRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
		railDivider: { height: '1px', background: TOSS_BORDER, margin: '10px 0' },
		sideInspectorGrid: { display: 'flex', flexDirection: 'column', gap: '12px' },
	};

	const currentLineData = syncLinesByStart?.get(lineCharOffsets[currentLineIndex]);
	const currentLineTimes = getSyncCreatorLineTimes(currentLineData);
	const hasCurrentLineTiming = currentLineTimes.length > 0;
	const currentLineTimingLabel = hasCurrentLineTiming
		? `${formatSeconds(Math.min(...currentLineTimes))} - ${formatSeconds(Math.max(...currentLineTimes))}`
		: (I18n.t('syncCreator.lineOffsetUnavailable') || '싱크 후 조정 가능');
	const currentLinePreviewIndex = currentLineText
		? getPreviewProgressIndex(currentLineIndex)
		: -1;
	const currentRecordingCharIndex = recordingCharIndexRef.current;
	const currentLineProgressIndex = mode === 'record' && currentRecordingCharIndex >= 0
		? currentRecordingCharIndex
		: currentLinePreviewIndex;
	const currentLineProgressPercent = currentLineChars.length > 0 && currentLineProgressIndex >= 0
		? Math.max(0, Math.min(100, ((currentLineProgressIndex + 1) / currentLineChars.length) * 100))
		: 0;
	const currentLineProgressColor = mode === 'record' && currentRecordingCharIndex >= 0
		? SYNC_CREATOR_RECORDING_BACKGROUND
		: SYNC_CREATOR_PROGRESS_COLOR;
	const rtlTextRunStyle = {
		...s.rtlTextRun,
		direction: currentLineDirection,
		backgroundImage: getSyncCreatorProgressGradient(currentLineDirection, currentLineProgressPercent, currentLineProgressColor),
	};
	const renderCharacterSpan = (char, i, options = {}) => {
		const isSynced = isCharSynced(currentLineIndex, i);
		const isRec = mode === 'record' && currentRecordingCharIndex >= 0 && i <= currentRecordingCharIndex;
		const isLocked = mode === 'record' && recordingLockIndex >= 0 && i <= recordingLockIndex;
		const previewIdx = currentLinePreviewIndex;
		const previewNumericIndex = Number(previewIdx);
		const previewCompletedIndex = Number.isFinite(previewNumericIndex) ? Math.floor(previewNumericIndex) : -1;
		const isPlayed = isSynced && previewCompletedIndex >= i;
		const charTime = getCharSyncTime(currentLineIndex, i);
		const furigana = currentLineFuriganaMap.get(i);
		const characterPronunciation = options.hidePronunciation ? '' : currentLineCharacterPronunciationMap.get(i);
		const usePrimaryLayout = usePrimaryCharacterPronunciation && !options.suppressPrimaryPronunciation;
		const useFixedPrimaryLayout = usePrimaryLayout && useFixedPrimaryCharacterCells;
		const shouldShowCharTime = !options.hideTime && currentLineRenderedPronunciationUnits.length === 0;
		const baseBackground = !options.wordSpacer && isSynced
			? (isPlayed ? SYNC_CREATOR_PROGRESS_COLOR : 'rgba(49, 130, 246, 0.20)')
			: '';
		const baseColor = !options.wordSpacer && isSynced && isPlayed ? '#fff' : '';
		const originalContent = furigana
			? react.createElement('span', { style: s.charFuriganaWrap },
				char === ' ' ? '\u00A0' : char,
				react.createElement('span', { style: s.charFuriganaText }, furigana)
			)
			: (char === ' ' ? '\u00A0' : char);

		let style = { ...s.charSpan };
		if (usePrimaryLayout) style = { ...style, ...s.charSpanPronunciationPrimary };
		if (useFixedPrimaryLayout) style = { ...style, ...s.charFixedPrimaryCell };
		if (options.wordSpacer) style = { ...style, ...s.charWordSpace };
		if (options.inWordUnit) style = { ...style, ...s.charSpanInWord };
		if (options.inWordPrimary) style = { ...style, ...s.charSpanInWordPrimary };
		if (!options.wordSpacer) {
			if (isRec) style = { ...style, ...s.charRecording };
			else if (isSynced) style = isPlayed ? { ...style, ...s.charPlayed } : { ...style, ...s.charSynced };
			if (isLocked) style = { ...style, ...s.charLocked };
		}

		const pronunciationStyle = usePrimaryLayout
			? {
				...s.charPronunciationPrimary,
				...(useFixedPrimaryLayout ? s.charPronunciationPrimaryFixed : null),
				visibility: characterPronunciation ? 'visible' : 'hidden',
				color: isPlayed ? '#fff' : s.charPronunciationPrimary.color
			}
			: {
				...s.charPronunciation,
				color: isPlayed ? '#fff' : s.charPronunciation.color
			};

		return react.createElement('span', {
			key: options.key || i,
			style,
			ref: (el) => { charElementsRef.current[i] = el; },
			'data-char-index': i,
			'data-iv-sync-creator-synced': !options.wordSpacer && isSynced ? '1' : '0',
			'data-iv-sync-creator-base-background': baseBackground,
			'data-iv-sync-creator-base-color': baseColor,
			onContextMenu: options.wordSpacer ? undefined : (e) => handleCharacterContextMenu(i, e),
			title: options.wordSpacer || mode !== 'record' ? undefined : (I18n.t('syncCreator.syncLockTooltip') || 'Right-click to lock timing up to this character')
		},
			usePrimaryLayout
				? react.createElement('span', { style: s.charOriginalSmall }, originalContent)
				: originalContent,
			usePrimaryLayout
				? react.createElement('span', { style: pronunciationStyle }, characterPronunciation || '\u00A0')
				: (characterPronunciation && react.createElement('span', { style: pronunciationStyle }, characterPronunciation)),
			shouldShowCharTime && isSynced && charTime !== null && react.createElement('span', { style: s.charTime }, formatSeconds(charTime))
		);
	};
	const renderPronunciationUnit = (unit) => {
		const wordChars = [];
		for (let i = unit.start; i <= unit.end; i++) {
			wordChars.push(renderCharacterSpan(currentLineChars[i], i, {
				key: `unit-${unit.start}-${i}`,
				hidePronunciation: true,
				suppressPrimaryPronunciation: true,
				inWordUnit: true,
				inWordPrimary: usePrimaryCharacterPronunciation
			}));
		}

		const groupStyle = usePrimaryCharacterPronunciation
			? { ...s.charWordGroup, ...s.charWordGroupPrimary }
			: s.charWordGroup;
		const pronunciationStyle = usePrimaryCharacterPronunciation
			? s.charWordPronunciationPrimary
			: s.charWordPronunciation;

		return react.createElement('span', {
			key: `unit-${unit.start}-${unit.end}`,
			style: groupStyle
		},
			react.createElement('span', { style: s.charWordOriginalRow }, wordChars),
			react.createElement('span', { style: pronunciationStyle }, unit.pronunciation)
		);
	};
	const renderCurrentLineCharacters = () => {
		const displayItems = activeParallelPart && Array.isArray(activeParallelPart.ranges) && activeParallelPart.ranges.length > 1
			? getSyncCreatorParallelPartDisplayItems(activeParallelPart, currentFullLineChars, currentLineStart)
			: null;
		if (useCurrentLineTextRun) {
			return react.createElement('span', {
				ref: rtlTextRunRef,
				style: rtlTextRunStyle,
				dir: currentLineDirection,
				'data-rtl-text-run': 'true',
				onContextMenu: (e) => {
					const charIndex = getCharIndexFromPoint(e.clientX, e.clientY);
					if (charIndex >= 0) handleCharacterContextMenu(charIndex, e);
				}
			}, displayItems ? displayItems.map(item => item.text || item.char || '').join('') : currentLineText);
		}

		const items = displayItems || currentLineChars.map((char, i) => ({ type: 'char', key: `char-${i}`, charIndex: i, char }));
		return items.map((item) => {
			if (item.type === 'separator') {
				return react.createElement('span', {
					key: item.key,
					style: s.charJoinSeparator
				}, item.text === ' ' ? '\u00A0' : item.text);
			}
			const char = item.char;
			const i = item.charIndex;
			const pronunciationUnit = currentLineRenderedPronunciationUnitByStart.get(i);
			if (pronunciationUnit) {
				return renderPronunciationUnit(pronunciationUnit);
			}
			if (currentLineRenderedPronunciationCoveredIndexes.has(i)) {
				return null;
			}
			if (currentLineRenderedPronunciationUnits.length > 0 && /\s/u.test(char)) {
				return renderCharacterSpan(char, i, {
					key: `word-space-${i}`,
					hidePronunciation: true,
					hideTime: true,
					suppressPrimaryPronunciation: true,
					wordSpacer: true
				});
			}
			return renderCharacterSpan(char, i);
		});
	};
	const renderParallelPartLine = (part, index) => {
		const isActive = activeParallelTargetId === part.id;
		const partCharRefs = rangesToCharRefs(part.ranges, currentFullLineChars, currentLineStart);
		const partChars = partCharRefs.map(ref => ref.char);
		const partDisplayItems = getSyncCreatorParallelPartDisplayItems(part, currentFullLineChars, currentLineStart);
		const savedPart = currentLineData?.parallel?.parts?.find(item => item.id === part.id);
		const syncedCount = Array.isArray(savedPart?.chars) ? Math.min(savedPart.chars.length, partChars.length) : 0;
		const speakerLabel = part.speaker || SYNC_CREATOR_DEFAULT_SPEAKER;
		const isDuetSpeaker = isSyncCreatorDuetSpeaker(speakerLabel, part['speaker-fallback']);
		const kindLabel = getSyncCreatorKindLabel(part.kind) || part.kind || SYNC_CREATOR_DEFAULT_KIND;
		const handlePartPointerDown = (e) => {
			if (isActive) {
				handleContainerMouseDown(e);
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			selectParallelPart(part.id);
		};

		return react.createElement('button', {
			key: part.id,
			type: 'button',
			style: {
				...s.parallelStackLine,
				...(isDuetSpeaker ? s.parallelStackLineDuet : null),
				...(isActive ? s.parallelStackLineActive : null),
				...(isDuetSpeaker && isActive ? s.parallelStackLineDuetActive : null)
			},
			onMouseDown: handlePartPointerDown,
			onTouchStart: handlePartPointerDown,
			onClick: () => {
				if (!isActive) selectParallelPart(part.id);
			}
		},
			react.createElement('div', { style: { ...s.parallelStackMeta, ...(isDuetSpeaker ? s.parallelStackMetaDuet : null) } },
				`${index + 1} | ${speakerLabel} | ${kindLabel} | ${partChars.length}`
			),
			isActive
				? react.createElement('div', { style: useCurrentLineTextRun ? { ...s.rtlLyricsLine, direction: currentLineDirection, paddingLeft: 0, paddingRight: 0 } : s.parallelStackText },
					renderCurrentLineCharacters()
				)
				: react.createElement('div', { style: s.parallelStackText },
					partDisplayItems.map((item) => {
						if (item.type === 'separator') {
							return react.createElement('span', {
								key: `${part.id}-${item.key}`,
								style: s.parallelStackJoinSeparator
							}, item.text === ' ' ? '\u00A0' : item.text);
						}
						return react.createElement('span', {
							key: `${part.id}-${item.charIndex}`,
							style: {
								...s.parallelStackChar,
								...(item.charIndex < syncedCount ? s.parallelStackCharSynced : null)
							}
						}, item.char === ' ' ? '\u00A0' : item.char);
					})
				)
		);
	};

	const getSpeakerTone = (speaker, speakerColor = '', speakerFallback = '') => {
		const value = String(speaker || '').toUpperCase();
		const text = getSyncCreatorSpeakerTextColor(value, speakerColor, speakerFallback);
		const colorTone = {
			text,
			dot: text,
			background: getSyncCreatorHexColorWithAlpha(text, 0.12),
			border: getSyncCreatorHexColorWithAlpha(text, 0.34),
			borderActive: getSyncCreatorHexColorWithAlpha(text, 0.78),
			ring: getSyncCreatorHexColorWithAlpha(text, 0.22)
		};
		const withActualColor = (fallback) => ({
			...fallback,
			text,
			dot: text,
			background: colorTone.background || fallback.background,
			border: colorTone.border || fallback.border,
			borderActive: colorTone.borderActive || fallback.borderActive,
			ring: colorTone.ring || fallback.ring
		});

		if (value.startsWith('NORMAL')) {
			return withActualColor({
				text,
				dot: text,
				background: 'rgba(148, 163, 184, 0.105)',
				border: 'rgba(148, 163, 184, 0.25)',
				borderActive: 'rgba(148, 163, 184, 0.58)',
				ring: 'rgba(148, 163, 184, 0.16)'
			});
		}
		if (value.startsWith('FEMALE')) {
			return withActualColor({
				text,
				dot: text,
				background: 'rgba(255, 122, 168, 0.105)',
				border: 'rgba(255, 122, 168, 0.25)',
				borderActive: 'rgba(255, 122, 168, 0.58)',
				ring: 'rgba(255, 122, 168, 0.16)'
			});
		}
		if (value.startsWith('DUET')) {
			return withActualColor({
				text,
				dot: text,
				background: 'rgba(180, 147, 255, 0.105)',
				border: 'rgba(180, 147, 255, 0.25)',
				borderActive: 'rgba(180, 147, 255, 0.58)',
				ring: 'rgba(180, 147, 255, 0.16)'
			});
		}
		return withActualColor({
			text,
			dot: text,
			background: 'rgba(49, 130, 246, 0.105)',
			border: 'rgba(49, 130, 246, 0.25)',
			borderActive: TOSS_BLUE_BORDER,
			ring: TOSS_BLUE_RING
		});
	};

	const renderSpeakerPicker = (selectedSpeaker, selectedSpeakerColor, selectedSpeakerFallback, onSelect) => {
		const groups = [
			{ title: 'NORMAL', values: SYNC_CREATOR_SPEAKER_OPTIONS.filter(value => value.startsWith('NORMAL')) },
			{ title: 'MALE', values: SYNC_CREATOR_SPEAKER_OPTIONS.filter(value => value.startsWith('MALE')) },
			{ title: 'FEMALE', values: SYNC_CREATOR_SPEAKER_OPTIONS.filter(value => value.startsWith('FEMALE')) },
			{ title: 'DUET', values: SYNC_CREATOR_SPEAKER_OPTIONS.filter(value => value.startsWith('DUET')) },
			{ title: 'CUSTOM', values: ['CUSTOM'] }
		];

		return react.createElement('div', { style: s.speakerGroups },
			groups.map(group => react.createElement('div', { key: group.title },
				react.createElement('div', { style: s.speakerGroupTitle }, group.title),
				react.createElement('div', { style: s.speakerGrid },
					group.values.map(value => {
						const isSelected = selectedSpeaker === value;
						const tone = getSpeakerTone(
							value,
							isSelected ? selectedSpeakerColor : '',
							isSelected ? selectedSpeakerFallback : SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK
						);
						return react.createElement('button', {
							key: value,
							type: 'button',
							style: {
								...s.speakerChoice,
								...(value === 'CUSTOM' ? { gridColumn: '1 / -1' } : null),
								color: tone.text,
								background: tone.background,
								borderColor: isSelected ? tone.borderActive : tone.border,
								boxShadow: isSelected ? `0 0 0 3px ${tone.ring}, 0 10px 24px rgba(0, 0, 0, 0.18)` : 'none'
							},
							onClick: () => onSelect(value)
						},
							react.createElement('span', { style: { ...s.speakerDot, background: tone.dot } }),
							value === 'CUSTOM' ? 'CUSTOM' : value.replace(' ', '')
						);
					})
				)
			))
		);
	};

	const renderTextEffectPicker = (selectedKind, onSelect) => {
		const normalizedKind = selectedKind || SYNC_CREATOR_DEFAULT_KIND;
		const renderEffectPreview = (label, value) => react.createElement('span', {
			style: s.effectLabel,
			className: `ivlyrics-sync-kind-preview ${value}`
		}, Array.from(label).map((char, index) => react.createElement('span', {
			key: `${value}-${index}`,
			className: `ivlyrics-sync-kind-preview-char ${value}`,
			style: char === ' ' ? { minWidth: '0.35em' } : null
		}, char === ' ' ? '\u00A0' : char)));

		return react.createElement('div', { style: s.effectGrid },
			SYNC_CREATOR_KIND_OPTIONS.map(([value, labelKey]) => {
				const isSelected = normalizedKind === value;
				const label = I18n.t(labelKey) || value;
				return react.createElement('button', {
					key: value,
					type: 'button',
					className: 'ivlyrics-sync-effect-card',
					style: {
						...s.effectCard,
						background: isSelected ? TOSS_BLUE_SOFT : s.effectCard.background,
						borderColor: isSelected ? TOSS_BLUE_BORDER : s.effectCard.border,
						boxShadow: isSelected ? `0 0 0 3px ${TOSS_BLUE_RING}` : 'none'
					},
					onMouseDown: (e) => e.preventDefault(),
					onClick: () => onSelect(value),
					title: label
				}, renderEffectPreview(label, value));
			})
		);
	};

	const renderBulkSpeakerControl = ({ compact = false, seedColor = '', seedFallback = '' } = {}) => lyricsLines.length > 0 && react.createElement('label', {
		style: compact ? s.bulkVocalControl : s.bulkVocalPanelRow
	},
		react.createElement('span', { style: s.bulkVocalLabel }, I18n.t('syncCreator.bulkVocalLabel') || 'All vocals'),
		react.createElement('select', {
			style: compact ? s.select : { ...s.select, width: '100%' },
			value: '',
			onChange: (event) => requestSongVocalSpeaker(event.target.value, {
				color: seedColor,
				fallback: seedFallback
			})
		},
			[
				react.createElement('option', { key: 'placeholder', value: '', disabled: true }, I18n.t('syncCreator.bulkVocalPlaceholder') || 'Set speaker...'),
				...SYNC_CREATOR_BULK_SPEAKER_OPTIONS.map(value => react.createElement('option', { key: value, value }, value))
			]
		)
	);

	const renderLineInspector = () => {
		const targetSpeaker = activeParallelPart ? activeParallelPart.speaker : currentLineMeta.speaker;
		const targetSpeakerColor = activeParallelPart ? activeParallelPart['speaker-color'] : currentLineMeta['speaker-color'];
		const targetSpeakerFallback = sanitizeSyncCreatorSpeakerFallback(
			targetSpeaker,
			activeParallelPart ? activeParallelPart['speaker-fallback'] : currentLineMeta['speaker-fallback'],
			true,
			targetSpeaker
		);
		const targetKind = activeParallelPart ? activeParallelPart.kind : currentLineMeta.kind;
		const updateSpeakerMeta = (field, value) => {
			if (activeParallelPart) updateParallelPartMeta(activeParallelPart.id, field, value);
			else updateCurrentLineMeta(field, value);
		};
		const customSpeakerMemoryKey = `${trackId || 'track'}:${currentLineStart}:${activeParallelPart?.id || 'line'}`;
		const targetRememberedCustomSpeakerMeta = customSpeakerMetaMemoryRef.current.get(customSpeakerMemoryKey) || {};
		const rememberedCustomSpeakerMeta = resolveSyncCreatorRememberedCustomSpeakerMeta(
			targetRememberedCustomSpeakerMeta,
			{ color: bulkCustomSpeakerColor, fallback: bulkCustomSpeakerFallback }
		);
		const updateSpeaker = (value) => {
			const transition = resolveSyncCreatorSpeakerTransition({
				currentSpeaker: targetSpeaker,
				currentColor: targetSpeakerColor,
				currentFallback: targetSpeakerFallback,
				nextSpeaker: value,
				remembered: rememberedCustomSpeakerMeta
			});
			if (!transition) return;
			customSpeakerMetaMemoryRef.current.set(customSpeakerMemoryKey, transition.remembered);
			if (isSyncCreatorCustomSpeaker(transition.speaker)) {
				setBulkCustomSpeakerColor(transition.color);
				setBulkCustomSpeakerFallback(transition.fallback);
			}
			updateSpeakerMeta('speaker', transition.speaker);
			updateSpeakerMeta('speaker-fallback', transition.fallback);
			updateSpeakerMeta('speaker-color', transition.color);
		};
		const updateSpeakerColor = (value) => {
			const color = normalizeSyncCreatorSpeakerColor(value);
			if (!color) return false;
			customSpeakerMetaMemoryRef.current.set(customSpeakerMemoryKey, {
				color,
				fallback: normalizeSyncCreatorSpeakerFallback(targetSpeakerFallback)
					|| rememberedCustomSpeakerMeta.fallback
			});
			setBulkCustomSpeakerColor(color);
			updateSpeakerMeta('speaker-color', color);
			return true;
		};
		const updateSpeakerFallback = (value) => {
			const fallback = normalizeSyncCreatorSpeakerFallback(value);
			if (!fallback) return;
			customSpeakerMetaMemoryRef.current.set(customSpeakerMemoryKey, {
				color: normalizeSyncCreatorSpeakerColor(targetSpeakerColor)
					|| rememberedCustomSpeakerMeta.color,
				fallback
			});
			setBulkCustomSpeakerFallback(fallback);
			updateSpeakerMeta('speaker-fallback', fallback);
		};
		const updateKind = (value) => {
			if (activeParallelPart) updateParallelPartMeta(activeParallelPart.id, 'kind', value);
			else updateCurrentLineMeta('kind', value);
		};

		return react.createElement('div', { style: s.sideInspectorGrid },
			react.createElement('div', { style: s.panel },
				react.createElement('div', { style: s.panelTitle }, I18n.t('syncCreator.speakerLabel') || 'SPEAKER'),
				react.createElement('div', { style: s.panelSubtitle }, activeParallelPart ? (activeParallelPart.role || '') : (I18n.t('syncCreator.allLine') || 'Full line')),
				renderSpeakerPicker(targetSpeaker, targetSpeakerColor, targetSpeakerFallback, updateSpeaker),
				isSyncCreatorCustomSpeaker(targetSpeaker) && react.createElement('div', { style: s.customSpeakerColorEditor },
					react.createElement('input', {
						type: 'color',
						style: s.customSpeakerColorPicker,
						value: sanitizeSyncCreatorSpeakerColor(targetSpeaker, targetSpeakerColor, true, targetSpeakerFallback),
						onChange: (event) => updateSpeakerColor(event.target.value),
						'aria-label': I18n.t('syncCreator.speakerCustomColor') || 'Custom speaker color'
					}),
					react.createElement('div', { style: s.customSpeakerColorFields },
						react.createElement('div', { style: s.customSpeakerColorLabel }, I18n.t('syncCreator.speakerCustomColor') || 'Custom speaker color'),
						react.createElement('input', {
							key: `${currentLineStart}:${activeParallelPart?.id || 'line'}:${targetSpeakerColor}`,
							type: 'text',
							style: s.customSpeakerColorText,
							defaultValue: sanitizeSyncCreatorSpeakerColor(targetSpeaker, targetSpeakerColor, true, targetSpeakerFallback),
							placeholder: '#00ff00',
							maxLength: 7,
							onKeyDown: (event) => {
								if (event.key === 'Enter') event.currentTarget.blur();
							},
							onBlur: (event) => {
								if (updateSpeakerColor(event.target.value)) return;
								event.target.value = sanitizeSyncCreatorSpeakerColor(targetSpeaker, targetSpeakerColor, true, targetSpeakerFallback);
								Toast.error(I18n.t('syncCreator.speakerCustomColorInvalid') || 'Enter a valid HEX color.');
							}
						}),
						react.createElement('div', { style: s.customSpeakerColorDescription }, I18n.t('syncCreator.speakerCustomColorDesc') || 'This color is stored in sync-data for listeners who allow creator colors.'),
						react.createElement('div', { style: s.customSpeakerColorLabel }, I18n.t('syncCreator.speakerCustomFallback') || 'Fallback color group'),
						react.createElement('select', {
							style: { ...s.select, width: '100%' },
							value: targetSpeakerFallback,
							onChange: (event) => updateSpeakerFallback(event.target.value)
						}, SYNC_CREATOR_CUSTOM_FALLBACK_OPTIONS.map(value => react.createElement('option', {
							key: value,
							value
						}, value.replace(' 1', '')))),
						react.createElement('div', { style: s.customSpeakerColorDescription }, I18n.t('syncCreator.speakerCustomFallbackDesc') || 'Used when listeners disable creator custom colors.')
					)
				),
				react.createElement('div', { style: s.railDivider }),
				renderBulkSpeakerControl({
					seedColor: isSyncCreatorCustomSpeaker(targetSpeaker) ? targetSpeakerColor : rememberedCustomSpeakerMeta.color,
					seedFallback: isSyncCreatorCustomSpeaker(targetSpeaker) ? targetSpeakerFallback : rememberedCustomSpeakerMeta.fallback
				})
			),
			react.createElement('div', { style: s.panel },
				react.createElement('div', { style: s.panelTitle }, I18n.t('syncCreator.typeLabel') || 'Text effect'),
				react.createElement('div', { style: s.panelSubtitle }, getSyncCreatorKindLabel(targetKind) || targetKind || SYNC_CREATOR_DEFAULT_KIND),
				renderTextEffectPicker(targetKind, updateKind)
			)
		);
	};

	const renderHeader = () => react.createElement('div', { style: s.header },
		react.createElement('button', {
			style: s.backBtn,
			onClick: () => {
				preventNextTrackRef.current = false;
				if (onClose) onClose();
			}
		},
			react.createElement('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'currentColor' },
				react.createElement('path', { d: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z' })
			),
			I18n.t('syncCreator.back') || '닫기'
		),
		react.createElement('h2', { style: s.title }, I18n.t('syncCreator.title')),
		react.createElement('span', { style: { ...s.modeBadge, ...getModeStyle() } }, getModeLabel()),
		react.createElement('button', {
			style: { ...s.submitBtn, opacity: isSubmitting || !syncData ? 0.5 : 1, cursor: isSubmitting || !syncData ? 'not-allowed' : 'pointer' },
			onClick: handleSubmit,
			disabled: isSubmitting || !syncData
		}, isSubmitting ? I18n.t('syncCreator.submitting') : I18n.t('syncCreator.submit'))
	);

	const renderSourcePanel = () => react.createElement('div', { style: s.panel },
		react.createElement('div', { style: s.panelTitle }, 'Source'),
		react.createElement('div', { style: s.sourceTrack },
			albumArt && react.createElement('img', { src: albumArt, style: s.sourceAlbumArt, alt: trackName }),
			react.createElement('div', { style: s.trackMeta },
				react.createElement('div', { style: s.trackName }, trackName),
				react.createElement('div', { style: s.artistName }, artistName)
			)
		),
		react.createElement('div', { style: s.sourceControls },
			react.createElement('select', {
				style: { ...s.select, width: '100%' },
				value: addonId || '',
				onChange: (e) => {
					const newAddonId = e.target.value;
					if (newAddonId) {
						setAddonId(newAddonId);
						loadLyrics(newAddonId);
					}
				}
			},
				[
					react.createElement('option', { key: 'default', value: '', disabled: true }, I18n.t('syncCreator.selectProvider') || '제공자 선택...'),
					...availableProviders.map(p => react.createElement('option', { key: p.id, value: p.id }, p.name))
				]
			),
			react.createElement('div', { style: s.sourceButtonRow },
				react.createElement('button', {
					style: { ...s.loadBtn, ...s.fullWidthButton, opacity: isLoading ? 0.5 : 1 },
					onClick: () => loadLyrics(addonId),
					disabled: isLoading
				}, isLoading ? I18n.t('syncCreator.loading') : I18n.t('syncCreator.reload') || '다시 로드')
			),
			addonId === 'lrclib' && react.createElement('div', { style: s.lrclibIdBox },
				react.createElement('div', { style: s.lrclibIdLabel }, I18n.t('syncCreator.lrclibIdLabel') || 'LRCLIB ID'),
				react.createElement('div', { style: s.lrclibIdRow },
					react.createElement('input', {
						type: 'text',
						inputMode: 'numeric',
						style: s.lrclibIdInput,
						value: lrclibIdInput,
						placeholder: I18n.t('syncCreator.lrclibIdPlaceholder') || 'e.g. 5206921',
						onChange: (e) => setLrclibIdInput(e.target.value.replace(/[^\d]/g, '')),
						onKeyDown: (e) => {
							if (e.key === 'Enter') loadLrclibById();
						},
						disabled: isLoadingLrclibId
					}),
					react.createElement('button', {
						type: 'button',
						style: { ...s.loadBtn, whiteSpace: 'nowrap', opacity: isLoadingLrclibId ? 0.6 : 1 },
						onClick: loadLrclibById,
						disabled: isLoadingLrclibId
					}, isLoadingLrclibId
						? (I18n.t('syncCreator.lrclibIdLoading') || 'Loading...')
						: (I18n.t('syncCreator.lrclibIdLoad') || 'Load by ID'))
				)
			),
			lyricsLines.length > 0 && react.createElement('button', {
				style: {
					...s.secondaryBtn,
					...s.fullWidthButton,
					opacity: isGeneratingCharacterPronunciations ? 0.6 : 1,
					background: showCharacterPronunciations ? 'rgba(49, 130, 246, 0.22)' : s.secondaryBtn.background
				},
				onClick: handleCharacterPronunciationToggle,
				disabled: isGeneratingCharacterPronunciations,
				title: I18n.t('syncCreator.characterPronunciationDesc') || 'AI로 글자별 한국어 발음을 생성해 현재 라인 아래에 표시합니다.'
			}, isGeneratingCharacterPronunciations
				? (characterPronunciationProgressInfo?.buttonLabel || I18n.t('syncCreator.characterPronunciationGenerating') || 'AI 발음 생성 중...')
				: characterPronunciations
					? (showCharacterPronunciations
						? (I18n.t('syncCreator.characterPronunciationHide') || '발음 숨기기')
						: (I18n.t('syncCreator.characterPronunciationShow') || '발음 표시'))
					: (I18n.t('syncCreator.characterPronunciationGenerate') || 'AI 글자 발음')
			),
			isGeneratingCharacterPronunciations && characterPronunciationProgressInfo && react.createElement('div', {
				style: { ...s.characterPronunciationProgress, width: '100%', maxWidth: '100%' },
				title: characterPronunciationProgressInfo.label
			},
				react.createElement('div', { style: s.characterPronunciationProgressText }, characterPronunciationProgressInfo.label),
				react.createElement('div', { style: s.characterPronunciationProgressTrack },
					react.createElement('div', {
						style: {
							...s.characterPronunciationProgressFill,
							width: `${Math.max(0, Math.min(100, characterPronunciationProgressInfo.percent || 0))}%`
						}
					})
				)
			),
			characterPronunciations && showCharacterPronunciations && react.createElement('button', {
				style: {
					...s.secondaryBtn,
					...s.fullWidthButton,
					background: isCharacterPronunciationPrimary ? 'rgba(49, 130, 246, 0.22)' : s.secondaryBtn.background
				},
				onClick: () => setIsCharacterPronunciationPrimary(value => !value),
				title: I18n.t('syncCreator.characterPronunciationPrimaryDesc') || '생성된 발음을 크게, 원어 가사를 작게 표시합니다.'
			}, I18n.t('syncCreator.characterPronunciationPrimary') || '발음 크게'),
			isVirtualKaraokeSource && react.createElement('span', { style: s.virtualKaraokeBadge }, I18n.t('syncCreator.virtualKaraoke') || '가상 노래방 데이터')
		)
	);

	const renderProgressPanel = () => lyricsText && react.createElement('div', { style: s.panel },
		react.createElement('div', { style: s.panelTitle }, I18n.t('syncCreator.progress') || '진행'),
		react.createElement('div', { style: s.statsGrid },
			react.createElement('div', { style: s.statCard },
				react.createElement('div', { style: s.statValue }, `${completedLines}/${lyricsLines.length}`),
				react.createElement('div', { style: s.statLabel }, I18n.t('syncCreator.linesCompleted') || '줄 완료')
			),
			react.createElement('div', { style: s.statCard },
				react.createElement('div', { style: s.statValue }, `${syncedChars}/${totalChars}`),
				react.createElement('div', { style: s.statLabel }, I18n.t('syncCreator.chars') || '글자')
			)
		),
		react.createElement('div', { style: s.actionGrid },
			react.createElement('button', { style: s.ctrlBtn, onClick: goToFirstLine, disabled: currentLineIndex <= 0 }, I18n.t('syncCreator.firstLine')),
			react.createElement('button', {
				style: {
					...s.modeBtn,
					background: mode === 'record' ? 'linear-gradient(135deg, #ff6b6b, #f04452)' : TOSS_BLUE,
					color: '#fff',
					boxShadow: mode === 'record' ? '0 8px 22px rgba(240, 68, 82, 0.24)' : `0 8px 22px ${TOSS_BLUE_RING}`
				},
				onClick: () => toggleMode('record')
			}, mode === 'record' ? I18n.t('syncCreator.stopRecord') : I18n.t('syncCreator.recordMode')),
			react.createElement('button', {
				style: {
					...s.modeBtn,
					background: mode === 'preview' ? `linear-gradient(135deg, ${TOSS_BLUE}, ${TOSS_BLUE_DEEP})` : 'rgba(255,255,255,0.05)',
					color: mode === 'preview' ? '#fff' : 'var(--spice-text)',
					border: mode === 'preview' ? '1px solid transparent' : `1px solid ${TOSS_BORDER}`,
					boxShadow: mode === 'preview' ? `0 8px 22px ${TOSS_BLUE_RING}` : 'none'
				},
				onClick: () => toggleMode('preview'),
				disabled: !syncData || syncData.lines.length === 0
			}, mode === 'preview' ? I18n.t('syncCreator.stopPreview') : I18n.t('syncCreator.previewMode')),
			react.createElement('button', { style: s.ctrlBtn, onClick: copyAllLyrics, disabled: !lyricsText }, I18n.t('syncCreator.copyLyrics') || '가사 복사'),
			react.createElement('button', { style: s.ctrlBtn, onClick: exportSyncData, disabled: !syncData || !syncData.lines || syncData.lines.length === 0 }, I18n.t('syncCreator.export') || '내보내기'),
			react.createElement('button', { style: s.ctrlBtn, onClick: importSyncData }, I18n.t('syncCreator.import') || '불러오기'),
			isCurrentLineSynced && react.createElement('button', { style: s.deleteBtn, onClick: deleteCurrentLineSync }, I18n.t('syncCreator.deleteLine')),
			react.createElement('button', {
				style: s.deleteBtn,
				onClick: resetFromStart,
				title: I18n.t('syncCreator.resetConfirm') || '현재 작업 중인 싱크 데이터가 모두 삭제됩니다.'
			}, I18n.t('syncCreator.reset'))
		)
	);

	const renderShortcutGuide = () => lyricsText && react.createElement('div', { style: s.panel },
		react.createElement('div', { style: s.panelTitle }, 'Sync Creator 단축키'),
		react.createElement('div', { style: s.panelSubtitle }, I18n.t('syncCreator.dragHint')),
		react.createElement('div', { style: { ...s.shortcutsContainer, marginTop: 0, padding: 0, background: 'transparent', border: 'none' } },
			[
				[getSyncCreatorShortcutDisplay('charForward'), I18n.t('syncCreator.shortcuts.charForward') || '한 글자'],
				[getSyncCreatorShortcutDisplay('charBack'), I18n.t('syncCreator.shortcuts.charBack') || '한 글자 취소'],
				[getSyncCreatorShortcutDisplay('wordForward'), I18n.t('syncCreator.shortcuts.wordForward') || '한 단어'],
				[getSyncCreatorShortcutDisplay('wordBack'), I18n.t('syncCreator.shortcuts.wordBack') || '한 단어 취소'],
				[getSyncCreatorShortcutDisplay('syllable'), I18n.t('syncCreator.shortcuts.syllable') || '음절'],
				[getSyncCreatorShortcutDisplay('drag'), I18n.t('syncCreator.shortcuts.drag') || '누르면 드래그'],
				[I18n.t('syncCreator.shortcuts.rightClick') || 'Right click', I18n.t('syncCreator.shortcuts.lockToCharacter') || '해당 글자까지 잠금'],
				['Enter', I18n.t('syncCreator.shortcuts.finish') || '라인 완료'],
				['Backspace', I18n.t('syncCreator.shortcuts.cancel') || '취소'],
				['Space', I18n.t('syncCreator.shortcuts.playPause') || '재생/일시정지'],
				['Z', I18n.t('syncCreator.shortcuts.seekBack') || '-3초'],
				['X', I18n.t('syncCreator.shortcuts.seekForward') || '+3초']
			].map(([key, desc]) => react.createElement('div', { key: `${key}-${desc}`, style: s.shortcutItem },
				react.createElement('span', { style: s.shortcutKey }, key),
				react.createElement('span', { style: s.shortcutDesc }, desc)
			))
		)
	);

	const renderLrclibSearchControls = () => react.createElement('div', { style: s.lrclibSearchBox },
		react.createElement('div', { style: s.lrclibIdLabel }, I18n.t('syncCreator.lrclibSearchQueryLabel') || 'LRCLIB Search'),
		react.createElement('div', { style: s.lrclibSearchRow },
			react.createElement('input', {
				type: 'text',
				style: s.lrclibIdInput,
				value: lrclibSearchQuery,
				placeholder: I18n.t('syncCreator.lrclibSearchQueryPlaceholder') || `${trackName} ${artistName}`.trim(),
				onChange: (e) => setLrclibSearchQuery(e.target.value),
				onKeyDown: (e) => {
					if (e.key === 'Enter') searchLrclibByQuery();
				},
				disabled: isSearchingLrclib
			}),
			react.createElement('button', {
				type: 'button',
				style: { ...s.loadBtn, whiteSpace: 'nowrap', opacity: isSearchingLrclib ? 0.6 : 1 },
				onClick: searchLrclibByQuery,
				disabled: isSearchingLrclib
			}, isSearchingLrclib
				? (I18n.t('syncCreator.lrclibSearchLoading') || 'Searching...')
				: (I18n.t('syncCreator.lrclibSearchButton') || 'Search'))
		)
	);

	const renderLrclibCandidatesPanel = () => addonId === 'lrclib' && react.createElement('div', {
		style: { ...s.candidatePanel, padding: '12px', borderBottom: 'none', borderRadius: '8px' }
	},
		react.createElement('div', { style: s.candidatePanelHeader },
			react.createElement('div', { style: s.candidatePanelTitle },
				`${I18n.t('syncCreator.lrclibSearchResults') || 'LRCLIB Search Results'} ${(lrclibSearchMeta?.totalResults || lrclibCandidates.length || 0) > 0 ? `(${lrclibSearchMeta?.totalResults || lrclibCandidates.length})` : ''}`
			),
			react.createElement('button', {
				type: 'button',
				style: s.secondaryBtn,
				onClick: () => setShowLrclibCandidates(prev => !prev)
			}, showLrclibCandidates
				? (I18n.t('syncCreator.hideLrclibSearchResults') || 'Hide Search Results')
				: (I18n.t('syncCreator.showLrclibSearchResults') || 'Show Search Results'))
		),
		showLrclibCandidates && renderLrclibSearchControls(),
		showLrclibCandidates && react.createElement('div', { style: s.candidateList },
			isLoading && lrclibCandidates.length === 0 && react.createElement('div', { style: s.candidateEmpty }, I18n.t('syncCreator.loadingLyrics') || 'Loading lyrics...'),
			!isLoading && lrclibCandidates.length === 0 && react.createElement('div', { style: s.candidateEmpty }, lrclibSearchMeta?.error || (I18n.t('syncCreator.lrclibNoCandidates') || 'No LRCLIB candidates found')),
			lrclibCandidates.map((candidate, index) => {
				const isPreviewing = previewLrclibCandidate?.candidateKey === candidate.candidateKey;
				const isApplied = selectedLrclibCandidateKey === candidate.candidateKey;
				const candidateId = getLrclibCandidateId(candidate);
				let itemStyle = { ...s.candidateItem };
				if (isPreviewing) itemStyle = { ...itemStyle, ...s.candidateItemActive };
				if (isApplied) itemStyle = { ...itemStyle, ...s.candidateItemApplied };

				return react.createElement('button', {
					key: candidate.candidateKey,
					type: 'button',
					style: itemStyle,
					onClick: () => setPreviewLrclibCandidateKey(candidate.candidateKey)
				},
					react.createElement('div', { style: s.candidateTitleRow },
						react.createElement('span', { style: s.candidateTitle }, `${index + 1}. ${candidate.trackName || candidate.name || trackName}`),
						candidateId && react.createElement('span', {
							style: s.candidateIdBadge,
							title: `${I18n.t('syncCreator.lrclibIdLabel') || 'LRCLIB ID'}: ${candidateId}`,
							onClick: (event) => copyLrclibCandidateId(candidateId, event)
						}, `ID ${candidateId}`)
					),
					react.createElement('div', { style: s.candidateSubtitle }, `${candidate.artistName || artistName} · ${formatSeconds(Number(candidate.duration || 0))}`),
					react.createElement('div', { style: s.candidateMetaRow },
						candidate.syncLineExactMatch && react.createElement('span', { style: { ...s.candidateBadge, color: '#8fc1ff' } }, I18n.t('syncCreator.lrclibBadgeExact') || 'Exact'),
						candidate.hasSyncedLyrics && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgeSynced') || 'Synced'),
						candidate.hasPlainLyrics && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgePlain') || 'Plain'),
						candidate.searchSource === 'primary' && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgePrimary') || 'Primary'),
						candidate.searchSource === 'english' && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgeEnglish') || 'English'),
						isApplied && react.createElement('span', { style: { ...s.candidateBadge, color: '#8fc1ff' } }, I18n.t('syncCreator.lrclibLoaded') || 'Loaded')
					)
				);
			})
		),
		showLrclibCandidates && react.createElement('div', { style: s.candidatePreview },
			previewLrclibCandidate
				? react.createElement(react.Fragment, null,
					react.createElement('div', { style: s.candidatePreviewHeader },
						react.createElement('div', null,
							react.createElement('div', { style: s.candidatePreviewTitle }, previewLrclibCandidate.trackName || previewLrclibCandidate.name || trackName),
							react.createElement('div', { style: s.candidatePreviewSubtitle }, `${previewLrclibCandidate.artistName || artistName} · ${previewLrclibCandidate.albumName || ''}`.replace(/\s·\s$/, ''))
						),
						react.createElement('div', { style: s.candidatePreviewActions },
							getLrclibCandidateId(previewLrclibCandidate) && react.createElement('button', {
								type: 'button',
								style: s.candidateIdButton,
								title: `${I18n.t('syncCreator.lrclibIdLabel') || 'LRCLIB ID'}: ${getLrclibCandidateId(previewLrclibCandidate)}`,
								onClick: (event) => copyLrclibCandidateId(previewLrclibCandidate, event)
							}, `ID ${getLrclibCandidateId(previewLrclibCandidate)}`),
							react.createElement('button', {
								type: 'button',
								style: { ...s.secondaryBtn, opacity: selectedLrclibCandidateKey === previewLrclibCandidate.candidateKey ? 0.7 : 1 },
								onClick: () => applySelectedLrclibCandidate(previewLrclibCandidate.candidateKey),
								disabled: isLoading
							}, selectedLrclibCandidateKey === previewLrclibCandidate.candidateKey
								? (I18n.t('syncCreator.lrclibLoaded') || 'Loaded')
								: (I18n.t('syncCreator.lrclibApplyCandidate') || 'Load This Lyrics'))
						)
					),
					react.createElement('div', { style: s.candidateMetaRow },
						react.createElement('span', { style: s.candidateBadge }, `${I18n.t('syncCreator.lrclibMetricArtist') || 'artist'} ${Number(previewLrclibCandidate.artistScore || 0).toFixed(3)}`),
						react.createElement('span', { style: s.candidateBadge }, `${I18n.t('syncCreator.lrclibMetricTitle') || 'title'} ${Number(previewLrclibCandidate.titleScore || 0).toFixed(3)}`),
						react.createElement('span', { style: s.candidateBadge }, `${I18n.t('syncCreator.lrclibMetricDiff') || 'diff'} ${formatSeconds(Number(previewLrclibCandidate.durationDiff || 0))}`),
						previewLrclibCandidate.preferredLyricsSource === 'synced' && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgeSynced') || 'Synced'),
						previewLrclibCandidate.preferredLyricsSource === 'plain' && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgePlain') || 'Plain')
					),
					react.createElement('pre', { style: s.candidatePreviewText }, previewLrclibCandidate.previewText || '')
				)
				: react.createElement('div', { style: s.candidateEmpty }, I18n.t('syncCreator.lrclibSelectCandidate') || 'Select a candidate')
		)
	);

	const renderPlaybackPanel = () => {
		if (!lyricsText) return null;
		const playbackPercent = (position / (Spicetify.Player?.data?.item?.duration?.milliseconds || 1)) * 100;
		return react.createElement('div', { style: { ...s.panel, ...s.transportPanel } },
			react.createElement('div', { style: s.transportRow },
				react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(-3000) }, '-3s'),
				react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(-1000) }, '-1s'),
				react.createElement('span', { style: s.playbackTime }, formatTime(position)),
				react.createElement('div', {
					style: { ...s.playbackBar, '--iv-progress': `${playbackPercent}%` },
					'data-iv-progress-bar': 'true',
					onClick: handleSeek
				}, react.createElement('div', { style: { ...s.playbackFill, width: `${playbackPercent}%` } })),
				react.createElement('span', { style: s.playbackTime }, formatTime(Spicetify.Player?.data?.item?.duration?.milliseconds || 0)),
				react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(1000) }, '+1s'),
				react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(3000) }, '+3s')
			),
			syncData && react.createElement('div', { style: s.offsetCompactRow },
				react.createElement('span', { style: s.offsetLabel }, I18n.t('syncCreator.globalOffset')),
				react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(-100) }, '-100ms'),
				react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(-10) }, '-10ms'),
				react.createElement('span', { style: s.offsetValue }, `${globalOffset >= 0 ? '+' : ''}${globalOffset}ms`),
				react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(10) }, '+10ms'),
				react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(100) }, '+100ms')
			)
		);
	};

	const renderManualSplitEditor = () => multiVocalMode && currentFullLineChars.length > 1 && react.createElement('div', { style: s.parallelSplitEditor },
		react.createElement('div', { style: s.parallelSplitHeader },
			react.createElement('span', { style: s.parallelSplitTitle }, I18n.t('syncCreator.manualSplit') || 'Manual split'),
			hasManualParallelSplit && react.createElement('span', { style: s.parallelSplitBadge }, `${currentManualSplitPoints.length + 1} parts`),
			hasManualDraftSplit && react.createElement('button', {
				type: 'button',
				style: s.parallelSplitResetBtn,
				onClick: resetCurrentLineManualSplit
			}, I18n.t('syncCreator.useAutoSplit') || 'Use auto'),
			react.createElement('button', {
				type: 'button',
				style: s.parallelSplitToggleBtn,
				onClick: () => setIsParallelSplitCollapsed(prev => !prev)
			}, isParallelSplitCollapsed ? (I18n.t('update.expand') || 'Expand') : (I18n.t('update.collapse') || 'Collapse'))
		),
		!isParallelSplitCollapsed && react.createElement('div', { style: s.parallelSplitBody },
			react.createElement('div', { style: s.parallelSplitTape },
				currentFullLineChars.map((char, index) => react.createElement(react.Fragment, { key: `manual-split-${currentLineStart}-${index}` },
					index > 0 && react.createElement('button', {
						type: 'button',
						style: {
							...s.parallelSplitBoundary,
							...(currentManualSplitPointSet.has(index) ? s.parallelSplitBoundaryActive : null)
						},
						title: I18n.t('syncCreator.splitHere') || 'Split here',
						onClick: (e) => {
							e.preventDefault();
							e.stopPropagation();
							toggleManualParallelSplitPoint(index);
						}
					}, currentManualSplitPointSet.has(index) ? '|' : '·'),
					react.createElement('span', { style: s.parallelSplitChar }, char === ' ' ? '\u00A0' : char)
				))
			)
		)
	);

	const renderStagePanel = () => react.createElement('div', { style: { ...s.panel, ...s.stagePanel } },
		isLoading && react.createElement('div', { style: s.loading }, I18n.t('syncCreator.loadingLyrics')),
		error && react.createElement('div', { style: { ...s.error, display: 'flex', flexDirection: 'column', alignItems: 'center' } },
			react.createElement('div', null, error)
		),
		!isLoading && !error && !lyricsText && react.createElement('div', { style: s.loading }, I18n.t('syncCreator.selectProvider')),
		lyricsText && lyricsLines.length > 0 && react.createElement('div', { style: s.stageBody },
			react.createElement('div', { style: s.lineNav },
				react.createElement('button', { style: { ...s.navBtn, opacity: previousNavigableLineIndex < 0 ? 0.3 : 1 }, onClick: goToPrevLine, disabled: previousNavigableLineIndex < 0 }, '‹'),
				react.createElement('div', { style: s.lineInfo },
					react.createElement('div', { style: s.lineCount }, `${currentLineIndex + 1} / ${lyricsLines.length}`),
					react.createElement('div', { style: s.lineStatus }, isCurrentLineSynced ? '✓ ' + I18n.t('syncCreator.synced') : I18n.t('syncCreator.notSynced'))
				),
				react.createElement('button', { style: { ...s.navBtn, opacity: nextNavigableLineIndex < 0 ? 0.3 : 1 }, onClick: goToNextLine, disabled: nextNavigableLineIndex < 0 }, '›')
			),
			multiVocalMode && react.createElement('div', { style: s.multiVocalBanner },
				hasCurrentParallelParts
					? (I18n.t('syncCreator.multiVocalBannerParts') || 'Multiple vocal mode: sync each vocal part separately.')
					: (I18n.t('syncCreator.multiVocalBannerLine') || 'Multiple vocal mode: choose SPEAKER and text effect for this line.')
			),
			renderManualSplitEditor(),
			react.createElement('div', {
				style: hasCurrentParallelParts
					? { ...s.lyricsBox, ...s.lyricsBoxParallelScrollable, ...s.stageLyricsBox }
					: { ...s.lyricsBox, ...s.stageLyricsBox },
				onMouseDown: hasCurrentParallelParts ? undefined : handleContainerMouseDown,
				onTouchStart: hasCurrentParallelParts ? undefined : handleContainerMouseDown,
				ref: lyricsScrollRef
			},
				hasCurrentParallelParts
					? react.createElement('div', { style: s.parallelStack }, currentParallelParts.map((part, index) => renderParallelPartLine(part, index)))
					: react.createElement('div', { style: useCurrentLineTextRun ? { ...s.rtlLyricsLine, direction: currentLineDirection } : s.lyricsLine }, renderCurrentLineCharacters())
			),
			nextNavigableLineIndex >= 0 && react.createElement('div', { style: s.nextLineBox },
				react.createElement('div', { style: s.nextLineLabel }, I18n.t('syncCreator.nextLine')),
				react.createElement('div', {
					style: {
						...s.nextLineText,
						direction: getSyncCreatorTextDirection(lyricsLines[nextNavigableLineIndex]),
						unicodeBidi: 'plaintext'
					}
				}, getSyncCreatorFuriganaReact(lyricsLines[nextNavigableLineIndex]))
			),
			mode === 'record' && react.createElement('div', { style: s.hint }, I18n.t('syncCreator.dragHint'))
		)
	);

	const renderLineOffsetControls = () => {
		const buttonStyle = hasCurrentLineTiming ? s.lineOffsetBtn : { ...s.lineOffsetBtn, opacity: 0.45, cursor: 'not-allowed' };
		const renderOffsetButton = (deltaMs) => react.createElement('button', {
			key: deltaMs,
			type: 'button',
			style: buttonStyle,
			disabled: !hasCurrentLineTiming,
			onClick: () => adjustCurrentLineOffset(deltaMs)
		}, `${deltaMs > 0 ? '+' : ''}${deltaMs}ms`);

		return react.createElement('div', { style: s.lineOffsetBox },
			react.createElement('div', { style: s.lineOffsetHeader },
				react.createElement('span', { style: s.lineOffsetLabel }, I18n.t('syncCreator.lineOffset') || '라인 오프셋'),
				react.createElement('span', { style: s.lineOffsetValue }, currentLineTimingLabel)
			),
			react.createElement('div', { style: s.lineOffsetButtonRow },
				[-100, -10, 10, 100].map(renderOffsetButton)
			)
		);
	};

	const renderCurrentLineTools = () => lyricsText && lyricsLines.length > 0 && react.createElement('div', { style: s.panel },
		react.createElement('div', { style: s.panelTitle }, I18n.t('syncCreator.currentLine') || '현재 가사'),
		renderLineOffsetControls(),
		react.createElement('div', { style: s.rightActionRow },
			!multiVocalMode && currentFullLineChars.length > 1 && react.createElement('button', {
				type: 'button',
				style: s.multiVocalSwitchBtn,
				onClick: enableManualMultiVocalMode
			}, I18n.t('syncCreator.enableMultiVocalMode') || 'Enable multiple vocal mode'),
			canMergeCurrentLineWithNext && react.createElement('button', {
				type: 'button',
				style: s.multiVocalSwitchBtn,
				onClick: mergeCurrentLineWithNext
			}, I18n.t('syncCreator.mergeWithNextLine') || 'Merge next line')
		)
	);

	const renderRightRail = () => react.createElement('aside', { style: s.rightRail },
		renderCurrentLineTools(),
		lyricsText && lyricsLines.length > 0 && (activeParallelPart || !hasCurrentParallelParts) && renderLineInspector()
	);

	const renderModals = () => {
		const renderParentheticalLayoutChoice = (modeValue, title, description, previewLines, primary = false) => react.createElement('button', {
			type: 'button',
			style: {
				...s.parentheticalLayoutOption,
				...(primary ? s.parentheticalLayoutOptionPrimary : null)
			},
			onClick: () => resolveParentheticalLayoutDecision(modeValue)
		},
			react.createElement('div', { style: s.parentheticalLayoutOptionTitle }, title),
			react.createElement('div', { style: s.parentheticalLayoutOptionDesc }, description),
			react.createElement('div', { style: s.parentheticalLayoutPreview },
				(Array.isArray(previewLines) ? previewLines : []).map((line, index) =>
					react.createElement('div', { key: `${modeValue}-${index}` }, line)
				)
			)
		);

		return react.createElement(react.Fragment, null,
		pendingMultiVocalDecision && react.createElement('div', { style: s.lrcLibModal },
			react.createElement('div', { style: { ...s.lrcLibContent, maxWidth: '560px' } },
				react.createElement('h3', { style: s.lrcLibTitle }, I18n.t('syncCreator.multiVocalDetectedTitle') || 'Multiple vocals detected'),
				react.createElement('p', { style: s.lrcLibDesc },
					I18n.t('syncCreator.multiVocalDetectedBody') || 'This lyric contains lines with parentheses or separators, so it can be synced as separate vocal parts. Choose how to work on this song.'
				),
				pendingMultiVocalDecision.preview && react.createElement('div', {
					style: s.multiVocalDecisionPreview,
					title: pendingMultiVocalDecision.preview
				}, pendingMultiVocalDecision.preview),
				react.createElement('div', { style: s.lrcLibBtnRow },
					react.createElement('button', {
						style: s.lrcLibBtnCancel,
						onClick: () => resolveMultiVocalDecision(false)
					}, I18n.t('syncCreator.multiVocalDecisionNormal') || 'Continue in normal mode'),
					react.createElement('button', {
						style: s.lrcLibBtn,
						onClick: () => resolveMultiVocalDecision(true)
					}, I18n.t('syncCreator.multiVocalDecisionMulti') || 'Continue in multiple vocal mode')
				)
			)
		),
		pendingParentheticalLayoutDecision && react.createElement('div', { style: s.lrcLibModal },
			react.createElement('div', { style: { ...s.lrcLibContent, maxWidth: '680px' } },
				react.createElement('h3', { style: s.lrcLibTitle }, I18n.t('syncCreator.parentheticalLayoutTitle') || 'Choose parenthetical vocal layout'),
				react.createElement('p', { style: s.lrcLibDesc },
					I18n.t('syncCreator.parentheticalLayoutBody') || 'This line has multiple parenthetical vocal parts. Choose how it should be shown and synced.'
				),
				react.createElement('div', { style: s.parentheticalLayoutOriginal },
					`${I18n.t('syncCreator.parentheticalLayoutOriginal') || 'Original'}: ${pendingParentheticalLayoutDecision.original || ''}`
				),
				react.createElement('div', { style: s.parentheticalLayoutGrid },
					renderParentheticalLayoutChoice(
						'separate',
						I18n.t('syncCreator.parentheticalLayoutSeparateLabel') || 'Separate each part',
						I18n.t('syncCreator.parentheticalLayoutSeparateDesc') || 'Sync each parenthetical vocal as its own vocal line.',
						pendingParentheticalLayoutDecision.separatePreview,
						false
					),
					renderParentheticalLayoutChoice(
						'grouped',
						I18n.t('syncCreator.parentheticalLayoutGroupedLabel') || 'Group on one line',
						I18n.t('syncCreator.parentheticalLayoutGroupedDesc') || 'Sync adjacent parenthetical vocals together as one vocal line.',
						pendingParentheticalLayoutDecision.groupedPreview,
						true
					)
				)
			)
		),
		showCharacterPronunciationConsent && react.createElement('div', {
			style: s.lrcLibModal,
			onClick: (e) => e.target === e.currentTarget && setShowCharacterPronunciationConsent(false)
		},
			react.createElement('div', { style: s.lrcLibContent },
				react.createElement('h3', { style: s.lrcLibTitle },
					I18n.t('syncCreator.characterPronunciationTokenWarningTitle') || 'AI character pronunciation token usage'
				),
				react.createElement('p', { style: s.lrcLibDesc },
					I18n.t('syncCreator.characterPronunciationTokenWarningBody') || 'This feature generates pronunciation aligned to each character for karaoke sync, so it uses more AI tokens than ordinary pronunciation generation.'
				),
				react.createElement('div', {
					style: {
						fontSize: '12px',
						color: '#ffb74d',
						lineHeight: 1.55,
						padding: '12px 14px',
						background: 'rgba(255, 152, 0, 0.08)',
						borderRadius: '10px',
						border: '1px solid rgba(255, 152, 0, 0.28)'
					}
				}, I18n.t('syncCreator.characterPronunciationTokenWarningUsage') || 'Expected usage: about 3-6x more tokens than a normal line-by-line pronunciation request. Actual usage varies by lyrics length, language, and provider retries.'),
				react.createElement('div', { style: s.lrcLibBtnRow },
					react.createElement('button', {
						style: s.lrcLibBtnCancel,
						onClick: () => setShowCharacterPronunciationConsent(false)
					}, I18n.t('syncCreator.characterPronunciationTokenWarningCancel') || I18n.t('cancel') || 'Cancel'),
					react.createElement('button', {
						style: s.lrcLibBtn,
						onClick: () => {
							setShowCharacterPronunciationConsent(false);
							handleCharacterPronunciationToggle({ skipConsent: true });
						}
					}, I18n.t('syncCreator.characterPronunciationTokenWarningConfirm') || 'I understand and generate')
				)
			)
		),
		);
	};

	return react.createElement('div', { className: 'ivlyrics-sync-creator-shell', style: s.overlay, ref: containerRef },
		renderHeader(),
		react.createElement('div', { style: s.workspace },
			react.createElement('aside', { style: s.sideRail },
				renderSourcePanel(),
				renderProgressPanel(),
				renderShortcutGuide()
			),
			react.createElement('main', { style: s.centerRail },
				renderPlaybackPanel(),
				renderLrclibCandidatesPanel(),
				renderStagePanel()
			),
			renderRightRail()
		),
		renderModals()
	);

	return react.createElement('div', { className: 'ivlyrics-sync-creator-shell', style: s.overlay, ref: containerRef },
		// Header - 유저 요청대로 가운데 정렬 (윈도우 컨트롤과 겹치지 않게)
		react.createElement('div', { style: s.header },
			react.createElement('button', {
				style: s.backBtn, onClick: () => {
					preventNextTrackRef.current = false;
					if (onClose) onClose();
				}
			},
				react.createElement('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'currentColor' },
					react.createElement('path', { d: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z' })
				),
				I18n.t('syncCreator.back') || '닫기'
			),
			react.createElement('h2', { style: s.title }, I18n.t('syncCreator.title')),
			react.createElement('span', { style: { ...s.modeBadge, ...getModeStyle() } }, getModeLabel()),

			react.createElement('button', {
				style: { ...s.submitBtn, opacity: isSubmitting || !syncData ? 0.5 : 1, cursor: isSubmitting || !syncData ? 'not-allowed' : 'pointer' },
				onClick: handleSubmit,
				disabled: isSubmitting || !syncData
			}, isSubmitting ? I18n.t('syncCreator.submitting') : I18n.t('syncCreator.submit'))
		),

		// Track + Provider
		react.createElement('div', { style: s.trackRow },
			albumArt && react.createElement('img', { src: albumArt, style: s.albumArt, alt: trackName }),
			react.createElement('div', { style: s.trackMeta },
				react.createElement('div', { style: s.trackName }, trackName),
				react.createElement('div', { style: s.artistName }, artistName)
			),
			react.createElement('div', { style: s.providerRow },
				react.createElement('span', { style: { fontSize: '12px', color: 'var(--spice-subtext)' } }, 'Provider:'),
				react.createElement('select', {
					style: s.select,
					value: addonId || '',
					onChange: (e) => {
						const newAddonId = e.target.value;
						if (newAddonId) {
							setAddonId(newAddonId);
							loadLyrics(newAddonId);
						}
					}
				},
					[
						react.createElement('option', { key: 'default', value: '', disabled: true }, I18n.t('syncCreator.selectProvider') || '제공자 선택...'),
						...availableProviders.map(p =>
							react.createElement('option', { key: p.id, value: p.id }, p.name)
						)
					]
				),
				react.createElement('button', { style: { ...s.loadBtn, opacity: isLoading ? 0.5 : 1 }, onClick: () => loadLyrics(addonId), disabled: isLoading },
					isLoading ? I18n.t('syncCreator.loading') : I18n.t('syncCreator.reload') || '다시 로드'
				),
				lyricsLines.length > 0 && react.createElement('button', {
					style: {
						...s.secondaryBtn,
						opacity: isGeneratingCharacterPronunciations ? 0.6 : 1,
						background: showCharacterPronunciations ? 'rgba(49, 130, 246, 0.22)' : s.secondaryBtn.background
					},
					onClick: handleCharacterPronunciationToggle,
					disabled: isGeneratingCharacterPronunciations,
					title: I18n.t('syncCreator.characterPronunciationDesc') || 'AI로 글자별 한국어 발음을 생성해 현재 라인 아래에 표시합니다.'
				}, isGeneratingCharacterPronunciations
					? (characterPronunciationProgressInfo?.buttonLabel || I18n.t('syncCreator.characterPronunciationGenerating') || 'AI 발음 생성 중...')
					: characterPronunciations
						? (showCharacterPronunciations
							? (I18n.t('syncCreator.characterPronunciationHide') || '발음 숨기기')
							: (I18n.t('syncCreator.characterPronunciationShow') || '발음 표시'))
						: (I18n.t('syncCreator.characterPronunciationGenerate') || 'AI 글자 발음')
				),
				isGeneratingCharacterPronunciations && characterPronunciationProgressInfo && react.createElement('div', {
					style: s.characterPronunciationProgress,
					title: characterPronunciationProgressInfo.label
				},
					react.createElement('div', { style: s.characterPronunciationProgressText }, characterPronunciationProgressInfo.label),
					react.createElement('div', { style: s.characterPronunciationProgressTrack },
						react.createElement('div', {
							style: {
								...s.characterPronunciationProgressFill,
								width: `${Math.max(0, Math.min(100, characterPronunciationProgressInfo.percent || 0))}%`
							}
						})
					)
				),
				characterPronunciations && showCharacterPronunciations && react.createElement('button', {
					style: {
						...s.secondaryBtn,
						background: isCharacterPronunciationPrimary ? 'rgba(49, 130, 246, 0.22)' : s.secondaryBtn.background
					},
					onClick: () => setIsCharacterPronunciationPrimary(value => !value),
					title: I18n.t('syncCreator.characterPronunciationPrimaryDesc') || '생성된 발음을 크게, 원어 가사를 작게 표시합니다.'
				}, I18n.t('syncCreator.characterPronunciationPrimary') || '발음 크게'),
				renderBulkSpeakerControl({ compact: true }),
				isVirtualKaraokeSource && react.createElement('span', { style: s.virtualKaraokeBadge },
					I18n.t('syncCreator.virtualKaraoke') || '가상 노래방 데이터'
				)
			)
		),

		addonId === 'lrclib' && react.createElement('div', { style: s.candidatePanel },
			react.createElement('div', { style: s.candidatePanelHeader },
				react.createElement('div', { style: s.candidatePanelTitle },
					`${I18n.t('syncCreator.lrclibSearchResults') || 'LRCLIB Search Results'} ${(lrclibSearchMeta?.totalResults || lrclibCandidates.length || 0) > 0 ? `(${lrclibSearchMeta?.totalResults || lrclibCandidates.length})` : ''}`
				),
				react.createElement('button', {
					type: 'button',
					style: s.secondaryBtn,
					onClick: () => setShowLrclibCandidates(prev => !prev)
				}, showLrclibCandidates
					? (I18n.t('syncCreator.hideLrclibSearchResults') || 'Hide Search Results')
					: (I18n.t('syncCreator.showLrclibSearchResults') || 'Show Search Results'))
			),
			showLrclibCandidates && react.createElement('div', { style: s.candidateList },
				isLoading && lrclibCandidates.length === 0 && react.createElement('div', { style: s.candidateEmpty },
					I18n.t('syncCreator.loadingLyrics') || 'Loading lyrics...'
				),
				!isLoading && lrclibCandidates.length === 0 && react.createElement('div', { style: s.candidateEmpty },
					lrclibSearchMeta?.error || (I18n.t('syncCreator.lrclibNoCandidates') || 'No LRCLIB candidates found')
				),
				lrclibCandidates.map((candidate, index) => {
					const isPreviewing = previewLrclibCandidate?.candidateKey === candidate.candidateKey;
					const isApplied = selectedLrclibCandidateKey === candidate.candidateKey;
					const candidateId = getLrclibCandidateId(candidate);
					let itemStyle = { ...s.candidateItem };
					if (isPreviewing) itemStyle = { ...itemStyle, ...s.candidateItemActive };
					if (isApplied) itemStyle = { ...itemStyle, ...s.candidateItemApplied };

					return react.createElement('button', {
						key: candidate.candidateKey,
						type: 'button',
						style: itemStyle,
						onClick: () => setPreviewLrclibCandidateKey(candidate.candidateKey)
					},
						react.createElement('div', { style: s.candidateTitleRow },
							react.createElement('span', { style: s.candidateTitle }, `${index + 1}. ${candidate.trackName || candidate.name || trackName}`),
							candidateId && react.createElement('span', {
								style: s.candidateIdBadge,
								title: `${I18n.t('syncCreator.lrclibIdLabel') || 'LRCLIB ID'}: ${candidateId}`,
								onClick: (event) => copyLrclibCandidateId(candidateId, event)
							}, `ID ${candidateId}`)
						),
						react.createElement('div', { style: s.candidateSubtitle },
							`${candidate.artistName || artistName} · ${formatSeconds(Number(candidate.duration || 0))}`
						),
						react.createElement('div', { style: s.candidateMetaRow },
							candidate.syncLineExactMatch && react.createElement('span', { style: { ...s.candidateBadge, color: '#8fc1ff' } }, I18n.t('syncCreator.lrclibBadgeExact') || 'Exact'),
							candidate.hasSyncedLyrics && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgeSynced') || 'Synced'),
							candidate.hasPlainLyrics && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgePlain') || 'Plain'),
							candidate.searchSource === 'primary' && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgePrimary') || 'Primary'),
							candidate.searchSource === 'english' && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgeEnglish') || 'English'),
							isApplied && react.createElement('span', { style: { ...s.candidateBadge, color: '#8fc1ff' } }, I18n.t('syncCreator.lrclibLoaded') || 'Loaded')
						)
					);
				})
			),
			showLrclibCandidates && react.createElement('div', { style: s.candidatePreview },
				previewLrclibCandidate
					? react.createElement(react.Fragment, null,
						react.createElement('div', { style: s.candidatePreviewHeader },
							react.createElement('div', null,
								react.createElement('div', { style: s.candidatePreviewTitle }, previewLrclibCandidate.trackName || previewLrclibCandidate.name || trackName),
								react.createElement('div', { style: s.candidatePreviewSubtitle },
									`${previewLrclibCandidate.artistName || artistName} · ${previewLrclibCandidate.albumName || ''}`.replace(/\s·\s$/, '')
								)
							),
							react.createElement('div', { style: s.candidatePreviewActions },
								getLrclibCandidateId(previewLrclibCandidate) && react.createElement('button', {
									type: 'button',
									style: s.candidateIdButton,
									title: `${I18n.t('syncCreator.lrclibIdLabel') || 'LRCLIB ID'}: ${getLrclibCandidateId(previewLrclibCandidate)}`,
									onClick: (event) => copyLrclibCandidateId(previewLrclibCandidate, event)
								}, `ID ${getLrclibCandidateId(previewLrclibCandidate)}`),
								react.createElement('button', {
									type: 'button',
									style: { ...s.secondaryBtn, opacity: selectedLrclibCandidateKey === previewLrclibCandidate.candidateKey ? 0.7 : 1 },
									onClick: () => applySelectedLrclibCandidate(previewLrclibCandidate.candidateKey),
									disabled: isLoading
								}, selectedLrclibCandidateKey === previewLrclibCandidate.candidateKey
									? (I18n.t('syncCreator.lrclibLoaded') || 'Loaded')
									: (I18n.t('syncCreator.lrclibApplyCandidate') || 'Load This Lyrics'))
							)
						),
						react.createElement('div', { style: s.candidateMetaRow },
							react.createElement('span', { style: s.candidateBadge }, `${I18n.t('syncCreator.lrclibMetricArtist') || 'artist'} ${Number(previewLrclibCandidate.artistScore || 0).toFixed(3)}`),
							react.createElement('span', { style: s.candidateBadge }, `${I18n.t('syncCreator.lrclibMetricTitle') || 'title'} ${Number(previewLrclibCandidate.titleScore || 0).toFixed(3)}`),
							react.createElement('span', { style: s.candidateBadge }, `${I18n.t('syncCreator.lrclibMetricDiff') || 'diff'} ${formatSeconds(Number(previewLrclibCandidate.durationDiff || 0))}`),
							previewLrclibCandidate.preferredLyricsSource === 'synced' && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgeSynced') || 'Synced'),
							previewLrclibCandidate.preferredLyricsSource === 'plain' && react.createElement('span', { style: s.candidateBadge }, I18n.t('syncCreator.lrclibBadgePlain') || 'Plain')
						),
						react.createElement('pre', { style: s.candidatePreviewText }, previewLrclibCandidate.previewText || '')
					)
					: react.createElement('div', { style: s.candidateEmpty },
						I18n.t('syncCreator.lrclibSelectCandidate') || 'Select a candidate'
					)
			)
		),

		// Playback
		lyricsText && react.createElement('div', { style: s.playbackRow },
			react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(-3000) }, '-3s'),
			react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(-1000) }, '-1s'),
			react.createElement('span', { style: s.playbackTime }, formatTime(position)),
			(() => {
				const playbackPercent = (position / (Spicetify.Player?.data?.item?.duration?.milliseconds || 1)) * 100;
				return react.createElement('div', {
					style: { ...s.playbackBar, '--iv-progress': `${playbackPercent}%` },
					'data-iv-progress-bar': 'true',
					onClick: handleSeek
				},
					react.createElement('div', { style: { ...s.playbackFill, width: `${playbackPercent}%` } })
				);
			})(),
			react.createElement('span', { style: s.playbackTime }, formatTime(Spicetify.Player?.data?.item?.duration?.milliseconds || 0)),
			react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(1000) }, '+1s'),
			react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(3000) }, '+3s')
		),

		// Offset
		lyricsText && syncData && react.createElement('div', { style: s.offsetRow },
			react.createElement('span', { style: s.offsetLabel }, I18n.t('syncCreator.globalOffset')),
			react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(-100) }, '-100ms'),
			react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(-10) }, '-10ms'),
			react.createElement('span', { style: s.offsetValue }, `${globalOffset >= 0 ? '+' : ''}${globalOffset}ms`),
			react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(10) }, '+10ms'),
			react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(100) }, '+100ms')
		),

		// Lyrics Area
		react.createElement('div', { style: s.lyricsArea },
			isLoading && react.createElement('div', { style: s.loading }, I18n.t('syncCreator.loadingLyrics')),
			error && react.createElement('div', { style: { ...s.error, display: 'flex', flexDirection: 'column', alignItems: 'center' } },
				react.createElement('div', null, error)
			),
			!isLoading && !error && !lyricsText && react.createElement('div', { style: s.loading }, I18n.t('syncCreator.selectProvider')),

			lyricsText && lyricsLines.length > 0 && react.createElement(react.Fragment, null,
				// Line Navigation (이전/다음 버튼)
				react.createElement('div', { style: s.lineNav },
					react.createElement('button', { style: { ...s.navBtn, opacity: previousNavigableLineIndex < 0 ? 0.3 : 1 }, onClick: goToPrevLine, disabled: previousNavigableLineIndex < 0 }, '◀'),
					react.createElement('div', { style: s.lineInfo },
						react.createElement('div', { style: s.lineCount }, `${currentLineIndex + 1} / ${lyricsLines.length}`),
						react.createElement('div', { style: s.lineStatus }, isCurrentLineSynced ? '✓ ' + I18n.t('syncCreator.synced') : I18n.t('syncCreator.notSynced'))
					),
					react.createElement('button', { style: { ...s.navBtn, opacity: nextNavigableLineIndex < 0 ? 0.3 : 1 }, onClick: goToNextLine, disabled: nextNavigableLineIndex < 0 }, '▶')
				),

				((!multiVocalMode && currentFullLineChars.length > 1) || canMergeCurrentLineWithNext) && react.createElement('div', { style: s.multiVocalSwitchRow },
					!multiVocalMode && currentFullLineChars.length > 1 && react.createElement('button', {
						type: 'button',
						style: s.multiVocalSwitchBtn,
						onClick: enableManualMultiVocalMode
					}, I18n.t('syncCreator.enableMultiVocalMode') || 'Enable multiple vocal mode'),
					canMergeCurrentLineWithNext && react.createElement('button', {
						type: 'button',
						style: s.multiVocalSwitchBtn,
						onClick: mergeCurrentLineWithNext
					}, I18n.t('syncCreator.mergeWithNextLine') || 'Merge next line')
				),

				multiVocalMode && react.createElement('div', { style: s.multiVocalBanner },
					hasCurrentParallelParts
						? (I18n.t('syncCreator.multiVocalBannerParts') || 'Multiple vocal mode: sync each vocal part separately.')
						: (I18n.t('syncCreator.multiVocalBannerLine') || 'Multiple vocal mode: choose SPEAKER and text effect for this line.')
				),

				multiVocalMode && currentFullLineChars.length > 1 && react.createElement('div', { style: s.parallelSplitEditor },
					react.createElement('div', { style: s.parallelSplitHeader },
						react.createElement('span', { style: s.parallelSplitTitle }, I18n.t('syncCreator.manualSplit') || 'Manual split'),
						hasManualParallelSplit && react.createElement('span', { style: s.parallelSplitBadge }, `${currentManualSplitPoints.length + 1} parts`),
						hasManualDraftSplit && react.createElement('button', {
							type: 'button',
							style: s.parallelSplitResetBtn,
							onClick: resetCurrentLineManualSplit
						}, I18n.t('syncCreator.useAutoSplit') || 'Use auto'),
						react.createElement('button', {
							type: 'button',
							style: s.parallelSplitToggleBtn,
							onClick: () => setIsParallelSplitCollapsed(prev => !prev)
						}, isParallelSplitCollapsed
							? (I18n.t('update.expand') || 'Expand')
							: (I18n.t('update.collapse') || 'Collapse'))
					),
					!isParallelSplitCollapsed && react.createElement('div', { style: s.parallelSplitBody },
						react.createElement('div', { style: s.parallelSplitTape },
						currentFullLineChars.map((char, index) => react.createElement(react.Fragment, { key: `manual-split-${currentLineStart}-${index}` },
							index > 0 && react.createElement('button', {
								type: 'button',
								style: {
									...s.parallelSplitBoundary,
									...(currentManualSplitPointSet.has(index) ? s.parallelSplitBoundaryActive : null)
								},
								title: I18n.t('syncCreator.splitHere') || 'Split here',
								onClick: (e) => {
									e.preventDefault();
									e.stopPropagation();
									toggleManualParallelSplitPoint(index);
								}
							}, currentManualSplitPointSet.has(index) ? '|' : '·'),
							react.createElement('span', { style: s.parallelSplitChar }, char === ' ' ? '\u00A0' : char)
						))
					)
					)
				),

				false && hasCurrentParallelParts && react.createElement('div', { style: s.parallelPartRow },
					currentParallelParts.map((part, index) => {
						const speakerLabel = part.speaker || `VOCAL ${index + 1}`;
						const kindLabel = getSyncCreatorKindLabel(part.kind) || I18n.t('syncCreator.unselectedType') || 'Text effect not selected';
						return react.createElement('button', {
							key: part.id,
							type: 'button',
							style: {
								...s.parallelPartBtn,
								...(activeParallelPartId === part.id ? s.parallelPartBtnActive : null)
							},
							onClick: () => {
								setActiveParallelPartId(part.id);
								setRecordingProgressIndex(-1);
								clearRecordingLock();
								charTimesRef.current = [];
								if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
							}
						}, `${speakerLabel} · ${kindLabel} · ${countRangeChars(part.ranges)}`);
					})
				),

				(activeParallelPart || !hasCurrentParallelParts) && renderLineInspector(),

				false && hasCurrentParallelParts && react.createElement('div', { style: s.parallelPartRow },
					[
							{ id: 'full', label: I18n.t('syncCreator.allLine') || 'Full line', count: currentFullLineChars.length },
							...currentParallelParts.map(part => ({
								id: part.id,
								label: `${part.speaker || (part.role === 'background' ? 'B' : 'A')} ${getSyncCreatorKindLabel(part.kind) || (I18n.t('syncCreator.kindVocal') || 'No effect')}`,
								count: countRangeChars(part.ranges)
							}))
					].map(part => react.createElement('button', {
						key: part.id,
						type: 'button',
						style: {
							...s.parallelPartBtn,
							...(activeParallelPartId === part.id ? s.parallelPartBtnActive : null)
						},
						onClick: () => {
							setActiveParallelPartId(part.id);
							setRecordingProgressIndex(-1);
							clearRecordingLock();
							charTimesRef.current = [];
							if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
							}
						}, `${part.label} · ${part.count}`))
					),

					false && activeParallelPart && react.createElement('div', { style: s.parallelMetaRow },
						react.createElement('span', { style: s.parallelMetaLabel }, 'Speaker'),
						react.createElement('select', {
							style: s.parallelMetaSelect,
							value: activeParallelPart.speaker || 'A',
							onChange: (e) => updateParallelPartMeta(activeParallelPart.id, 'speaker', e.target.value)
						}, ['A', 'B', 'C', 'D', 'SFX'].map(value =>
							react.createElement('option', { key: value, value }, value)
						)),
						react.createElement('span', { style: s.parallelMetaLabel }, I18n.t('syncCreator.typeLabel') || 'Text effect'),
						react.createElement('select', {
							style: s.parallelMetaSelect,
							value: activeParallelPart.kind || 'vocal',
							onChange: (e) => updateParallelPartMeta(activeParallelPart.id, 'kind', e.target.value)
						}, SYNC_CREATOR_KIND_OPTIONS.map(([value, labelKey]) =>
							react.createElement('option', { key: value, value }, I18n.t(labelKey) || value)
						))
					),

					false && !activeParallelPart && react.createElement('div', { style: s.parallelMetaRow },
						react.createElement('span', { style: s.parallelMetaLabel }, 'Speaker'),
						react.createElement('select', {
							style: s.parallelMetaSelect,
							value: currentLineMeta.speaker || 'A',
							onChange: (e) => updateCurrentLineMeta('speaker', e.target.value)
						}, ['A', 'B', 'C', 'D', 'SFX'].map(value =>
							react.createElement('option', { key: value, value }, value)
						)),
						react.createElement('span', { style: s.parallelMetaLabel }, I18n.t('syncCreator.typeLabel') || 'Text effect'),
						react.createElement('select', {
							style: s.parallelMetaSelect,
							value: currentLineMeta.kind || 'vocal',
							onChange: (e) => updateCurrentLineMeta('kind', e.target.value)
						}, SYNC_CREATOR_KIND_OPTIONS.map(([value, labelKey]) =>
							react.createElement('option', { key: value, value }, I18n.t(labelKey) || value)
						))
					),

					// Lyrics Box
				react.createElement('div', {
					style: hasCurrentParallelParts
						? { ...s.lyricsBox, ...s.lyricsBoxParallelScrollable }
						: s.lyricsBox,
					onMouseDown: hasCurrentParallelParts ? undefined : handleContainerMouseDown,
					onTouchStart: hasCurrentParallelParts ? undefined : handleContainerMouseDown,
					ref: lyricsScrollRef
				},
					hasCurrentParallelParts
						? react.createElement('div', { style: s.parallelStack },
							currentParallelParts.map((part, index) => renderParallelPartLine(part, index))
						)
						: react.createElement('div', { style: useCurrentLineTextRun ? { ...s.rtlLyricsLine, direction: currentLineDirection } : s.lyricsLine },
							renderCurrentLineCharacters()
						)
				),

				// Next Line
				nextNavigableLineIndex >= 0 && react.createElement('div', { style: s.nextLineBox },
					react.createElement('div', { style: s.nextLineLabel }, I18n.t('syncCreator.nextLine')),
					react.createElement('div', {
						style: {
							...s.nextLineText,
							direction: getSyncCreatorTextDirection(lyricsLines[nextNavigableLineIndex]),
							unicodeBidi: 'plaintext'
						}
					}, getSyncCreatorFuriganaReact(lyricsLines[nextNavigableLineIndex]))
				),

				mode === 'record' && react.createElement('div', { style: s.hint }, I18n.t('syncCreator.dragHint')),

				// 키보드 단축키 가이드 (record 모드일 때만 표시)
				mode === 'record' && react.createElement('div', { style: s.shortcutsContainer },
					// 한 글자
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, getSyncCreatorShortcutDisplay('charForward')),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.charForward') || '한 글자')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, getSyncCreatorShortcutDisplay('charBack')),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.charBack') || '한 글자 취소')
					),
					// 한 단어
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, getSyncCreatorShortcutDisplay('wordForward')),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.wordForward') || '한 단어')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, getSyncCreatorShortcutDisplay('wordBack')),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.wordBack') || '한 단어 취소')
					),
					// 음절
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, getSyncCreatorShortcutDisplay('syllable')),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.syllable') || '음절')
					),
					// 드래그
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, getSyncCreatorShortcutDisplay('drag')),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.drag') || '누르고 있으면 드래그')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, I18n.t('syncCreator.shortcuts.rightClick') || '우클릭'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.lockToCharacter') || '해당 글자까지 잠금')
					),
					// 완료/취소
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, 'Enter'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.finish') || '라인 완료')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, '⌫'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.cancel') || '취소')
					),
					// 재생 컨트롤
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, 'Space'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.playPause') || '재생/일시정지')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, 'Z'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.seekBack') || '-3초')
					),
					react.createElement('div', { style: s.shortcutItem },
						react.createElement('span', { style: s.shortcutKey }, 'X'),
						react.createElement('span', { style: s.shortcutDesc }, I18n.t('syncCreator.shortcuts.seekForward') || '+3초')
					)
				)
			)
		),

		// Progress
		lyricsText && react.createElement('div', { style: s.progressRow },
			`${completedLines} / ${lyricsLines.length} ${I18n.t('syncCreator.linesCompleted')}`,
			react.createElement('span', { style: { opacity: 0.5 } }, '|'),
			`${syncedChars} / ${totalChars} ${I18n.t('syncCreator.chars')}`
		),

		// Controls
		lyricsText && react.createElement('div', { style: s.controls },
			react.createElement('button', { style: s.ctrlBtn, onClick: goToFirstLine, disabled: currentLineIndex <= 0 }, I18n.t('syncCreator.firstLine')),

			// 기록 모드
			react.createElement('button', {
				style: {
					...s.modeBtn,
					background: mode === 'record'
						? 'linear-gradient(135deg, #ff6b6b, #f04452)'
						: TOSS_BLUE,
					color: '#fff',
					boxShadow: mode === 'record'
						? '0 8px 22px rgba(240, 68, 82, 0.24)'
						: `0 8px 22px ${TOSS_BLUE_RING}`
				},
				onClick: () => toggleMode('record')
			}, mode === 'record' ? I18n.t('syncCreator.stopRecord') : I18n.t('syncCreator.recordMode')),

			// 미리보기 모드
			react.createElement('button', {
				style: {
					...s.modeBtn,
					background: mode === 'preview'
						? `linear-gradient(135deg, ${TOSS_BLUE}, ${TOSS_BLUE_DEEP})`
						: 'rgba(255,255,255,0.05)',
					color: mode === 'preview' ? '#fff' : 'var(--spice-text)',
					border: mode === 'preview' ? '1px solid transparent' : `1px solid ${TOSS_BORDER}`,
					boxShadow: mode === 'preview' ? `0 8px 22px ${TOSS_BLUE_RING}` : 'none'
				},
				onClick: () => toggleMode('preview'),
				disabled: !syncData || syncData.lines.length === 0
			}, mode === 'preview' ? I18n.t('syncCreator.stopPreview') : I18n.t('syncCreator.previewMode')),

			// 가사 복사 버튼
			react.createElement('button', { style: s.ctrlBtn, onClick: copyAllLyrics, disabled: !lyricsText },
				I18n.t('syncCreator.copyLyrics') || '가사 복사'
			),

			// 싱크 데이터 내보내기
			react.createElement('button', { style: s.ctrlBtn, onClick: exportSyncData, disabled: !syncData || !syncData.lines || syncData.lines.length === 0 },
				I18n.t('syncCreator.export') || '내보내기'
			),

			// 싱크 데이터 불러오기
			react.createElement('button', { style: s.ctrlBtn, onClick: importSyncData },
				I18n.t('syncCreator.import') || '불러오기'
			),

			// 현재 줄 삭제
			isCurrentLineSynced && react.createElement('button', { style: s.deleteBtn, onClick: deleteCurrentLineSync },
				I18n.t('syncCreator.deleteLine')
			),

			// 초기화
			react.createElement('button', {
				style: s.deleteBtn,
				onClick: resetFromStart,
				title: I18n.t('syncCreator.resetConfirm') || '현재 작업 중인 싱크 데이터가 모두 삭제됩니다.'
			},
				I18n.t('syncCreator.reset')
			)
		),

		pendingMultiVocalDecision && react.createElement('div', { style: s.lrcLibModal },
			react.createElement('div', { style: { ...s.lrcLibContent, maxWidth: '560px' } },
				react.createElement('h3', { style: s.lrcLibTitle }, I18n.t('syncCreator.multiVocalDetectedTitle') || 'Multiple vocals detected'),
				react.createElement('p', { style: s.lrcLibDesc },
					I18n.t('syncCreator.multiVocalDetectedBody') || 'This lyric contains lines with parentheses or separators, so it can be synced as separate vocal parts. Choose how to work on this song.'
				),
				pendingMultiVocalDecision.preview && react.createElement('div', {
					style: s.multiVocalDecisionPreview,
					title: pendingMultiVocalDecision.preview
				}, pendingMultiVocalDecision.preview),
				react.createElement('div', { style: s.lrcLibBtnRow },
					react.createElement('button', {
						style: s.lrcLibBtnCancel,
						onClick: () => resolveMultiVocalDecision(false)
					}, I18n.t('syncCreator.multiVocalDecisionNormal') || 'Continue in normal mode'),
					react.createElement('button', {
						style: s.lrcLibBtn,
						onClick: () => resolveMultiVocalDecision(true)
					}, I18n.t('syncCreator.multiVocalDecisionMulti') || 'Continue in multiple vocal mode')
				)
			)
		),

		showBulkCustomSpeakerDialog && react.createElement('div', {
			style: s.lrcLibModal,
			onClick: (event) => {
				if (event.target === event.currentTarget) setShowBulkCustomSpeakerDialog(false);
			}
		},
			react.createElement('div', { style: { ...s.lrcLibContent, maxWidth: '440px' } },
				react.createElement('h3', { style: s.lrcLibTitle },
					`${I18n.t('syncCreator.bulkVocalLabel') || 'All vocals'} · CUSTOM`
				),
				react.createElement('div', {
					style: {
						...s.customSpeakerColorEditor,
						marginTop: 0,
						padding: 0,
						border: 'none',
						background: 'transparent'
					}
				},
					react.createElement('input', {
						type: 'color',
						style: s.customSpeakerColorPicker,
						value: sanitizeSyncCreatorSpeakerColor(
							'CUSTOM',
							bulkCustomSpeakerColor,
							true,
							bulkCustomSpeakerFallback
						),
						onChange: (event) => setBulkCustomSpeakerColor(event.target.value),
						'aria-label': I18n.t('syncCreator.speakerCustomColor') || 'Custom speaker color'
					}),
					react.createElement('div', { style: s.customSpeakerColorFields },
						react.createElement('div', { style: s.customSpeakerColorLabel }, I18n.t('syncCreator.speakerCustomColor') || 'Custom speaker color'),
						react.createElement('input', {
							type: 'text',
							style: s.customSpeakerColorText,
							value: bulkCustomSpeakerColor,
							placeholder: '#00ff00',
							maxLength: 7,
							onChange: (event) => setBulkCustomSpeakerColor(event.target.value),
							onKeyDown: (event) => {
								if (event.key !== 'Enter') return;
								event.preventDefault();
								applyBulkCustomSpeaker();
							}
						}),
						react.createElement('div', { style: s.customSpeakerColorLabel }, I18n.t('syncCreator.speakerCustomFallback') || 'Fallback color group'),
						react.createElement('select', {
							style: { ...s.select, width: '100%' },
							value: bulkCustomSpeakerFallback,
							onChange: (event) => setBulkCustomSpeakerFallback(event.target.value)
						}, SYNC_CREATOR_CUSTOM_FALLBACK_OPTIONS.map(value => react.createElement('option', {
							key: value,
							value
						}, value.replace(' 1', ''))))
					)
				),
				react.createElement('div', { style: s.lrcLibBtnRow },
					react.createElement('button', {
						type: 'button',
						style: s.lrcLibBtnCancel,
						onClick: () => setShowBulkCustomSpeakerDialog(false)
					}, I18n.t('cancel') || 'Cancel'),
					react.createElement('button', {
						type: 'button',
						style: s.lrcLibBtn,
						onClick: applyBulkCustomSpeaker
					}, I18n.t('videoBackground.apply') || 'Apply')
				)
			)
		),

		// AI character pronunciation token usage modal
		showCharacterPronunciationConsent && react.createElement('div', {
			style: s.lrcLibModal,
			onClick: (e) => e.target === e.currentTarget && setShowCharacterPronunciationConsent(false)
		},
			react.createElement('div', { style: s.lrcLibContent },
				react.createElement('h3', { style: s.lrcLibTitle },
					I18n.t('syncCreator.characterPronunciationTokenWarningTitle') || 'AI character pronunciation token usage'
				),
				react.createElement('p', { style: s.lrcLibDesc },
					I18n.t('syncCreator.characterPronunciationTokenWarningBody') || 'This feature generates pronunciation aligned to each character for karaoke sync, so it uses more AI tokens than ordinary pronunciation generation.'
				),
				react.createElement('div', {
					style: {
						fontSize: '12px',
						color: '#ffb74d',
						lineHeight: 1.55,
						padding: '12px 14px',
						background: 'rgba(255, 152, 0, 0.08)',
						borderRadius: '10px',
						border: '1px solid rgba(255, 152, 0, 0.28)'
					}
				}, I18n.t('syncCreator.characterPronunciationTokenWarningUsage') || 'Expected usage: about 3-6x more tokens than a normal line-by-line pronunciation request. Actual usage varies by lyrics length, language, and provider retries.'),
				react.createElement('div', { style: s.lrcLibBtnRow },
					react.createElement('button', {
						style: s.lrcLibBtnCancel,
						onClick: () => setShowCharacterPronunciationConsent(false)
					}, I18n.t('syncCreator.characterPronunciationTokenWarningCancel') || I18n.t('cancel') || 'Cancel'),
					react.createElement('button', {
						style: s.lrcLibBtn,
						onClick: () => {
							setShowCharacterPronunciationConsent(false);
							handleCharacterPronunciationToggle({ skipConsent: true });
						}
					}, I18n.t('syncCreator.characterPronunciationTokenWarningConfirm') || 'I understand and generate')
				)
			)
		),

		// LRCLIB 발행 모달
	);
};

window.SyncDataCreator = SyncDataCreator;
