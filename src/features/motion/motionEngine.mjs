import { backgroundFrame, barsLevel, cameraFilter, floodAt, panelAt } from "./motionBackground.mjs";
import { createBoardMount } from "./motionBoardDom.mjs";
import { createBoardPainter } from "./motionBoardPainter.mjs";
import { createBoardWindowIndex, collectVisibleBoards } from "./motionBoardWindows.mjs";
import { createDepthReader } from "./motionCameraFraming.mjs";
import { cameraPose, lineIndexAt, progressAt, recentEvent, restAt } from "./motionCamera.mjs";
import { createMotionContrast } from "./motionContrast.mjs";
import { createInterludeRenderer } from "./motionInterludeRenderer.mjs";
import { translationOf } from "./motionLyricModel.mjs";
import { clamp, round } from "./motionMath.mjs";

// Lite quality (the engine's watchFrames): frames averaging slower than LITE_SLOW_MS for
// LITE_AFTER_MS turn the costly extras off; faster than LITE_FAST_MS for LITE_BACK_MS, back on.
const LITE_SLOW_MS = 27;
const LITE_FAST_MS = 18.5;
const LITE_AFTER_MS = 2000;
const LITE_BACK_MS = 12000;

const timecode = (ms) => {
	const seconds = Math.max(0, Math.floor(ms / 1000));
	return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
};
const pad2 = (value) => String(Math.max(0, value)).padStart(2, "0");

// A translation shows while its line is sung and this long after; between lines it steps aside.
const SUBTITLE_LINGER_MS = 700;
const BACKGROUND_TRANSFORMS = ["rotate", "scale", "translate"];

export function createEngine({
	stage, viewport, camera, scrim, wash, flood, interlude, flash, panel, bars, subtitle, live, hudShot, hudTime, defs,
}, {
	document, readTime, isTrackCurrent, now, readComputedStyle, createImage, shapedOutlines,
	requestFrame, cancelFrame, scheduleTimer, cancelTimer,
}) {
	const mountBoard = createBoardMount({ document, camera, defs, shapedOutlines });
	let plan = null;
	let boardWindows = [];
	const visibleBoards = new Set();
	let pending = null;
	let planSetAt = 0;
	let lyrics = [];
	let pulses = null;
	let trackUri = "";
	let playing = false;
	let frameId = 0;
	let timerId = 0;
	let destroyed = false;
	let trackSuspended = false;
	let currentLine = -2;
	let currentBoard = -2;
	let background = null;
	// The background's own filter (the app's dimming and blur of a cover) and what the camera last wrote over it:
	// the camera's motion blur is added after it, and it is given back as it was.
	let backgroundFilter = { base: "", written: null };
	let backgroundTransform = {};
	let backgroundCheckedAt = -Infinity;
	let lastPose = null;
	let lastFrameAt = 0;
	let paintedPausedTime = NaN;
	let lastBackgroundFrame = null;
	let swapFlashAt = -Infinity;
	const mounted = new Map();
	const cache = { camera: {}, viewport: {}, flash: {}, wash: {}, background: {}, hud: {}, panel: {}, bars: {}, rest: {}, flood: {} };
	const write = (store, key, value, apply) => {
		if (store[key] === value) return;
		store[key] = value;
		apply(value);
	};

	const { clearScenes, paintInterludes } = createInterludeRenderer({
		document, interlude, readPlan: () => plan, readPulses: () => pulses, write,
	});
	const contrast = createMotionContrast({
		document, stage, createImage, readComputedStyle, readMountedBoards: () => mounted.values(), write,
	});

	const findBackground = (at) => {
		if (background?.isConnected) return background;
		if (background) releaseBackground();
		if (at - backgroundCheckedAt < 1000) return null;
		backgroundCheckedAt = at;
		const scope = stage.closest?.("#lyrics-fullscreen-container, .lyrics-lyricsContainer-LyricsContainer") || document;
		background = scope.querySelector?.(".ivlyrics-video-background-camera") || document.querySelector?.(".ivlyrics-video-background-camera") || null;
		backgroundFilter = { base: background?.style?.filter || "", written: null };
		if (background) {
			backgroundTransform = Object.fromEntries(BACKGROUND_TRANSFORMS.map(property => [
				property, { base: background.style[property] || "", written: null },
			]));
		}
		background?.classList?.add("is-motion-camera");
		return background;
	};
	const writeBackgroundTransform = (property, value) => {
		write(cache.background, property, value, (next) => {
			const state = backgroundTransform[property];
			const current = background.style[property] || "";
			if (current !== state.written) state.base = current;
			background.style[property] = next;
			state.written = background.style[property];
		});
	};
	const writeBackgroundFilter = (backdrop, blurPx) => {
		const current = backdrop.style.filter || "";
		const next = cameraFilter(backgroundFilter, current, blurPx);
		if (next.written !== current) backdrop.style.filter = next.written;
		backgroundFilter = next;
	};
	// ---- Quality: when frames keep coming late on this machine, the costly extras go (lite):
	// motion blur, reading the picture for contrast, halos and glows (CSS, .is-lite) and words
	// changing weight. It comes back once frames are on time again, at most twice a song.
	const quality = { lite: false, average: 0, lastAt: 0, slowSince: null, fastSince: null, drops: 0 };
	const paintBoard = createBoardPainter({ write, isLite: () => quality.lite });
	const setLite = (value) => {
		quality.lite = value;
		quality.slowSince = null;
		quality.fastSince = null;
		if (value) quality.drops += 1;
		stage.classList?.toggle("is-lite", value);
	};
	const watchFrames = (at) => {
		const gap = at - quality.lastAt;
		quality.lastAt = at;
		// Only running frames count (not a pause, a hidden tab or the first frame).
		if (!playing || gap <= 0 || gap > 250) return;
		quality.average = quality.average ? quality.average * 0.92 + gap * 0.08 : gap;
		if (!quality.lite) {
			if (quality.average > LITE_SLOW_MS) {
				quality.slowSince ??= at;
				if (at - quality.slowSince > LITE_AFTER_MS) setLite(true);
			} else quality.slowSince = null;
		} else if (quality.drops < 2) {
			if (quality.average < LITE_FAST_MS) {
				quality.fastSince ??= at;
				if (at - quality.fastSince > LITE_BACK_MS) setLite(false);
			} else quality.fastSince = null;
		}
	};
	const releaseBackground = () => {
		if (background) {
			background.classList?.remove("is-motion-camera");
			for (const property of BACKGROUND_TRANSFORMS) {
				const { base, written } = backgroundTransform[property];
				if (written !== null && background.style[property] === written) background.style[property] = base;
			}
			// Restore the app's filter if the camera still owns the inline value.
			if (backgroundFilter.written !== null && (background.style.filter || "") === backgroundFilter.written) background.style.filter = backgroundFilter.base;
		}
		backgroundFilter = { base: "", written: null };
		backgroundTransform = {};
		background = null;
		backgroundCheckedAt = -Infinity;
		cache.background = {};
		contrast.reset();
	};

	const unmount = (index) => {
		const entry = mounted.get(index);
		if (!entry) return;
		entry.el.remove();
		mounted.delete(index);
	};
	const unmountAll = () => {
		for (const entry of mounted.values()) entry.el.remove();
		mounted.clear();
		paintedPausedTime = NaN;
		currentLine = -2;
		currentBoard = -2;
		clearScenes();
	};
	const clearFrame = () => {
		unmountAll();
		releaseBackground();
		lastPose = null;
		swapFlashAt = -Infinity;
		subtitle.classList.remove("has-text");
		for (const node of [subtitle, live, hudShot, hudTime]) {
			if (node) node.textContent = "";
		}
		for (const [node, property] of [
			[viewport, "filter"], [scrim, "opacity"], [flash, "opacity"],
			[panel, "visibility"], [bars, "visibility"], [flood, "visibility"],
		]) {
			if (node) node.style[property] = "";
		}
		wash?.classList.remove("is-alt");
		for (const key of Object.keys(cache)) cache[key] = {};
	};
	const updateText = (index) => {
		const line = plan.lines[index];
		const source = line ? lyrics[line.index] : null;
		const text = translationOf(source);
		if (subtitle.textContent !== text) subtitle.textContent = text;
		subtitle.classList.toggle("has-text", !!text);
		if (live && line && live.textContent !== line.text) live.textContent = line.text;
	};

	const applyPlan = (nextPlan, at) => {
		plan = nextPlan;
		pending = null;
		planSetAt = at;
		boardWindows = createBoardWindowIndex(plan?.boards || []);
		if (plan?.lines.length) unmountAll();
		else clearFrame();
	};

	const swapIfDue = (time, at) => {
		if (!pending) return;
		const lines = plan?.lines || [];
		const index = lineIndexAt(plan, time);
		const line = lines[index];
		const next = lines[index + 1];
		const betweenBoards = !!(line && next && time > line.leave && next.board !== line.board);
		const beforeSong = !lines.length || time < lines[0].arrive - 400;
		// Nothing to cut away from while only the video plays.
		const resting = restAt(plan, time) > 0.95;
		if (!playing || beforeSong || betweenBoards || resting || at - planSetAt < 1500 || at - pending.since > 15000) {
			const quiet = at - planSetAt < 1500 || beforeSong || resting || !playing;
			applyPlan(pending.plan, at);
			if (!quiet && !plan.comfort?.safe) swapFlashAt = at;
		}
	};

	const render = (time) => {
		if (destroyed || !plan?.lines.length) return;
		if (trackUri && !isTrackCurrent(trackUri)) {
			if (!trackSuspended) {
				trackSuspended = true;
				clearFrame();
			}
			return;
		}
		trackSuspended = false;
		const at = now();
		swapIfDue(time, at);
		watchFrames(at);
		const lineIndex = lineIndexAt(plan, time);
		const restLevel = restAt(plan, time, lineIndex);
		// Paused ticks still follow seeks and refresh the backdrop. Its contrast can
		// change even when the camera and the lyrics are frozen at the same time.
		const repaint = playing || !lastPose || time !== paintedPausedTime;
		const pose = repaint ? cameraPose(plan, time, pulses || plan.pulses, lineIndex) : lastPose;
		if (repaint) {
			lastBackgroundFrame = null;
			write(cache.camera, "transform",
				"rotateX(" + round(pose.pitch || 0, 2) + "deg) rotateY(" + round(pose.yaw || 0, 2) + "deg) rotateZ(" + round(-pose.roll, 3) + "deg) translate3d(" + round(-pose.x) + "px," + round(-pose.y) + "px," + round(-pose.z) + "px)",
				(value) => { camera.style.transform = value; });
		}

		// Motion blur while the camera whips between boards (not in lite quality).
		let blur = 0;
		if (playing && !quality.lite && lastPose && at - lastFrameAt > 0 && at - lastFrameAt < 90) {
			const elapsed = at - lastFrameAt;
			let turn = Math.abs(pose.roll - lastPose.roll) % 360;
			turn = Math.min(turn, 360 - turn);
			const swing = Math.abs((pose.yaw || 0) - (lastPose.yaw || 0)) + Math.abs((pose.pitch || 0) - (lastPose.pitch || 0));
			const travel = Math.hypot(pose.x - lastPose.x, pose.y - lastPose.y) + ((turn + swing) * Math.PI / 180) * plan.W * 0.45;
			blur = clamp((travel / elapsed - 1.7) * 1.3, 0, 7);
		}
		lastPose = pose;
		lastFrameAt = at;
		const blurValue = blur >= 0.5 ? "blur(" + round(blur, 1) + "px)" : "";
		write(cache.viewport, "filter", blurValue, (value) => { viewport.style.filter = value; });

		const backdrop = findBackground(at);
		if (backdrop) {
			const frameState = lastBackgroundFrame ??= backgroundFrame(plan, pose, time, restLevel);
			contrast.setFrame(frameState);
			if (cache.background.frame !== frameState) {
				cache.background.frame = frameState;
				writeBackgroundTransform("rotate", round(frameState.rotate, 2) + "deg");
				writeBackgroundTransform("scale", String(round(frameState.scale, 4)));
				writeBackgroundTransform("translate", round(frameState.x) + "px " + round(frameState.y) + "px");
			}
			writeBackgroundFilter(backdrop, blur >= 1 ? round(blur * 0.5, 1) : 0);
			if (!quality.lite) contrast.sampleContrast(backdrop, at, plan, backgroundFilter);
		}

		if (repaint) {
			const line = plan.lines[lineIndex];
			const through = line?.move?.type === "through" && time > line.leave ? line.board : -1;
			const progress = progressAt(plan, time, lineIndex);
			collectVisibleBoards(boardWindows, time, visibleBoards);
			for (const index of mounted.keys()) {
				if (!visibleBoards.has(index)) unmount(index);
			}
			if (visibleBoards.size) {
				const depthOf = createDepthReader(pose);
				for (const index of visibleBoards) {
					let entry = mounted.get(index);
					if (!entry) {
						entry = mountBoard(plan, index);
						mounted.set(index, entry);
					}
					paintBoard(plan, entry, time, depthOf, progress, pose.beat || 0, through);
				}
			}
			paintInterludes(time);
			paintedPausedTime = playing ? NaN : time;
		}
		if (!quality.lite) contrast.paintContrast(at);

		const index = Math.max(0, lineIndex);
		if (index !== currentLine) {
			currentLine = index;
			updateText(index);
			const board = plan.lines[index]?.board ?? 0;
			write(cache.hud, "line", pad2(index + 1) + " / " + pad2(plan.lines.length), (value) => { if (hudShot) hudShot.textContent = "SHOT " + pad2(board + 1) + " / " + pad2(plan.boards.length) + "  ·  L " + value; });
			if (board !== currentBoard) {
				currentBoard = board;
				write(cache.wash, "color", plan.boards[board]?.color ? "is-alt" : "", (value) => { wash.classList.toggle("is-alt", value === "is-alt"); });
			}
		}
		// Interludes, intro and outro: the video comes forward and the subtitle steps aside.
		const rest = round(restLevel, 2);
		// The shade over the frame: lighter in interludes, and over a dark picture (where it can be read).
		const shade = round((1 - rest * 0.5) * (contrast.mean === null ? 1 : clamp(0.55 + contrast.mean * 0.9, 0.62, 1)), 2);
		write(cache.rest, "shade", shade, (value) => {
			if (scrim) scrim.style.opacity = String(value);
		});
		// The translation goes with its line: not after it ends, before the next one starts.
		const sung = plan.lines[index];
		const spoken = !!sung && time >= sung.arrive - 200 && time <= sung.end + SUBTITLE_LINGER_MS;
		write(cache.rest, "subtitle", rest > 0.5 || !spoken, (value) => subtitle.classList.toggle("is-resting", value));
		write(cache.hud, "time", timecode(time), (value) => { if (hudTime) hudTime.textContent = value; });

		const sweep = panelAt(plan, time);
		write(cache.panel, "visibility", sweep ? "visible" : "hidden", (value) => { if (panel) panel.style.visibility = value; });
		if (sweep && panel) {
			write(cache.panel, "transform", "translateX(" + round(sweep.position * 135, 2) + "%) skewX(-14deg)", (value) => { panel.style.transform = value; });
			write(cache.panel, "color", sweep.color ? "is-alt" : "", (value) => { panel.classList.toggle("is-alt", value === "is-alt"); });
		}
		const barLevel = round(barsLevel(plan, time), 3);
		write(cache.bars, "level", barLevel, (value) => {
			if (!bars) return;
			bars.style.visibility = value > 0.001 ? "visible" : "hidden";
			for (const bar of bars.children) bar.style.transform = "scaleY(" + value + ")";
		});
		if (flood) {
			const field = floodAt(plan, time);
			write(cache.flood, "color", field ? field.color : "", (value) => { flood.className = "ivlyrics-motion-flood" + (value ? " is-" + value : ""); });
			write(cache.flood, "level", field ? round(field.level, 3) : 0, (value) => {
				flood.style.visibility = value > 0.001 ? "visible" : "hidden";
				flood.style.transform = "scaleY(" + value + ")";
			});
		}

		let flashLevel = 0;
		const cut = recentEvent(plan.flashes, time, 320);
		if (cut) flashLevel = cut.strength * Math.exp(-cut.since / 90);
		if (at - swapFlashAt < 360) flashLevel = Math.max(flashLevel, 0.45 * Math.exp(-(at - swapFlashAt) / 110));
		write(cache.flash, "opacity", round(flashLevel, 3), (value) => { flash.style.opacity = String(value); });
	};

	const schedule = () => {
		if (destroyed || !plan?.lines.length || frameId || timerId) return;
		if (playing) {
			frameId = requestFrame((frameTime) => {
				frameId = 0;
				render(readTime(frameTime));
				schedule();
			});
		} else {
			// Paused: follow seeks without a running frame loop.
			timerId = scheduleTimer(() => {
				timerId = 0;
				render(readTime(NaN));
				schedule();
			}, 200);
		}
	};

	const stopRendering = () => {
		if (frameId) cancelFrame(frameId);
		if (timerId) cancelTimer(timerId);
		frameId = 0;
		timerId = 0;
	};
	const restart = () => {
		stopRendering();
		if (!plan?.lines.length) return;
		lastPose = null;
		render(readTime(NaN));
		schedule();
	};

	return {
		/**
		 * soft: a new edit of the same song (the AI direction or a late
		 * font arrived) waits for a cut between boards; anything else
		 * (size, a new song) applies now.
		 */
		setPlan(nextPlan, nextTrackUri, options = {}) {
			const uri = nextTrackUri || "";
			if ((plan === nextPlan || pending?.plan === nextPlan) && trackUri === uri) return;
			if (!plan || !nextPlan || trackUri !== uri || options.soft !== true) {
				trackUri = uri;
				pulses = nextPlan?.pulses || null;
				applyPlan(nextPlan, now());
				restart();
				return;
			}
			pending = { plan: nextPlan, since: now() };
		},
		setPulses(nextPulses) {
			pulses = nextPulses || plan?.pulses || null;
			paintedPausedTime = NaN;
		},
		setLyrics(nextLyrics) {
			lyrics = Array.isArray(nextLyrics) ? nextLyrics : [];
			currentLine = -2;
		},
		setPlaying(value) {
			if (playing === (value === true)) return;
			playing = value === true;
			restart();
		},
		destroy() {
			destroyed = true;
			stopRendering();
			unmountAll();
			releaseBackground();
		},
	};
}
