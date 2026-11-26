import { compose } from "./motionComposition.mjs";
import { critiquePlan } from "./motionCritique.mjs";
import { lineEnergies, pulsesInMs } from "./motionLyricModel.mjs";
import { motionDirector } from "./MotionLyricsDirector.mjs";

const STATUS_DELAY_MS = 400;
const FAILED_NOTICE_MS = 6000;

export function useMotionStageDirection({
	react, browser, requestDirection, onStatus,
	song: { trackUri, signature, model, title, artist, songLang, typography, tempo, take, seedBase },
	inputs: { ready, sound, coverRef, sizeRef, measureRef },
}) {
	const { useEffect, useRef, useState } = react;
	const [ai, setAi] = useState({ key: "", status: "idle", raw: null });
	const [showFailure, setShowFailure] = useState(null);
	const matches = ai.key === signature && ai.take === take;
	const loading = matches && ai.status === "loading";

	useEffect(() => {
		if (!model.length || !trackUri || !ready) return undefined;

		const controller = new AbortController();
		const { signal } = controller;
		const identity = { key: signature, take, requestId: signal };
		// Keep the preceding edit visible until a new take is ready.
		setAi(current => ({
			...identity, status: "loading", raw: current.key === signature ? current.raw : null,
		}));
		const requestTempo = motionDirector.tempoOf(model, pulsesInMs(sound)) || tempo;
		const energy = lineEnergies(model, sound);
		const judge = raw => {
			const checked = motionDirector.normalizeDirection(raw, model, { seed: seedBase, energy, tempo: requestTempo });
			return critiquePlan(compose(model, checked, {
				width: sizeRef.current.width || 1440,
				height: sizeRef.current.height || 900,
				seed: seedBase,
				analysis: sound,
				measure: measureRef.current,
				typography,
				songLang,
			}));
		};
		const receive = result => {
			if (signal.aborted) return;
			setAi(current => ({
				...identity,
				status: result.status,
				raw: result.raw || (current.key === signature && result.status === "failed" ? current.raw : null),
			}));
			if (result.status === "failed") {
				console.warn("[ivLyrics motion] AI direction failed:", result.error);
				setShowFailure(signal);
			}
			result.revised?.then(better => {
				if (!signal.aborted && better) setAi({ ...identity, status: "ready", raw: better });
			});
		};
		requestDirection({ trackUri, model, title, artist, tempo: requestTempo, songLang, energy,
			cover: coverRef.current, judge, retake: take, signal }).then(receive);

		return () => controller.abort();
	}, [signature, take, ready]);

	useEffect(() => {
		if (!showFailure) return undefined;
		const timer = browser.setTimeout(() => setShowFailure(null), FAILED_NOTICE_MS);
		return () => browser.clearTimeout(timer);
	}, [showFailure]);

	const onStatusRef = useRef(onStatus);
	onStatusRef.current = onStatus;
	const reportedRef = useRef(null);
	const reports = typeof onStatus === "function";
	useEffect(() => {
		const reported = reportedRef.current;
		if (reported && (!reports || !loading || reported.requestId !== ai.requestId)) {
			reportedRef.current = null;
			const phase = !matches || reported.requestId !== ai.requestId
				? "idle" : ai.status === "ready" ? "complete" : ai.status === "failed" ? "failed" : "idle";
			reported.notify({ phase, uri: reported.uri, requestId: reported.requestId });
		}
		// Cached replies usually finish before the notice is visible.
		if (!reports || !loading || reportedRef.current) return undefined;
		const timer = browser.setTimeout(() => {
			if (ai.requestId.aborted) return;
			const notify = onStatusRef.current;
			if (!notify) return;
			reportedRef.current = { uri: trackUri, requestId: ai.requestId, notify };
			notify({ phase: "loading", uri: trackUri, requestId: ai.requestId });
		}, STATUS_DELAY_MS);
		return () => browser.clearTimeout(timer);
	}, [reports, loading, matches, ai.status, ai.requestId, trackUri]);

	useEffect(() => () => {
		const reported = reportedRef.current;
		reportedRef.current = null;
		if (reported) reported.notify({ phase: "idle", uri: reported.uri, requestId: reported.requestId });
	}, []);

	return { ai, loading, showFailure: matches && showFailure === ai.requestId };
}
