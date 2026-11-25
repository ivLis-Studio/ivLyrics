import { getSyncCreatorTextLayout } from './syncCreatorLyricText.mjs';
import { resolveSyncCreatorSelectionEffectKind, shouldUseSyncCreatorSelectionEffect } from './selectionTiming.mjs';
import { renderSyncCreatorTextEffectPicker } from './syncCreatorStyleControls.mjs';

export function renderSyncCreatorStagePanel({
	react, i18n: I18n, styles: s,
	line: {
		lyricsText, lyricsLines, currentLineIndex, isCurrentLineSynced, currentLineDirection,
		useCurrentLineTextRun, currentParallelParts, hasCurrentParallelParts, currentTextEffectKind,
	},
	status: { isLoading, error, mode, multiVocalMode, showLivePreview, syncGranularityRecordingHint },
	selection: { activeParallelPart, offsetSelectionRange, currentLineStyleRanges, currentLineCharRefs },
	visuals: { currentSpeakerTextColor, currentSpeakerMutedColor, textEffectsDisabled },
	navigation: { previousNavigableLineIndex, nextNavigableLineIndex, goToPrevLine, goToNextLine },
	lyricsScrollRef,
	actions: {
		handleContainerMouseDown, updateCurrentTextEffect, getSyncCreatorFuriganaReact,
		renderManualSplitEditor, renderLivePreviewOverlay, renderParallelPartLine, renderCurrentLineCharacters,
	},
}) {
	const hasStyleSelection = shouldUseSyncCreatorSelectionEffect({ mode, activeParallelPart, offsetSelectionRange });
	return react.createElement('div', { className: 'sync-creator-stage', style: { ...s.panel, ...s.stagePanel } },
		isLoading && react.createElement('div', { style: s.loading }, I18n.t('syncCreator.loadingLyrics')),
		error && react.createElement('div', { style: { ...s.error, display: 'flex', flexDirection: 'column', alignItems: 'center' } },
			react.createElement('div', null, error)
		),
		!isLoading && !error && !lyricsText && react.createElement('div', { style: s.loading }, I18n.t('syncCreator.loadLyrics')),
		lyricsText && lyricsLines.length > 0 && react.createElement('div', { style: s.stageBody },
			react.createElement('div', { style: s.lineNav },
				react.createElement('button', { style: { ...s.navBtn, opacity: previousNavigableLineIndex < 0 ? 0.3 : 1 }, onClick: goToPrevLine, disabled: previousNavigableLineIndex < 0 }, '‹'),
				react.createElement('div', { style: s.lineInfo },
					react.createElement('div', { style: s.lineCount }, `${currentLineIndex + 1} / ${lyricsLines.length}`),
					react.createElement('div', { style: s.lineStatus }, isCurrentLineSynced ? '✓ ' + I18n.t('syncCreator.synced') : I18n.t('syncCreator.notSynced'))
				),
				react.createElement('button', { style: { ...s.navBtn, opacity: nextNavigableLineIndex < 0 ? 0.3 : 1 }, onClick: goToNextLine, disabled: nextNavigableLineIndex < 0 }, '›')
			),

			showLivePreview && renderLivePreviewOverlay(),
			multiVocalMode && react.createElement('div', { style: s.multiVocalBanner },
				hasCurrentParallelParts
					? (I18n.t('syncCreator.multiVocalBannerParts') || 'Multiple vocal mode: sync each vocal part separately.')
					: (I18n.t('syncCreator.multiVocalBannerLine') || 'Multiple vocal mode: choose SPEAKER and text effect for this line.')
			),
			renderManualSplitEditor(),
			react.createElement('div', {
				className: `sync-creator-stage-lyrics${hasCurrentParallelParts ? ' is-parallel' : ''}`,
				style: hasCurrentParallelParts
					? { ...s.lyricsBox, ...s.stageLyricsBox, ...s.lyricsBoxParallelScrollable }
					: { ...s.lyricsBox, ...s.stageLyricsBox },
				onMouseDown: hasCurrentParallelParts ? undefined : handleContainerMouseDown,
				onTouchStart: hasCurrentParallelParts ? undefined : handleContainerMouseDown,
				ref: lyricsScrollRef
			},
				hasCurrentParallelParts
					? react.createElement('div', { style: s.parallelStack }, currentParallelParts.map((part, index) => renderParallelPartLine(part, index)))
					: react.createElement('div', {
						className: `ivlyrics-sync-stage-effect-preview lyrics-karaoke-part lead ${currentTextEffectKind}${textEffectsDisabled ? ' text-effects-disabled' : ''}`,
						style: s.stageEffectPreview
					}, react.createElement('div', {
						className: 'lyrics-karaoke-line is-active is-effect-live is-effect-focused',
						style: useCurrentLineTextRun ? { ...s.rtlLyricsLine, direction: currentLineDirection } : s.lyricsLine
					}, renderCurrentLineCharacters()))
			),
			nextNavigableLineIndex >= 0 && react.createElement('div', { style: s.nextLineBox },
				react.createElement('div', { style: s.nextLineLabel }, I18n.t('syncCreator.nextLine')),
				react.createElement('div', {
					style: {
						...s.nextLineText,
						direction: getSyncCreatorTextLayout(lyricsLines[nextNavigableLineIndex]).direction,
						unicodeBidi: 'plaintext'
					}
				}, getSyncCreatorFuriganaReact(lyricsLines[nextNavigableLineIndex]))
			),
			mode === 'record' && react.createElement('div', { style: s.hint }, syncGranularityRecordingHint),
			react.createElement('div', { style: s.effectStripRow },
				react.createElement('span', { style: s.effectStripTitle }, I18n.t('syncCreator.typeLabel') || 'Text effect'),
				renderSyncCreatorTextEffectPicker({
					react, i18n: I18n, styles: s, currentSpeakerTextColor, currentSpeakerMutedColor, textEffectsDisabled,
					selectedKind: hasStyleSelection
						? resolveSyncCreatorSelectionEffectKind({ styleRanges: currentLineStyleRanges, charRefs: currentLineCharRefs, range: offsetSelectionRange })
						: currentTextEffectKind,
					onSelect: updateCurrentTextEffect,
					compact: true,
					allowEmpty: hasStyleSelection,
				})
			),
		)
	);
}
