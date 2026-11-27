import { createLyricsSearchBar } from "#ivlyrics/lyrics/lyricsSearchBar.mjs";
import { createLyricsUnavailableView } from "#ivlyrics/lyrics/lyricsUnavailableView.mjs";
import { readPronunciationFirst as readPagePronunciationFirst } from "#ivlyrics/lyrics/pronunciationRuntime.mjs";
import { createKaraokeLine } from "#ivlyrics/lyrics/createKaraokeLine.mjs";
import { createKaraokePhoneticFill, getPhoneticFillUnits } from "#ivlyrics/lyrics/karaokePhoneticFill.mjs";
import {
	createKaraokeLinePresentation, hasKaraokeVocalRows,
} from "#ivlyrics/lyrics/karaokeLinePresentation.mjs";
import {
	createKaraokeLineTiming, getKaraokeLineBounds, applyKaraokeWhitespaceCompensation,
} from "#ivlyrics/lyrics/karaokeLineTiming.mjs";
import { createKaraokeVocalRowRenderDataBuilder } from "#ivlyrics/lyrics/karaokeVocalTiming.mjs";
import { prepareSyncedLinePlaybackWindows } from "#ivlyrics/lyrics/lyricPlaybackTimeline.mjs";
import {
	createLyricDisplayResolver, getEmbeddedAuxiliaryDisplayValues, normalizeUnsyncedLyrics,
} from "#ivlyrics/lyrics/lyricDisplayText.mjs";
import {
	createLyricInterludeTiming, getLyricTrackDurationMs,
	isAutomaticInstrumentalBreakEnabled, INTERLUDE_MIN_DURATION_MS,
} from "#ivlyrics/lyrics/lyricInterludeTiming.mjs";
import { createSyncedLyricsViewportHook } from "#ivlyrics/lyrics/syncedLyricsViewport.mjs";
import { createLyricsScrollGeometry } from "#ivlyrics/lyrics/lyricsScrollGeometry.mjs";
import { createLyricsExpandedScroll } from "#ivlyrics/lyrics/lyricsExpandedScroll.mjs";
import { createLyricsLineMotion, LYRICS_CENTERING_LEAD_MS } from "#ivlyrics/lyrics/lyricsLineMotion.mjs";
import { createKaraokeGraphemes } from "#ivlyrics/lyrics/karaokeGraphemes.mjs";
import { createCreatorProfileFooter } from "#ivlyrics/lyrics/creator-profile/profileFooter.mjs";
import { getPlaybackPositionService as getPagePlaybackPosition } from "#ivlyrics/core/playbackPositionService.mjs";
import { createLyricsFrameScheduler, createLyricsVisibilityManager } from "#ivlyrics/lyrics/lyricsFrameScheduler.mjs";
import { createGlobalSyncOffsetReader } from "#ivlyrics/core/globalSyncOffset.mjs";
import { createLyricsPlaybackHooks, createLyricsViewClock, getLyricsTrackFrameRate } from "#ivlyrics/lyrics/lyricsPlaybackView.mjs";
import { createLyricsScrollActivityHook } from "#ivlyrics/lyrics/lyricsScrollActivity.mjs";
import { createLyricsLayoutObserver } from "#ivlyrics/lyrics/lyricsLayoutObserver.mjs";
import { createKaraokeCharacterTimelineBuilder, queryGlobalCharTimeline, EMPTY_GLOBAL_CHAR_STATE } from "#ivlyrics/lyrics/karaokeCharacterTimeline.mjs";
import { createKaraokeFill } from "#ivlyrics/lyrics/karaokeFill.mjs";
import { createKaraokeMotion } from "#ivlyrics/lyrics/karaokeMotion.mjs";
import { createKaraokeTextRenderer } from "#ivlyrics/lyrics/karaokeTextRenderer.mjs";
import { createKaraokeLivePainter } from "#ivlyrics/lyrics/karaokeLivePainter.mjs";
import { createKaraokeWordSupplementHook } from "#ivlyrics/lyrics/karaokeWordSupplementHook.mjs";
import { createWordSupplementPrefetcher } from "#ivlyrics/lyrics/createWordSupplementPrefetcher.mjs";
import { getWordSupplementService as getPageWordSupplementService, registerWordSupplementPrefetcher } from "#ivlyrics/lyrics/wordSupplementRuntime.mjs";
import { getLyricsTypographyStyleVariables as getPageLyricsTypography } from "#ivlyrics/lyrics/lyricsTypography.mjs";
import { createInterludeIndicator } from "#ivlyrics/lyrics/lyricInterludePresentation.mjs";
import { createLyricSubLineRenderer } from "#ivlyrics/lyrics/createLyricSubLineRenderer.mjs";
import { createLyricLineActions } from "#ivlyrics/lyrics/createLyricLineActions.mjs";
import { createLyricMainContentRenderer, createLyricsLineBlock } from "#ivlyrics/lyrics/lyricsLineComponents.mjs";
import { createLyricsTrackRevealHook } from "#ivlyrics/lyrics/lyricsTrackReveal.mjs";
import { createSyncedLyricRows } from "#ivlyrics/lyrics/createSyncedLyricRows.mjs";
import { createLyricsPageRenderer } from "#ivlyrics/lyrics/createLyricsPageRenderer.mjs";
import { createSyncedLyricsPages } from "#ivlyrics/lyrics/createSyncedLyricsPages.mjs";
import { createSyncedLyricsPlaybackTracker } from "#ivlyrics/lyrics/createSyncedLyricsPlaybackTracker.mjs";
import { createSyncedLyricsEngine } from "#ivlyrics/lyrics/createSyncedLyricsEngine.mjs";
import { createKaraokeWordIndexer } from "#ivlyrics/lyrics/karaokeWordIndexes.mjs";
import { readLyricRenderingLocale, isLyricFuriganaReady, readRouteDetectedLyricLanguage } from "#ivlyrics/lyrics/lyricsTextRuntime.mjs";

export function createLyricsRenderer({
	react, window, document, localStorage, spicetify: Spicetify, config: CONFIG, i18n: I18n,
	getUtils, getToast, getMarketplacePage, services,
}) {
	const { useState, useEffect, useMemo, useRef } = react;
	const {
		getPlaylistPicker, getStoragePersistence, getRuntimeI18n, getRuntimeStorage, getSpeakerColors,
		getWordSegmenter, getLyricsService, getReactDOM, readPlayerTrackUri, translateSeekTitle,
		reportWordStackDebug, publishCompatibility,
	} = services;

	const CREATOR_PROFILE_THEME_KEY = "ivLyrics:settings-ui-theme";
	const CREATOR_PROFILE_LANGUAGE_KEY = "ivLyrics:visual:language";
	const CreditFooter = createCreatorProfileFooter({
		react,
		translate: (key) => I18n.t(key),
		profileApi: {
			isDiscordUserHash: (userHash) => getUtils().isDiscordUserHash(userHash),
			fetchDiscordSupportTier: (...args) => getUtils().fetchDiscordSupportTier(...args),
			fetchSyncCreatorGreetingTranslation: (...args) => getUtils().fetchSyncCreatorGreetingTranslation(...args),
			fetchSyncCreatorProfile: (...args) => getUtils().fetchSyncCreatorProfile(...args),
			setSyncCreatorLike: (...args) => getUtils().setSyncCreatorLike(...args),
			setSyncCreatorGreeting: (...args) => getUtils().setSyncCreatorGreeting(...args),
			getCreatorDecorationDefaults: () => getUtils().getCreatorDecorationDefaults(),
			saveOwnCreatorDecoration: (decoration) => getUtils().saveOwnCreatorDecoration(decoration),
			setCachedDiscordSupportTier: (...args) => getUtils().setCachedDiscordSupportTier(...args),
			resetOwnCreatorDecoration: () => getUtils().resetOwnCreatorDecoration(),
		},
		notify: {
			error: (message) => getToast().error(message),
			warning: (message) => getToast().warning(message),
			success: (message) => getToast().success(message),
		},
		fetchCover: (...args) => fetch(...args),
		getPlaylistPickerButton: () => getPlaylistPicker().PlaylistPickerButton,
		readTheme: () => getStoragePersistence()?.getItem(CREATOR_PROFILE_THEME_KEY)
			?? localStorage.getItem(CREATOR_PROFILE_THEME_KEY),
		writeTheme: (value) => {
			const persistence = getStoragePersistence();
			if (persistence) {
				persistence.setItem(CREATOR_PROFILE_THEME_KEY, value);
			} else {
				localStorage.setItem(CREATOR_PROFILE_THEME_KEY, value);
			}
		},
		prefersLightTheme: () => window.matchMedia?.("(prefers-color-scheme: light)")?.matches,
		getLocaleCandidates: () => [
			getRuntimeI18n()?.getCurrentLanguage?.(),
			typeof I18n !== "undefined" ? I18n.getCurrentLanguage?.() : null,
			getRuntimeStorage()?.getItem?.(CREATOR_PROFILE_LANGUAGE_KEY),
			Spicetify?.LocalStorage?.get?.(CREATOR_PROFILE_LANGUAGE_KEY),
			Spicetify?.Locale?.getLocale?.(),
		],
		getDefaultLocale: () => getRuntimeI18n()?.DEFAULT_LANGUAGE,
		getReactDOM,
		getPortalBody: () => document.body,
		listenForKeyDown: (listener) => {
			window.addEventListener("keydown", listener);
			return () => window.removeEventListener("keydown", listener);
		},
		openTrack: (trackId) => Spicetify?.Platform?.History?.push?.(`/track/${trackId}`),
	});
	publishCompatibility("CreditFooter", CreditFooter);

	const IdlingIndicator = react.memo(({ isActive = false, delay = 0, durationMs = 0, settingsRevision = 0, lineRef = null, detailClassName = "", fadeDurationMs = null, offsetPx = null }) => {
		const className = useMemo(() =>
			`lyrics-idling-indicator ${!isActive ? "lyrics-idling-indicator-hidden" : ""} lyrics-lyricsContainer-LyricsLine ${isActive ? "lyrics-lyricsContainer-LyricsLine-active" : ""} lyrics-lyricsContainer-LyricsLine-interlude${detailClassName}`,
			[isActive, detailClassName]
		);

		const style = useMemo(() => ({
			"--position-index": 0,
			"--animation-index": 1,
			"--indicator-delay": `${delay}ms`,
			...(Number.isFinite(offsetPx) ? { "--offset": `${offsetPx}px` } : {}),
			...(Number.isFinite(fadeDurationMs) ? { "--lyrics-interlude-fade-duration": `${fadeDurationMs}ms` } : {}),
		}), [delay, fadeDurationMs, offsetPx]);

		if (durationMs <= INTERLUDE_MIN_DURATION_MS) {
			return null;
		}

		return react.createElement(
			"div",
			{ className, style, ref: lineRef, "aria-hidden": !isActive ? true : undefined },
			react.createElement(
				"p",
				{ className: "lyrics-lyricsContainer-LyricsLine-interludeMain" },
				react.createElement(InterludeIndicator, {
					durationMs,
					kind: "prelude",
					settingsRevision,
				})
			)
		);
	});

	const emptyLine = {
		startTime: 0,
		endTime: 0,
		text: [],
	};

	const { getUnsyncedLineRenderData, buildLyricDisplayState } = createLyricDisplayResolver({
		readDisplayMode: () => CONFIG.visual["translate:display-mode"],
		applyFurigana: (text) => getUtils().applyFuriganaIfEnabled(text),
	});

	const getTrackPositionFPS = () => getLyricsTrackFrameRate(CONFIG?.visual);
	const readLyricsGlobalOffset = createGlobalSyncOffsetReader(window, {
		readVisualSettings: () => CONFIG?.visual,
		readLocalStorage: () => localStorage,
	});

	const { getFrameAlignedLyricsPlaybackPosition, ...lyricsViewClock } = createLyricsViewClock({
		getSafePlayerProgress: () => getPagePlaybackPosition(window)?.getSafePlayerProgress?.(),
		getSnapshot: () => getPagePlaybackPosition(window)?.getPlayerPlaybackSnapshot?.(),
		getPublicProgress: () => Spicetify.Player?.getProgress?.(),
		getDelay: () => CONFIG.visual.delay,
		getPronunciationLead: () => readPagePronunciationFirst(window)?.getLeadMs?.() || 0,
		readGlobalOffset: readLyricsGlobalOffset,
	});
	const AnimationManager = createLyricsFrameScheduler({
		getPlayer: () => Spicetify.Player,
		getPlatformPaused: () => Spicetify.Platform?.PlayerAPI?._state?.isPaused,
		hostEvents: window,
		documentEvents: document,
		isHidden: () => document.hidden,
		isSettingsOpen: () => document.documentElement.classList.contains("ivlyrics-settings-open")
			|| document.body?.classList.contains("ivlyrics-settings-open"),
		getFrameRate: getTrackPositionFPS,
		now: () => performance.now(),
		requestFrame: typeof requestAnimationFrame === "function" ? (callback) => requestAnimationFrame(callback) : null,
		cancelFrame: (id) => cancelAnimationFrame(id),
		scheduleTimer: (callback, delay) => setTimeout(callback, delay),
		cancelTimer: (id) => clearTimeout(id),
	});
	const VisibilityManager = createLyricsVisibilityManager(document, () => document.hidden);
	const { useLyricsPlaybackPosition, useLyricsPlaybackObserver } = createLyricsPlaybackHooks({
		react,
		hostEvents: window,
		frameScheduler: AnimationManager,
		visibilityManager: VisibilityManager,
		clock: lyricsViewClock,
		readTrackUri: () => Spicetify.Player?.data?.item?.uri || "",
		readTrackOffset: (uri) => getUtils().getTrackSyncOffset(uri),
		readGlobalOffset: readLyricsGlobalOffset,
	});

	// The existing performance-monitoring API exposes the two shared managers.
	publishCompatibility("AnimationManager", AnimationManager);
	publishCompatibility("VisibilityManager", VisibilityManager);

	const useScrollActivity = createLyricsScrollActivityHook({
		react,
		hostEvents: window,
		getPlayer: () => Spicetify.Player,
		getReturnPositions: () => syncedManualScrollReturns,
		getAnchorRatio: (container) => getLyricsAnchorRatio(container),
		cancelAutoScroll: (container) => cancelSyncedLyricsScrollAnimation(container),
		createSpacer: () => document.createElement("div"),
		scheduleFrame: (callback) => requestAnimationFrame(callback),
		cancelFrame: (id) => cancelAnimationFrame(id),
		scheduleTimer: (callback, delay) => setTimeout(callback, delay),
		cancelTimer: (id) => clearTimeout(id),
		now: () => Date.now(),
	});

	const renderLyricSubLine = createLyricSubLineRenderer({
		react,
		getInactiveColor: () => CONFIG.visual["inactive-color"],
	});

	const getCurrentTrackDurationMs = () => getLyricTrackDurationMs(
		typeof Spicetify === "undefined" ? null : Spicetify.Player?.data?.item
	);
	const isAutoInstrumentalBreakEnabled = () => isAutomaticInstrumentalBreakEnabled(CONFIG?.visual?.["instrumental-break-auto-detect"]);

	const {
		getKaraokeInlineSpeakerClass, getKaraokeSpeakerStyle,
		getKaraokeKindClassParts, getKaraokeLineMetaClass, getKaraokeVocalRows,
	} = createKaraokeLinePresentation({
		getSpeakerColors: () => getSpeakerColors(),
		getVisualSettings: () => CONFIG?.visual,
		prefersReducedLyricsMotion: () => prefersReducedLyricsMotion(),
	});

	const { splitKaraokeGraphemes, coalesceKaraokeTimedGraphemes } = createKaraokeGraphemes({
		getSharedSegmenter: () => getWordSegmenter(),
	});

	const { buildKaraokeFuriganaMap, buildKaraokeTimedChars, getKaraokeLineFillEndTime } = createKaraokeLineTiming({
		splitKaraokeGraphemes, coalesceKaraokeTimedGraphemes,
		getLocale: () => readLyricRenderingLocale(window),
	});
	const buildKaraokeVocalRowRenderData = createKaraokeVocalRowRenderDataBuilder(buildKaraokeTimedChars);

	const { getInterludeInfo, getTrailingKaraokeInterludeInfo, createActiveTrailingKaraokeInterludeLine,
		buildKaraokeCumulativeEndTimes } = createLyricInterludeTiming({
		readTrackDuration: getCurrentTrackDurationMs,
		readLineFillEndTime: getKaraokeLineFillEndTime,
		readAutoBreakEnabled: isAutoInstrumentalBreakEnabled,
	});

	const InterludeIndicator = createInterludeIndicator({
		react,
		getVisualSettings: () => CONFIG?.visual,
		translate: key => I18n.t(key),
	});

	const prefersReducedLyricsMotion = () => (
		CONFIG?.visual?.["reduce-motion"] === true
		|| (
			typeof window !== "undefined"
			&& typeof window.matchMedia === "function"
			// MediaQueryList.matches stays live; do not allocate one for every glyph.
			&& (prefersReducedLyricsMotion.mediaQuery ??= window.matchMedia("(prefers-reduced-motion: reduce)")).matches
		)
	);

	const { getLyricsAnchorRatio, getCompactSyncedOffset, getExpandedScrollTarget } =
		createLyricsScrollGeometry((container) => window.getComputedStyle(container));
	const getLyricsScrollTime = () => typeof performance !== "undefined" && typeof performance.now === "function"
		? performance.now()
		: Date.now();
	const { scrollSyncedContainerToActiveLine, cancelSyncedLyricsScrollAnimation } = createLyricsExpandedScroll({
		getExpandedScrollTarget, prefersReducedLyricsMotion,
		now: getLyricsScrollTime,
		requestFrame: (callback) => typeof window.requestAnimationFrame === "function"
			? window.requestAnimationFrame(callback)
			: setTimeout(() => callback(getLyricsScrollTime()), 16),
		cancelFrame: (id) => typeof window.cancelAnimationFrame === "function"
			? window.cancelAnimationFrame(id)
			: clearTimeout(id),
	});
	const compactLyricsLineMotion = createLyricsLineMotion({
		readMatrix: () => typeof DOMMatrix === "function" ? DOMMatrix : null,
		readOnlyMatrix: () => typeof DOMMatrixReadOnly === "function" ? DOMMatrixReadOnly : null,
		supportsLinearEasing: () => typeof CSS !== "undefined" && CSS.supports?.("animation-timing-function", "linear(0, 1)"),
	});
	const requestLyricsLayoutFrame = (callback) => typeof requestAnimationFrame === "function"
		? requestAnimationFrame(callback) : setTimeout(callback, 0);
	const cancelLyricsLayoutFrame = (id) => typeof cancelAnimationFrame === "function"
		? cancelAnimationFrame(id) : clearTimeout(id);
	const useSyncedLyricsViewport = createSyncedLyricsViewportHook({
		react, getCompactSyncedOffset, scrollSyncedContainerToActiveLine,
		isLineVisible: (line) => isInViewport(line),
		canObserveLayout: () => typeof ResizeObserver !== "undefined",
		createObserver: () => createLyricsLayoutObserver({
			ResizeObserver,
			MutationObserver: typeof MutationObserver === "undefined" ? null : MutationObserver,
			scheduleFrame: requestLyricsLayoutFrame,
			cancelFrame: cancelLyricsLayoutFrame,
		}),
		requestFrame: requestLyricsLayoutFrame,
		cancelFrame: cancelLyricsLayoutFrame,
	});


	const prepareGlobalCharTimeline = createKaraokeCharacterTimelineBuilder({
		splitKaraokeGraphemes,
		coalesceKaraokeTimedGraphemes,
	});

	const PSEUDO_KARAOKE_SOURCES = new Set(["audio-analysis-pseudo", "spotify-audio-analysis", "line-timing-pseudo"]);
	const assignKaraokeWordIndexes = createKaraokeWordIndexer(
		() => getWordSegmenter(),
	);

	const getPseudoKaraokeRenderAdvance = (karaokeSource) => {
		if (!PSEUDO_KARAOKE_SOURCES.has(karaokeSource)) {
			return 0;
		}

		const configuredAdvance = Number(CONFIG.visual["pseudo-karaoke-render-advance"] ?? 0);
		return Number.isFinite(configuredAdvance) ? configuredAdvance : 0;
	};

	const buildPreparedSyncedLyrics = (lyrics, isKara, cache = null) =>
		lyrics.map((line, index, allLines) => {
			const cached = line && typeof line === "object" ? cache?.get(line) : null;
			if (cached && cached.nextLine === allLines[index + 1]
				&& cached.index === index && cached.count === allLines.length) return cached.prepared;
			const displayValues = getEmbeddedAuxiliaryDisplayValues(line);
			const prepared = {
				...line,
				interludeInfo: getInterludeInfo(line, allLines[index + 1], index, allLines.length),
				...buildLyricDisplayState(
					isKara,
					line,
					displayValues.text,
					displayValues.originalText,
					displayValues.text2
				),
			};
			if (line && typeof line === "object") cache?.set(line, {
				nextLine: allLines[index + 1], index, count: allLines.length, prepared,
			});
			return prepared;
		});

	const buildPaddedSyncedLyrics = (lyrics, leadingEmptyLines, cache = null) =>
		Array.from({ length: leadingEmptyLines }, () => emptyLine)
			.concat(lyrics)
			.map((line, lineNumber) => {
				const cached = cache?.get(line);
				if (cached?.lineNumber === lineNumber) return cached;
				const padded = { ...line, lineNumber };
				cache?.set(line, padded);
				return padded;
			});

	const buildSyncedLinePlaybackWindows = (lines, isKara) => prepareSyncedLinePlaybackWindows(
		lines, isKara, (line) => getKaraokeLineBounds(line).endTime, getKaraokeLineFillEndTime,
	);

	const shouldHideSyncedLine = ({ compact, isScrolling, animationIndex }) => {
		if (compact && isScrolling) {
			return false;
		}

		return (
			(animationIndex < 0 && -animationIndex > CONFIG.visual["lines-before"]) ||
			animationIndex > CONFIG.visual["lines-after"]
		);
	};

	// Start the exit before the source changes, rather than removing a visible
	// indicator at the lyric boundary. A coarse clock/seek may first enter this
	// window late: cap the fade to the time actually left so it still completes.
	const getInterludeHandoffState = ({ position, startTime = 0, nextStartTime, enabled = true }) => {
		const valid = enabled && Number.isFinite(position) && Number.isFinite(startTime)
			&& Number.isFinite(nextStartTime) && nextStartTime > startTime;
		const leadMs = valid ? Math.min(LYRICS_CENTERING_LEAD_MS, (nextStartTime - startTime) / 2) : 0;
		const isDeparting = leadMs > 0 && position >= nextStartTime - leadMs && position < nextStartTime;
		return {
			isDeparting,
			fadeDurationMs: isDeparting ? Math.max(0, Math.min(220, leadMs * 0.8, nextStartTime - position - 16)) : null,
		};
	};

	const isInterludeMotionEnabled = (isKara = false) =>
		!prefersReducedLyricsMotion() && (!isKara || CONFIG.visual["karaoke-line-transition"] !== false);

	const getLyricsLineDetailClass = (enabled, focused, past, departingInterlude = false) => {
		if (!enabled) return "";
		return ` lyrics-line-detail lyrics-line-detail-${focused ? "current" : past ? "past" : "future"}`
			+ (departingInterlude ? " lyrics-interlude-departing" : "");
	};

	const lyricLineActions = createLyricLineActions({
		getVisualSettings: () => CONFIG.visual,
		prefersReducedLyricsMotion,
		supportsScale: () => typeof CSS !== "undefined" && CSS.supports?.("scale", "1"),
		clearPlaybackCorrection: () => getPagePlaybackPosition(window)?.clearSafePlayerProgressCorrection?.(),
		seek: position => Spicetify.Player.seek(position),
		copy: text => Spicetify.Platform.ClipboardAPI.copy(text),
		notifySuccess: key => getToast().success(I18n.t(key)),
		notifyError: key => getToast().error(I18n.t(key)),
		translateSeekTitle,
	});
	const LyricsLineBlock = createLyricsLineBlock({
		react,
		InterludeIndicator,
		getInterludeInfo,
		hasKaraokeVocalRows,
		getPhoneticFillUnits: (...args) => getPhoneticFillUnits(...args),
		renderPhoneticFillSubLine: (...args) => renderPhoneticFillSubLine(...args),
		renderLyricSubLine,
		renderLyricMainContent: createLyricMainContentRenderer({ react, getKaraokeLine: () => KaraokeLine, hasKaraokeVocalRows }),
		formatLyricLineToCopy: (...args) => getUtils().formatLyricLineToCopy(...args),
		actions: lyricLineActions,
		readSeekTitleLocale: () => window.I18n?.getCurrentLanguage?.(),
	});
	const { renderLyricsItems, prepareLiveSyncedRenderItems, advanceLiveSyncedRenderItems } =
		createSyncedLyricRows({ react, IdlingIndicator, LyricsLineBlock });

	const usePreparedSyncedLyrics = (lyrics, isKara, sourceKey = "") => {
		// Keep display preparation shared with the playback-only fullscreen tracker.
		const lyricsDisplayMode = CONFIG.visual["translate:display-mode"];
		const furiganaEnabled = !!CONFIG.visual["furigana-enabled"];
		const furiganaReady = isLyricFuriganaReady(window);
		const lyricsLocale = readLyricRenderingLocale(window);
		const trackDuration = getCurrentTrackDurationMs();
		const autoDetect = CONFIG.visual["instrumental-break-auto-detect"];
		const cache = useMemo(() => new WeakMap(),
			[isKara, sourceKey, lyricsDisplayMode, furiganaEnabled, furiganaReady, lyricsLocale, trackDuration, autoDetect]);
		return useMemo(
			() => buildPreparedSyncedLyrics(lyrics, isKara, cache),
			[lyrics, isKara, cache]
		);
	};

	const publishLyricIndex = (activeLineIndex, leadingEmptyLines, total) => {
		window.dispatchEvent(new CustomEvent("ivLyrics:lyric-index-changed", {
			detail: { index: Math.max(0, activeLineIndex - leadingEmptyLines), total }
		}));
	};

	const useLyricIndexNotification = (activeLineIndex, leadingEmptyLines, total, lyricsId) => {
		useEffect(
			() => publishLyricIndex(activeLineIndex, leadingEmptyLines, total),
			[activeLineIndex, leadingEmptyLines, total, lyricsId]
		);
	};

	const syncedManualScrollReturns = new WeakMap();

	const useSyncedLyricsEngine = createSyncedLyricsEngine({
		react,
		getVisualSettings: () => CONFIG.visual,
		getPlayer: () => typeof Spicetify !== "undefined" ? Spicetify.Player : null,
		getSpeakerColors: () => getSpeakerColors(),
		getCurrentTrackDurationMs,
		supportsLineAnimation: () => typeof Element !== "undefined" && typeof Element.prototype?.animate === "function",
		isElement: (element) => element instanceof Element,
		readTransform: (element) => getComputedStyle(element).transform,
		readTimelineTime: () => document.timeline?.currentTime,
		scheduleUpdate: (callback) => typeof queueMicrotask === "function"
			? queueMicrotask(callback)
			: Promise.resolve().then(callback),
		useScrollActivity, usePreparedSyncedLyrics, useLyricIndexNotification, useSyncedLyricsViewport,
		syncedManualScrollReturns, compactLyricsLineMotion, prefersReducedLyricsMotion,
		buildPaddedSyncedLyrics,
		buildSyncedLinePlaybackWindows,
		isAutoInstrumentalBreakEnabled, buildKaraokeCumulativeEndTimes,
		getTrailingKaraokeInterludeInfo, createActiveTrailingKaraokeInterludeLine, getInterludeHandoffState,
		getKaraokeSpeakerStyle, getKaraokeLineMetaClass, getLyricsLineDetailClass,
		shouldHideSyncedLine, prepareLiveSyncedRenderItems, advanceLiveSyncedRenderItems,
	});

	const getKaraokeVisualSettings = () => CONFIG?.visual;
	const { applyKaraokeFillCorrectionCurve, getKaraokeCharFill, getKaraokeLiveFill } =
		createKaraokeFill(getKaraokeVisualSettings);
	const karaokeMotion = createKaraokeMotion({
		getVisualSettings: getKaraokeVisualSettings,
		prefersReducedLyricsMotion,
	});
	const karaokeTextRenderer = createKaraokeTextRenderer({
		react, getKaraokeKindClassParts, getKaraokeInlineSpeakerClass, getKaraokeSpeakerStyle,
		splitKaraokeGraphemes, applyKaraokeFillCorrectionCurve, motion: karaokeMotion,
		buildSharedWordSegments: (chars, options) => getLyricsService()
			?.buildKaraokeWordSegments?.(chars, options),
	});
	const { KaraokeLivePainter, useKaraokeLivePainting, paintKaraokeLiveEntry } = createKaraokeLivePainter({
		useRef, useEffect, useLayoutEffect: react.useLayoutEffect || useEffect,
		getTrackPositionFPS,
		isSettingsOpen: () => document.documentElement.classList.contains("ivlyrics-settings-open")
			|| document.body?.classList.contains("ivlyrics-settings-open"),
		getVisualSettings: getKaraokeVisualSettings,
		prefersReducedLyricsMotion,
		getKaraokeLiveFill,
		splitKaraokeGraphemes,
		motion: karaokeMotion,
		requestFrame: callback => typeof requestAnimationFrame === "function" ? requestAnimationFrame(callback) : null,
	});

	const getPageWordSupplementLanguage = () => readRouteDetectedLyricLanguage(window);
	const useKaraokeWordStackSupplements = createKaraokeWordSupplementHook({
		useMemo, useState, useRef, useEffect,
		getService: getPageWordSupplementService,
		getDetectedLanguage: getPageWordSupplementLanguage,
		getTrackUri: () => readPlayerTrackUri(),
		subscribeInvalidation: listener => {
			if (typeof window.addEventListener !== "function") return undefined;
			window.addEventListener("ivLyrics:word-supplements-invalidated", listener);
			return () => {
				try {
					window.removeEventListener?.("ivLyrics:word-supplements-invalidated", listener);
				} catch { /* ignore */ }
			};
		},
		reportDebug: reportWordStackDebug,
	});
	const prefetchWordSupplementsForLyrics = createWordSupplementPrefetcher({
		getService: getPageWordSupplementService,
		getVisualSettings: () => CONFIG?.visual,
		getDetectedLanguage: getPageWordSupplementLanguage,
		prepareTimedChars: (line, locale) => assignKaraokeWordIndexes(
			applyKaraokeWhitespaceCompensation(buildKaraokeTimedChars(line)),
			line?.karaokeGranularity === "word",
			locale
		),
	});
	registerWordSupplementPrefetcher(prefetchWordSupplementsForLyrics);
	// Compatibility for callers outside the route bundle.
	publishCompatibility("ivLyricsPrefetchWordSupplements", prefetchWordSupplementsForLyrics);

	const { PhoneticFillText, renderPhoneticFillSubLine } = createKaraokePhoneticFill({
		react, KaraokeLivePainter, paintKaraokeLiveEntry, getKaraokeLiveFill,
		getKaraokeInlineSpeakerClass, getKaraokeSpeakerStyle,
		getInactiveColor: () => CONFIG.visual["inactive-color"],
		now: () => performance.now(),
	});
	const KaraokeLine = createKaraokeLine({
		react, PhoneticFillText, motion: karaokeMotion, getKaraokeCharFill, useKaraokeLivePainting, useKaraokeWordStackSupplements,
		getVisualSettings: getKaraokeVisualSettings,
		getLocale: () => readLyricRenderingLocale(window),
		getSpeakerColors: () => getSpeakerColors(),
		getSegmenter: () => getWordSegmenter(),
		getWordSegmentBuilder: () => getLyricsService()?.buildKaraokeWordSegments,
		isFuriganaReady: () => isLyricFuriganaReady(window),
		applyFurigana: (text) => getUtils().applyFuriganaIfEnabled(text),
		prefersReducedLyricsMotion, getKaraokeVocalRows,
		buildKaraokeFuriganaMap, buildKaraokeTimedChars, buildKaraokeVocalRowRenderData, splitKaraokeGraphemes,
		assignKaraokeWordIndexes,
		textRenderer: {
			getKaraokeKindClassParts,
			...karaokeTextRenderer,
		},
	});

	const useLyricsTrackReveal = createLyricsTrackRevealHook({
		react, host: window, readPlayer: () => Spicetify.Player,
		prefersReducedMotion: prefersReducedLyricsMotion,
		requestFrame: requestLyricsLayoutFrame, cancelFrame: cancelLyricsLayoutFrame,
	});

	// Optional blur behind the lyric column (Settings > Appearance). The layer is
	// always mounted but hidden unless the container has lyrics-backdrop-blur-enabled.
	// It is out of flow, so grid placement and the row order are unchanged; while a
	// page is scrolled by hand it follows scrollTop to stay behind the visible rows.
	const LyricsBackdropLayer = react.memo(() => {
		const layerRef = useRef(null);
		useEffect(() => {
			const layer = layerRef.current;
			const page = layer?.parentElement;
			if (!layer || !page) return undefined;
			let lastTop = 0;
			const follow = () => {
				const top = page.scrollTop || 0;
				if (top === lastTop) return;
				lastTop = top;
				layer.style.translate = top ? `0 ${top}px` : "";
			};
			follow();
			page.addEventListener("scroll", follow, { passive: true });
			return () => page.removeEventListener("scroll", follow);
		}, []);
		return react.createElement("div", {
			className: "lyrics-lyricsContainer-LyricsBackdrop",
			ref: layerRef,
			"aria-hidden": "true",
		});
	});

	const SearchBar = createLyricsSearchBar({
		react, browser: window,
		readPathname: () => Spicetify.Platform.History.location.pathname,
		getSearchIcon: () => Spicetify.SVGIcons.search,
		translate: key => I18n.t(key),
	});

	function isInViewport(element) {
		const rect = element.getBoundingClientRect();
		return (
			rect.top >= 0 &&
			rect.left >= 0 &&
			rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
			rect.right <= (window.innerWidth || document.documentElement.clientWidth)
		);
	}

	const UnsyncedLyricsPage = react.memo(({ lyrics = [], trackUri = "", trackRevealKey = null }) => {
		const pageRef = useRef(null);
		const lyricsDisplayMode = CONFIG.visual["translate:display-mode"];
		const furiganaEnabled = !!CONFIG.visual["furigana-enabled"];
		const furiganaReady = isLyricFuriganaReady(window);
		const lyricsLocale = readLyricRenderingLocale(window);
		const lyricsArray = useMemo(() => normalizeUnsyncedLyrics(lyrics), [lyrics]);
		const renderItems = useMemo(() => lyricsArray.map((line, index) => {
			const { text, originalText, text2 } = getEmbeddedAuxiliaryDisplayValues(line);
			const {
				lineText,
				subText,
				showMode2Translation,
				belowMode,
				showMode2,
			} = getUnsyncedLineRenderData(text, originalText, text2);

			return {
				key: index,
				mainText: lineText,
				subText: belowMode ? subText : null,
				subText2: showMode2 ? showMode2Translation : null,
				culturalNote: line?.culturalNote || null,
				mainCopyText: getUtils().formatLyricLineToCopy(
					lineText,
					belowMode ? subText : null,
					showMode2 ? showMode2Translation : null,
					originalText
				),
				subCopyText: belowMode ? subText : null,
				subText2CopyText: showMode2 ? showMode2Translation : null,
				originalText,
			};
		}), [lyricsArray, lyrics, lyricsDisplayMode, furiganaEnabled, furiganaReady, lyricsLocale]);

		useLyricsTrackReveal(pageRef, trackRevealKey, lyricsArray.length > 0);

		if (lyricsArray.length === 0) {
			return react.createElement("div", { className: "lyrics-lyricsContainer-UnsyncedLyricsPage" }, renderLyricsUnavailable(I18n.t("messages.noLyrics")));
		}

		return react.createElement(
			"div",
			{
				className: "lyrics-lyricsContainer-UnsyncedLyricsPage",
				ref: pageRef,
			},
			react.createElement("p", {
				className: "lyrics-lyricsContainer-LyricsUnsyncedPadding",
			}),
			...renderItems.map((item) =>
				react.createElement(LyricsLineBlock, {
					key: item.key,
					className: "lyrics-lyricsContainer-LyricsLine lyrics-lyricsContainer-LyricsLine-active",
					mainText: item.mainText,
					subText: item.subText,
					subText2: item.subText2,
					culturalNote: item.culturalNote,
					originalText: item.originalText,
					mainCopyText: item.mainCopyText,
					subCopyText: item.subCopyText,
					subText2CopyText: item.subText2CopyText,
				})
			),
			react.createElement("p", {
				className: "lyrics-lyricsContainer-LyricsUnsyncedPadding",
			}),

		react.createElement(SearchBar, { key: trackUri, lyricsRoot: pageRef, lyricsRevision: renderItems }),
			react.createElement(LyricsBackdropLayer, null)
		);
	});

	const { renderLyricsUnavailable, NoLyricsAnimation, LyricsUnavailableView } =
		createLyricsUnavailableView({ react, translate: key => I18n.t(key) });

	const { SyncedLyricsPage, SyncedExpandedLyricsPage, useKaraokeLiveClock } = createSyncedLyricsPages({
		react, translate: key => I18n.t(key),
		readInterfaceLanguage: () => I18n.getCurrentLanguage?.(),
		readKaraokeLineTransition: () => CONFIG.visual["karaoke-line-transition"],
		prefersReducedLyricsMotion, useLyricsPlaybackPosition, getFrameAlignedLyricsPlaybackPosition,
		getPseudoKaraokeRenderAdvance, useSyncedLyricsEngine, renderLyricsItems, useLyricsTrackReveal, renderLyricsUnavailable,
		LyricsBackdropLayer, SearchBar,
	});
	const readCompactMode = () => CONFIG.visual["synced-compact"];
	const SyncedLyricsPlaybackTracker = createSyncedLyricsPlaybackTracker({
		react, readCompactMode, getPseudoKaraokeRenderAdvance, useLyricsPlaybackObserver, publishLyricIndex,
	});
	const RouteLyricsPageRenderer = createLyricsPageRenderer({
		react, readCompactMode, getMarketplacePage, CreditFooter, LyricsUnavailableView,
		SyncedLyricsPage, SyncedExpandedLyricsPage, UnsyncedLyricsPage, SyncedLyricsPlaybackTracker,
	});

	const lyricRendererPrimitives = Object.freeze({
		LyricsLineBlock,
		IdlingIndicator,
		useLyricsPlaybackPosition,
		useKaraokeLiveClock,
		getFrameAlignedLyricsPlaybackPosition,
		getPseudoKaraokeRenderAdvance,
		prepareGlobalCharTimeline,
		queryGlobalCharTimeline,
		EMPTY_GLOBAL_CHAR_STATE,
		getInterludeInfo,
		createActiveTrailingKaraokeInterludeLine,
		getEmbeddedAuxiliaryDisplayValues,
		buildLyricDisplayState,
		getKaraokeLineMetaClass,
		getKaraokeSpeakerStyle,
		getLyricsTypographyStyleVariables: (visual = CONFIG?.visual || {}) => getPageLyricsTypography(visual),
		getInterludeHandoffState,
		isInterludeMotionEnabled,
	});

	return {
		LyricsPageRenderer: RouteLyricsPageRenderer, NoLyricsAnimation, KaraokeLine, lyricRendererPrimitives,
	};
}
