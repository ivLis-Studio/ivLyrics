import {
	backgroundFrame, barsLevel, cameraFilter, coverScale, floodAt, panelAt, plateLevel, revealClip,
	strokeLevel,
} from "./motionBackground.mjs";
import { beatGridOf, onBeat } from "./motionBeatGrid.mjs";
import {
	boardVisibility, cameraPose, lineIndexAt, progressAt, restAt, uprightAt,
} from "./motionCamera.mjs";
import { comfortDirection, comfortOf, feelFor } from "./motionCameraComfort.mjs";
import { PERSPECTIVE_PX, facingOf, viewDepth } from "./motionCameraFraming.mjs";
import { compose, expandPieces, piecesOf } from "./motionComposition.mjs";
import { critiqueNotes, critiquePlan, projectPoint } from "./motionCritique.mjs";
import { bestLocalDirection, createCoverColorSampler, createMotionDirectionRequester } from "./motionDirectionRequests.mjs";
import { createEngine } from "./motionEngine.mjs";
import { publishRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { INTERLUDE_STYLES, interludesOf } from "./motionInterludes.mjs";
import {
	buildModel, buildWords, hasRealTiming, leadSyllablesOf, lineEnergies, modelSignature,
} from "./motionLyricModel.mjs";
import { motionDirector } from "./MotionLyricsDirector.mjs";
import { motionShapes } from "./MotionLyricsShapes.mjs";
import { motionType } from "./MotionLyricsType.mjs";
import { hashString } from "./motionMath.mjs";
import { deepOf, paletteFrom } from "./motionPalette.mjs";
import { createStage } from "./motionStage.mjs";
import {
	EXIT_NAMES, LETTER_EXITS, charFrame, exitCharFrame, exitFrame, fillFrame, flexOf, holdFrame,
	levelsOn, lifeLevels, lineLevels, lineMotion, solidFrame, travelFrame, wordEntrance,
} from "./motionTypeEffects.mjs";
import { fontNeeds, layoutBlock } from "./motionTypesetting.mjs";

const pure = Object.freeze({
	PERSPECTIVE_PX,
	hashString,
	leadSyllablesOf,
	hasRealTiming,
	buildWords,
	buildModel,
	modelSignature,
	lineEnergies,
	paletteFrom,
	fontNeeds,
	layoutBlock,
	compose,
	lineIndexAt,
	progressAt,
	cameraPose,
	viewDepth,
	boardVisibility,
	restAt,
	lineLevels,
	lifeLevels,
	exitFrame,
	holdFrame,
	wordEntrance,
	solidFrame,
	charFrame,
	backgroundFrame,
	uprightAt,
	coverScale,
	barsLevel,
	panelAt,
	strokeLevel,
	facingOf,
	floodAt,
	plateLevel,
	levelsOn,
	piecesOf,
	expandPieces,
	exitCharFrame,
	EXIT_NAMES: [...EXIT_NAMES],
	LETTER_EXITS,
	INTERLUDE_STYLES,
	interludesOf,
	cameraFilter,
	revealClip,
	fillFrame,
	travelFrame,
	lineMotion,
	deepOf,
	comfortOf,
	comfortDirection,
	feelFor,
	beatGridOf,
	onBeat,
	flexOf,
	critiquePlan,
	critiqueNotes,
	projectPoint,
});

export let motionLyrics;

// The WebView host and existing Spotify integrations can still read the public API.
export function startMotionLyrics({
	host, react, directionServices, playback, translate, detectLanguage, shapedOutlines,
}) {
	if (!host.ivLyricsMotionShapes?.initialized) host.ivLyricsMotionShapes = motionShapes;
	if (!host.ivLyricsMotionType?.initialized) host.ivLyricsMotionType = motionType;
	if (!host.ivLyricsMotionDirector?.initialized) {
		publishRuntimeService("ivLyricsMotionDirector", motionDirector, host);
	}
	if (host.ivLyricsMotionLyrics?.initialized) {
		motionLyrics = host.ivLyricsMotionLyrics;
		return;
	}

	const createImage = () => new host.Image();
	const requestDirection = createMotionDirectionRequester(directionServices);
	const coverColorsOf = createCoverColorSampler({
		canSample: () => typeof host.Image === "function" && !!host.document?.createElement,
		createImage,
		createElement: (tag) => host.document.createElement(tag),
	});
	const createHostEngine = (nodes) => createEngine(nodes, {
		document: host.document,
		readTime: (frameTime) => {
			const position = playback.readFrameAlignedPosition(frameTime);
			if (Number.isFinite(position)) return position;
			const fallback = Number(playback.readPosition());
			return Number.isFinite(fallback) ? fallback : 0;
		},
		isTrackCurrent: playback.isTrackCurrent ?? (trackUri => {
			const uri = playback.readTrackUri();
			return !uri || uri === trackUri;
		}),
		now: () => (typeof host.performance?.now === "function" ? host.performance.now() : Date.now()),
		readComputedStyle: (element) => host.getComputedStyle?.(element),
		createImage,
		shapedOutlines,
		requestFrame: (callback) => host.requestAnimationFrame(callback),
		cancelFrame: (id) => host.cancelAnimationFrame(id),
		scheduleTimer: (callback, delay) => host.setTimeout(callback, delay),
		cancelTimer: (id) => host.clearTimeout(id),
	});
	motionLyrics = host.ivLyricsMotionLyrics = Object.freeze({
		initialized: true,
		...pure,
		requestDirection,
		bestLocalDirection,
		createEngine: createHostEngine,
		Stage: react ? createStage(react, {
			browser: host,
			translate,
			detectLanguage,
			readAnalysisLoader: playback.readAnalysisLoader,
			requestDirection,
			coverColorsOf,
			createEngine: createHostEngine,
		}) : null,
	});
}
