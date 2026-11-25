import { readSettingsPersistence, readSettingsStorage } from "../core/settingsRuntime.mjs";
// Pronunciation-first display mode.
//
// The lyric page keeps its slots (the original row and its typography, the
// smaller pronunciation row and its typography) and only swaps the values
// shown in them: the pronunciation fills the original row, and the original
// moves to the pronunciation row. Lines without a pronunciation are left as
// they are.
//
// Karaoke rows also need timing for the pronunciation. Songs with word or
// character timing get their pronunciation generated per sung unit
// (PronunciationSlots.js), so the part sung during each karaoke syllable is
// derived locally and keeps that syllable's timing. Lines without those
// slots (older caches, timing that arrived after the pronunciation) send
// their units and existing pronunciation to AI, which returns the part sung
// during each unit. Until either is known (or when no AI provider can do
// it) the pronunciation is spread over the units in proportion to length.
//
// The same unit timing also drives the optional pronunciation fill: with
// pronunciation-first off, the pronunciation row under each karaoke line is
// filled along these units (no bounce, glow or other karaoke effects).
import { getRuntimeService } from "../spicetify/runtimeServices.mjs";
import { createPronunciationPresentation } from "./createPronunciationPresentation.mjs";
import { createPronunciationTiming } from "./createPronunciationTiming.mjs";
import {
	readPronunciationFirst, readPronunciationSlots, publishPronunciationFirst,
	PRONUNCIATION_UPDATED_EVENT as UPDATED_EVENT,
} from "./pronunciationRuntime.mjs";

export default function initializePronunciationFirst() {
	const host = window;
	if (readPronunciationFirst(host)?.initialized) return;

	const SETTING = "pronunciation-first";
	const FILL_SETTING = "pronunciation-karaoke-fill";
	// Synced pronunciation (Settings > Karaoke mode). Off by default: the
	// pronunciation is plain line text. On, karaoke pronunciation is requested
	// with unit timing, and pronunciation-first and the fill become available.
	const SYNC_SETTING = "synced-pronunciation";
	const STORAGE_KEY = "ivLyrics:visual:" + SETTING;
	const CHANGED_EVENT = "ivLyrics:pronunciation-first-changed";
	const STATUS_EVENT = "ivLyrics:pronunciation-sync:status";

	const readService = (name) => getRuntimeService(name, host);
	const getConfig = () => readService("CONFIG");
	const presentation = createPronunciationPresentation(() => readService("LyricsWordSegmenter")?.segmentGraphemes);
	const { getUnitGroups, distribute, normalizeParts, alignParts, swapLine, applyToLines, applyFillToLines } = presentation;

	const readStoredSetting = (setting = SETTING) => {
		try {
			const key = "ivLyrics:visual:" + setting;
			const value = readSettingsPersistence(window)?.getItem?.(key)
				?? localStorage.getItem(key);
			return value === true || value === "true";
		} catch {
			return false;
		}
	};

	const readSetting = (setting) => {
		const visual = getConfig()?.visual;
		if (visual && Object.prototype.hasOwnProperty.call(visual, setting)) return visual[setting] === true;
		return readStoredSetting(setting);
	};

	/** Whether synced pronunciation is on. */
	const isSyncedEnabled = () => readSetting(SYNC_SETTING);

	const isEnabled = () => isSyncedEnabled() && readSetting(SETTING);

	/** Pronunciation fill along karaoke timing while pronunciation-first is off. */
	const isFillEnabled = () => isSyncedEnabled() && !readSetting(SETTING) && readSetting(FILL_SETTING);

	/** Whether either display needs AI unit timing for the pronunciation. */
	const needsTiming = () => isSyncedEnabled() && (readSetting(SETTING) || readSetting(FILL_SETTING));

	const setEnabled = (enabled) => {
		const value = enabled === true;
		const config = getConfig();
		if (config?.visual) config.visual[SETTING] = value;
		try {
			const storageManager = readSettingsStorage(window);
			const persistence = readSettingsPersistence(window);
			if (storageManager?.saveConfig) {
				storageManager.saveConfig(SETTING, value);
			} else if (persistence?.setItem) {
				persistence.setItem(STORAGE_KEY, String(value));
			} else {
				localStorage.setItem(STORAGE_KEY, String(value));
			}
		} catch (error) {
			console.warn("[ivLyrics] Could not save pronunciation-first mode:", error);
		}
		if (!needsTiming()) cancelPending();
		host.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { enabled: value } }));
		host.dispatchEvent(new CustomEvent("ivLyrics", { detail: { type: "config", name: SETTING, value } }));
		return value;
	};

	const toggle = () => setEnabled(!isEnabled());

	// The settings page changes these through the shared config event; the
	// displays listening for this module's change event refresh with them.
	host.addEventListener?.("ivLyrics", (event) => {
		const detail = event?.detail;
		if (detail?.type !== "config" || (detail.name !== SYNC_SETTING && detail.name !== FILL_SETTING)) return;
		if (!needsTiming()) cancelPending();
		host.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { enabled: isEnabled() } }));
	});

	// Singing along reads slightly ahead of the voice: while pronunciation
	// first is shown, the lyric clock runs this much earlier. It is not a
	// sync offset and never appears in the offset settings.
	const LEAD_MS = 200;
	let displayed = false;
	/** Set by the lyric page: whether its rows currently show pronunciation first. */
	const setDisplayed = (value) => {
		displayed = value === true;
	};
	/** Milliseconds the lyric page clock runs ahead (0 unless pronunciation first is shown). */
	const getLeadMs = () => (displayed && isEnabled() ? LEAD_MS : 0);

	const { buildTimingItems, ensureTimed, getTimed, getStatuses, releaseTimed, clearTrack, cancelPending } = createPronunciationTiming({
		presentation,
		getService: readService,
		getSlots: () => readPronunciationSlots(host),
		needsTiming,
		emitStatus: (uri, requestId, phase) =>
			host.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: { uri, requestId, phase } })),
		notifyAvailable: trackUri =>
			host.dispatchEvent(new CustomEvent(UPDATED_EVENT, { detail: { trackUri } })),
	});

	publishPronunciationFirst(host, Object.freeze({
		initialized: true,
		SETTING,
		FILL_SETTING,
		SYNC_SETTING,
		CHANGED_EVENT,
		UPDATED_EVENT,
		STATUS_EVENT,
		isSyncedEnabled,
		isEnabled,
		isFillEnabled,
		needsTiming,
		setEnabled,
		toggle,
		LEAD_MS,
		setDisplayed,
		getLeadMs,
		getUnitGroups,
		distribute,
		normalizeParts,
		alignParts,
		swapLine,
		applyToLines,
		applyFillToLines,
		buildTimingItems,
		ensureTimed,
		getTimed,
		getStatuses,
		releaseTimed,
		clearTrack,
	}));
}
