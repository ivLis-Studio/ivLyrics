import assert from "node:assert/strict";
import { getSyncCreatorStyles } from "#ivlyrics/features/sync/syncCreatorStyles.mjs";
import test from "node:test";

const styles = getSyncCreatorStyles({});

test("pronunciation readings stay out of the word group's horizontal sizing", () => {
	// A reading wider than its character row must not widen charWordGroup:
	// the group box is transparent, so any excess would show up as a
	// hairline slit between adjacent character bubbles.
	for (const name of ["charWordPronunciation", "charWordPronunciationPrimary"]) {
		const style = styles[name];
		assert.equal(style.width, "0", `${name} must leave the group width unchanged`);
		assert.equal(style.whiteSpace, "nowrap");
		assert.equal(style.justifyContent, "center");
	}
});

test("word group styles never add transparent horizontal space around the row", () => {
	assert.equal(styles.charWordGroup.padding, "0 0 3px");
	assert.match(styles.charWordGroupPrimary.padding, /^\d+(?:\.\d+)?px 0(?:px)? \d+(?:\.\d+)?px$/);
});
