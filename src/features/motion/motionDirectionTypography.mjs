const SERIF_SHARE = 0.15;
const SERIF_LINE_SHARE = 0.18;

/** How many shots, and lines in them, may be set wholly in serif. */
export const serifBudget = (shotCount, lineCount) => ({
	shots: Math.max(1, Math.round(shotCount * SERIF_SHARE)),
	lines: Math.max(3, Math.round(lineCount * SERIF_LINE_SHARE)),
});

/**
 * Keeps serif shots rare: never two neighbouring shots (parts of one
 * split shot excepted) and no more shots or lines than the budget; the
 * rest become heavy shots whose emphasised words stay serif.
 */
export const limitSerif = (shots) => {
	const budget = serifBudget(shots.length, shots.length ? shots[shots.length - 1].to + 1 : 0);
	let used = 0;
	let usedLines = 0;
	const result = [];
	shots.forEach((shot) => {
		const previous = result[result.length - 1];
		const size = shot.to - shot.from + 1;
		const fits = usedLines + size <= budget.lines;
		const keep = shot.type === "serif" && fits && (shot.continued === true
			? previous?.type === "serif"
			: previous?.type !== "serif" && used < budget.shots);
		if (keep) {
			if (shot.continued !== true) used += 1;
			usedLines += size;
			result.push(shot);
		} else {
			result.push(shot.type === "serif" ? { ...shot, type: "impact", serif: true } : shot);
		}
	});
	return result;
};
