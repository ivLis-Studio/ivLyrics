import { clamp, round } from "./motionMath.mjs";

export function createMotionContrast({ document, stage, createImage, readComputedStyle, readMountedBoards, write }) {
	// ---- Contrast: how bright the picture is behind each line, where it can be read (a cover, a video
	// of our own); the halo round the type is stronger on bright parts, the shade over the frame lighter
	// on dark ones. A picture that cannot be read (a YouTube player, the apps' own video) leaves both as they are.
	const CONTRAST_MS = 300;
	const contrast = { canvas: null, context: null, key: "", image: null, blocked: new Set(), cells: null, columns: 0, rows: 0, mean: null, at: -Infinity, paintedAt: -Infinity, frame: null };
	const contrastSource = (backdrop) => {
		if (!backdrop || backdrop.querySelector?.("iframe")) return null;
		const video = backdrop.querySelector?.("video");
		if (video) return video.readyState >= 2 && video.videoWidth ? { key: "video:" + (video.currentSrc || video.src), el: video, width: video.videoWidth, height: video.videoHeight } : null;
		const img = backdrop.querySelector?.("img");
		if (img) return img.complete && img.naturalWidth ? { key: "img:" + img.currentSrc, el: img, width: img.naturalWidth, height: img.naturalHeight } : null;
		const url = /url\(["']?([^"')]+)["']?\)/.exec(readComputedStyle(backdrop)?.backgroundImage || "")?.[1];
		if (!url) return null;
		// A cover set as a background image is read from a copy loaded for it.
		if (contrast.key !== "url:" + url) {
			contrast.key = "url:" + url;
			contrast.image = null;
			const image = createImage();
			image.crossOrigin = "anonymous";
			image.onload = () => { if (contrast.key === "url:" + url) contrast.image = image; };
			image.src = url;
		}
		return contrast.image ? { key: contrast.key, el: contrast.image, width: contrast.image.naturalWidth, height: contrast.image.naturalHeight } : null;
	};
	/** Samples the picture (as the camera has turned it) into a small grid of brightness. */
	const sampleContrast = (backdrop, at, plan, backgroundFilter) => {
		if (at - contrast.at < CONTRAST_MS) return;
		contrast.at = at;
		const source = contrastSource(backdrop);
		if (!source || contrast.blocked.has(source.key)) {
			contrast.cells = null;
			contrast.mean = null;
			return;
		}
		const columns = 32;
		const rows = Math.max(8, Math.round((columns * plan.H) / plan.W));
		if (!contrast.canvas) {
			contrast.canvas = document.createElement("canvas");
			contrast.context = contrast.canvas.getContext("2d", { willReadFrequently: true });
		}
		if (!contrast.context) return;
		contrast.canvas.width = columns;
		contrast.canvas.height = rows;
		const context = contrast.context;
		const frame = contrast.frame || { rotate: 0, scale: 1, x: 0, y: 0 };
		// object-fit: cover, then the camera's turn, zoom and shift.
		const cover = Math.max(columns / source.width, rows / source.height);
		context.setTransform(1, 0, 0, 1, 0, 0);
		context.fillStyle = "#000";
		context.fillRect(0, 0, columns, rows);
		context.translate(columns / 2 + (frame.x * columns) / plan.W, rows / 2 + (frame.y * rows) / plan.H);
		context.rotate(((frame.rotate || 0) * Math.PI) / 180);
		context.scale(frame.scale || 1, frame.scale || 1);
		try {
			context.drawImage(source.el, (-source.width * cover) / 2, (-source.height * cover) / 2, source.width * cover, source.height * cover);
			const pixels = context.getImageData(0, 0, columns, rows).data;
			const cells = new Float32Array(columns * rows);
			let sum = 0;
			for (let index = 0; index < cells.length; index += 1) {
				const value = (0.2126 * pixels[index * 4] + 0.7152 * pixels[index * 4 + 1] + 0.0722 * pixels[index * 4 + 2]) / 255;
				cells[index] = value;
				sum += value;
			}
			// The background's own dimming (brightness(...) in its filter) darkens what is seen.
			const dim = Number(/brightness\(([\d.]+)\)/.exec(backgroundFilter.base || "")?.[1]);
			const factor = Number.isFinite(dim) ? dim : 1;
			for (let index = 0; index < cells.length; index += 1) cells[index] *= factor;
			contrast.cells = cells;
			contrast.columns = columns;
			contrast.rows = rows;
			contrast.mean = (sum / cells.length) * factor;
		} catch {
			// A picture from another origin cannot be read: left as it is.
			contrast.blocked.add(source.key);
			contrast.cells = null;
			contrast.mean = null;
		}
	};
	/** How bright the picture is behind a line on screen (0 to 1), or null when it cannot be read. */
	const brightnessBehind = (element, stageRect) => {
		if (!contrast.cells) return null;
		const rect = element.getBoundingClientRect();
		if (!rect.width || !rect.height) return null;
		const left = clamp(Math.floor(((rect.left - stageRect.left) / stageRect.width) * contrast.columns), 0, contrast.columns - 1);
		const right = clamp(Math.ceil(((rect.right - stageRect.left) / stageRect.width) * contrast.columns), left + 1, contrast.columns);
		const top = clamp(Math.floor(((rect.top - stageRect.top) / stageRect.height) * contrast.rows), 0, contrast.rows - 1);
		const bottom = clamp(Math.ceil(((rect.bottom - stageRect.top) / stageRect.height) * contrast.rows), top + 1, contrast.rows);
		let sum = 0;
		let count = 0;
		let brightest = 0;
		for (let row = top; row < bottom; row += 1) {
			for (let column = left; column < right; column += 1) {
				const value = contrast.cells[row * contrast.columns + column];
				sum += value;
				count += 1;
				brightest = Math.max(brightest, value);
			}
		}
		// Bright spots behind the type matter more than the average.
		return count ? clamp((sum / count) * 0.6 + brightest * 0.4, 0, 1) : null;
	};
	/** Each visible line's halo, from the brightness behind it (every CONTRAST_MS). */
	const paintContrast = (at) => {
		if (at - contrast.paintedAt < CONTRAST_MS) return;
		contrast.paintedAt = at;
		const stageRect = contrast.cells ? stage.getBoundingClientRect() : null;
		for (const entry of readMountedBoards()) {
			for (const lineEntry of entry.lines) {
				const shown = (lineEntry.cache.solid || 0) > 0.05;
				const value = shown && stageRect ? brightnessBehind(lineEntry.el, stageRect) : null;
				const level = value === null ? "" : String(round(value, 2));
				write(lineEntry.cache, "lum", level, (next) => {
					if (next === "") lineEntry.el.style.removeProperty("--lum");
					else lineEntry.el.style.setProperty("--lum", next);
				});
			}
		}
	};

	return {
		sampleContrast,
		paintContrast,
		setFrame(frame) { contrast.frame = frame; },
		reset() {
			contrast.cells = null;
			contrast.mean = null;
			contrast.at = -Infinity;
			contrast.paintedAt = -Infinity;
			contrast.frame = null;
		},
		get mean() { return contrast.mean; },
	};
}
