/**
 * The song's beat grid (ms): the audio analysis's beats when there are
 * enough, otherwise a steady grid fitted to when words start (people sing
 * on the beat). Every fourth beat from the bar most lines start on is a
 * downbeat (strength 1). Null when neither gives a steady beat.
 */
export const beatGridOf = (model, pulses) => {
	if (pulses?.times?.length >= 16) {
		const times = Array.from(pulses.times);
		const gaps = times.slice(1).map((time, index) => time - times[index]).filter((gap) => gap > 200 && gap < 1500).sort((a, b) => a - b);
		const period = gaps[Math.floor(gaps.length / 2)] || 500;
		return { period, times, strengths: Array.from(pulses.strengths || times.map(() => 0.6)), source: "analysis", confidence: 1 };
	}
	const lines = Array.isArray(model) ? model : [];
	// Words as onsets, a line's first word and held words weighing more (they fall on the beat more often).
	const onsets = [];
	for (const line of lines) {
		(line.words || []).forEach((word, index) => {
			if (Number.isFinite(word.start)) onsets.push({ time: word.start, weight: index === 0 ? 2 : word.end - word.start >= 350 ? 1.3 : 1 });
		});
	}
	onsets.sort((a, b) => a.time - b.time);
	if (onsets.length < 24) return null;
	// 1. The grid words fall on (the coarsest that still fits them all: eighths, or the beat itself), over the whole song.
	const coherenceAt = (period) => {
		let sx = 0;
		let sy = 0;
		let total = 0;
		for (const onset of onsets) {
			const angle = (2 * Math.PI * onset.time) / period;
			sx += onset.weight * Math.cos(angle);
			sy += onset.weight * Math.sin(angle);
			total += onset.weight;
		}
		return { r: Math.hypot(sx, sy) / total, angle: Math.atan2(sy, sx) };
	};
	const fits = [];
	let peak = 0;
	for (let step = 150; step <= 450; step += 0.5) {
		const fit = coherenceAt(step);
		fits.push({ step, ...fit });
		peak = Math.max(peak, fit.r);
	}
	if (peak < 0.3) return null;
	let tatum = fits.filter((fit) => fit.r >= peak * 0.92).reduce((a, b) => (b.step > a.step ? b : a));
	for (let step = tatum.step - 0.5; step <= tatum.step + 0.5; step += 0.05) {
		const fit = coherenceAt(step);
		if (fit.r > tatum.r) tatum = { step, ...fit };
	}
	// 2. The beat: two of those (or one, three, four) at a usual tempo, on the one lines start on.
	const multiple = [2, 1, 3, 4].find((count) => {
		const bpm = 60000 / (tatum.step * count);
		return bpm >= 85 && bpm <= 150;
	}) || (tatum.step * 2 <= 1000 ? 2 : 1);
	const period = tatum.step * multiple;
	const base = ((((tatum.angle / (2 * Math.PI)) * tatum.step) % tatum.step) + tatum.step) % tatum.step;
	const starts = lines.map((line) => line.start).filter(Number.isFinite);
	const fitOf = (phase) => starts.reduce((sum, time) => {
		const off = (((time - phase) % period) + period) % period;
		return sum + (Math.min(off, period - off) < period * 0.15 ? 1 : 0);
	}, 0);
	let phase = base;
	for (let offset = 1; offset < multiple; offset += 1) if (fitOf(base + offset * tatum.step) > fitOf(phase)) phase = base + offset * tatum.step;
	const first = Math.floor((onsets[0].time - phase) / period) - 8;
	const last = Math.ceil((onsets[onsets.length - 1].time - phase) / period) + 24;
	// The downbeat: the bar position most lines start on.
	const bars = [0, 0, 0, 0];
	for (const time of starts) bars[((Math.round((time - phase) / period) % 4) + 4) % 4] += 1;
	const downbeat = bars.indexOf(Math.max(...bars));
	const times = [];
	const strengths = [];
	for (let beat = first; beat <= last; beat += 1) {
		times.push(phase + beat * period);
		strengths.push(((beat % 4) + 4) % 4 === downbeat ? 1 : 0.55);
	}
	return { period, times, strengths, source: "words", confidence: tatum.r };
};

/** Index of the grid's last beat at or before time (-1 before the first). */
const beatIndexAt = (grid, time) => {
	const times = grid.times;
	let low = 0;
	let high = times.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (times[middle] <= time) low = middle + 1;
		else high = middle;
	}
	return low - 1;
};

/**
 * The beat nearest to time within [time - before, time + after] that is
 * also inside [low, high] (downbeats only when asked), or time itself.
 */
export const onBeat = (grid, time, before, after, low = -Infinity, high = Infinity, downbeats = false) => {
	if (!grid?.times?.length || !Number.isFinite(time)) return time;
	const index = beatIndexAt(grid, time);
	let chosen = time;
	let distance = Infinity;
	for (let at = index - 6; at <= index + 7; at += 1) {
		const beat = grid.times[at];
		if (!Number.isFinite(beat) || beat < time - before || beat > time + after || beat < low || beat > high) continue;
		if (downbeats && (grid.strengths[at] ?? 0) < 0.9) continue;
		if (Math.abs(beat - time) < distance) {
			distance = Math.abs(beat - time);
			chosen = beat;
		}
	}
	return chosen;
};
