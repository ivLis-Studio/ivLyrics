const splitLineByParallelShape = (text, rowCount) => {
	const value = typeof text === "string" ? text.trim() : "";
	if (!value || rowCount <= 1) {
		return [];
	}

	const separatorParts = value.split(/\s*[/|／｜]\s*/).filter(Boolean);
	if (separatorParts.length === rowCount) {
		return separatorParts;
	}

	const chars = Array.from(value);
	const lead = [];
	const background = [];
	let depth = 0;
	let firstLeadIndex = Number.POSITIVE_INFINITY;
	let firstBackgroundIndex = Number.POSITIVE_INFINITY;

	chars.forEach((char, index) => {
		if (char === "(" || char === "（") {
			depth++;
			return;
		}
		if (char === ")" || char === "）") {
			depth = Math.max(0, depth - 1);
			return;
		}
		if (depth > 0) {
			firstBackgroundIndex = Math.min(firstBackgroundIndex, index);
			background.push(char);
		} else {
			if (!/\s/u.test(char)) {
				firstLeadIndex = Math.min(firstLeadIndex, index);
			}
			lead.push(char);
		}
	});

	if (rowCount === 2 && background.join("").trim()) {
		const leadText = lead.join("").trim();
		const backgroundText = background.join("").trim();
		return firstBackgroundIndex < firstLeadIndex
			? [backgroundText, leadText]
			: [leadText, backgroundText];
	}

	return [];
};

const isKaraokeParenthesisOpen = (char) => char === "(" || char === "\uFF08";
const isKaraokeParenthesisClose = (char) => char === ")" || char === "\uFF09";

const isStandaloneParentheticalText = (text) => {
	const chars = Array.from(String(text || "").trim());
	if (chars.length < 2 || !isKaraokeParenthesisOpen(chars[0])) return false;

	let depth = 0;
	for (let index = 0; index < chars.length; index++) {
		const char = chars[index];
		if (isKaraokeParenthesisOpen(char)) {
			depth++;
			continue;
		}
		if (isKaraokeParenthesisClose(char)) {
			depth--;
			if (depth === 0 && index !== chars.length - 1) return false;
			if (depth < 0) return false;
		}
	}
	return depth === 0 && isKaraokeParenthesisClose(chars[chars.length - 1]);
};

const stripStandaloneParentheticalText = (text) => {
	let value = String(text || "").trim();
	while (isStandaloneParentheticalText(value)) {
		value = Array.from(value).slice(1, -1).join("").trim();
	}
	return value;
};

export const splitLineByVocalRowShape = (text, rows) => {
	const value = typeof text === "string" ? text.trim() : "";
	const rowCount = Array.isArray(rows) ? rows.length : 0;
	if (!value || rowCount <= 1) return [];

	const simpleParts = splitLineByParallelShape(value, rowCount);
	if (simpleParts.length === rowCount) return simpleParts;

	const segments = [];
	let buffer = [];
	let depth = 0;
	let parenthetical = false;
	const flush = () => {
		const segmentText = buffer.join("").trim();
		if (segmentText) {
			segments.push({
				parenthetical,
				text: parenthetical ? stripStandaloneParentheticalText(segmentText) : segmentText
			});
		}
		buffer = [];
		parenthetical = depth > 0;
	};

	Array.from(value).forEach((char) => {
		if (isKaraokeParenthesisOpen(char)) {
			if (depth === 0) {
				flush();
				parenthetical = true;
			}
			depth++;
			buffer.push(char);
			return;
		}

		if (isKaraokeParenthesisClose(char)) {
			buffer.push(char);
			if (depth > 0) depth--;
			if (depth === 0 && parenthetical) flush();
			return;
		}

		buffer.push(char);
	});
	flush();

	if (segments.length === rowCount) {
		return segments.map(segment => segment.text);
	}

	const remaining = [...segments];
	const rowShapeParts = rows.map((row) => {
		const rowIsParenthetical = isStandaloneParentheticalText(row?.text);
		const segmentIndex = remaining.findIndex(segment => segment.parenthetical === rowIsParenthetical);
		if (segmentIndex < 0) return "";
		const [segment] = remaining.splice(segmentIndex, 1);
		return segment.text;
	});

	return rowShapeParts.every(Boolean) && remaining.length === 0 ? rowShapeParts : [];
};
