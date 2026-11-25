import { comfortOf } from "./motionCameraComfort.mjs";
import { PERSPECTIVE_PX } from "./motionCameraFraming.mjs";
import { compose } from "./motionComposition.mjs";
import { critiquePlan } from "./motionCritique.mjs";
import { bestLocalDirection } from "./motionDirectionRequests.mjs";
import {
	buildModel, lineEnergies, modelSignature, pulsesInMs, voicesSignature,
} from "./motionLyricModel.mjs";
import { motionDirector } from "./MotionLyricsDirector.mjs";
import { motionType } from "./MotionLyricsType.mjs";
import { hashString } from "./motionMath.mjs";
import { deepOf, paletteFrom } from "./motionPalette.mjs";
import { UI_FONT, fontNeeds } from "./motionTypesetting.mjs";

export const createStage = (react, {
	browser, translate, detectLanguage, readAnalysisLoader, requestDirection, coverColorsOf, createEngine,
}) => {
	const { useEffect, useLayoutEffect, useMemo, useRef, useState } = react;
	const ANALYSIS_WAIT_MS = 700;
	const FAILED_NOTICE_MS = 6000;
	// A direction that arrives sooner (from the cache) is not announced at all.
	const STATUS_DELAY_MS = 400;
	// How long the AI request waits for the cover's colours.
	const COVER_WAIT_MS = 1200;
	const t = (key, fallback) => translate(key) || fallback;

	/**
	 * onStatus: the app shows the AI direction's progress with its other AI
	 * tasks; it is called with { phase: "loading" | "complete" | "failed" |
	 * "idle", uri }. Without it the stage shows its own notice.
	 * motion: the viewer's comfort ({ intensity, rotation, safe }, comfortOf);
	 * retake: counts the viewer's "direct again" (a new edit each time);
	 * cover: the album cover's URL (its colours go to the AI).
	 */
	return react.memo(({ lyrics = [], trackUri = "", accent = "", isPlaying = false, title = "", artist = "", onStatus = null, motion = null, retake = 0, cover = "" }) => {
		const rootRef = useRef(null);
		const viewportRef = useRef(null);
		const cameraRef = useRef(null);
		const scrimRef = useRef(null);
		const washRef = useRef(null);
		const floodRef = useRef(null);
		const interludeRef = useRef(null);
		const flashRef = useRef(null);
		const panelRef = useRef(null);
		const barsRef = useRef(null);
		const subtitleRef = useRef(null);
		const liveRef = useRef(null);
		const hudShotRef = useRef(null);
		const hudTimeRef = useRef(null);
		const defsRef = useRef(null);
		const engineRef = useRef(null);
		const measureRef = useRef(null);
		const [size, setSize] = useState({ width: 0, height: 0 });
		const [fonts, setFonts] = useState({ key: "", epoch: 0 });
		const [analysis, setAnalysis] = useState({ uri: "", status: "loading", data: null, planned: false });
		const [ai, setAi] = useState({ key: "", status: "idle", raw: null });
		const [showFailure, setShowFailure] = useState(false);
		const [coverInfo, setCoverInfo] = useState({ url: "", colors: null, settled: false });
		const sizeRef = useRef(size);
		sizeRef.current = size;
		const modelRef = useRef({ signature: "", lines: [] });
		const model = useMemo(() => {
			const lines = buildModel(lyrics);
			const signature = trackUri + "\u0002" + modelSignature(lines);
			const shape = signature + "\u0003" + voicesSignature(lines);
			if (shape !== modelRef.current.shape) modelRef.current = { signature, shape, lines };
			return modelRef.current.lines;
		}, [lyrics, trackUri]);
		const signature = modelRef.current.signature;
		const aiKey = String(hashString(signature));
		// The song's language decides Han characters (Japanese, Simplified or Traditional faces).
		const songLang = useMemo(() => {
			try {
				return String(detectLanguage(lyrics) || "");
			} catch {
				return "";
			}
		}, [signature]);
		const typography = useMemo(() => motionType?.typographyOf?.(model, songLang) || [], [model, songLang]);
		// Every "direct again" is a new edit: its own seed (and a new AI take).
		const take = Math.max(0, Math.floor(Number(retake) || 0));
		const seedBase = (hashString(trackUri) + Math.imul(take, 7919)) >>> 0;
		const comfortKey = [motion?.intensity || "", motion?.rotation || "", motion?.safe === true ? "safe" : ""].join("|");
		const comfort = useMemo(() => comfortOf(motion), [comfortKey]);

		useLayoutEffect(() => {
			const element = rootRef.current;
			if (!element) return undefined;
			const update = () => {
				const rect = element.getBoundingClientRect();
				// Small changes (scrollbars, rounding) do not re-plan the song.
				const width = Math.round(rect.width / 16) * 16;
				const height = Math.round(rect.height / 16) * 16;
				setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
			};
			update();
			const observer = typeof browser.ResizeObserver === "function" ? new browser.ResizeObserver(update) : null;
			observer?.observe(element);
			engineRef.current = createEngine({
				stage: element,
				viewport: viewportRef.current,
				camera: cameraRef.current,
				scrim: scrimRef.current,
				wash: washRef.current,
				flood: floodRef.current,
				interlude: interludeRef.current,
				flash: flashRef.current,
				panel: panelRef.current,
				bars: barsRef.current,
				subtitle: subtitleRef.current,
				live: liveRef.current,
				hudShot: hudShotRef.current,
				hudTime: hudTimeRef.current,
				defs: defsRef.current,
			});
			return () => {
				observer?.disconnect();
				engineRef.current?.destroy();
				engineRef.current = null;
			};
		}, []);

		useEffect(() => {
			let cancelled = false;
			setAnalysis({ uri: trackUri, status: "loading", data: null, planned: false });
			const load = readAnalysisLoader?.();
			if (!trackUri || typeof load !== "function") {
				setAnalysis({ uri: trackUri, status: "none", data: null, planned: false });
				return undefined;
			}
			const timer = browser.setTimeout(() => {
				if (!cancelled) setAnalysis((current) => (current.uri === trackUri && current.status === "loading" ? { ...current, status: "late" } : current));
			}, ANALYSIS_WAIT_MS);
			Promise.resolve(load(trackUri)).then((data) => {
				if (cancelled) return;
				setAnalysis((current) => (current.uri !== trackUri ? current : { uri: trackUri, status: "ready", data: data || null, planned: current.status === "loading" }));
			}, () => {
				if (!cancelled) setAnalysis((current) => (current.uri !== trackUri ? current : { ...current, status: "none" }));
			});
			return () => {
				cancelled = true;
				browser.clearTimeout(timer);
			};
		}, [trackUri]);

		const planAnalysis = analysis.planned ? analysis.data : null;
		const tempo = useMemo(() => motionDirector?.tempoOf?.(model, pulsesInMs(planAnalysis)) || null, [model, planAnalysis]);

		// The cover's colours for the AI (it waits a moment for them).
		useEffect(() => {
			let cancelled = false;
			if (!cover) {
				setCoverInfo({ url: "", colors: null, settled: true });
				return undefined;
			}
			setCoverInfo((current) => (current.url === cover ? current : { url: cover, colors: null, settled: false }));
			const timer = browser.setTimeout(() => {
				if (!cancelled) setCoverInfo((current) => (current.url === cover && !current.settled ? { ...current, settled: true } : current));
			}, COVER_WAIT_MS);
			coverColorsOf(cover).then((colors) => {
				if (!cancelled) setCoverInfo({ url: cover, colors, settled: true });
			});
			return () => {
				cancelled = true;
				browser.clearTimeout(timer);
			};
		}, [cover]);
		const coverSettled = !cover || (coverInfo.url === cover && coverInfo.settled);
		const coverRef = useRef(null);
		coverRef.current = coverInfo.url === cover ? coverInfo.colors : null;

		// The AI is asked once the song's analysis is in (or late): it reads each line's energy and the tempo with its BPM.
		const analysisSettled = analysis.uri === trackUri && analysis.status !== "loading";
		useEffect(() => {
			if (!model.length || !trackUri || !analysisSettled || !coverSettled) return undefined;
			let cancelled = false;
			// A new take keeps showing the edit before it until the new one is in.
			setAi((current) => (current.key === aiKey && current.raw ? { ...current, status: "loading" } : { key: aiKey, status: "loading", raw: null }));
			setShowFailure(false);
			const sound = analysis.data || null;
			const requestTempo = motionDirector?.tempoOf?.(model, pulsesInMs(sound)) || tempo;
			const energy = lineEnergies(model, sound);
			// How the AI's direction plays on this screen, watched before it is trusted (critiquePlan).
			const judgeModel = model;
			const judgeTypography = typography;
			const judgeSeed = seedBase;
			const judge = (raw) => {
				const director = motionDirector;
				const checked = director.normalizeDirection(raw, judgeModel, { seed: judgeSeed, energy, tempo: requestTempo });
				return critiquePlan(compose(judgeModel, checked, {
					width: sizeRef.current.width || 1440,
					height: sizeRef.current.height || 900,
					seed: judgeSeed,
					analysis: sound,
					measure: measureRef.current,
					typography: judgeTypography,
					songLang,
				}));
			};
			requestDirection({ trackUri, model, title, artist, tempo: requestTempo, songLang, energy, cover: coverRef.current, judge, retake: take }).then((result) => {
				if (cancelled) return;
				setAi((current) => ({ key: aiKey, status: result.status, raw: result.raw || (current.key === aiKey && result.status === "failed" ? current.raw : null) }));
				if (result.status === "failed") {
					console.warn("[ivLyrics motion] AI direction failed:", result.error);
					setShowFailure(true);
				}
				// The AI's revision of its own direction, when it came out better: shown from the next cut.
				Promise.resolve(result.revised).then((better) => {
					if (!cancelled && better) setAi({ key: aiKey, status: "ready", raw: better });
				});
			});
			return () => { cancelled = true; };
		}, [aiKey, analysisSettled, coverSettled, take]);

		useEffect(() => {
			if (!showFailure) return undefined;
			const timer = browser.setTimeout(() => setShowFailure(false), FAILED_NOTICE_MS);
			return () => browser.clearTimeout(timer);
		}, [showFailure]);

		const chosen = useMemo(() => {
			const director = motionDirector;
			if (!director || !model.length) return null;
			const options = { seed: seedBase, energy: lineEnergies(model, planAnalysis), tempo };
			if (ai.key === aiKey && ai.raw) return { direction: director.normalizeDirection(ai.raw, model, options), seed: seedBase };
			// Once it is clear no AI direction is coming, the built-in one is the best of a few takes.
			if (ai.key === aiKey && (ai.status === "off" || ai.status === "failed")) {
				const best = bestLocalDirection(model, options, { typography, songLang, analysis: planAnalysis });
				if (best) return best;
			}
			return { direction: director.localDirection(model, options), seed: seedBase };
		}, [ai, aiKey, model, seedBase, planAnalysis, tempo, typography, songLang]);
		const direction = chosen?.direction || null;
		const planSeed = chosen?.seed ?? seedBase;
		const palette = useMemo(() => paletteFrom(accent, direction?.palette), [accent, direction]);

		// The faces this direction sets load before it is composed (bounded),
		// and a face that arrives later re-measures the edit at the next cut.
		const needs = useMemo(() => (direction ? fontNeeds(model, direction, typography, [title, artist]) : new Map()), [direction, typography, title, artist]);
		const needsKey = useMemo(() => [...needs.keys()].sort().join("\u0001"), [needs]);
		useEffect(() => {
			let cancelled = false;
			const document = browser.document;
			motionType?.ensureFonts?.(document, needs).then(() => {
				if (cancelled) return;
				measureRef.current = motionType?.createMeasurer?.(document) || null;
				setFonts((current) => ({ key: needsKey, epoch: current.epoch + 1 }));
			});
			const fontSet = document?.fonts;
			const late = () => {
				if (cancelled) return;
				measureRef.current = motionType?.createMeasurer?.(document) || null;
				setFonts((current) => (current.key === needsKey ? { key: needsKey, epoch: current.epoch + 1 } : current));
			};
			fontSet?.addEventListener?.("loadingdone", late);
			return () => {
				cancelled = true;
				fontSet?.removeEventListener?.("loadingdone", late);
			};
		}, [needsKey]);

		const fontsReady = fonts.key === needsKey && fonts.epoch > 0;
		const planReady = analysis.uri === trackUri && analysis.status !== "loading" && fontsReady;
		const plan = useMemo(() => {
			if (!planReady || !size.width || !size.height || !direction) return null;
			return compose(model, direction, {
				width: size.width,
				height: size.height,
				seed: planSeed,
				analysis: planAnalysis,
				measure: measureRef.current,
				typography,
				songLang,
				title,
				artist,
				motion: comfort,
			});
		}, [planReady, direction, size.width, size.height, fonts.epoch, planAnalysis, typography, title, artist, comfort, planSeed]);

		useEffect(() => { engineRef.current?.setLyrics(lyrics); }, [lyrics]);
		const shownRef = useRef({ direction: null, size: "" });
		useEffect(() => {
			// A new direction or a late face for the same song and size waits for a cut.
			const sizeKey = size.width + "x" + size.height;
			const soft = !!plan && !!shownRef.current.direction && shownRef.current.size === sizeKey;
			if (plan) shownRef.current = { direction, size: sizeKey };
			engineRef.current?.setPlan(plan, trackUri, { soft });
		}, [plan, trackUri]);
		useEffect(() => { engineRef.current?.setPulses(pulsesInMs(analysis.data)); }, [analysis.data]);
		useEffect(() => { engineRef.current?.setPlaying(isPlaying); }, [isPlaying]);

		const status = ai.status === "loading" && ai.key === aiKey
			? { kind: "loading", text: t("vinyl.presentation.motionDirecting", "AI is directing the motion…") }
			: showFailure
				? { kind: "failed", text: t("vinyl.presentation.motionDirectFailed", "AI direction failed. Using the built-in direction.") }
				: null;

		// The app's status list: loading once the AI takes a while, then done or failed.
		const onStatusRef = useRef(onStatus);
		onStatusRef.current = onStatus;
		const reportedRef = useRef(null);
		const reports = typeof onStatus === "function";
		const loading = ai.status === "loading" && ai.key === aiKey;
		useEffect(() => {
			if (!reports) return undefined;
			if (loading) {
				const timer = browser.setTimeout(() => {
					reportedRef.current = { key: aiKey, uri: trackUri };
					onStatusRef.current?.({ phase: "loading", uri: trackUri });
				}, STATUS_DELAY_MS);
				return () => browser.clearTimeout(timer);
			}
			const reported = reportedRef.current;
			if (reported) {
				reportedRef.current = null;
				const phase = reported.key !== ai.key ? "idle" : ai.status === "ready" ? "complete" : ai.status === "failed" ? "failed" : "idle";
				onStatusRef.current?.({ phase, uri: reported.uri });
			}
			return undefined;
		}, [reports, loading, ai.status, ai.key, aiKey, trackUri]);
		useEffect(() => () => {
			const reported = reportedRef.current;
			reportedRef.current = null;
			if (reported) onStatusRef.current?.({ phase: "idle", uri: reported.uri });
		}, []);

		const e = react.createElement;
		return e("div", {
			ref: rootRef,
			className: "ivlyrics-motion-stage",
			"data-mood": direction?.mood || "warm",
			"data-tempo": direction?.tempo?.tempo || "mid",
			"data-source": direction?.source || "local",
			style: {
				"--iv-motion-accent": palette[0],
				"--iv-motion-accent-2": palette[1],
				"--iv-motion-deep": deepOf(palette[0]),
				"--iv-motion-deep-2": deepOf(palette[1]),
				"--iv-motion-perspective": PERSPECTIVE_PX + "px",
				"--iv-motion-ui": UI_FONT,
			},
		},
			e("div", { ref: scrimRef, className: "ivlyrics-motion-scrim", "aria-hidden": "true" }),
			// The outline filters (createOutlines) are added here by the engine.
			e("svg", { ref: defsRef, className: "ivlyrics-motion-defs", width: 0, height: 0, "aria-hidden": "true", focusable: "false" }),
			e("div", { ref: washRef, className: "ivlyrics-motion-wash", "aria-hidden": "true" }),
			e("div", { ref: floodRef, className: "ivlyrics-motion-flood", "aria-hidden": "true" }),
			// Scenes while no lyrics are on screen (the intro, instrumental breaks, the outro).
			e("div", { ref: interludeRef, className: "ivlyrics-motion-interludes", "aria-hidden": "true" }),
			e("div", { ref: viewportRef, className: "ivlyrics-motion-viewport", "aria-hidden": "true" },
				e("div", { ref: cameraRef, className: "ivlyrics-motion-camera" })),
			e("div", { ref: panelRef, className: "ivlyrics-motion-panel", "aria-hidden": "true" }),
			e("div", { ref: barsRef, className: "ivlyrics-motion-bars", "aria-hidden": "true" },
				e("div", { className: "ivlyrics-motion-bar is-top" }),
				e("div", { className: "ivlyrics-motion-bar is-bottom" })),
			e("div", { ref: flashRef, className: "ivlyrics-motion-flash", "aria-hidden": "true" }),
			e("div", { className: "ivlyrics-motion-hud", "aria-hidden": "true" },
				e("div", { className: "ivlyrics-motion-hud-title" },
					e("span", { className: "ivlyrics-motion-hud-strong" }, title),
					artist ? e("span", null, artist) : null),
				e("div", { className: "ivlyrics-motion-hud-shot" },
					e("span", { ref: hudShotRef }),
					direction?.source === "ai" ? e("span", { className: "ivlyrics-motion-hud-ai" }, "AI") : null),
				e("div", { ref: hudTimeRef, className: "ivlyrics-motion-hud-time" })),
			status && !reports ? e("div", { className: "ivlyrics-motion-status is-" + status.kind, role: "status" },
				e("span", { className: "ivlyrics-motion-status-dot", "aria-hidden": "true" }), status.text) : null,
			e("div", { ref: subtitleRef, className: "ivlyrics-motion-subtitle", "aria-hidden": "true" }),
			e("div", { ref: liveRef, className: "ivlyrics-motion-live", "aria-live": "polite" })
		);
	});
};
