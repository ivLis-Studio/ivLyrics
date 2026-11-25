// Word-stack supplements (per-word gloss + per-word reading) for suitable
// source languages. Units are the existing karaoke word units so the sung
// highlight and the annotations share the same grouping. Returns null when
// the line should keep the legacy line-level rendering.
const WORD_SUPPLEMENT_RETRY_MAX = 1;
const WORD_SUPPLEMENT_RETRY_DELAY_MS = 8000;

export function createKaraokeWordSupplementHook({
	useMemo, useState, useRef, useEffect,
	getService, getDetectedLanguage, getTrackUri, subscribeInvalidation, reportDebug,
	schedule = setTimeout, cancelTimer = clearTimeout,
}) {
	return function useKaraokeWordStackSupplements({ line, timedChars, timedText, wordTimed, settingsRevision }) {
		const supplementsApi = getService() || null;
		// Read live each render: song detection lands after early lines mount
		// (auto -> ja). Without this in the deps, those lines keep a stale
		// per-line vote (e.g. "en" for a kanji+English hook) forever.
		let globalLangTick = "auto";
		try {
			globalLangTick = String(
				supplementsApi?.getSourceLanguage?.() ?? getDetectedLanguage() ?? "auto"
			);
		} catch { globalLangTick = "auto"; }
		const sourceLang = useMemo(() => {
			if (!supplementsApi) {
				try {
					return String(getDetectedLanguage() || "auto");
				} catch {
					return "auto";
				}
			}
			try {
				return supplementsApi.resolveSourceLanguage(timedText);
			} catch {
				return "auto";
			}
		}, [supplementsApi, timedText, globalLangTick, settingsRevision]);
		// Pronunciation-first rows already show the reading as the sung text.
		const suitable = !!supplementsApi && !!wordTimed && line?.pronunciationFirst !== true
			&& supplementsApi.isSuitableSourceLanguage(sourceLang);
		const units = useMemo(() => {
			if (!suitable || !supplementsApi) return [];
			try {
				return supplementsApi.getWordUnits(timedChars);
			} catch {
				return [];
			}
		}, [suitable, supplementsApi, timedChars]);
		const readingMode = useMemo(() => {
			if (!suitable || !supplementsApi || units.length === 0) return null;
			try {
				return supplementsApi.resolveReadingMode(sourceLang);
			} catch {
				return null;
			}
		}, [suitable, supplementsApi, sourceLang, units, settingsRevision]);
		const glossActive = useMemo(() => {
			if (!suitable || !supplementsApi || units.length === 0) return false;
			try {
				return supplementsApi.isGlossModeActive(sourceLang);
			} catch {
				return false;
			}
		}, [suitable, supplementsApi, sourceLang, units, settingsRevision]);
		const lineKey = useMemo(() => {
			if (!suitable || !supplementsApi || units.length === 0) return "";
			try {
				return supplementsApi.getLineKey(line, units);
			} catch {
				return "";
			}
		}, [suitable, supplementsApi, line, units]);
		const trackUri = String(getTrackUri() || "");
		const targetLang = supplementsApi?.getGlossTargetLanguage?.() || "";
		const pronunciationNotation = supplementsApi?.getPronunciationNotation?.() || "";
		const unitSignature = useMemo(() => JSON.stringify(units.map(unit => [unit.wordKey, unit.surface])), [units]);
		const sourceKey = useMemo(() => JSON.stringify([trackUri, lineKey, timedText, sourceLang, unitSignature]),
			[trackUri, lineKey, timedText, sourceLang, unitSignature]);
		const readingKey = lineKey && readingMode
			? JSON.stringify([sourceKey, targetLang, readingMode, pronunciationNotation]) : "";
		const glossKey = lineKey && glossActive ? JSON.stringify([sourceKey, targetLang]) : "";
		const [readingResult, setReadingResult] = useState(null);
		const [glossResult, setGlossResult] = useState(null);
		// A pending refresh may reuse only the exact same source/output. Deriving
		// visibility during render also hides another track or target before effects
		// have had a chance to cancel the previous request.
		const readings = useMemo(() => readingKey && readingResult?.key === readingKey
			&& readingResult.api === supplementsApi ? readingResult.values : [], [readingResult, readingKey, supplementsApi]);
		const glosses = useMemo(() => glossKey && glossResult?.key === glossKey
			&& glossResult.api === supplementsApi ? glossResult.values : [], [glossResult, glossKey, supplementsApi]);
		const currentRequestRef = useRef(null);
		currentRequestRef.current = { api: supplementsApi, readingKey, glossKey };
		const [wordRevision, setWordRevision] = useState(0);
		const [wordRetry, setWordRetry] = useState(0);
		useEffect(() => subscribeInvalidation(() => {
			setWordRevision((revision) => revision + 1);
		}), []);
		useEffect(() => {
			if (!readingKey && !glossKey) return undefined;
			let cancelled = false;
			const options = trackUri ? { trackId: trackUri.split(":").pop() } : undefined;
			const publish = (slot, key, setter, values) => {
				if (cancelled || !Array.isArray(values)
					|| currentRequestRef.current?.api !== supplementsApi
					|| currentRequestRef.current?.[slot] !== key || String(getTrackUri() || "") !== trackUri
					|| (supplementsApi.getGlossTargetLanguage?.() || "") !== targetLang
					|| (slot === "readingKey" && (supplementsApi.getPronunciationNotation?.() || "") !== pronunciationNotation)) return;
				setter(previous => previous?.api === supplementsApi && previous.key === key
					&& previous.values.length === values.length && values.every((value, index) => value === previous.values[index])
					? previous : { api: supplementsApi, key, values });
			};
			if (readingKey) {
				supplementsApi.getWordReadings(units, sourceLang, readingMode, timedText, options).then((values) => {
					publish("readingKey", readingKey, setReadingResult, values);
				}).catch(() => { /* Retain a valid same-source reading during transient failures. */ });
			}
			if (glossKey) {
				supplementsApi.getWordGlosses(units, timedText, sourceLang, options).then((values) => {
					publish("glossKey", glossKey, setGlossResult, values);
				}).catch(() => { /* A refresh failure does not unmount an existing word stack. */ });
			}
			return () => {
				cancelled = true;
			};
		}, [supplementsApi, readingKey, glossKey, settingsRevision, wordRevision, wordRetry]);
		// Self-heal: a transient fetch failure (flaky gateway, poisoned batch)
		// leaves rows empty with nothing retrying until a remount (scroll). One
		// delayed retry recovers without user input. Fully-passthrough lines hit
		// memory cache instantly, so the retry is a no-op for them.
		useEffect(() => {
			if (!lineKey || (!readingMode && !glossActive) || wordRetry >= WORD_SUPPLEMENT_RETRY_MAX) {
				return undefined;
			}
			if (!supplementsApi) return undefined;
			if (readings.some((value) => String(value || "").trim())
				|| glosses.some((value) => String(value || "").trim())) {
				return undefined;
			}
			try {
				if (supplementsApi.isAiCoolingDown?.()) return undefined;
			} catch { /* ignore */ }
			const timer = schedule(() => setWordRetry((retry) => retry + 1), WORD_SUPPLEMENT_RETRY_DELAY_MS);
			return () => cancelTimer(timer);
		}, [supplementsApi, lineKey, readingMode, glossActive, readings, glosses, wordRetry]);
		return useMemo(() => {
			const debug = {
				sourceLang,
				suitable,
				wordTimed: !!wordTimed,
				unitCount: units.length,
				readingMode,
				glossActive,
				aiCoolingDown: (() => {
					try {
						return !!supplementsApi?.isAiCoolingDown?.();
					} catch {
						return false;
					}
				})(),
				aiError: (() => {
					try {
						return supplementsApi?.getAiStatus?.().lastError || "";
					} catch {
						return "";
					}
				})(),
				hasReading: readings.some((value) => String(value || "").trim()),
				hasGloss: glosses.some((value) => String(value || "").trim()),
			};
			try {
				reportDebug({ ...debug, at: Date.now() });
			} catch { /* diagnostics must never break rendering */ }
			if (!suitable || units.length === 0) return null;
			if (!debug.hasReading && !debug.hasGloss) return null;
			const supplementByKey = new Map();
			units.forEach((unit, index) => {
				supplementByKey.set(unit.wordKey, {
					gloss: String(glosses[index] || "").trim(),
					reading: String(readings[index] || "").trim(),
				});
			});
			return {
				units,
				supplementByKey,
				hasReading: debug.hasReading,
				hasGloss: debug.hasGloss,
			};
		}, [suitable, units, readings, glosses]);
	};
}
