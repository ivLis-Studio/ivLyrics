// Motion lyrics on mobile: runs the desktop presentation (the Stage of
// the same modules as Spicetify) in an iOS or Android WebView laid over the
// app's own background. The app sends the song and the playback position
// and answers two kinds of request (an AI direction, the direction cache);
// this file stands in for the parts of the desktop app the Stage reads:
// React (Preact), the playback clock, the AI provider manager, the cache.
//
// The page is built by .github/scripts/build_motion_mobile.mjs. This file
// loads after Preact and before the motion scripts.
//
// App to page:   ivLyricsMotionHost.configure / setTrack / setPlayback / resolve / redirect
// Page to app:   { type: "ready" | "eligible" | "direct" | "cacheGet" |
//                  "cacheSet" | "background" | "error", ... }
(function IvLyricsMotionMobileHost(root) {
	"use strict";

	if (root.ivLyricsMotionHost?.initialized) return;

	const preact = root.preact;
	const hooks = root.preactHooks;
	const document = root.document;
	const now = () => root.performance.now();

	// Outlines keep the plain text stroke here: the filtered outlines each take a layer of their own (motionDomEffects.mjs, createOutlines).
	root.ivLyricsMotionConfig = Object.freeze({ ...root.ivLyricsMotionConfig, shapedOutlines: false });

	// An AI direction of a long song can take a while; the built-in direction plays meanwhile.
	const AI_TIMEOUT_MS = 180000;
	const CACHE_TIMEOUT_MS = 4000;
	// Position reports this close to the running clock are reporting jitter: the clock eases toward them.
	const CLOCK_SNAP_MS = 120;
	const CLOCK_EASE = 0.2;
	const LABEL_KEYS = Object.freeze({
		"vinyl.presentation.motionDirecting": "directing",
		"vinyl.presentation.motionDirectFailed": "failed",
	});

	const state = {
		container: null,
		track: null,
		trackJson: "",
		eligible: false,
		playing: false,
		clock: { position: 0, at: 0, rate: 1 },
		labels: {},
		ai: false,
		background: false,
		// The viewer's comfort ({ intensity, rotation, safe }) and "direct again" counted per song.
		motion: null,
		take: { uri: "", count: 0 },
	};

	// ---------------------------------------------------------------------
	// Messages to the app, and the requests it answers
	// ---------------------------------------------------------------------

	const post = (message) => {
		try {
			const ios = root.webkit?.messageHandlers?.ivLyricsMotion;
			if (ios) ios.postMessage(message);
			else root.ivLyricsMotionNative?.postMessage?.(JSON.stringify(message));
		} catch {
			// No app is listening (a browser preview).
		}
	};

	let nextRequest = 1;
	const pending = new Map();
	const ask = (message, timeoutMs) => new Promise((resolve, reject) => {
		const id = nextRequest;
		nextRequest += 1;
		const timer = root.setTimeout(() => {
			pending.delete(id);
			reject(new Error("The app did not answer in time"));
		}, timeoutMs);
		pending.set(id, { resolve, reject, timer });
		post({ ...message, id });
	});
	/** The app's answer to a request: { ok: true, value } or { ok: false, error }. */
	const resolve = (id, result) => {
		const request = pending.get(Number(id));
		if (!request) return;
		pending.delete(Number(id));
		root.clearTimeout(request.timer);
		if (result?.ok === true) request.resolve(result.value ?? null);
		else request.reject(new Error(String(result?.error || "The request failed")));
	};

	// ---------------------------------------------------------------------
	// Playback clock
	// ---------------------------------------------------------------------

	const positionAt = (time) => {
		const clock = state.clock;
		return state.playing ? clock.position + (time - clock.at) * clock.rate : clock.position;
	};

	/** position in milliseconds (with the app's sync offset applied), playing, rate. */
	const setPlayback = ({ position, playing, rate } = {}) => {
		const time = now();
		const wasPlaying = state.playing;
		const isPlaying = playing === true;
		const speed = Number(rate) > 0 ? Number(rate) : 1;
		const current = positionAt(time);
		const reported = Number.isFinite(Number(position)) ? Number(position) : current;
		const running = wasPlaying && isPlaying && speed === state.clock.rate;
		const drift = reported - current;
		// A seek or a state change takes the report as it is; while running, small drift is eased out.
		const next = running && Math.abs(drift) <= CLOCK_SNAP_MS ? current + drift * CLOCK_EASE : reported;
		state.clock = { position: next, at: time, rate: speed };
		if (isPlaying !== wasPlaying) {
			state.playing = isPlaying;
			render();
		}
	};

	// ---------------------------------------------------------------------
	// What the Stage reads from the desktop app
	// ---------------------------------------------------------------------

	const trackIdOf = (uri) => String(uri || "").split(":").pop() || String(uri || "");
	const cacheKey = (trackId, sourceHash) => "motion-direction:" + trackId + ":" + sourceHash;

	/** The direction object in an AI answer (providers wrap it in prose or a code fence at times). */
	const parseDirection = (answer) => {
		if (answer && typeof answer === "object") return answer;
		const text = String(answer ?? "");
		const start = text.indexOf("{");
		const end = text.lastIndexOf("}");
		if (start < 0 || end <= start) throw new Error("The AI answer holds no direction");
		return JSON.parse(text.slice(start, end + 1));
	};

	root.Spicetify = {
		React: {
			createElement: preact.h,
			// The page renders only when a prop changed, so the Stage needs no memo.
			memo: (component) => component,
			useEffect: hooks.useEffect,
			useLayoutEffect: hooks.useLayoutEffect,
			useMemo: hooks.useMemo,
			useRef: hooks.useRef,
			useState: hooks.useState,
		},
		Player: {
			getProgress: () => positionAt(now()),
			get data() {
				return { item: { uri: state.track?.uri || "" } };
			},
		},
	};
	root.ivLyricsLyricRendererPrimitives = {
		getFrameAlignedLyricsPlaybackPosition: (frameTime) => positionAt(Number.isFinite(frameTime) ? frameTime : now()),
	};
	root.Utils = {
		extractTrackId: trackIdOf,
		getPlayerPlaybackSnapshot: () => ({ uri: state.track?.uri || "" }),
	};
	root.LyricsService = { detectLanguage: () => state.track?.language || "" };
	root.I18n = { t: (key) => state.labels[LABEL_KEYS[key]] || "" };
	root.AIAddonManager = {
		getEnabledProvidersFor: (capability) => (capability === "motionDirection" && state.ai ? [{ id: "app" }] : []),
		async generateMotionDirection(params) {
			const prompt = root.ivLyricsMotionDirector.buildPrompt(params);
			const direction = parseDirection(await ask({ type: "direct", prompt }, AI_TIMEOUT_MS));
			if (!Array.isArray(direction?.shots) || !direction.shots.length) throw new Error("The AI direction has no shots");
			return direction;
		},
	};
	root.LyricsCache = {
		async getMotionDirection(trackId, sourceHash) {
			const value = await ask({ type: "cacheGet", key: cacheKey(trackId, sourceHash) }, CACHE_TIMEOUT_MS);
			return value ? JSON.parse(value) : null;
		},
		async setMotionDirection(trackId, sourceHash, data) {
			post({ type: "cacheSet", key: cacheKey(trackId, sourceHash), value: JSON.stringify(data) });
		},
	};

	// ---------------------------------------------------------------------
	// The stage
	// ---------------------------------------------------------------------

	const render = () => {
		if (!state.container) return;
		const Stage = root.ivLyricsMotionLyrics?.Stage;
		const track = state.track;
		const stage = Stage && track && state.eligible
			? preact.h(Stage, {
				lyrics: track.lyrics,
				trackUri: track.uri,
				accent: track.accent,
				isPlaying: state.playing,
				title: track.title,
				artist: track.artist,
				motion: state.motion,
				retake: state.take.uri === track.uri ? state.take.count : 0,
				cover: track.cover,
			})
			: null;
		preact.render(stage, state.container);
	};

	/**
	 * The song: { uri, title, artist, accent, cover?, language, karaokeSource, lyrics }
	 * (cover: the album art's URL, its colours go to the AI).
	 * lyrics are lines as the desktop app holds them: { text, startTime,
	 * endTime, syllables: [{ text, startTime, endTime }], vocals?, text2? }.
	 * null clears the stage.
	 */
	const setTrack = (track) => {
		const json = track ? JSON.stringify(track) : "";
		if (json === state.trackJson) return;
		state.trackJson = json;
		const motion = root.ivLyricsMotionLyrics;
		const lyrics = Array.isArray(track?.lyrics) ? track.lyrics : [];
		state.track = track ? {
			uri: String(track.uri || ""),
			title: String(track.title || ""),
			artist: String(track.artist || ""),
			accent: String(track.accent || ""),
			cover: String(track.cover || ""),
			language: String(track.language || ""),
			lyrics,
		} : null;
		// Real word or character timing only, as on desktop: estimated timing would move the words off the singing.
		state.eligible = !!state.track?.uri
			&& motion?.hasRealTiming?.(lyrics, true, track.karaokeSource || null) === true
			&& motion.buildModel(lyrics).length > 0;
		post({ type: "eligible", uri: state.track?.uri || "", value: state.eligible });
		render();
	};

	/**
	 * labels: { directing, failed }; ai: the app can ask a provider; insets: safe area in CSS pixels; hud; background;
	 * motion: the viewer's comfort { intensity: calm | normal | wild, rotation: full | gentle | off, safe: boolean }.
	 */
	const configure = (options = {}) => {
		if (options.labels && typeof options.labels === "object") state.labels = { ...options.labels };
		if (typeof options.ai === "boolean") state.ai = options.ai;
		if (typeof options.background === "boolean") state.background = options.background;
		if (options.motion && typeof options.motion === "object") {
			const next = { intensity: String(options.motion.intensity || "normal"), rotation: String(options.motion.rotation || "full"), safe: options.motion.safe === true };
			const current = state.motion;
			if (!current || current.intensity !== next.intensity || current.rotation !== next.rotation || current.safe !== next.safe) state.motion = Object.freeze(next);
		}
		const style = document.documentElement.style;
		for (const side of ["top", "right", "bottom", "left"]) {
			const value = Number(options.insets?.[side]);
			if (Number.isFinite(value)) style.setProperty("--iv-inset-" + side, Math.max(0, value) + "px");
		}
		if (typeof options.hud === "boolean") document.documentElement.classList.toggle("no-hud", !options.hud);
		render();
	};

	/** "Direct again": a new edit of the current song (a new AI take, or another built-in one). */
	const redirect = () => {
		const uri = state.track?.uri || "";
		if (!uri) return;
		state.take = { uri, count: state.take.uri === uri ? state.take.count + 1 : 1 };
		render();
	};

	// ---------------------------------------------------------------------
	// The app's background follows the motion camera
	// ---------------------------------------------------------------------

	// The engine turns the video with its camera by styling this element; the
	// app's own background view (a video or the artwork) repeats the values.
	const IDENTITY = "0|1|0|0|0";
	let backdrop = null;
	let backdropSent = IDENTITY;
	const number = (value, fallback) => {
		const parsed = parseFloat(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	};
	const followBackdrop = () => {
		root.requestAnimationFrame(followBackdrop);
		if (!backdrop) return;
		const style = backdrop.style;
		const [x = "0", y = "0"] = String(style.translate || "").split(/\s+/);
		const values = state.background
			? [number(style.rotate, 0), number(style.scale, 1), number(x, 0), number(y, 0), number(String(style.filter).replace("blur(", ""), 0)]
			: [0, 1, 0, 0, 0];
		const key = values.join("|");
		if (key === backdropSent) return;
		backdropSent = key;
		post({ type: "background", rotate: values[0], scale: values[1], x: values[2], y: values[3], blur: values[4] });
	};

	/** Mounts the stage; called once the motion scripts have loaded. */
	const start = () => {
		if (state.container) return;
		state.container = document.getElementById("ivlyrics-motion-root");
		backdrop = document.createElement("div");
		backdrop.className = "ivlyrics-video-background-camera";
		backdrop.hidden = true;
		document.body.appendChild(backdrop);
		root.requestAnimationFrame(followBackdrop);
		render();
		post({ type: "ready", version: root.ivLyricsMotionDirector?.VERSION || 0 });
	};

	root.addEventListener("error", (event) => post({ type: "error", message: String(event?.message || "error") }));
	root.addEventListener("unhandledrejection", (event) => post({ type: "error", message: String(event?.reason?.message || event?.reason || "rejection") }));

	root.ivLyricsMotionHost = Object.freeze({
		initialized: true,
		configure,
		setTrack,
		setPlayback,
		resolve,
		redirect,
		start,
		// For tests.
		positionAt,
		parseDirection,
	});
})(typeof window !== "undefined" ? window : globalThis);
