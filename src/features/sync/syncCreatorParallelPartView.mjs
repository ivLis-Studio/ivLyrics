import { getSyncCreatorParallelPartDisplayItems, rangesToCharRefs } from './syncCreatorVocalLayout.mjs';
import { SYNC_CREATOR_DEFAULT_KIND, SYNC_CREATOR_DEFAULT_SPEAKER } from './syncCreatorVocalStyles.mjs';

function renderPartPreviewGlyphs({
	react, styles: s, part, partDisplayItems, previewReadings, syncedCount, partSpeakerTextColor, usePrimaryCharacterPronunciation,
}) {
	const renderSeparator = item => react.createElement('span', {
		key: `${part.id}-${item.key}`,
		style: s.parallelStackJoinSeparator
	}, item.text === ' ' ? '\u00A0' : item.text);
	const hasPreviewReadings = !!(previewReadings && (previewReadings.hasFurigana || previewReadings.hasPron));
	if (!hasPreviewReadings) {
		return partDisplayItems.map((item) => {
			if (item.type === 'separator') {
				return renderSeparator(item);
			}
			return react.createElement('span', {
				key: `${part.id}-${item.charIndex}`,
				'data-iv-sync-creator-preview-index': item.charIndex,
				style: {
					...s.parallelStackChar,
					...(item.charIndex < syncedCount ? s.parallelStackCharSynced : null),
					color: partSpeakerTextColor
				}
			}, item.char === ' ' ? '\u00A0' : item.char);
		});
	}
	const isPreviewPrimary = Boolean(usePrimaryCharacterPronunciation);
	const previewHasFurigana = !!previewReadings.hasFurigana;
	const previewHasSinglePron = !!previewReadings.hasPron && previewReadings.units.length === 0;
	const previewCharBase = {
		...s.parallelStackChar,
		position: 'relative',
		...(isPreviewPrimary
			? { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '2px 3px 6px', minHeight: '68px' }
			: { paddingTop: previewHasFurigana ? '18px' : '6px', paddingBottom: previewReadings.units.length > 0 ? '28px' : (previewHasSinglePron ? '26px' : '10px') })
	};
	const previewPronStyle = isPreviewPrimary
		? { ...s.charPronunciationPrimary, color: partSpeakerTextColor }
		: { ...s.charPronunciation, color: partSpeakerTextColor };
	const renderPreviewSingle = (char, displayIndex, key, options = {}) => {
		const furigana = previewReadings.furiganaMap.get(displayIndex);
		const pronunciation = options.hidePron ? '' : (previewReadings.pronMap.get(displayIndex) || '');
		const originalContent = furigana
			? react.createElement('span', { style: s.charFuriganaWrap }, char === ' ' ? '\u00A0' : char,
				react.createElement('span', { style: s.charFuriganaText }, furigana))
			: (char === ' ' ? '\u00A0' : char);
		if (isPreviewPrimary) {
			return react.createElement('span', {
				key,
				'data-iv-sync-creator-preview-index': displayIndex,
				style: { ...previewCharBase, ...(displayIndex < syncedCount ? s.parallelStackCharSynced : null), color: partSpeakerTextColor }
			},
				react.createElement('span', { style: s.charOriginalSmall }, originalContent),
				react.createElement('span', { style: { ...previewPronStyle, visibility: pronunciation ? 'visible' : 'hidden' } }, pronunciation || '\u00A0')
			);
		}
		return react.createElement('span', {
			key,
			'data-iv-sync-creator-preview-index': displayIndex,
			style: {
				...previewCharBase,
				...(options.inUnit ? { paddingBottom: '28px' } : null),
				...(displayIndex < syncedCount ? s.parallelStackCharSynced : null),
				color: partSpeakerTextColor
			}
		},
			originalContent,
			(!!pronunciation && react.createElement('span', { style: previewPronStyle }, pronunciation))
		);
	};
	const renderPreviewUnit = (unit) => {
		const wordChars = [];
		for (let i = unit.start; i <= unit.end; i++) {
			wordChars.push(renderPreviewSingle(previewReadings.partChars[i] ?? '', i, `${part.id}-unit-${unit.start}-${i}`, { hidePron: true, inUnit: !isPreviewPrimary }));
		}
		const groupStyle = isPreviewPrimary
			? { ...s.charWordGroup, ...s.charWordGroupPrimary, color: partSpeakerTextColor }
			: { ...s.charWordGroup, color: partSpeakerTextColor };
		const unitPronStyle = isPreviewPrimary
			? { ...s.charWordPronunciationPrimary, marginTop: '4px', color: partSpeakerTextColor }
			: { ...s.charWordPronunciation, marginTop: '-18px', color: partSpeakerTextColor };
		return react.createElement('span', {
			key: `${part.id}-unit-${unit.start}-${unit.end}`,
			style: groupStyle
		},
			react.createElement('span', { style: s.charWordOriginalRow }, wordChars),
			react.createElement('span', { style: unitPronStyle }, unit.pronunciation)
		);
	};
	return partDisplayItems.flatMap((item) => {
		if (item.type === 'separator') {
			return [renderSeparator(item)];
		}
		const displayIndex = item.charIndex;
		if (previewReadings.covered.has(displayIndex)) return [];
		const unit = previewReadings.unitByStart.get(displayIndex);
		if (unit) return [renderPreviewUnit(unit)];
		return [renderPreviewSingle(item.char, displayIndex, `${part.id}-${displayIndex}`)];
	});
}

export function renderSyncCreatorParallelPart({
	react, styles: s, part, index, preview, previewReadings, getSyncCreatorProgressGradient,
	line: {
		activeParallelTargetId, currentFullLineChars, currentLineStart, currentLineDirection,
		useCurrentLineTextRun, hasCurrentLineCharacterPronunciation, usePrimaryCharacterPronunciation,
	},
	vocalStyles: { isSyncCreatorDuetSpeaker, getSyncCreatorKindLabel, normalizeSyncCreatorKind },
	actions: { handleContainerMouseDown, selectParallelPart, renderCurrentLineCharacters },
	textEffectsDisabled,
}) {
	const isActive = activeParallelTargetId === part.id;
	const partCharCount = rangesToCharRefs(part.ranges, currentFullLineChars, currentLineStart).length;
	const partDisplayItems = isActive
		? []
		: getSyncCreatorParallelPartDisplayItems(part, currentFullLineChars, currentLineStart);
	const { chars: previewChars, color: partSpeakerTextColor, mutedColor: partMutedColor,
		direction: partDirection, useTextRun: usePartTextRun } = preview;
	const syncedCount = previewChars.length;
	const speakerLabel = part.speaker || SYNC_CREATOR_DEFAULT_SPEAKER;
	const isDuetSpeaker = isSyncCreatorDuetSpeaker(speakerLabel, part['speaker-fallback']);
	const kindLabel = getSyncCreatorKindLabel(part.kind) || part.kind || SYNC_CREATOR_DEFAULT_KIND;
	const activeTextStyle = useCurrentLineTextRun
		? { ...s.rtlLyricsLine, direction: currentLineDirection, paddingLeft: 0, paddingRight: 0 }
		: hasCurrentLineCharacterPronunciation
			? { ...s.parallelStackText, paddingBottom: '16px' }
			: s.parallelStackText;
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
		className: `ivlyrics-sync-stage-part lyrics-karaoke-part lead ${normalizeSyncCreatorKind(part.kind) || SYNC_CREATOR_DEFAULT_KIND}${textEffectsDisabled ? ' text-effects-disabled' : ''}`,
		style: {
			...s.parallelStackLine,
			...(isDuetSpeaker ? s.parallelStackLineDuet : null),
			...(isActive ? s.parallelStackLineActive : null),
			...(isDuetSpeaker && isActive ? s.parallelStackLineDuetActive : null),
			color: partSpeakerTextColor
		},
		onMouseDown: handlePartPointerDown,
		onTouchStart: handlePartPointerDown,
		onClick: () => {
			if (!isActive) selectParallelPart(part.id);
		}
	},
		react.createElement('div', { style: { ...s.parallelStackMeta, ...(isDuetSpeaker ? s.parallelStackMetaDuet : null) } },
			`${index + 1} | ${speakerLabel} | ${kindLabel} | ${partCharCount}`
		),
		isActive
			? react.createElement('div', {
				className: 'lyrics-karaoke-line is-active is-effect-live is-effect-focused',
				style: activeTextStyle
			},
				renderCurrentLineCharacters()
			)
			: react.createElement('div', {
				style: { ...s.parallelStackText, direction: partDirection },
				ref: preview.ref
			}, usePartTextRun ? react.createElement('span', {
				'data-iv-sync-creator-preview-text-run': 'true',
				dir: partDirection,
				style: {
					...s.rtlTextRun,
					...s.parallelStackChar,
					whiteSpace: 'pre-wrap',
					overflowWrap: 'anywhere',
					color: 'transparent',
					backgroundImage: getSyncCreatorProgressGradient(
						partDirection,
						0,
						partSpeakerTextColor,
						partMutedColor
					)
				}
			}, partDisplayItems.map(item => item.text || item.char || '').join('')) : renderPartPreviewGlyphs({
				react, styles: s, part, partDisplayItems, previewReadings, syncedCount, partSpeakerTextColor, usePrimaryCharacterPronunciation,
			}))
	);
}
