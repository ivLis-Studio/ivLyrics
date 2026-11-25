import { getSyncCreatorParallelPartDisplayItems } from './syncCreatorVocalLayout.mjs';
import { isSyncCreatorCharContextMenuEnabled } from './parallelTiming.mjs';
import { SYNC_CREATOR_PROGRESS_BACKGROUND, SYNC_CREATOR_SYNCED_BACKGROUND } from './syncCreatorStyles.mjs';

export function renderSyncCreatorLineGlyphs({
	react, i18n: I18n, styles: s,
	line: {
		currentLineIndex, currentLineStart, currentLineCharRefs, currentLineStyleRanges, activeParallelPart,
		currentFullLineChars, currentLineChars, currentLineText, currentLineDirection, useCurrentLineTextRun,
	},
	reading: {
		currentLineFuriganaMap, currentLineCharacterPronunciationMap,
		usePrimaryCharacterPronunciation, useFixedPrimaryCharacterCells,
		currentLineRenderedPronunciationUnits, currentLineRenderedPronunciationUnitByStart,
		currentLineRenderedPronunciationCoveredIndexes,
	},
	timing: {
		mode, syncGranularity, currentRecordingCharIndex, currentLinePreviewIndex, currentLinePlayedMarks, currentLockedPlaybackIndex,
		isRecordingLockArmed, recordingLockRange, recordingLockIndex, offsetSelectionRange,
		currentGranularityRanges, currentWordBoundaryStartIndexes, isCharSynced, getCharSyncTime, formatSeconds,
	},
	visuals: { currentSpeakerTextColor, rtlTextRunStyle, textEffectsDisabled },
	vocalStyles: { getSyncCreatorSpeakerTextColor, normalizeSyncCreatorKind },
	refs: { charElementsRef, rtlTextRunRef },
	input: { getCharIndexFromPoint, handleCharacterContextMenu },
}) {
	const lockedPlaybackCompletedIndex = currentLockedPlaybackIndex === null
		? -1
		: Math.floor(currentLockedPlaybackIndex);
	const previewIndex = Number(currentLinePreviewIndex);
	const previewCompletedIndex = Number.isFinite(previewIndex) ? Math.floor(previewIndex) : -1;
	const renderCharacter = (char, i, options = {}) => {
		const absoluteIndex = currentLineCharRefs[i]?.absoluteIndex ?? (currentLineStart + i);
		const inlineStyleRange = options.wordSpacer
			? null
			: currentLineStyleRanges.find(range => range.start <= absoluteIndex && range.end >= absoluteIndex);
		const inlineStyleColor = inlineStyleRange?.speaker
			? getSyncCreatorSpeakerTextColor(
				inlineStyleRange.speaker,
				inlineStyleRange['speaker-color'],
				inlineStyleRange['speaker-fallback']
			)
			: '';
		const inlineStyleKind = normalizeSyncCreatorKind(inlineStyleRange?.kind) || 'vocal';
		const isSynced = isCharSynced(currentLineIndex, i);
		const isRec = mode === 'record' && currentRecordingCharIndex >= 0 && i <= currentRecordingCharIndex;
		const isLocked = isRecordingLockArmed && (recordingLockRange
			? (i >= recordingLockRange.start && i <= recordingLockRange.end)
			: i <= recordingLockIndex);
		// Offset-selection highlight uses the same underline treatment as the
		// record-mode lock. The two never coexist (entering record clears it).
		const isOffsetSelected = !isRecordingLockArmed && mode !== 'record' && offsetSelectionRange !== null
			&& i >= offsetSelectionRange.start && i <= offsetSelectionRange.end;
		const isLockedPlaybackProgress = isLocked && i <= lockedPlaybackCompletedIndex;
		const isPlayed = isSynced && !isRecordingLockArmed && (currentLinePlayedMarks?.[i] ?? (previewCompletedIndex >= i));
		const charTime = getCharSyncTime(currentLineIndex, i);
		const furigana = currentLineFuriganaMap.get(i);
		const characterPronunciation = options.hidePronunciation ? '' : currentLineCharacterPronunciationMap.get(i);
		const usePrimaryLayout = usePrimaryCharacterPronunciation && !options.suppressPrimaryPronunciation;
		const useFixedPrimaryLayout = usePrimaryLayout && useFixedPrimaryCharacterCells;
		const shouldShowCharTime = !options.hideTime;
		const baseBackground = !options.wordSpacer && isSynced
			? (isPlayed ? SYNC_CREATOR_PROGRESS_BACKGROUND : SYNC_CREATOR_SYNCED_BACKGROUND)
			: '';
		const baseColor = !options.wordSpacer ? currentSpeakerTextColor : '';
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
			if (isRec || isLockedPlaybackProgress) style = { ...style, ...s.charRecording };
			else if (isSynced) style = isPlayed ? { ...style, ...s.charPlayed } : { ...style, ...s.charSynced };
			if (isLocked || isOffsetSelected) style = { ...style, ...s.charLocked };
			if (inlineStyleColor) {
				style = {
					...style,
					color: inlineStyleColor,
					'--lyrics-color-active': inlineStyleColor,
					'--lyrics-color-inactive': inlineStyleColor
				};
			}
			if (inlineStyleRange) style['--ivlyrics-range-index'] = i;
		}

		const pronunciationStyle = usePrimaryLayout
			? {
				...s.charPronunciationPrimary,
				...(useFixedPrimaryLayout ? s.charPronunciationPrimaryFixed : null),
				visibility: characterPronunciation ? 'visible' : 'hidden',
				color: currentSpeakerTextColor
			}
			: {
				...s.charPronunciation,
				color: currentSpeakerTextColor
			};

		const charNode = react.createElement('span', {
			key: options.key || i,
			className: [
				'lyrics-karaoke-char',
				inlineStyleRange ? 'ivlyrics-karaoke-range-style lyrics-karaoke-part' : '',
				inlineStyleRange ? inlineStyleKind : '',
				inlineStyleRange && textEffectsDisabled ? 'text-effects-disabled' : ''
			].filter(Boolean).join(' '),
			style,
			ref: (el) => { charElementsRef.current[i] = el; },
			'data-char-index': i,
			'data-iv-sync-creator-synced': !options.wordSpacer && isSynced ? '1' : '0',
			'data-iv-sync-creator-base-background': baseBackground,
			'data-iv-sync-creator-base-color': baseColor,
			'data-iv-sync-creator-range-color': options.wordSpacer ? '' : (inlineStyleColor || ''),
			onContextMenu: options.wordSpacer || !isSyncCreatorCharContextMenuEnabled(syncGranularity, mode)
				? undefined
				: (e) => handleCharacterContextMenu(i, e),
			title: options.wordSpacer || mode !== 'record' || syncGranularity !== 'character'
				? undefined
				: (I18n.t('settings.syncLockTooltip') || 'Right-click to lock timing up to this character')
		},
			usePrimaryLayout
				? react.createElement('span', { style: s.charOriginalSmall }, originalContent)
				: originalContent,
			usePrimaryLayout
				? react.createElement('span', { style: pronunciationStyle }, characterPronunciation || '\u00A0')
				: (characterPronunciation && react.createElement('span', { style: pronunciationStyle }, characterPronunciation)),
			shouldShowCharTime && isSynced && charTime !== null && react.createElement('span', { style: options.timeBottom ? { ...s.charTime, bottom: options.timeBottom } : s.charTime }, formatSeconds(charTime))
		);
		return charNode;
	};
	const renderPronunciationUnit = (unit) => {
		const wordChars = [];
		for (let i = unit.start; i <= unit.end; i++) {
			wordChars.push(renderCharacter(currentLineChars[i], i, {
				key: `unit-${unit.start}-${i}`,
				hidePronunciation: true,
				suppressPrimaryPronunciation: true,
				inWordUnit: true,
				inWordPrimary: usePrimaryCharacterPronunciation,
				// Times hang just below the character bubble: the reading row now
				// lives inside the cell's extended padding, so the bubble edge
				// is the span edge and one small offset fits every mode
				// (40px in primary, whose cells keep their own layout).
				timeBottom: usePrimaryCharacterPronunciation ? '-40px' : '-16px'
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
	const displayItems = activeParallelPart && Array.isArray(activeParallelPart.ranges) && activeParallelPart.ranges.length > 1
		? getSyncCreatorParallelPartDisplayItems(activeParallelPart, currentFullLineChars, currentLineStart)
		: null;
	const renderWordInputSeparator = (key) => react.createElement('span', {
		key,
		className: 'sync-creator-word-input-separator',
		style: s.wordInputSeparator,
		'aria-hidden': 'true'
	}, '/');
	if (useCurrentLineTextRun) {
		const textRunContent = syncGranularity === 'word'
			? currentGranularityRanges.flatMap((range, index) => [
				index > 0 && renderWordInputSeparator(`rtl-separator-${index}`),
				react.createElement('span', { key: `rtl-word-${index}` }, (
					currentLineChars.slice(range.start, range.end + 1).join('')
				))
			]).filter(Boolean)
			: (displayItems ? displayItems.map(item => item.text || item.char || '').join('') : currentLineText);
		return react.createElement('span', {
			ref: rtlTextRunRef,
			className: 'lyrics-karaoke-text-run-segment',
			style: rtlTextRunStyle,
			dir: currentLineDirection,
			'data-rtl-text-run': 'true',
			onContextMenu: (e) => {
				const charIndex = getCharIndexFromPoint(e.clientX, e.clientY);
				if (charIndex >= 0) handleCharacterContextMenu(charIndex, e);
			}
		}, textRunContent);
	}

	const items = displayItems || currentLineChars.map((char, i) => ({ type: 'char', key: `char-${i}`, charIndex: i, char }));
	return items.flatMap((item) => {
		if (item.type === 'separator') {
			return [react.createElement('span', {
				key: item.key,
				style: s.charJoinSeparator
			}, item.text === ' ' ? '\u00A0' : item.text)];
		}
		const char = item.char;
		const i = item.charIndex;
		const wordSeparator = currentWordBoundaryStartIndexes.has(i)
			? renderWordInputSeparator(`word-separator-${i}`)
			: null;
		const pronunciationUnit = currentLineRenderedPronunciationUnitByStart.get(i);
		if (pronunciationUnit) {
			return [wordSeparator, renderPronunciationUnit(pronunciationUnit)].filter(Boolean);
		}
		if (currentLineRenderedPronunciationCoveredIndexes.has(i)) {
			return wordSeparator ? [wordSeparator] : [];
		}
		if (currentLineRenderedPronunciationUnits.length > 0 && /\s/u.test(char)) {
			return [wordSeparator, renderCharacter(char, i, {
				key: `word-space-${i}`,
				hidePronunciation: true,
				hideTime: true,
				suppressPrimaryPronunciation: true,
				wordSpacer: true
			})].filter(Boolean);
		}
		return [wordSeparator, renderCharacter(char, i)].filter(Boolean);
	});
}
