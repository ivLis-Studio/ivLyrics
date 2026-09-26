import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../SyncDataCreator.js", import.meta.url), "utf8");

const extractStyleObject = (name) => {
	const marker = `${name}: {`;
	const start = source.indexOf(marker);
	assert.ok(start >= 0, `${name}: style object not found`);
	const open = source.indexOf("{", start);
	let depth = 0;
	for (let i = open; i < source.length; i++) {
		if (source[i] === "{") depth++;
		else if (source[i] === "}") {
			depth--;
			if (depth === 0) return source.slice(open, i + 1);
		}
	}
	assert.fail(`${name}: unbalanced braces`);
};

test("pronunciation readings stay out of the word group's horizontal sizing", () => {
	// A reading wider than its character row must not widen charWordGroup:
	// the group box is transparent, so any excess would show up as a
	// hairline slit between adjacent character bubbles.
	for (const name of ["charWordPronunciation", "charWordPronunciationPrimary"]) {
		const style = extractStyleObject(name);
		assert.match(style, /width:\s*'0'/, `${name} must set width: '0'`);
		assert.match(style, /whiteSpace:\s*'nowrap'/, `${name} keeps nowrap text that overflows symmetrically`);
		assert.match(style, /justifyContent:\s*'center'/, `${name} centers the overflowing text on the row`);
	}
});

test("word group styles never add transparent horizontal space around the row", () => {
	const group = extractStyleObject("charWordGroup");
	assert.match(group, /padding:\s*'0 0 3px'/, "charWordGroup keeps vertical-only padding");

	const groupPrimary = extractStyleObject("charWordGroupPrimary");
	const padding = groupPrimary.match(/padding:\s*'([^']+)'/);
	assert.ok(padding, "charWordGroupPrimary declares padding");
	assert.match(padding[1], /^\d+(?:\.\d+)?px 0(?:px)? \d+(?:\.\d+)?px$/, "charWordGroupPrimary must have zero horizontal padding");
});
