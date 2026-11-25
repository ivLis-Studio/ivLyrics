export const renderSyncCreatorPlaybackPanel = ({
	react, i18n, styles: s, lyricsText, durationMs, syncData, globalOffset,
	SyncCreatorPlaybackTime, SyncCreatorPlaybackBar, positionStore, formatTime,
	handleSeek, handleSeekOffset, adjustGlobalOffset,
}) => {
	if (!lyricsText) return null;
	return react.createElement('div', { className: 'sync-creator-transport-section', style: { ...s.panel, ...s.transportPanel } },
		react.createElement('div', { style: s.transportRow },
			react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(-3000) }, '-3s'),
			react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(-1000) }, '-1s'),
			react.createElement(SyncCreatorPlaybackTime, { positionStore, style: s.playbackTime, formatTime }),
			react.createElement(SyncCreatorPlaybackBar, {
				positionStore, durationMs,
				barStyle: s.playbackBar,
				fillStyle: s.playbackFill,
				onClick: handleSeek
			}),
			react.createElement('span', { style: s.playbackTime }, formatTime(durationMs)),
			react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(1000) }, '+1s'),
			react.createElement('button', { style: s.seekBtn, onClick: () => handleSeekOffset(3000) }, '+3s')
		),
		syncData && react.createElement('div', { style: s.offsetCompactRow },
			react.createElement('span', { style: s.offsetLabel }, i18n.t('syncCreator.globalOffset')),
			react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(-100) }, '-100ms'),
			react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(-10) }, '-10ms'),
			react.createElement('span', { style: s.offsetValue }, `${globalOffset >= 0 ? '+' : ''}${globalOffset}ms`),
			react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(10) }, '+10ms'),
			react.createElement('button', { style: s.offsetBtn, onClick: () => adjustGlobalOffset(100) }, '+100ms')
		)
	);
};

export const renderSyncCreatorManualSplitEditor = ({
	react, i18n, styles: s, mode, multiVocalMode, currentFullLineChars, currentLineStart,
	hasManualParallelSplit, hasManualDraftSplit, currentManualSplitPoints, currentManualSplitPointSet,
	isParallelSplitCollapsed, setIsParallelSplitCollapsed, resetCurrentLineManualSplit, toggleManualParallelSplitPoint,
}) => {
	if (mode === 'preview') return null;
	return multiVocalMode && currentFullLineChars.length > 1 && react.createElement('div', { style: s.parallelSplitEditor },
	react.createElement('div', { style: s.parallelSplitHeader },
		react.createElement('span', { style: s.parallelSplitTitle }, i18n.t('syncCreator.manualSplit') || 'Manual split'),
		hasManualParallelSplit && react.createElement('span', { style: s.parallelSplitBadge }, `${currentManualSplitPoints.length + 1} parts`),
		hasManualDraftSplit && react.createElement('button', {
			type: 'button',
			style: s.parallelSplitResetBtn,
			onClick: resetCurrentLineManualSplit
		}, i18n.t('syncCreator.useAutoSplit') || 'Use auto'),
		react.createElement('button', {
			type: 'button',
			style: s.parallelSplitToggleBtn,
			onClick: () => setIsParallelSplitCollapsed(prev => !prev)
		}, isParallelSplitCollapsed ? (i18n.t('update.expand') || 'Expand') : (i18n.t('update.collapse') || 'Collapse'))
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
					title: i18n.t('syncCreator.splitHere') || 'Split here',
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
};
