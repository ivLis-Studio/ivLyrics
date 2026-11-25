import { TOSS_BORDER } from './syncCreatorStyles.mjs';
import { roundSyncCreatorTime } from './timingGranularity.mjs';

const renderLastCharEndControls = (react, I18n, s, { info, setCurrentLastCharEnd, getPlaybackTime }) => {
	const styleFor = (disabled) => disabled ? { ...s.lineOffsetBtn, opacity: 0.45, cursor: 'not-allowed' } : s.lineOffsetBtn;
	const hasValue = Boolean(info) && info.value !== null;
	const valueLabel = !info
		? (I18n.t('syncCreator.lineOffsetUnavailable') || '싱크 후 조정 가능')
		: hasValue
			? `${info.lastTime.toFixed(2)}s → ${info.value.toFixed(2)}s`
			: I18n.t('syncCreator.lastCharEnd.auto');
	const nudge = (deltaSec) => info && setCurrentLastCharEnd(roundSyncCreatorTime((hasValue ? info.value : info.lastTime) + deltaSec));
	const button = (key, label, disabled, onClick) => react.createElement('button', {
		key, type: 'button', style: styleFor(disabled), disabled, onClick
	}, label);
	return react.createElement('div', {
		style: { ...s.lineOffsetBox, marginTop: 0, borderTop: `1px solid ${TOSS_BORDER}` },
		title: I18n.t('syncCreator.lastCharEnd.hint')
	},
		react.createElement('div', { style: s.lineOffsetHeader },
			react.createElement('span', { style: s.lineOffsetLabel }, I18n.t('syncCreator.lastCharEnd.title')),
			react.createElement('span', { style: s.lineOffsetValue }, valueLabel)
		),
		react.createElement('div', { style: s.lineOffsetButtonRow },
			button('now', I18n.t('syncCreator.lastCharEnd.markNow'), !info, () => setCurrentLastCharEnd(getPlaybackTime())),
			button('earlier', '-100ms', !hasValue, () => nudge(-0.1)),
			button('later', '+100ms', !info, () => nudge(0.1)),
			button('clear', I18n.t('syncCreator.lastCharEnd.clear'), !hasValue, () => setCurrentLastCharEnd(null))
		)
	);
};

const renderLineOffsetControls = (react, I18n, s, { hasCurrentLineTiming, currentLineTimingLabel, adjustCurrentLineOffset }) => {
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

export const renderSyncCreatorCurrentLineTools = ({
	react, i18n: I18n, styles: s, hasLyrics,
	lineOffset, lastCharEnd,
	lineLayout: { canSplitIntoMultipleVocals, enableManualMultiVocalMode, canMergeCurrentLineWithNext, mergeCurrentLineWithNext },
}) => hasLyrics && react.createElement('div', { className: 'sync-creator-section sync-creator-current-line-section', style: s.panel },
	react.createElement('div', { style: s.panelTitle }, I18n.t('syncCreator.currentLine') || '현재 가사'),
	renderLineOffsetControls(react, I18n, s, lineOffset),
	renderLastCharEndControls(react, I18n, s, lastCharEnd),
	react.createElement('div', { style: s.rightActionRow },
		canSplitIntoMultipleVocals && react.createElement('button', {
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
