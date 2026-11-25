import { SYNC_CREATOR_CUSTOM_FALLBACK_OPTIONS } from './syncCreatorVocalStyles.mjs';

const renderBulkCustomSpeakerDialog = (react, i18n, s, { open, color, fallback, getPickerColor, onColorChange, onFallbackChange, onClose, onApply }) => open && react.createElement('div', {
	style: s.lrcLibModal,
	role: 'dialog',
	'aria-modal': true,
	onClick: (event) => {
		if (event.target === event.currentTarget) onClose();
	},
	onKeyDown: (event) => {
		if (event.key === 'Escape') onClose();
	}
},
	react.createElement('div', { style: { ...s.lrcLibContent, maxWidth: '440px' } },
		react.createElement('h3', { style: s.lrcLibTitle },
			`${i18n.t('syncCreator.bulkVocalLabel') || 'All vocals'} · CUSTOM`
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
				value: getPickerColor(),
				onChange: (event) => onColorChange(event.target.value),
				'aria-label': i18n.t('syncCreator.speakerCustomColor') || 'Custom speaker color'
			}),
			react.createElement('div', { style: s.customSpeakerColorFields },
				react.createElement('div', { style: s.customSpeakerColorLabel }, i18n.t('syncCreator.speakerCustomColor') || 'Custom speaker color'),
				react.createElement('input', {
					type: 'text',
					style: s.customSpeakerColorText,
					value: color,
					placeholder: '#00ff00',
					maxLength: 7,
					autoFocus: true,
					onFocus: (event) => event.currentTarget.select(),
					onChange: (event) => onColorChange(event.target.value),
					onKeyDown: (event) => {
						if (event.key !== 'Enter') return;
						event.preventDefault();
						onApply();
					}
				}),
				react.createElement('div', { style: s.customSpeakerColorLabel }, i18n.t('syncCreator.speakerCustomFallback') || 'Fallback color group'),
				react.createElement('select', {
					style: { ...s.select, width: '100%' },
					value: fallback,
					onChange: (event) => onFallbackChange(event.target.value)
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
				onClick: onClose
			}, i18n.t('cancel') || 'Cancel'),
			react.createElement('button', {
				type: 'button',
				style: s.lrcLibBtn,
				onClick: onApply
			}, i18n.t('buttons.apply') || 'Apply')
		)
	)
);

const renderCharacterPronunciationConsent = (react, i18n, s, { open, onCancel, onConfirm }) => open && react.createElement('div', {
	style: s.lrcLibModal,
	onClick: (event) => {
		if (event.target === event.currentTarget) onCancel();
	}
},
	react.createElement('div', { style: s.lrcLibContent },
		react.createElement('h3', { style: s.lrcLibTitle },
			i18n.t('syncCreator.characterPronunciationTokenWarningTitle') || 'AI character pronunciation token usage'
		),
		react.createElement('p', { style: s.lrcLibDesc },
			i18n.t('syncCreator.characterPronunciationTokenWarningBody') || 'This feature generates pronunciation aligned to each character for karaoke sync, so it uses more AI tokens than ordinary pronunciation generation.'
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
		}, i18n.t('syncCreator.characterPronunciationTokenWarningUsage') || 'Expected usage: about 3-6x more tokens than a normal line-by-line pronunciation request. Actual usage varies by lyrics length, language, and provider retries.'),
		react.createElement('div', { style: s.lrcLibBtnRow },
			react.createElement('button', {
				style: s.lrcLibBtnCancel,
				onClick: onCancel
			}, i18n.t('syncCreator.characterPronunciationTokenWarningCancel') || i18n.t('cancel') || 'Cancel'),
			react.createElement('button', {
				style: s.lrcLibBtn,
				onClick: onConfirm
			}, i18n.t('syncCreator.characterPronunciationTokenWarningConfirm') || 'I understand and generate')
		)
	)
);

export function renderSyncCreatorDialogs({
	react, i18n, styles: s, pendingMultiVocalDecision, resolveMultiVocalDecision,
	pendingParentheticalLayoutDecision, resolveParentheticalLayoutDecision, bulkSpeaker, pronunciationConsent,
}) {
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
				react.createElement('h3', { style: s.lrcLibTitle }, i18n.t('syncCreator.multiVocalDetectedTitle') || 'Multiple vocals detected'),
				react.createElement('p', { style: s.lrcLibDesc },
					i18n.t('syncCreator.multiVocalDetectedBody') || 'This lyric contains lines with parentheses or separators, so it can be synced as separate vocal parts. Choose how to work on this song.'
				),
				pendingMultiVocalDecision.preview && react.createElement('div', {
					style: s.multiVocalDecisionPreview,
					title: pendingMultiVocalDecision.preview
				}, pendingMultiVocalDecision.preview),
				react.createElement('div', { style: s.lrcLibBtnRow },
					react.createElement('button', {
						style: s.lrcLibBtnCancel,
						onClick: () => resolveMultiVocalDecision(false)
					}, i18n.t('syncCreator.multiVocalDecisionNormal') || 'Continue in normal mode'),
					react.createElement('button', {
						style: s.lrcLibBtn,
						onClick: () => resolveMultiVocalDecision(true)
					}, i18n.t('syncCreator.multiVocalDecisionMulti') || 'Continue in multiple vocal mode')
				)
			)
		),
		pendingParentheticalLayoutDecision && react.createElement('div', { style: s.lrcLibModal },
			react.createElement('div', { style: { ...s.lrcLibContent, maxWidth: '680px' } },
				react.createElement('h3', { style: s.lrcLibTitle }, i18n.t('syncCreator.parentheticalLayoutTitle') || 'Choose parenthetical vocal layout'),
				react.createElement('p', { style: s.lrcLibDesc },
					i18n.t('syncCreator.parentheticalLayoutBody') || 'This line has multiple parenthetical vocal parts. Choose how it should be shown and synced.'
				),
				react.createElement('div', { style: s.parentheticalLayoutOriginal },
					`${i18n.t('syncCreator.parentheticalLayoutOriginal') || 'Original'}: ${pendingParentheticalLayoutDecision.original || ''}`
				),
				react.createElement('div', { style: s.parentheticalLayoutGrid },
					renderParentheticalLayoutChoice(
						'separate',
						i18n.t('syncCreator.parentheticalLayoutSeparateLabel') || 'Separate each part',
						i18n.t('syncCreator.parentheticalLayoutSeparateDesc') || 'Sync each parenthetical vocal as its own vocal line.',
						pendingParentheticalLayoutDecision.separatePreview,
						false
					),
					renderParentheticalLayoutChoice(
						'grouped',
						i18n.t('syncCreator.parentheticalLayoutGroupedLabel') || 'Group on one line',
						i18n.t('syncCreator.parentheticalLayoutGroupedDesc') || 'Sync adjacent parenthetical vocals together as one vocal line.',
						pendingParentheticalLayoutDecision.groupedPreview,
						true
					)
				)
			)
		),
		renderBulkCustomSpeakerDialog(react, i18n, s, bulkSpeaker),
		renderCharacterPronunciationConsent(react, i18n, s, pronunciationConsent),
	);
}
