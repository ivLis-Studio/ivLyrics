import {
	SYNC_CREATOR_SPEAKER_OPTIONS, SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK, SYNC_CREATOR_DEFAULT_KIND,
	SYNC_CREATOR_KIND_OPTIONS, SYNC_CREATOR_BULK_SPEAKER_OPTIONS, SYNC_CREATOR_CUSTOM_FALLBACK_OPTIONS,
} from './syncCreatorVocalStyles.mjs';
import { shouldUseSyncCreatorSelectionEffect, resolveSyncCreatorSelectionSpeaker, formatSyncCreatorSelectedSubtitle } from './selectionTiming.mjs';
import { TOSS_BLUE, TOSS_BLUE_SOFT, TOSS_BLUE_BORDER, TOSS_BORDER } from './syncCreatorStyles.mjs';

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

const getSpeakerTone = (getSyncCreatorSpeakerTextColor, speaker, speakerColor, speakerFallback) => {
	const value = String(speaker || '').toUpperCase();
	const text = getSyncCreatorSpeakerTextColor(value, speakerColor, speakerFallback);
	const colorTone = {
		text,
		dot: text,
		background: getSyncCreatorHexColorWithAlpha(text, 0.12),
		border: getSyncCreatorHexColorWithAlpha(text, 0.34),
		borderActive: getSyncCreatorHexColorWithAlpha(text, 0.78),
	};
	const withActualColor = (fallback) => ({
		...fallback,
		text,
		dot: text,
		background: colorTone.background || fallback.background,
		border: colorTone.border || fallback.border,
		borderActive: colorTone.borderActive || fallback.borderActive,
	});

	if (value.startsWith('NORMAL')) {
		return withActualColor({
			text,
			dot: text,
			background: 'rgba(148, 163, 184, 0.105)',
			border: 'rgba(148, 163, 184, 0.25)',
			borderActive: 'rgba(148, 163, 184, 0.58)',
		});
	}
	if (value.startsWith('FEMALE')) {
		return withActualColor({
			text,
			dot: text,
			background: 'rgba(255, 122, 168, 0.105)',
			border: 'rgba(255, 122, 168, 0.25)',
			borderActive: 'rgba(255, 122, 168, 0.58)',
		});
	}
	if (value.startsWith('DUET')) {
		return withActualColor({
			text,
			dot: text,
			background: 'rgba(180, 147, 255, 0.105)',
			border: 'rgba(180, 147, 255, 0.25)',
			borderActive: 'rgba(180, 147, 255, 0.58)',
		});
	}
	return withActualColor({
		text,
		dot: text,
		background: TOSS_BLUE_SOFT,
		border: TOSS_BLUE_BORDER,
		borderActive: TOSS_BLUE_BORDER,
	});
};

const speakerGroups = ['NORMAL', 'MALE', 'FEMALE', 'DUET', 'CUSTOM'].map(title => ({
	title,
	values: SYNC_CREATOR_SPEAKER_OPTIONS.filter(value => value.startsWith(title)),
}));

const renderSpeakerPicker = ({
	react, styles: s, getSyncCreatorSpeakerTextColor,
	selectedSpeaker, selectedSpeakerColor, selectedSpeakerFallback, onSelect,
}) => {
	return react.createElement('div', { className: 'sync-creator-speaker-groups', style: s.speakerGroups },
		speakerGroups.map(group => react.createElement('div', { className: 'sync-creator-speaker-group', key: group.title },
			react.createElement('div', { className: 'sync-creator-speaker-group-title', style: s.speakerGroupTitle }, group.title),
			react.createElement('div', { className: 'sync-creator-speaker-grid', style: s.speakerGrid },
				group.values.map(value => {
					const isSelected = selectedSpeaker === value;
					const tone = getSpeakerTone(
						getSyncCreatorSpeakerTextColor,
						value,
						isSelected ? selectedSpeakerColor : '',
						isSelected ? selectedSpeakerFallback : SYNC_CREATOR_DEFAULT_CUSTOM_FALLBACK
					);
					return react.createElement('button', {
						key: value,
						type: 'button',
						className: 'sync-creator-speaker-choice',
						'data-speaker': value,
						disabled: false,
						style: {
							...s.speakerChoice,
							...(value === 'CUSTOM' ? { gridColumn: '1 / -1' } : null),
							color: tone.text,
							background: tone.background,
							borderColor: isSelected ? tone.borderActive : tone.border,
							boxShadow: isSelected ? `inset 2px 0 0 ${tone.borderActive}` : 'none'
						},
						onClick: () => onSelect(value)
					},
						react.createElement('span', { className: 'sync-creator-speaker-dot', style: { ...s.speakerDot, background: tone.dot } }),
						value === 'CUSTOM' ? 'CUSTOM' : value.replace(' ', '')
					);
				})
			)
		))
	);
};

export const renderSyncCreatorTextEffectPicker = ({
	react, i18n: I18n, styles: s, currentSpeakerTextColor, currentSpeakerMutedColor, textEffectsDisabled,
	selectedKind, onSelect, compact = false, disabled = false, allowEmpty = false,
}) => {
	const normalizedKind = allowEmpty ? selectedKind : (selectedKind || SYNC_CREATOR_DEFAULT_KIND);
	const renderEffectPreview = (label, value) => react.createElement('span', {
		style: {
			...(compact ? s.effectPillLabel : s.effectLabel),
			color: currentSpeakerTextColor,
			pointerEvents: 'none',
			'--lyrics-color-active': currentSpeakerTextColor,
			'--lyrics-color-inactive': currentSpeakerMutedColor
		},
		className: `ivlyrics-sync-kind-preview lyrics-karaoke-part lead ${value}${textEffectsDisabled ? ' text-effects-disabled' : ''}`,
		'aria-hidden': true
	}, react.createElement('span', {
		className: 'lyrics-karaoke-line is-active is-effect-live is-effect-focused'
	}, Array.from(label).map((char, index) => react.createElement('span', {
		key: `${value}-${index}`,
		className: 'ivlyrics-sync-kind-preview-char lyrics-karaoke-char lyrics-karaoke-char--done',
		style: char === ' ' ? { minWidth: '0.35em' } : null,
		'data-outline-text': char === ' ' ? '' : char
	}, react.createElement('span', {
		className: 'lyrics-karaoke-glyph-fill'
	}, char === ' ' ? '\u00A0' : char)))));

	return react.createElement('div', {
		className: compact ? 'sync-creator-effect-strip' : undefined,
		style: compact ? s.effectStrip : s.effectGrid,
		role: 'group',
		'aria-label': I18n.t('syncCreator.typeLabel') || 'Text effect'
	},
		SYNC_CREATOR_KIND_OPTIONS.map(([value, labelKey]) => {
			const isSelected = normalizedKind === value;
			const label = I18n.t(labelKey) || value;
			return react.createElement('button', {
				key: value,
				type: 'button',
				className: 'ivlyrics-sync-effect-card',
				disabled,
				style: {
					...(compact ? s.effectPill : s.effectCard),
					background: isSelected ? TOSS_BLUE_SOFT : (compact ? s.effectPill.background : s.effectCard.background),
					borderColor: isSelected ? TOSS_BLUE_BORDER : (compact ? TOSS_BORDER : s.effectCard.border),
					boxShadow: isSelected ? `inset 0 -2px 0 ${TOSS_BLUE}` : 'none'
				},
				onMouseDown: (e) => e.preventDefault(),
				onClick: () => onSelect(value),
				'aria-pressed': isSelected,
				'aria-label': label,
				title: label
			}, renderEffectPreview(label, value));
		})
	);
};

const renderBulkSpeakerControl = ({
	react, i18n: I18n, styles: s, lyricsLines, requestSongVocalSpeaker, seedColor, seedFallback,
}) => lyricsLines.length > 0 && react.createElement('label', {
	style: s.bulkVocalPanelRow
},
	react.createElement('span', { style: s.bulkVocalLabel }, I18n.t('syncCreator.bulkVocalLabel') || 'All vocals'),
	react.createElement('select', {
		style: { ...s.select, width: '100%' },
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

export const renderSyncCreatorLineInspector = ({
	react, i18n: I18n, toast: Toast, styles: s, vocalStyles,
	line: { trackId, currentLineStart, activeParallelPart, currentLineMeta, lyricsLines },
	selection: { mode, offsetSelectionRange, currentLineStyleRanges, currentLineCharRefs, currentLineChars },
	customSpeaker: { customSpeakerMetaMemoryRef, bulkCustomSpeakerColor, bulkCustomSpeakerFallback, setBulkCustomSpeakerColor, setBulkCustomSpeakerFallback },
	actions: { canStartOperation, updateCurrentLineStyleRanges, updateCurrentVocalMeta, requestSongVocalSpeaker },
}) => {
	const {
		getSyncCreatorSpeakerTextColor, isSyncCreatorCustomSpeaker, sanitizeSyncCreatorSpeakerFallback,
		normalizeSyncCreatorSpeakerFallback, normalizeSyncCreatorSpeakerColor, sanitizeSyncCreatorSpeakerColor,
		resolveSyncCreatorRememberedCustomSpeakerMeta, resolveSyncCreatorSpeakerTransition,
	} = vocalStyles;
	const hasInspectorSelectionTarget = shouldUseSyncCreatorSelectionEffect({ mode, activeParallelPart, offsetSelectionRange });
	const inspectorSelectionMeta = hasInspectorSelectionTarget
		? resolveSyncCreatorSelectionSpeaker({ styleRanges: currentLineStyleRanges, charRefs: currentLineCharRefs, range: offsetSelectionRange })
		: null;
	const targetSpeaker = hasInspectorSelectionTarget
		? (inspectorSelectionMeta?.speaker || '')
		: (activeParallelPart ? activeParallelPart.speaker : currentLineMeta.speaker);
	const targetSpeakerColor = hasInspectorSelectionTarget
		? (inspectorSelectionMeta?.['speaker-color'] || '')
		: (activeParallelPart ? activeParallelPart['speaker-color'] : currentLineMeta['speaker-color']);
	const targetSpeakerFallbackSource = hasInspectorSelectionTarget
		? inspectorSelectionMeta?.['speaker-fallback']
		: (activeParallelPart ? activeParallelPart['speaker-fallback'] : currentLineMeta['speaker-fallback']);
	const targetSpeakerFallback = sanitizeSyncCreatorSpeakerFallback(
		targetSpeaker,
		targetSpeakerFallbackSource,
		true,
		targetSpeaker
	);
	const updateSpeakerMeta = (patch) => {
		if (hasInspectorSelectionTarget) {
			// Range patches replace speaker metadata atomically. A color-only
			// patch would otherwise be ignored and revert the visible input.
			return updateCurrentLineStyleRanges({
				speaker: targetSpeaker,
				'speaker-color': targetSpeakerColor,
				'speaker-fallback': targetSpeakerFallback,
				...patch
			});
		}
		return updateCurrentVocalMeta(patch);
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
		if (!updateSpeakerMeta({
			speaker: transition.speaker,
			'speaker-color': transition.color,
			'speaker-fallback': transition.fallback,
		})) return;
		customSpeakerMetaMemoryRef.current.set(customSpeakerMemoryKey, transition.remembered);
		if (isSyncCreatorCustomSpeaker(transition.speaker)) {
			setBulkCustomSpeakerColor(transition.color);
			setBulkCustomSpeakerFallback(transition.fallback);
		}
	};
	const updateSpeakerColor = (value) => {
		const color = normalizeSyncCreatorSpeakerColor(value);
		if (!color) return false;
		if (!updateSpeakerMeta({ 'speaker-color': color })) return true;
		customSpeakerMetaMemoryRef.current.set(customSpeakerMemoryKey, {
			color,
			fallback: normalizeSyncCreatorSpeakerFallback(targetSpeakerFallback)
				|| rememberedCustomSpeakerMeta.fallback
		});
		setBulkCustomSpeakerColor(color);
		return true;
	};
	const updateSpeakerFallback = (value) => {
		const fallback = normalizeSyncCreatorSpeakerFallback(value);
		if (!fallback || !updateSpeakerMeta({ 'speaker-fallback': fallback })) return;
		customSpeakerMetaMemoryRef.current.set(customSpeakerMemoryKey, {
			color: normalizeSyncCreatorSpeakerColor(targetSpeakerColor)
				|| rememberedCustomSpeakerMeta.color,
			fallback
		});
		setBulkCustomSpeakerFallback(fallback);
	};
	const inspectorSelectionStart = hasInspectorSelectionTarget ? offsetSelectionRange.start : -1;
	const inspectorSelectionEnd = hasInspectorSelectionTarget ? offsetSelectionRange.end : -1;
	const inspectorSelectedText = hasInspectorSelectionTarget && inspectorSelectionStart >= 0
		? currentLineChars.slice(inspectorSelectionStart, inspectorSelectionEnd + 1).join('')
		: '';
	const inspectorSubtitle = hasInspectorSelectionTarget && inspectorSelectedText
		? formatSyncCreatorSelectedSubtitle({
			selectedText: inspectorSelectedText,
			startLabel: currentLineCharRefs[inspectorSelectionStart]?.localIndex + 1,
			endLabel: currentLineCharRefs[inspectorSelectionEnd]?.localIndex + 1,
			selectedLabel: I18n.t('syncCreator.rangeStyleSelected') || 'Selected'
		})
		: (activeParallelPart ? (activeParallelPart.role || '') : (I18n.t('syncCreator.allLine') || 'Full line'));
	return react.createElement('div', { style: s.sideInspectorGrid },
		react.createElement('div', { style: s.panel },
			react.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 } },
				react.createElement('div', { style: s.panelTitle }, I18n.t('syncCreator.speakerLabel') || 'SPEAKER'),
				react.createElement('button', {
					type: 'button',
					style: { ...s.deleteBtn, flexShrink: 0, opacity: hasInspectorSelectionTarget ? 1 : 0.45 },
					disabled: !hasInspectorSelectionTarget,
					title: I18n.t('syncCreator.rangeStyleClear') || 'Clear style',
					onClick: () => {
						if (updateCurrentLineStyleRanges({ kind: null, speaker: null })) {
							Toast.success(I18n.t('syncCreator.rangeStyleCleared') || 'Style cleared from the selected range.');
						}
					}
				}, I18n.t('syncCreator.rangeStyleClear') || 'Clear style')
			),
			react.createElement('div', { style: s.panelSubtitle }, inspectorSubtitle),
			renderSpeakerPicker({
				react, styles: s, getSyncCreatorSpeakerTextColor,
				selectedSpeaker: targetSpeaker, selectedSpeakerColor: targetSpeakerColor,
				selectedSpeakerFallback: targetSpeakerFallback, onSelect: updateSpeaker,
			}),
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
							if (!canStartOperation()) return;
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
				react, i18n: I18n, styles: s, lyricsLines, requestSongVocalSpeaker,
				seedColor: isSyncCreatorCustomSpeaker(targetSpeaker) ? targetSpeakerColor : rememberedCustomSpeakerMeta.color,
				seedFallback: isSyncCreatorCustomSpeaker(targetSpeaker) ? targetSpeakerFallback : rememberedCustomSpeakerMeta.fallback
			})
		)
	);
};
