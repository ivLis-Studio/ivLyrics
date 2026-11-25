import { safeRenderText } from "./lyricDisplayText.mjs";
import { renderAnnotatedLyricHTML } from "./lyricCulturalAnnotations.mjs";

export function createLyricSubLineRenderer({ react, getInactiveColor, renderHtml = renderAnnotatedLyricHTML }) {
	return function renderLyricSubLine(
		className,
		text,
		onContextMenu = null,
		singleLineScroll = false,
		culturalAnnotations = [],
		key = null
	) {
		if (!text) return null;
		const props = {
			className: `${className}${singleLineScroll ? " ivlyrics-vinyl-lyric-scroll-viewport" : ""}`,
			style: { "--sub-lyric-color": getInactiveColor() },
		};
		if (key) props.key = key;
		if (onContextMenu) {
			props.onContextMenu = onContextMenu;
		}

		if (typeof text === "string" && text) {
			const html = renderHtml(text, culturalAnnotations);
			if (!singleLineScroll) {
				props.dangerouslySetInnerHTML = { __html: html };
				return react.createElement("p", props);
			}

			return react.createElement(
				"p",
				props,
				react.createElement("span", {
					className: "ivlyrics-vinyl-lyric-scroll-content",
					dangerouslySetInnerHTML: { __html: html },
				})
			);
		}

		const renderedText = safeRenderText(text);
		return react.createElement(
			"p",
			props,
			singleLineScroll
				? react.createElement(
					"span",
					{ className: "ivlyrics-vinyl-lyric-scroll-content" },
					renderedText
				)
				: renderedText
		);
	};
}
