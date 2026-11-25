const prepareKaraokeGlyphUpdates = (timedChars, motionProfiles, wordTimed, wordStartTimes) => {
	const events = [];
	const always = [];
	timedChars.forEach((charInfo, index) => {
		const wordStart = wordStartTimes.get(charInfo?.karaokeWordIndex);
		const fillStart = wordTimed
			? (Number.isFinite(wordStart) ? wordStart : Number.isFinite(charInfo?.startTime) ? charInfo.startTime : 0)
			: Number.isFinite(charInfo?.karaokeFillStartTime) ? charInfo.karaokeFillStartTime : charInfo?.startTime;
		const fillEnd = wordTimed ? fillStart
			: Number.isFinite(charInfo?.karaokeFillEndTime) ? charInfo.karaokeFillEndTime : charInfo?.endTime;
		const profile = !wordTimed && motionProfiles[index];
		const motionEnd = profile ? profile.endTime + profile.releaseDuration : fillEnd;
		if (!Number.isFinite(fillStart) || !Number.isFinite(fillEnd)
			|| (profile && (!Number.isFinite(profile.startTime) || !Number.isFinite(motionEnd)))) {
			// Keep unusual provider data on the original calculation path.
			always.push(index);
			return;
		}
		const start = profile ? Math.min(fillStart, profile.startTime) : fillStart;
		const end = Math.max(fillStart, fillEnd, motionEnd);
		events.push({ time: start, index, ending: false }, { time: end, index, ending: true });
	});
	// Source order is not necessarily playback order; equal and overlapping
	// onsets remain independent. End events follow starts at the same time.
	events.sort((left, right) => left.time - right.time || Number(left.ending) - Number(right.ending));
	return { events, always, active: new Set(), cursor: 0, position: NaN, isComplete: null, elements: [] };
};

const getKaraokeGlyphUpdates = (state, position, isComplete) => {
	const reset = !Number.isFinite(position) || !Number.isFinite(state.position) || position < state.position;
	const updateAll = reset || isComplete !== state.isComplete;
	if (reset) {
		state.active.clear();
		state.cursor = 0;
	}
	const updates = updateAll ? null : new Set([...state.always, ...state.active]);
	if (Number.isFinite(position)) {
		while (state.cursor < state.events.length) {
			const event = state.events[state.cursor];
			// A zero-duration character remains pending at its exact onset.
			// Retain it through that instant and settle it on the next update.
			if (event.time > position || (event.ending && event.time === position)) break;
			state.cursor++;
			updates?.add(event.index);
			if (event.ending) state.active.delete(event.index);
			else state.active.add(event.index);
		}
	}
	state.position = position;
	state.isComplete = isComplete;
	return updates;
};

export { prepareKaraokeGlyphUpdates, getKaraokeGlyphUpdates };
