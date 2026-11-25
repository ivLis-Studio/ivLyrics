import { TOSS_BLUE, TOSS_BORDER } from './syncCreatorStyles.mjs';

export const getSyncCreatorRecordingHint = (syncGranularity, i18n) => syncGranularity === 'line'
	? (i18n.t('syncCreator.lineSyncHint') || 'Tap the line at the moment it starts.')
	: syncGranularity === 'word'
		? (i18n.t('syncCreator.wordSyncHint') || 'Tap or drag in time with each word.')
		: i18n.t('syncCreator.dragHint');

export const renderSyncCreatorProgressPanel = ({
	react, i18n, styles: s, lyricsText, lineCount, completedLines, syncedChars, totalChars,
	mode, currentLineIndex, syncData, isCurrentLineSynced,
	actions: { goToFirstLine, toggleMode, copyAllLyrics, exportSyncData, importSyncData, deleteCurrentLineSync, resetFromStart },
}) => lyricsText && react.createElement('div', { className: 'sync-creator-section sync-creator-progress-section', style: s.panel },
	react.createElement('div', { style: s.panelTitle }, i18n.t('syncCreator.progress') || '진행'),
	react.createElement('div', { style: s.statsGrid },
		react.createElement('div', { style: s.statCard },
			react.createElement('div', { style: s.statValue }, `${completedLines}/${lineCount}`),
			react.createElement('div', { style: s.statLabel }, i18n.t('syncCreator.linesCompleted') || '줄 완료')
		),
		react.createElement('div', { style: { ...s.statCard, borderRight: 'none' } },
			react.createElement('div', { style: s.statValue }, `${syncedChars}/${totalChars}`),
			react.createElement('div', { style: s.statLabel }, i18n.t('syncCreator.chars') || '글자')
		)
	),
	react.createElement('div', { style: s.actionGrid },
		react.createElement('button', { style: s.ctrlBtn, onClick: goToFirstLine, disabled: currentLineIndex <= 0 }, i18n.t('syncCreator.firstLine')),
		react.createElement('button', {
			style: {
				...s.modeBtn,
				background: mode === 'record' ? '#ed4f5d' : TOSS_BLUE,
				color: '#fff',
				boxShadow: 'none'
			},
			onClick: () => toggleMode('record')
		}, mode === 'record' ? i18n.t('syncCreator.stopRecord') : i18n.t('syncCreator.recordMode')),
		react.createElement('button', {
			style: {
				...s.modeBtn,
				background: mode === 'preview' ? TOSS_BLUE : 'transparent',
				color: mode === 'preview' ? '#fff' : 'var(--spice-text)',
				border: mode === 'preview' ? '1px solid transparent' : `1px solid ${TOSS_BORDER}`,
				boxShadow: 'none'
			},
			onClick: () => toggleMode('preview'),
			disabled: !syncData || syncData.lines.length === 0
		}, mode === 'preview' ? i18n.t('syncCreator.stopPreview') : i18n.t('syncCreator.previewMode')),
		react.createElement('button', { style: s.ctrlBtn, onClick: copyAllLyrics, disabled: !lyricsText }, i18n.t('syncCreator.copyLyrics') || '가사 복사'),
		react.createElement('button', { style: s.ctrlBtn, onClick: exportSyncData, disabled: !syncData || !syncData.lines || syncData.lines.length === 0 }, i18n.t('syncCreator.export') || '내보내기'),
		react.createElement('button', { style: s.ctrlBtn, onClick: importSyncData }, i18n.t('syncCreator.import') || '불러오기'),
		isCurrentLineSynced && react.createElement('button', { style: s.deleteBtn, onClick: deleteCurrentLineSync }, i18n.t('syncCreator.deleteLine')),
		react.createElement('button', {
			style: s.deleteBtn,
			onClick: resetFromStart,
			title: i18n.t('syncCreator.resetConfirm') || '현재 작업 중인 싱크 데이터가 모두 삭제됩니다.'
		}, i18n.t('syncCreator.reset'))
	)
);

export const renderSyncCreatorShortcutGuide = ({
	react, i18n, styles: s, lyricsText, syncGranularityRecordingHint, syncCreatorShortcutSettings,
}) => lyricsText && react.createElement('div', { className: 'sync-creator-section sync-creator-shortcut-section', style: s.panel },
	react.createElement('div', { style: s.panelTitle }, i18n.t('syncCreator.shortcutsTitle') || i18n.t('syncCreator.title')),
	react.createElement('div', { style: s.panelSubtitle }, syncGranularityRecordingHint),
	react.createElement('div', { style: { ...s.shortcutsContainer, marginTop: 0, padding: 0, background: 'transparent', border: 'none' } },
		[
			[syncCreatorShortcutSettings.getDisplay('charForward'), i18n.t('syncCreator.shortcuts.charForward') || '한 글자'],
			[syncCreatorShortcutSettings.getDisplay('charBack'), i18n.t('syncCreator.shortcuts.charBack') || '한 글자 취소'],
			[syncCreatorShortcutSettings.getDisplay('wordForward'), i18n.t('syncCreator.shortcuts.wordForward') || '한 단어'],
			[syncCreatorShortcutSettings.getDisplay('wordBack'), i18n.t('syncCreator.shortcuts.wordBack') || '한 단어 취소'],
			[syncCreatorShortcutSettings.getDisplay('syllable'), i18n.t('syncCreator.shortcuts.syllable') || '음절'],
			[syncCreatorShortcutSettings.getDisplay('drag'), i18n.t('syncCreator.shortcuts.drag') || '누르면 드래그'],
			[syncCreatorShortcutSettings.getDisplay('lastCharEnd'), i18n.t('syncCreator.lastCharEnd.markNow') || '지금 끝'],
			[i18n.t('syncCreator.shortcuts.rightClick') || 'Right click', i18n.t('syncCreator.shortcuts.lockToCharacter') || '해당 글자까지 잠금'],
			['↑ / ↓', `${i18n.t('syncCreator.prevLine') || 'Previous Line'} / ${i18n.t('syncCreator.nextLineBtn') || 'Next Line'}`],
			['Enter', i18n.t('syncCreator.shortcuts.finish') || '라인 완료'],
			['Backspace', i18n.t('syncCreator.shortcuts.cancel') || '취소'],
			['Space', i18n.t('syncCreator.shortcuts.playPause') || '재생/일시정지'],
			['Z', i18n.t('syncCreator.shortcuts.seekBack') || '-3초'],
			['X', i18n.t('syncCreator.shortcuts.seekForward') || '+3초']
		].map(([key, desc]) => react.createElement('div', { key: `${key}-${desc}`, style: s.shortcutItem },
			react.createElement('span', { style: s.shortcutKey }, key),
			react.createElement('span', { style: s.shortcutDesc }, desc)
		))
	)
);
