import assert from "node:assert/strict";
import test from "node:test";
import { createMotionContrast } from "../src/features/motion/motionContrast.mjs";

test("contrast reads all line bounds before writing halos and reuses a clean canvas", () => {
	const operations = [];
	const sizes = [];
	const rect = { left: 0, top: 0, right: 800, bottom: 450, width: 800, height: 450 };
	const line = (index) => ({
		cache: { solid: 1 },
		el: {
			getBoundingClientRect() { operations.push("read " + index); return rect; },
			style: {
				setProperty(_name, value) { operations.push("write " + index + " " + value); },
				removeProperty() { operations.push("clear " + index); },
			},
		},
	});
	const lines = [line(1), line(2)];
	const video = { readyState: 2, videoWidth: 800, videoHeight: 450, currentSrc: "clean" };
	let width = 300;
	let height = 150;
	let tainted = false;
	const context = {
		setTransform() {}, fillRect() {}, translate() {}, rotate() {}, scale() {},
		drawImage(image) { tainted ||= image.currentSrc === "tainted"; },
		getImageData(_x, _y, w, h) {
			if (tainted) throw new Error("Blocked read");
			return { data: new Uint8ClampedArray(w * h * 4).fill(255) };
		},
	};
	const canvas = {
		get width() { return width; },
		set width(value) { tainted = false; width = value; sizes.push(["width", value]); },
		get height() { return height; },
		set height(value) { tainted = false; height = value; sizes.push(["height", value]); },
		getContext: () => context,
	};
	const contrast = createMotionContrast({
		document: { createElement: () => canvas },
		stage: { getBoundingClientRect: () => rect },
		readMountedBoards: () => [{ lines }],
		write(cache, key, value, apply) {
			if (cache[key] !== value) {
				cache[key] = value;
				apply(value);
			}
		},
	});
	const backdrop = { querySelector: selector => selector === "video" ? video : null };
	const sample = (at, base = "") => {
		contrast.sampleContrast(backdrop, at, { W: 800, H: 450 }, { base });
		contrast.paintContrast(at);
	};
	sample(0);
	assert.deepEqual(sizes, [["width", 32], ["height", 18]]);
	assert.deepEqual(operations.splice(0), ["read 1", "read 2", "write 1 1", "write 2 1"]);
	sample(300, "brightness(0.5)");
	assert.deepEqual(sizes, [["width", 32], ["height", 18]]);
	assert.deepEqual(operations.splice(0), ["read 1", "read 2", "write 1 0.5", "write 2 0.5"]);

	video.currentSrc = "tainted";
	sample(600);
	assert.equal(contrast.mean, null);
	assert.deepEqual(operations.splice(0), ["clear 1", "clear 2"]);
	assert.deepEqual(sizes.at(-1), ["width", 32]);
	video.currentSrc = "another clean source";
	sample(900);
	assert.ok(Math.abs(contrast.mean - 1) < 1e-12);
	assert.deepEqual(operations, ["read 1", "read 2", "write 1 1", "write 2 1"]);
});
