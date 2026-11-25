// Compatibility API shared by the desktop and mobile motion renderers.
import {
	VERSION, MOODS, TEMPOS, LAYOUTS, ENTERS, FX, LETTER_FX, HARD_FX, PUNCHY_FX,
	HARD_ENTERS, ACCENTS, TYPES, EXITS, HOLDS, SPLITS, INTERLUDES, MAX_SHOT_MS, MAX_LINES, PACE, vocabulary,
} from "./motionDirectionVocabulary.mjs";
import { singsInto, syllablesOf, tempoOf } from "./motionSongAnalysis.mjs";
import { localDirection } from "./motionLocalDirection.mjs";
import { normalizeDirection } from "./motionAiDirection.mjs";
import { buildPrompt, promptLines, promptShots } from "./motionDirectionPrompt.mjs";

export const motionDirector = Object.freeze({
	initialized: true,
	VERSION,
	MOODS,
	TEMPOS,
	LAYOUTS,
	ENTERS,
	FX,
	LETTER_FX,
	HARD_FX,
	PUNCHY_FX,
	HARD_ENTERS,
	ACCENTS,
	TYPES,
	EXITS,
	HOLDS,
	SPLITS,
	INTERLUDES,
	MAX_SHOT_MS,
	MAX_LINES,
	PACE,
	tempoOf,
	syllablesOf,
	singsInto,
	localDirection,
	normalizeDirection,
	promptLines,
	promptShots,
	vocabulary,
	buildPrompt,
});

export { singsInto };
