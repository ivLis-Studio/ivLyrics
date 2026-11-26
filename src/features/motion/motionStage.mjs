import { comfortOf } from "./motionCameraComfort.mjs";
import { PERSPECTIVE_PX } from "./motionCameraFraming.mjs";
import { compose } from "./motionComposition.mjs";
import { bestLocalDirection } from "./motionDirectionRequests.mjs";
import {
	buildModel, lineEnergies, modelSignature, pulsesInMs, sameMotionModelTiming,
} from "./motionLyricModel.mjs";
import { motionDirector } from "./MotionLyricsDirector.mjs";
import { motionType } from "./MotionLyricsType.mjs";
import { hashString } from "./motionMath.mjs";
import { deepOf, paletteFrom } from "./motionPalette.mjs";
import { UI_FONT, fontNeeds } from "./motionTypesetting.mjs";
import { useMotionStageDirection } from "./motionStageDirection.mjs";

export const createStage = (react, {
	browser, translate, detectLanguage, readAnalysisLoader, requestDirection, coverColorsOf, createEngine,
}) => {
	const { useEffect, useLayoutEffect, useMemo, useRef, useState } = react;
	const ANALYSIS_WAIT_MS = 700;
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
		const [coverInfo, setCoverInfo] = useState({ url: "", colors: null, settled: false });
		const sizeRef = useRef(size);
		sizeRef.current = size;
		const modelRef = useRef({ signature: "", lines: [] });
		const model = useMemo(() => {
			const lines = buildModel(lyrics);
			const signature = trackUri + "\u0002" + modelSignature(lines);
			const current = modelRef.current;
			if (signature !== current.signature || !sameMotionModelTiming(lines, current.lines)) {
				modelRef.current = { signature, lines };
			}
			return modelRef.current.lines;
		}, [lyrics, trackUri]);
		const signature = modelRef.current.signature;
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
			Promise.resolve().then(() => load(trackUri)).then((data) => {
				browser.clearTimeout(timer);
				if (cancelled) return;
				setAnalysis((current) => (current.uri !== trackUri ? current : { uri: trackUri, status: "ready", data: data || null, planned: current.status === "loading" }));
			}, () => {
				browser.clearTimeout(timer);
				if (!cancelled) setAnalysis((current) => (current.uri !== trackUri ? current : { ...current, status: "none" }));
			});
			return () => {
				cancelled = true;
				browser.clearTimeout(timer);
			};
		}, [trackUri]);

		const currentAnalysis = analysis.uri === trackUri ? analysis.data : null;
		const planAnalysis = analysis.planned ? currentAnalysis : null;
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
			const settle = (colors) => {
				browser.clearTimeout(timer);
				if (!cancelled) setCoverInfo({ url: cover, colors, settled: true });
			};
			Promise.resolve().then(() => coverColorsOf(cover)).then(settle, () => settle(null));
			return () => {
				cancelled = true;
				browser.clearTimeout(timer);
			};
		}, [cover]);
		const coverSettled = !cover || (coverInfo.url === cover && coverInfo.settled);
		const coverRef = useRef(null);
		coverRef.current = coverInfo.url === cover ? coverInfo.colors : null;

		const analysisSettled = analysis.uri === trackUri && analysis.status !== "loading";
		const { ai, loading, showFailure } = useMotionStageDirection({
			react, browser, requestDirection, onStatus,
			song: { trackUri, signature, model, title, artist, songLang, typography, tempo, take, seedBase },
			inputs: { ready: analysisSettled && coverSettled, sound: currentAnalysis, coverRef, sizeRef, measureRef },
		});

		const chosen = useMemo(() => {
			const director = motionDirector;
			if (!director || !model.length) return null;
			const options = { seed: seedBase, energy: lineEnergies(model, planAnalysis), tempo };
			if (ai.key === signature && ai.raw) return { direction: director.normalizeDirection(ai.raw, model, options), seed: seedBase };
			// Once it is clear no AI direction is coming, the built-in one is the best of a few takes.
			if (ai.key === signature && (ai.status === "off" || ai.status === "failed")) {
				const best = bestLocalDirection(model, options, { typography, songLang, analysis: planAnalysis });
				if (best) return best;
			}
			return { direction: director.localDirection(model, options), seed: seedBase };
		}, [ai, signature, model, seedBase, planAnalysis, tempo, typography, songLang]);
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
		const shownRef = useRef(null);
		useEffect(() => {
			// A new direction or a late face can wait for a cut. Updated syllable
			// timing applies immediately so the camera follows the current marks.
			const sizeKey = size.width + "x" + size.height;
			const shown = shownRef.current;
			const soft = !!plan && shown?.model === model && shown.size === sizeKey;
			shownRef.current = plan ? { model, size: sizeKey } : null;
			engineRef.current?.setPlan(plan, trackUri, { soft });
		}, [plan, trackUri, model, size.width, size.height]);
		useEffect(() => { engineRef.current?.setPulses(pulsesInMs(currentAnalysis)); }, [currentAnalysis]);
		useEffect(() => { engineRef.current?.setPlaying(isPlaying); }, [isPlaying]);

		const status = loading
			? { kind: "loading", text: t("vinyl.presentation.motionDirecting", "AI is directing the motion…") }
			: showFailure
				? { kind: "failed", text: t("vinyl.presentation.motionDirectFailed", "AI direction failed. Using the built-in direction.") }
				: null;

		const reports = typeof onStatus === "function";
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
