import { createOutsideTextOutlineShadow } from "./lyricsTextOutline.mjs";

const INSTRUMENTAL_BREAK_ICON_DESIGNS = new Set([
	"equalizer",
	"dotWave",
	"ripples",
	"orbit",
	"diamonds",
	"scan",
	"arcs",
	"signal",
	"pulseDot",
	"stack",
	"spark",
	"splitBars",
	"metronome",
	"vinyl",
	"beat",
	"reels",
	"triangle",
	"morph",
	"strings",
	"piano",
	"bloom",
	"speaker",
	"crossfade",
]);

export function getInstrumentalBreakMotionStyle(configuredSpeed) {
	const speed = Number(configuredSpeed ?? 100);
	const safeSpeed = Number.isFinite(speed) ? Math.max(50, Math.min(200, speed)) : 100;
	const duration = Math.round(1100 * (100 / safeSpeed));
	return {
		"--break-duration": `${duration}ms`,
		"--break-duration-fast": `${Math.round(duration * 0.72)}ms`,
		"--break-duration-slow": `${Math.round(duration * 1.65)}ms`,
		"--break-duration-xslow": `${Math.round(duration * 3.8)}ms`,
	};
}

export function getInstrumentalBreakPresentation({ readSetting, fallbackFont, defaultSize }) {
	const icon = readSetting("instrumental-break-icon", "equalizer") || "equalizer";
	const motionStyle = getInstrumentalBreakMotionStyle(readSetting("instrumental-break-animation-speed", 100));
	const labelFontFamily = readSetting("instrumental-break-label-font-family", "") || fallbackFont();
	const labelNumber = (key, fallback, min, max) => {
		const value = readSetting(key, fallback);
		const numeric = value === undefined || value === null || value === "" ? fallback : Number(value);
		return Math.max(min, Math.min(max, Number.isFinite(numeric) ? numeric : fallback));
	};
	return {
		icon: INSTRUMENTAL_BREAK_ICON_DESIGNS.has(icon) ? icon : "equalizer",
		showLabel: readSetting("instrumental-break-show-label", false) === true,
		style: {
			...motionStyle,
			"--break-label-font-family": labelFontFamily,
			"--break-label-font-size": `${labelNumber("instrumental-break-label-font-size", defaultSize, 12, 128)}px`,
			"--break-label-font-weight": labelNumber("instrumental-break-label-font-weight", 200, 100, 900),
			"--break-label-opacity": labelNumber("instrumental-break-label-opacity", 65, 0, 100) / 100,
			"--break-label-outline-shadow": createOutsideTextOutlineShadow(
				labelNumber("instrumental-break-label-outline-width", 0, 0, 10),
				readSetting("instrumental-break-label-outline-color", "#000000")
			),
		},
	};
}

export const getInstrumentalBreakLabel = (kind, translate) => {
	const key = kind === "prelude"
		? "settingsAdvanced.instrumentalBreak.labels.prelude"
		: kind === "postlude"
			? "settingsAdvanced.instrumentalBreak.labels.postlude"
			: "settingsAdvanced.instrumentalBreak.labels.break";

	return translate(key, kind === "prelude" ? "Intro" : kind === "postlude" ? "Outro" : "Break");
};

export const createBreakIconChildren = (react, icon) => {
	const span = (key, props = {}) => react.createElement("span", { key, ...props });

	switch (icon) {
		case "dotWave":
			return [0, 1, 2, 3, 4].map((index) => span(index));
		case "ripples":
		case "orbit":
		case "vinyl":
			return span("main");
		case "diamonds":
		case "stack":
			return [0, 1, 2].map((index) => span(index));
		case "signal":
			return react.createElement(
				"svg",
				{ viewBox: "0 0 112 32", "aria-hidden": "true" },
				react.createElement("path", {
					d: "M2 18 H20 L26 9 L34 25 L43 14 L50 18 H68 L74 9 L82 25 L91 14 L98 18 H110",
				})
			);
		case "spark":
			return [0, 1, 2, 3, 4, 5, 6, 7].map((index) => span(index, { style: { "--i": index } }));
		case "splitBars":
		case "strings":
			return [0, 1, 2, 3].map((index) => span(index));
		case "reels":
			return [0, 1].map((index) => span(index));
		case "piano":
			return [0, 1, 2, 3, 4].map((index) => span(index));
		case "bloom":
			return [0, 1, 2, 3].map((index) => span(index));
		case "scan":
		case "arcs":
		case "pulseDot":
		case "metronome":
		case "beat":
		case "triangle":
		case "morph":
		case "speaker":
		case "crossfade":
			return null;
		case "equalizer":
		default:
			return [0, 1, 2, 3].map((index) => span(index));
	}
};

export function createInterludeIndicator({ react, getVisualSettings, translate }) {
	return react.memo(({ kind = "break" }) => {
		const visual = getVisualSettings();
		const settings = getInstrumentalBreakPresentation({
			readSetting: (key, fallback) => visual?.[key] ?? fallback,
			fallbackFont: () => visual?.["original-font-family"] || "var(--lyrics-original-font-family, var(--font-family))",
			defaultSize: 20,
		});
		const label = getInstrumentalBreakLabel(kind, (key, fallback) => translate(key) || fallback);

		return react.createElement(
			"span",
			{
				className: `lyrics-break-indicator lyrics-break-kind-${kind}`,
				"aria-label": settings.showLabel ? label : undefined,
				"aria-hidden": settings.showLabel ? undefined : "true",
				style: settings.style,
			},
			react.createElement(
				"span",
				{ className: `lyrics-break-icon lyrics-break-icon-${settings.icon}` },
				createBreakIconChildren(react, settings.icon)
			),
			settings.showLabel && react.createElement("span", { className: "lyrics-break-label" }, label)
		);
	});
}
