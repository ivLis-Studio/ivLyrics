import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { createPlaybackClock } = require("../src/core/PlaybackClock.js");

// Anti's report: the karaoke fill froze for a moment and then jumped ahead.
// Spotify re-anchors its player state now and then with a reading a few
// hundred milliseconds off; the shown position must absorb it steadily.
const run = (offsetAfterReanchor) => {
	let time = 0;
	let wall = 1_000_000;
	let anchor = { position: 10_000, timestamp: wall };
	const clock = createPlaybackClock({
		autoStart: false,
		now: () => time,
		wallNow: () => wall,
		getPlayerData: () => ({ item: { uri: "spotify:track:a" }, isPaused: false }),
		getPlayerState: () => ({ item: { uri: "spotify:track:a" }, isPaused: false, positionAsOfTimestamp: anchor.position, timestamp: anchor.timestamp, speed: 1, duration: 300_000 }),
		getDuration: () => 300_000,
	});
	const positions = [];
	for (let frame = 0; frame < 180; frame++) {
		if (frame === 60) anchor = { position: anchor.position + (wall - anchor.timestamp) + offsetAfterReanchor, timestamp: wall };
		positions.push(clock.getSnapshot().position);
		time += 1000 / 60;
		wall += 1000 / 60;
	}
	return positions;
};

for (const [label, offset] of [["behind", -350], ["ahead", 350]]) {
	test("a re-anchored reading " + label + " moves the fill at a steady pace, without stalling or racing", () => {
		const positions = run(offset);
		const steps = positions.slice(1).map((value, index) => value - positions[index]);
		const frame = 1000 / 60;
		assert.ok(steps.every((step) => step >= frame * 0.69 && step <= frame * 1.31),
			"every frame advances between 0.7x and 1.3x real time: " + Math.min(...steps).toFixed(2) + " .. " + Math.max(...steps).toFixed(2));
		const end = positions.at(-1);
		const expected = 10_000 + 179 * frame + offset;
		assert.ok(Math.abs(end - expected) < 40, "and it converges on the new reading: " + (end - expected).toFixed(1));
	});
}

test("a reading far off still snaps (a seek), once the jump is confirmed", () => {
	const positions = run(2000);
	const jump = positions.slice(61, 72).findIndex((value, index) => value - positions[60 + index] > 1900);
	assert.ok(jump >= 0, "within the 120 ms confirmation window");
});

