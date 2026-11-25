export function createLyricsUnavailableView({ react, translate }) {
	function renderLyricsUnavailable(message = translate("messages.noLyrics"), messageClassName = "") {
		const messageClass = [
			"lyrics-lyricsContainer-LyricsUnavailableMessage",
			messageClassName,
		].filter(Boolean).join(" ");

		return react.createElement(
			"div",
			{ className: "lyrics-lyricsContainer-LyricsUnavailablePage" },
			react.createElement(
				"span",
				{ className: messageClass },
				message
			)
		);
	}

	const buildLoadingSpinnerCircle = (begin) =>
		react.createElement(
			"circle",
			{
				cx: "50",
				cy: "50",
				r: "0",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
			},
			react.createElement("animate", {
				attributeName: "r",
				repeatCount: "indefinite",
				dur: "1s",
				values: "0;40",
				keyTimes: "0;1",
				keySplines: "0 0.2 0.8 1",
				calcMode: "spline",
				begin,
			}),
			react.createElement("animate", {
				attributeName: "opacity",
				repeatCount: "indefinite",
				dur: "1s",
				values: "1;0",
				keyTimes: "0;1",
				keySplines: "0.2 0 0.8 1",
				calcMode: "spline",
				begin,
			})
		);

	const LoadingIcon = react.createElement(
		"svg",
		{
			width: "200px",
			height: "200px",
			viewBox: "0 0 100 100",
			preserveAspectRatio: "xMidYMid",
		},
		buildLoadingSpinnerCircle("0s"),
		buildLoadingSpinnerCircle("-0.5s")
	);

	const createNoLyricsParticle = (index, cx, radius, x, duration, delay, opacity = 0.75) =>
		react.createElement("circle", {
			key: `particle-${index}`,
			className: `lyrics-noLyricsMotion-particle lyrics-noLyricsMotion-particle-${index}`,
			cx,
			cy: "168",
			r: radius,
			fill: "currentColor",
			style: {
				"--particle-x": `${x}px`,
				"--particle-duration": `${duration}s`,
				"--particle-delay": `${delay}s`,
				"--particle-opacity": opacity,
			},
		});

	const NoLyricsAnimation = () => react.createElement(
		"svg",
		{
			className: "lyrics-noLyricsMotion",
			viewBox: "0 0 280 180",
			width: "280",
			height: "180",
			role: "img",
			"aria-label": translate("messages.noLyrics"),
			focusable: "false",
		},
		react.createElement(
			"g",
			{ className: "lyrics-noLyricsMotion-staff", "aria-hidden": "true" },
			[68, 88, 108, 128].map((y) =>
				react.createElement("line", {
					key: y,
					x1: "24",
					y1: y,
					x2: "256",
					y2: y,
					stroke: "currentColor",
					strokeWidth: "1",
					strokeLinecap: "round",
				})
			)
		),
		react.createElement("path", {
			className: "lyrics-noLyricsMotion-wave lyrics-noLyricsMotion-wave-soft",
			d: "M18 104 C60 72 100 136 142 104 S224 72 262 104",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
		}),
		react.createElement("path", {
			className: "lyrics-noLyricsMotion-wave lyrics-noLyricsMotion-wave-main",
			d: "M18 104 C60 72 100 136 142 104 S224 72 262 104",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "3",
			strokeLinecap: "round",
		}),
		react.createElement(
			"g",
			{ className: "lyrics-noLyricsMotion-particles", "aria-hidden": "true" },
			[
				createNoLyricsParticle(1, 42, 2.2, 18, 7.4, -0.8, 0.72),
				createNoLyricsParticle(2, 70, 1.7, -12, 8.8, -4.1, 0.58),
				createNoLyricsParticle(3, 98, 2.8, 24, 7.9, -2.2, 0.86),
				createNoLyricsParticle(4, 128, 1.8, -18, 9.6, -6.4, 0.55),
				createNoLyricsParticle(5, 158, 2.3, 15, 7.1, -1.7, 0.78),
				createNoLyricsParticle(6, 188, 1.6, -14, 8.4, -5.3, 0.56),
				createNoLyricsParticle(7, 216, 2.6, 22, 8.1, -3.2, 0.82),
				createNoLyricsParticle(8, 242, 1.8, -10, 9.2, -7.1, 0.6),
			]
		),
		react.createElement(
			"g",
			{ className: "lyrics-noLyricsMotion-notes", "aria-hidden": "true" },
			react.createElement("path", {
				className: "lyrics-noLyricsMotion-note lyrics-noLyricsMotion-note-1",
				d: "M103 45v36c-3-2-6-3-10-3-8 0-14 5-14 10s6 10 14 10 14-5 14-10V56l26-6V39z",
				fill: "currentColor",
			}),
			react.createElement("path", {
				className: "lyrics-noLyricsMotion-note lyrics-noLyricsMotion-note-2",
				d: "M194 66v30c-2-1-5-2-8-2-7 0-12 4-12 9s5 9 12 9 12-4 12-9V76l23 6v28c-2-1-5-2-8-2-7 0-12 4-12 9s5 9 12 9 12-4 12-9V73z",
				fill: "currentColor",
			})
		)
	);

	const LyricsUnavailableView = react.memo(({ isLoading }) =>
		isLoading
			? renderLyricsUnavailable(LoadingIcon)
			: renderLyricsUnavailable(
				react.createElement(NoLyricsAnimation, null),
				"lyrics-lyricsContainer-LyricsUnavailableMessage--motion"
			)
	);

	return { renderLyricsUnavailable, NoLyricsAnimation, LyricsUnavailableView };
}
