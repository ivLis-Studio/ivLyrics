import { SYNC_CREATOR_SOURCE_ADDON_ID } from './lrclibSyncSource.mjs';
import { getSyncCreatorLrclibCandidateId } from './syncCreatorLrclibControls.mjs';
import { TOSS_BLUE, TOSS_BLUE_SOFT } from './syncCreatorStyles.mjs';

const renderPronunciationNotation = (react, i18n, s, {
	characterPronunciationTargetMode, handleCharacterPronunciationTargetModeChange, isGeneratingCharacterPronunciations,
}) => react.createElement('label', {
	style: s.characterPronunciationTarget,
	title: i18n.t('syncCreator.characterPronunciationTargetDesc') || 'Choose the writing system used for generated pronunciation.'
},
	react.createElement('span', { style: s.characterPronunciationTargetLabel },
		i18n.t('syncCreator.characterPronunciationTarget') || 'Pronunciation notation'
	),
	react.createElement('select', {
		style: { ...s.select, width: '100%' },
		value: characterPronunciationTargetMode,
		onChange: (event) => handleCharacterPronunciationTargetModeChange(event.target.value),
		disabled: isGeneratingCharacterPronunciations,
		'aria-label': i18n.t('syncCreator.characterPronunciationTarget') || 'Pronunciation notation'
	},
		react.createElement('option', { value: 'latin' }, i18n.t('syncCreator.characterPronunciationTargetLatin') || 'Latin (Romanization)'),
		react.createElement('option', { value: 'translation' }, i18n.t('syncCreator.characterPronunciationTargetTranslation') || 'Translation language')
	)
);

export const renderSyncCreatorSourcePanel = ({
	react, i18n, styles: s,
	track: { albumArt, trackName, artistName, isVirtualKaraokeSource },
	source: { addonId, isLoading, loadLyrics, lrclibIdInput, onLrclibIdChange, isLoadingLrclibId, loadLrclibById },
	hasLyrics,
	pronunciation: {
		characterPronunciations, characterPronunciationProgressInfo, characterPronunciationTargetMode,
		isGeneratingCharacterPronunciations, isCharacterPronunciationPrimary, showCharacterPronunciations,
		handleCharacterPronunciationTargetModeChange, handleCharacterPronunciationToggle, setIsCharacterPronunciationPrimary,
	},
}) => react.createElement('div', { className: 'sync-creator-section sync-creator-source-section', style: s.panel },
	react.createElement('div', { style: s.panelTitle }, 'Source'),
	react.createElement('div', { style: s.sourceTrack },
		albumArt && react.createElement('img', { src: albumArt, style: s.sourceAlbumArt, alt: trackName }),
		react.createElement('div', { style: s.trackMeta },
			react.createElement('div', { style: s.trackName }, trackName),
			react.createElement('div', { style: s.artistName }, artistName)
		)
	),
	react.createElement('div', { style: s.sourceControls },
		react.createElement('div', { style: s.sourceProvider },
			react.createElement('span', { style: s.sourceProviderName }, 'LRCLIB')
		),
		react.createElement('div', { style: s.sourceButtonRow },
			react.createElement('button', {
				style: { ...s.loadBtn, ...s.fullWidthButton, opacity: isLoading ? 0.5 : 1 },
				onClick: loadLyrics,
				disabled: isLoading
			}, isLoading ? i18n.t('syncCreator.loading') : i18n.t('syncCreator.reload') || '다시 로드')
		),
		addonId === SYNC_CREATOR_SOURCE_ADDON_ID && react.createElement('div', { style: s.lrclibIdBox },
			react.createElement('div', { style: s.lrclibIdLabel }, i18n.t('syncCreator.lrclibIdLabel') || 'LRCLIB ID'),
			react.createElement('div', { style: s.lrclibIdRow },
				react.createElement('input', {
					type: 'text',
					inputMode: 'numeric',
					style: s.lrclibIdInput,
					value: lrclibIdInput,
					placeholder: i18n.t('syncCreator.lrclibIdPlaceholder') || 'e.g. 5206921',
					onChange: event => onLrclibIdChange(event.target.value),
					onKeyDown: (e) => {
						if (e.key === 'Enter' && !e.nativeEvent?.isComposing && e.keyCode !== 229) loadLrclibById();
					},
					disabled: isLoadingLrclibId
				}),
				react.createElement('button', {
					type: 'button',
					style: { ...s.loadBtn, whiteSpace: 'nowrap', opacity: isLoadingLrclibId ? 0.6 : 1 },
					onClick: () => loadLrclibById(),
					disabled: isLoadingLrclibId
				}, isLoadingLrclibId
					? (i18n.t('syncCreator.lrclibIdLoading') || 'Loading...')
					: (i18n.t('syncCreator.lrclibIdLoad') || 'Load by ID'))
			)
		),
		hasLyrics && renderPronunciationNotation(react, i18n, s, {
			characterPronunciationTargetMode, handleCharacterPronunciationTargetModeChange, isGeneratingCharacterPronunciations,
		}),
		hasLyrics && react.createElement('button', {
			style: {
				...s.secondaryBtn,
				...s.fullWidthButton,
				opacity: isGeneratingCharacterPronunciations ? 0.6 : 1,
				background: showCharacterPronunciations ? TOSS_BLUE_SOFT : s.secondaryBtn.background,
				color: showCharacterPronunciations ? TOSS_BLUE : s.secondaryBtn.color
			},
			onClick: handleCharacterPronunciationToggle,
			disabled: isGeneratingCharacterPronunciations,
			title: i18n.t('syncCreator.characterPronunciationDesc') || 'Generate character-aligned pronunciation with AI and show it below the current line.'
		}, isGeneratingCharacterPronunciations
			? (characterPronunciationProgressInfo?.buttonLabel || i18n.t('syncCreator.characterPronunciationGenerating') || 'AI 발음 생성 중...')
			: characterPronunciations
				? (showCharacterPronunciations
					? (i18n.t('syncCreator.characterPronunciationHide') || '발음 숨기기')
					: (i18n.t('syncCreator.characterPronunciationShow') || '발음 표시'))
				: (i18n.t('syncCreator.characterPronunciationGenerate') || 'AI 글자 발음')
		),
		characterPronunciations && react.createElement('button', {
			style: { ...s.secondaryBtn, ...s.fullWidthButton },
			onClick: () => handleCharacterPronunciationToggle({ forceRegenerate: true }),
			disabled: isGeneratingCharacterPronunciations,
			title: i18n.t('syncCreator.characterPronunciationRegenerateDesc') || 'Ignore the saved result and generate pronunciation again.'
		}, i18n.t('syncCreator.characterPronunciationRegenerate') || 'Regenerate Pronunciation'),
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
				background: isCharacterPronunciationPrimary ? TOSS_BLUE_SOFT : s.secondaryBtn.background,
				color: isCharacterPronunciationPrimary ? TOSS_BLUE : s.secondaryBtn.color
			},
			onClick: () => setIsCharacterPronunciationPrimary(value => !value),
			title: i18n.t('syncCreator.characterPronunciationPrimaryDesc') || '생성된 발음을 크게, 원어 가사를 작게 표시합니다.'
		}, i18n.t('syncCreator.characterPronunciationPrimary') || '발음 크게'),
		isVirtualKaraokeSource && react.createElement('span', { style: s.virtualKaraokeBadge }, i18n.t('syncCreator.virtualKaraoke') || '가상 노래방 데이터')
	)
);

const renderLrclibSearchControls = (react, i18n, s, {
	lrclibSearchQuery, onLrclibSearchQueryChange, isSearchingLrclib, searchLrclibByQuery,
}) => react.createElement('div', { style: s.lrclibSearchBox },
	react.createElement('div', { style: s.lrclibIdLabel }, i18n.t('syncCreator.lrclibSearchQueryLabel') || 'LRCLIB Search'),
	react.createElement('div', { style: s.lrclibSearchRow },
		react.createElement('input', {
			type: 'text',
			style: s.lrclibIdInput,
			value: lrclibSearchQuery,
			placeholder: i18n.t('syncCreator.lrclibSearchQueryPlaceholder') || 'Song title or artist',
			onChange: event => onLrclibSearchQueryChange(event.target.value),
			onKeyDown: (e) => {
				if (e.key === 'Enter' && !e.nativeEvent?.isComposing && e.keyCode !== 229) searchLrclibByQuery();
			},
			disabled: isSearchingLrclib
		}),
		react.createElement('button', {
			type: 'button',
			style: { ...s.loadBtn, whiteSpace: 'nowrap', opacity: isSearchingLrclib ? 0.6 : 1 },
			onClick: searchLrclibByQuery,
			disabled: isSearchingLrclib
		}, isSearchingLrclib
			? (i18n.t('syncCreator.lrclibSearchLoading') || 'Searching...')
			: (i18n.t('syncCreator.lrclibSearchButton') || 'Search'))
	)
);

export const renderSyncCreatorLrclibCandidates = ({
	react, i18n, styles: s, formatSeconds, trackName, artistName,
	source: { addonId, isLoading },
	search,
	candidates: {
		lrclibSearchMeta, lrclibCandidates, showLrclibCandidates, selectedLrclibCandidateKey, previewLrclibCandidate,
		setShowLrclibCandidates, setPreviewLrclibCandidateKey, applySelectedLrclibCandidate, copyLrclibCandidateId,
	},
}) => addonId === SYNC_CREATOR_SOURCE_ADDON_ID && react.createElement('div', {
	className: 'sync-creator-candidate-section',
	style: { ...s.candidatePanel, padding: '14px 18px', borderRadius: 0 }
},
	react.createElement('div', { style: s.candidatePanelHeader },
		react.createElement('div', { style: s.candidatePanelTitle },
			`${i18n.t('syncCreator.lrclibSearchResults') || 'LRCLIB Search Results'} ${(lrclibSearchMeta?.totalResults || lrclibCandidates.length || 0) > 0 ? `(${lrclibSearchMeta?.totalResults || lrclibCandidates.length})` : ''}`
		),
		react.createElement('button', {
			type: 'button',
			style: s.secondaryBtn,
			onClick: () => setShowLrclibCandidates(prev => !prev)
		}, showLrclibCandidates
			? (i18n.t('syncCreator.hideLrclibSearchResults') || 'Hide Search Results')
			: (i18n.t('syncCreator.showLrclibSearchResults') || 'Show Search Results'))
	),
	showLrclibCandidates && renderLrclibSearchControls(react, i18n, s, search),
	showLrclibCandidates && react.createElement('div', { style: s.candidateList },
		isLoading && lrclibCandidates.length === 0 && react.createElement('div', { style: s.candidateEmpty }, i18n.t('syncCreator.loadingLyrics') || 'Loading lyrics...'),
		!isLoading && lrclibCandidates.length === 0 && react.createElement('div', { style: s.candidateEmpty }, lrclibSearchMeta?.error || (i18n.t('syncCreator.lrclibNoCandidates') || 'No LRCLIB candidates found')),
		lrclibCandidates.map((candidate, index) => {
			const isPreviewing = previewLrclibCandidate?.candidateKey === candidate.candidateKey;
			const isApplied = selectedLrclibCandidateKey === candidate.candidateKey;
			const candidateId = getSyncCreatorLrclibCandidateId(candidate);
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
						title: `${i18n.t('syncCreator.lrclibIdLabel') || 'LRCLIB ID'}: ${candidateId}`,
						onClick: (event) => copyLrclibCandidateId(candidateId, event)
					}, `ID ${candidateId}`)
				),
				react.createElement('div', { style: s.candidateSubtitle }, `${candidate.artistName || artistName} · ${formatSeconds(Number(candidate.duration || 0))}`),
				react.createElement('div', { style: s.candidateMetaRow },
					candidate.syncLineExactMatch && react.createElement('span', { style: { ...s.candidateBadge, color: TOSS_BLUE } }, i18n.t('syncCreator.lrclibBadgeExact') || 'Exact'),
					candidate.hasSyncedLyrics && react.createElement('span', { style: s.candidateBadge }, i18n.t('syncCreator.lrclibBadgeSynced') || 'Synced'),
					candidate.hasPlainLyrics && react.createElement('span', { style: s.candidateBadge }, i18n.t('syncCreator.lrclibBadgePlain') || 'Plain'),
					candidate.searchSource === 'primary' && react.createElement('span', { style: s.candidateBadge }, i18n.t('syncCreator.lrclibBadgePrimary') || 'Primary'),
					candidate.searchSource === 'english' && react.createElement('span', { style: s.candidateBadge }, i18n.t('syncCreator.lrclibBadgeEnglish') || 'English'),
					isApplied && react.createElement('span', { style: { ...s.candidateBadge, color: TOSS_BLUE } }, i18n.t('syncCreator.lrclibLoaded') || 'Loaded')
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
						getSyncCreatorLrclibCandidateId(previewLrclibCandidate) && react.createElement('button', {
							type: 'button',
							style: s.candidateIdButton,
							title: `${i18n.t('syncCreator.lrclibIdLabel') || 'LRCLIB ID'}: ${getSyncCreatorLrclibCandidateId(previewLrclibCandidate)}`,
							onClick: (event) => copyLrclibCandidateId(previewLrclibCandidate, event)
						}, `ID ${getSyncCreatorLrclibCandidateId(previewLrclibCandidate)}`),
						react.createElement('button', {
							type: 'button',
							style: { ...s.secondaryBtn, opacity: selectedLrclibCandidateKey === previewLrclibCandidate.candidateKey ? 0.7 : 1 },
							onClick: () => applySelectedLrclibCandidate(previewLrclibCandidate.candidateKey),
							disabled: isLoading
						}, selectedLrclibCandidateKey === previewLrclibCandidate.candidateKey
							? (i18n.t('syncCreator.lrclibLoaded') || 'Loaded')
							: (i18n.t('syncCreator.lrclibApplyCandidate') || 'Load This Lyrics'))
					)
				),
				react.createElement('div', { style: s.candidateMetaRow },
					react.createElement('span', { style: s.candidateBadge }, `${i18n.t('syncCreator.lrclibMetricArtist') || 'artist'} ${Number(previewLrclibCandidate.artistScore || 0).toFixed(3)}`),
					react.createElement('span', { style: s.candidateBadge }, `${i18n.t('syncCreator.lrclibMetricTitle') || 'title'} ${Number(previewLrclibCandidate.titleScore || 0).toFixed(3)}`),
					react.createElement('span', { style: s.candidateBadge }, `${i18n.t('syncCreator.lrclibMetricDiff') || 'diff'} ${formatSeconds(Number(previewLrclibCandidate.durationDiff || 0))}`),
					previewLrclibCandidate.preferredLyricsSource === 'synced' && react.createElement('span', { style: s.candidateBadge }, i18n.t('syncCreator.lrclibBadgeSynced') || 'Synced'),
					previewLrclibCandidate.preferredLyricsSource === 'plain' && react.createElement('span', { style: s.candidateBadge }, i18n.t('syncCreator.lrclibBadgePlain') || 'Plain')
				),
				react.createElement('pre', { style: s.candidatePreviewText }, previewLrclibCandidate.previewText || '')
			)
			: react.createElement('div', { style: s.candidateEmpty }, i18n.t('syncCreator.lrclibSelectCandidate') || 'Select a candidate')
	)
);
