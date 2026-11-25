import { TOSS_RED } from './syncCreatorStyles.mjs';

const renderGranularitySelector = (react, i18n, s, syncGranularity, handleSyncGranularityChange) => react.createElement('div', {
	className: 'sync-creator-granularity',
	style: s.granularityControl,
	role: 'group',
	'aria-label': i18n.t('syncCreator.syncGranularityLabel') || 'Sync unit',
	title: i18n.t('syncCreator.syncGranularityHint') || 'Choose how precisely timing is recorded'
}, [
	['line', i18n.t('syncCreator.syncGranularityLine') || 'Line'],
	['word', i18n.t('syncCreator.syncGranularityWord') || 'Word'],
	['character', i18n.t('syncCreator.syncGranularityCharacter') || 'Character']
].map(([value, label]) => react.createElement('button', {
	key: value,
	type: 'button',
	style: syncGranularity === value
		? { ...s.granularityButton, ...s.granularityButtonActive }
		: s.granularityButton,
	'aria-pressed': syncGranularity === value,
	onClick: () => handleSyncGranularityChange(value)
}, label)));

export const renderSyncCreatorHeader = ({
	react, i18n, styles: s, syncGranularity, handleSyncGranularityChange, onClose,
	hasUnsubmittedSync, hasPublishedSync, isSubmitting, isReverting, isSourceLoading, lyricsText, syncData,
	handleRevertToPublished, handleSubmit,
}) => {
	const busy = isSubmitting || isReverting || isSourceLoading;
	const canRevert = !busy && Boolean(lyricsText);
	const canSubmit = !busy && Boolean(syncData);
	return react.createElement('div', { className: 'sync-creator-header', style: s.header },
		react.createElement('button', {
			className: 'sync-creator-header-back',
			style: s.backBtn,
			onClick: onClose
		},
			react.createElement('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'currentColor' },
				react.createElement('path', { d: 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z' })
			),
			i18n.t('syncCreator.back') || '닫기'
		),
		renderGranularitySelector(react, i18n, s, syncGranularity, handleSyncGranularityChange),
		(hasUnsubmittedSync || hasPublishedSync) && react.createElement('button', {
			className: 'sync-creator-revert',
			style: {
				...s.loadBtn,
				opacity: canRevert ? 1 : 0.5,
				cursor: canRevert ? 'pointer' : 'not-allowed',
				...(hasUnsubmittedSync && !busy
					? { borderColor: TOSS_RED, color: TOSS_RED }
					: {})
			},
			title: i18n.t('syncCreator.revertDesc') || 'Discard local edits and reload the published sync',
			onClick: handleRevertToPublished,
			disabled: !canRevert
		}, isReverting ? (i18n.t('syncCreator.reverting') || 'Reverting...') : (i18n.t('syncCreator.revert') || 'Revert')),
		react.createElement('button', {
			className: 'sync-creator-submit',
			style: {
				...s.submitBtn,
				background: hasUnsubmittedSync && canSubmit ? TOSS_RED : s.submitBtn.background,
				opacity: canSubmit ? 1 : 0.5,
				cursor: canSubmit ? 'pointer' : 'not-allowed'
			},
			title: hasUnsubmittedSync && canSubmit
				? (i18n.t('syncCreator.unsubmittedChanges') || 'Unsubmitted sync changes — submit to publish them')
				: undefined,
			onClick: handleSubmit,
			disabled: !canSubmit
		}, isSubmitting ? i18n.t('syncCreator.submitting') : i18n.t('syncCreator.submit'))
	);
};
