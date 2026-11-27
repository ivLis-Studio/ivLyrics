import { getLyricsTypographyStyleVariables } from "#ivlyrics/lyrics/lyricsTypography.mjs";
import { getSyncCreatorPlaybackLineIndex } from "./syncCreatorPlaybackTimeline.mjs";
import { sanitizeSyncCreatorLastCharEnds } from "./timingValidation.mjs";
import { buildSyncCreatorPreviewLines } from "./syncCreatorPreviewLines.mjs";
import { getCachedPreviewCharReadings, getSyncCreatorPreviewFuriganaMap } from "./syncCreatorPreviewReadings.mjs";

// The sync creator hides the lyric page behind the editor and pins these to
// neutral values on the page container (index.js). Copying them into the
// preview would disable the karaoke glow and flatten the lyric colours the
// preview exists to show, so the preview keeps the shared typography
// contract's and CONFIG's values instead.
const SYNC_CREATOR_PREVIEW_CONTAINER_VAR_EXCLUSIONS = new Set([
	'--lyrics-text-shadow',
	'--lyrics-shadow-enabled',
	'--lyrics-text-drop-shadow',
	'--lyrics-color-active',
	'--lyrics-color-inactive',
	'--lyrics-original-opacity',
	'--lyrics-translation-opacity',
	'--lyrics-phonetic-opacity'
]);

// One karaoke row per voice of a multi-vocal preview line. The karaoke
// renderer keeps its per-line preparation (timed glyphs, furigana, glyph
// element cache, live paint data) only while it receives the same line
// object, and the preview clock renders about every 16 ms. Each row is built
// once per preview line and voice instead of once per frame. Edited timing,
// text, voices or source build new preview lines with new part objects, and
// visual settings reach the renderer through its settings revision.
const previewVocalRowLines = new WeakMap();
export function getSyncCreatorPreviewVocalRowLine(sourceLine, part) {
	const cached = previewVocalRowLines.get(part);
	if (cached?.sourceLine === sourceLine) return cached.line;
	const line = {
		...sourceLine,
		interludeInfo: undefined,
		text: part.text,
		originalText: part.text,
		syllables: part.syllables,
		vocals: undefined,
		speaker: part.speaker,
		'speaker-color': part['speaker-color'] || '',
		'speaker-fallback': part['speaker-fallback'] || '',
		kind: part.kind || sourceLine.kind
	};
	previewVocalRowLines.set(part, { sourceLine, line });
	return line;
}

export function getSyncCreatorPreviewVariables({
	visualConfig,
	getLyricsContainer,
	readComputedStyle,
	editorGlyphSize = 32,
}) {
	// The renderer and the editor use the same font, ruby, shadow and outline values.
	const typographyVars = getLyricsTypographyStyleVariables(visualConfig);
	const vars = {
		...typographyVars,
		'--lyrics-color-active': visualConfig['active-color'] || 'var(--spice-text, #ffffff)',
		'--lyrics-color-inactive': visualConfig['inactive-color'] || 'var(--spice-subtext, rgba(255, 255, 255, 0.58))'
	};
	try {
		const container = getLyricsContainer();
		if (container) {
			const computed = readComputedStyle(container);
			for (const key of Object.keys(vars)) {
				if (SYNC_CREATOR_PREVIEW_CONTAINER_VAR_EXCLUSIONS.has(key)) continue;
				const liveValue = computed.getPropertyValue(key)?.trim();
				if (liveValue) vars[key] = liveValue;
			}
		}
	} catch (error) {
		void error;
	}
	// Preview pin (the container override above would otherwise restore
	// the outside value): glyph size follows the editor box. Per-glyph
	// readings carry their own fixed styling, so no phonetic pin needed.
	vars['--lyrics-original-font-size'] = `${editorGlyphSize}px`;
	return vars;
}

export function useSyncCreatorLivePreview({
	react,
	mode,
	setMode,
	syncData,
	lyricsLines,
	lineCharOffsets,
	getMergedLineIndexesForStart,
	materializeSyncCreatorParallelDrafts,
	lineMetadata,
	playbackTimeline,
	currentLineIndex,
	positionStore,
	SyncCreatorLivePreviewClock,
	getLiveClock,
	currentLineChars,
	currentParallelPartReadingMaps,
	currentLineCharacterPronunciationMap,
	currentLineRenderedPronunciationUnits,
	showCharacterPronunciations,
	getSyncCreatorFuriganaMap,
	furiganaRevision,
	getRenderer,
	getVisualSettings,
	isFuriganaReady,
	getDocument,
	readComputedStyle,
	translate,
	glyphFontSize,
	borderColor,
}) {
	const { useEffect, useMemo, useRef } = react;
	// Karaoke preview below the line counter. Linked to the existing preview
	// transport mode: visible exactly while mode === 'preview'.
	const showLivePreview = mode === 'preview';
	const livePreviewSyncBody = useMemo(() => {
		if (!showLivePreview) return null;
		try {
			const source = syncData && Array.isArray(syncData.lines) ? syncData : null;
			if (!source) return null;
			return typeof materializeSyncCreatorParallelDrafts === 'function'
				? sanitizeSyncCreatorLastCharEnds(materializeSyncCreatorParallelDrafts(source, { preview: true }))
				: source;
		} catch (error) {
			return syncData;
		}
	}, [showLivePreview, syncData, materializeSyncCreatorParallelDrafts]);
	const livePreviewKaraokeLines = useMemo(() => showLivePreview ? buildSyncCreatorPreviewLines({
		lyricsLines,
		lineCharOffsets,
		syncBody: livePreviewSyncBody,
		getMergedLineIndexesForStart,
		...lineMetadata,
	}) : [], [showLivePreview, lyricsLines, lineCharOffsets, livePreviewSyncBody, getMergedLineIndexesForStart]);
	const firstPreviewLineStart = useMemo(() => {
		for (const line of livePreviewKaraokeLines) {
			const start = Number(line?.startTime);
			if (Number.isFinite(start)) return start;
		}
		return null;
	}, [livePreviewKaraokeLines]);
	const currentLyricText = useMemo(() => currentLineChars.join(''), [currentLineChars]);
	useEffect(() => {
		if (!showLivePreview) return undefined;
		const handlePreviewEscape = (event) => {
			if (event?.key === 'Escape' || event?.key === 'Esc') setMode('idle');
		};
		const document = getDocument();
		document.addEventListener('keydown', handlePreviewEscape, true);
		return () => document.removeEventListener('keydown', handlePreviewEscape, true);
	}, [showLivePreview]);
	const previewFuriganaCacheRef = useRef({ maps: new Map() });
	const editorGlyphSize = Number.parseInt(glyphFontSize, 10) || 32;
	const previewSettingsRevisionRef = useRef(0);
	const previewSettingsSignatureRef = useRef('');
	const previewVisualSignature = showLivePreview
		? JSON.stringify(getVisualSettings())
		: '';
	if (previewSettingsSignatureRef.current !== previewVisualSignature) {
		previewSettingsSignatureRef.current = previewVisualSignature;
		previewSettingsRevisionRef.current += 1;
	}
	// Same revision the page renderer receives: cache invalidation follows the
	// visual settings instead of a frozen 0.
	const previewSettingsRevision = previewSettingsRevisionRef.current;
	const livePreviewLyricVars = useMemo(() => showLivePreview ? getSyncCreatorPreviewVariables({
		visualConfig: getVisualSettings(),
		getLyricsContainer: () => getDocument().querySelector('.lyrics-lyricsContainer-LyricsContainer'),
		readComputedStyle,
		editorGlyphSize,
	}) : null, [showLivePreview, previewVisualSignature]);
	// Error boundary so a failing karaoke preview can never crash the editor.
	// Remounted via key whenever the previewed line or its timing changes.
	const SyncCreatorPreviewBoundary = useMemo(() => (
		class extends react.Component {
			constructor(props) {
				super(props);
				this.state = { error: null };
			}
			static getDerivedStateFromError(error) {
				return { error };
			}
			componentDidCatch(error) {
				try {
					console.warn('[SyncDataCreator] Karaoke preview render failed:', error);
				} catch (loggingError) {
					void loggingError;
				}
			}
			render() {
				if (this.state.error) {
					return react.createElement('div', {
						style: { fontSize: '12px', color: 'var(--spice-subtext)', padding: '8px 4px' }
					}, translate('syncCreator.previewUnavailable') || 'Karaoke preview unavailable for this line.');
				}
				return this.props.children;
			}
		}
	), []);
	const renderLivePreviewOverlay = () => (showLivePreview
		? react.createElement(SyncCreatorLivePreviewClock, {
			fallbackPosition: positionStore.get(),
			positionStore,
			render: renderLivePreviewOverlayAt
		})
		: null);
	const renderLivePreviewOverlayAt = (position) => {
		const primitives = getRenderer();
		const previewLiveClock = getLiveClock();
		let previewBody = null;
		const renderPreviewLine = (rowLine, isRowActive, rowKey, charReadingsOverride = null) => {
			if (!rowLine || !primitives?.LyricsLineBlock) return null;
			try {
				let mainText = rowLine?.text || '';
				let subText = null;
				let subText2 = null;
				let originalText = null;
				try {
					const aux = primitives.getEmbeddedAuxiliaryDisplayValues
						? primitives.getEmbeddedAuxiliaryDisplayValues(rowLine)
						: { text: rowLine?.text };
					const display = primitives.buildLyricDisplayState
						? primitives.buildLyricDisplayState(true, rowLine, aux?.text, aux?.originalText, aux?.text2)
						: null;
					if (display) {
						mainText = display.mainText ?? mainText;
						subText = display.subText ?? null;
						subText2 = display.subText2 ?? null;
						originalText = display.originalText ?? null;
					}
				} catch (error) {
					mainText = rowLine?.text || '';
				}
				// Editor reading aids: the editor furigana map overrides the
				// converter result (the outside converter only runs when the global
				// furigana setting is on, while the editor always shows readings
				// for Japanese lines). Per-glyph AI pronunciation travels via
				// the charReadings prop into each karaoke glyph's own box.
				let furiganaMapOverride = null;
				try {
					const rowText = rowLine?.text;
					if (typeof rowText === 'string' && rowText && typeof getSyncCreatorFuriganaMap === 'function') {
						furiganaMapOverride = getSyncCreatorPreviewFuriganaMap(
							previewFuriganaCacheRef.current, rowText, getSyncCreatorFuriganaMap,
							furiganaRevision, isFuriganaReady()
						);
					}
				} catch (error) {
					furiganaMapOverride = null;
				}
				let lineClassName = `lyrics-lyricsContainer-LyricsLine${isRowActive ? ' lyrics-lyricsContainer-LyricsLine-active' : ''}`;
				try {
					const metaClass = primitives.getKaraokeLineMetaClass
						? primitives.getKaraokeLineMetaClass(rowLine)
						: '';
					if (metaClass) lineClassName += ` ${metaClass}`;
				} catch (error) {
					void error;
				}
				let speakerStyle = null;
				try {
					speakerStyle = primitives.getKaraokeSpeakerStyle
						? primitives.getKaraokeSpeakerStyle(rowLine?.speaker, rowLine?.['speaker-color'], rowLine?.['speaker-fallback'])
						: null;
				} catch (error) {
					speakerStyle = null;
				}
				const rowStartTime = Number(rowLine?.startTime);
				return react.createElement(primitives.LyricsLineBlock, {
					key: rowKey,
					className: lineClassName,
					style: speakerStyle || undefined,
					dir: 'auto',
					seekTime: Number.isFinite(rowStartTime) && !rowLine?.isVirtualTrailingInterlude ? rowStartTime : null,
					mainText,
					subText,
					subText2,
					originalText,
					isKara: true,
					line: rowLine,
					position,
					...(isRowActive && previewLiveClock ? { liveClock: previewLiveClock } : {}),
					isActive: isRowActive,
					isCurrentLine: isRowActive,
					isEffectFocused: isRowActive,
					isEffectLive: isRowActive,
					furiganaMapOverride,
					charReadings: charReadingsOverride,
					settingsRevision: previewSettingsRevision,
					globalCharOffset: 0,
					activeGlobalCharIndex: -1,
					singleLineScroll: false
				});
			} catch (error) {
				return null;
			}
		};
		// Current line only (never the whole song): fully rendered with all of
		// its vocal rows via the exact outside KaraokeLine vocal stack.
		// Marker rows become break indicators, long trailing gaps become
		// virtual break rows, playback before the first line shows the
		// leading prelude (interlude system, same source as outside).
		// The previewed line follows the same clock as its glyphs.
		const playbackLineIndex = getSyncCreatorPlaybackLineIndex(playbackTimeline, position);
		const previewLineIndex = Math.max(0, Math.min(playbackLineIndex >= 0 ? playbackLineIndex : currentLineIndex,
			livePreviewKaraokeLines.length - 1));
		const previewLine = livePreviewKaraokeLines[previewLineIndex] || null;
		let interludeDisplayLine = null;
		let isLeadingPrelude = false;
		let leadingPreludeDurationMs = 0;
		try {
			if (previewLine && primitives?.getInterludeInfo) {
				const nextPreviewLine = livePreviewKaraokeLines[previewLineIndex + 1] || null;
				const sourceInterludeInfo = primitives.getInterludeInfo(
					previewLine,
					nextPreviewLine,
					previewLineIndex,
					livePreviewKaraokeLines.length
				);
				if (sourceInterludeInfo?.isInterlude) {
					interludeDisplayLine = { ...previewLine, interludeInfo: sourceInterludeInfo };
				} else if (primitives.createActiveTrailingKaraokeInterludeLine) {
					interludeDisplayLine = primitives.createActiveTrailingKaraokeInterludeLine({
						line: previewLine,
						nextLine: nextPreviewLine,
						lineIndex: previewLineIndex,
						lineCount: livePreviewKaraokeLines.length,
						position,
						isActiveLine: true,
						isKara: true
					});
				}
			}
		} catch (error) {
			interludeDisplayLine = null;
		}
		if (!interludeDisplayLine && primitives?.IdlingIndicator
			&& firstPreviewLineStart !== null && Number(position) < firstPreviewLineStart) {
			isLeadingPrelude = true;
			leadingPreludeDurationMs = firstPreviewLineStart;
		}
		const displaySourceLine = interludeDisplayLine || previewLine;
		// Multi-vocal lines: render one exact row per vocal part (lead +
		// backgrounds) so every synced voice is visible, using the same
		// single-row renderer as above.
		const vocalLeadPart = displaySourceLine?.vocals?.lead;
		const vocalBackgroundParts = Array.isArray(displaySourceLine?.vocals?.background)
			? displaySourceLine.vocals.background
			: [];
		const hasVocalStack = vocalLeadPart?.syllables?.length > 0
			&& vocalBackgroundParts.some((part) => Array.isArray(part?.syllables) && part.syllables.length > 0);
		const previewVocalRowCount = hasVocalStack
			? 1 + vocalBackgroundParts.filter((part) => Array.isArray(part?.syllables) && part.syllables.length > 0 && String(part.text || '').trim()).length
			: 0;
		if (!previewBody && hasVocalStack && !displaySourceLine?.interludeInfo?.isInterlude) {
			try {
				const buildVocalRowLine = (part) => getSyncCreatorPreviewVocalRowLine(displaySourceLine, part);
				const stackRows = [];
				const previewPronEntries = showCharacterPronunciations
					? [...currentParallelPartReadingMaps.values()].filter((entry) => entry && entry.hasPron)
					: [];
				const leadReading = previewPronEntries.find(entry => entry.role === 'lead') || previewPronEntries[0] || null;
				const backgroundReadings = previewPronEntries.filter(entry => entry.role !== 'lead');
				const findPreviewPronEntry = (part, suffix) => {
					const direct = currentParallelPartReadingMaps.get(part.id);
					if (direct) return direct.hasPron ? direct : null;
					// Fallback when materialized preview ids diverge from draft ids:
					// same voice by role/order.
					if (suffix === 'lead') return leadReading;
					const bgIndex = Number(String(suffix).split('-')[1]);
					if (Number.isInteger(bgIndex)) return backgroundReadings[bgIndex] || null;
					return null;
				};
				const pushPartRow = (part, suffix) => {
					if (!part || !Array.isArray(part.syllables) || part.syllables.length === 0) return;
					if (!String(part.text || '').trim()) return;
					let partReadings = null;
					if (showCharacterPronunciations) {
						try {
							const entry = findPreviewPronEntry(part, suffix);
							if (entry) {
								partReadings = getCachedPreviewCharReadings(entry.partChars, entry.pronMap, entry.units, editorGlyphSize);
							}
						} catch (error) {
							partReadings = null;
						}
					}
					const rowElement = renderPreviewLine(buildVocalRowLine(part), true, `vocal-${suffix}`, partReadings);
					if (rowElement) stackRows.push(rowElement);
				};
				pushPartRow(vocalLeadPart, 'lead');
				vocalBackgroundParts.forEach((part, partIndex) => pushPartRow(part, `bg-${partIndex}`));
				if (stackRows.length > 0) {
					previewBody = react.createElement('div', { className: 'lyrics-karaoke-stack sync-creator-live-preview-stack' }, stackRows);
				}
			} catch (error) {
				previewBody = null;
			}
		}
		if (isLeadingPrelude && primitives?.IdlingIndicator) {
			try {
				previewBody = react.createElement(primitives.IdlingIndicator, {
					isActive: true,
					delay: leadingPreludeDurationMs / 3,
					durationMs: leadingPreludeDurationMs,
					settingsRevision: previewSettingsRevision
				});
			} catch (error) {
				previewBody = null;
			}
		}
		if (!previewBody && displaySourceLine) {
			let previewReadings = null;
			if (showCharacterPronunciations && displaySourceLine.text === currentLyricText) {
				try {
					previewReadings = getCachedPreviewCharReadings(currentLineChars, currentLineCharacterPronunciationMap, currentLineRenderedPronunciationUnits, editorGlyphSize);
				} catch (error) {
					previewReadings = null;
				}
			}
			const lineElement = renderPreviewLine(displaySourceLine, true, 'main', previewReadings);
			if (lineElement) {
				previewBody = react.createElement('div', { className: 'sync-creator-live-preview-line' }, lineElement);
			}
		}
		if (!previewBody && previewLine) {
			previewBody = react.createElement('div', {
				className: 'lyrics-lyricsContainer-LyricsLine lyrics-lyricsContainer-LyricsLine-active',
				dir: 'auto',
				style: { fontSize: '32px', fontWeight: '700', color: 'var(--spice-text)', textAlign: 'center', lineHeight: 1.5 }
			}, String(previewLine?.text || ''));
		}
		if (!previewBody) {
			previewBody = react.createElement('div', { style: { fontSize: '13px', color: 'var(--spice-subtext)' } },
				translate('syncCreator.noSyncData') || 'No sync data to preview yet.'
			);
		}
		const vocalPartSignature = (part) => `${part?.startTime ?? 'u'}:${Array.isArray(part?.syllables) ? part.syllables.length : 0}`;
		const previewContentKey = `${previewLineIndex}:${(displaySourceLine?.text || '').length}:${interludeDisplayLine ? 'interlude' : (displaySourceLine?.vocals ? `v:${vocalPartSignature(displaySourceLine.vocals.lead)}:${(displaySourceLine.vocals.background || []).map(vocalPartSignature).join('+')}` : (Array.isArray(displaySourceLine?.syllables) ? displaySourceLine.syllables.length : 0))}`;
		const safePreviewBody = react.createElement(SyncCreatorPreviewBoundary, { key: previewContentKey }, previewBody);
		return react.createElement('div', {
			className: 'sync-creator-live-preview-overlay',
			style: {
				position: 'static',
				margin: '0 0 12px',
				minHeight: '168px',
				display: 'flex', flexDirection: 'column', overflow: 'hidden',
				background: '#0a0e12',
				border: `1px solid ${borderColor}`,
				borderRadius: '12px'
			},
			onMouseDown: (event) => event.stopPropagation(),
			onTouchStart: (event) => event.stopPropagation()
		},
			react.createElement('div', {
				style: {
					display: 'flex', alignItems: 'center', gap: '8px',
					padding: '8px 12px',
					borderBottom: `1px solid ${borderColor}`,
					flexShrink: 0
				}
			},
				react.createElement('div', {
					style: { fontSize: '11px', fontWeight: '800', color: 'var(--spice-text)', letterSpacing: '0.04em', textTransform: 'uppercase' }
				}, translate('syncCreator.preview') || 'Preview'),
				react.createElement('div', {
					style: { fontSize: '11px', color: 'var(--spice-subtext)', fontVariantNumeric: 'tabular-nums' }
				}, livePreviewKaraokeLines.length > 0 ? `${previewLineIndex + 1} / ${livePreviewKaraokeLines.length}${previewVocalRowCount > 1 ? ` · ${translate('syncCreator.previewVocalCount', { count: previewVocalRowCount }) || previewVocalRowCount}` : ''}` : '')
			),
			react.createElement('div', {
				className: 'sync-creator-live-preview-exact',
				style: { position: 'relative', zIndex: 1, display: 'block', width: '100%', boxSizing: 'border-box', minHeight: '132px', maxHeight: '360px', overflowY: 'auto', overflowX: 'hidden', textAlign: 'center', padding: '28px 20px', flex: '1 0 auto' }
			},
				// The preview renders the production page markup, so every
				// page-scoped lyric rule (line colour, line transition, past-line
				// colour share, karaoke glow) applies exactly as it does in the app.
				react.createElement('div', {
					className: `sync-creator-live-preview-stage lyrics-lyricsContainer-SyncedLyricsPage is-karaoke${getVisualSettings()['karaoke-line-transition'] === false ? '' : ' karaoke-line-transition-enabled'}`,
					style: { position: 'relative', zIndex: 1, width: '100%', minHeight: 0, ...livePreviewLyricVars }
				},
					react.createElement('div', {
						className: 'sync-creator-live-preview-rows lyrics-lyricsContainer-SyncedLyrics',
						style: {
							position: 'relative', zIndex: 1, width: '100%',
							fontSize: 'var(--lyrics-original-font-size, var(--lyrics-font-size))',
							fontWeight: 'var(--lyrics-original-font-weight, 700)',
							fontFamily: 'var(--lyrics-original-font-family, var(--lyrics-font-family, var(--font-family)))',
							letterSpacing: 'var(--lyrics-original-letter-spacing, 0px)',
							lineHeight: 1
						}
					}, safePreviewBody)
				)
			)
		);
	};

	return { showLivePreview, renderLivePreviewOverlay };
}
