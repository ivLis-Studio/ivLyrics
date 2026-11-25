// Build a crisp outline from copies of the completed glyph silhouette. Unlike
// -webkit-text-stroke, these layers sit behind the fill and never consume the
// inside of thin glyphs. Multiple rings keep large configured widths solid.
export const createOutsideTextOutlineShadow = (widthValue, colorValue = "#000000") => {
	const width = Math.max(0, Math.min(10, Number(widthValue) || 0));
	if (width <= 0) return "0 0 0 transparent";

	const color = String(colorValue || "#000000");
	const ringCount = Math.max(1, Math.min(4, Math.ceil(width * 2)));
	const directionCount = width <= 0.5 ? 8 : width <= 1 ? 12 : 16;
	const layers = [];
	const formatOffset = (value) => {
		const rounded = Math.abs(value) < 0.0005 ? 0 : value;
		return `${rounded.toFixed(3)}px`;
	};

	for (let ring = 1; ring <= ringCount; ring += 1) {
		const radius = width * (ring / ringCount);
		for (let direction = 0; direction < directionCount; direction += 1) {
			const angle = (Math.PI * 2 * direction) / directionCount;
			layers.push(
				`${formatOffset(Math.cos(angle) * radius)} ${formatOffset(Math.sin(angle) * radius)} 0 ${color}`
			);
		}
	}

	return layers.join(", ");
};

// A full-density outline becomes visually much heavier after the surrounding
// lyric line is blurred. Keep the configured geometry but render a sparse,
// low-opacity variant so its width still tracks the setting without flooding
// the glyph interior.
export const getBlurredLineOutlineWidth = (widthValue) => Math.min(
	10,
	Math.max(0, Number(widthValue) || 0)
);

export const createBlurredLineOutlineShadow = (widthValue, colorValue = "#000000") => {
	const width = getBlurredLineOutlineWidth(widthValue);
	if (width <= 0) return "0 0 0 transparent";

	const color = String(colorValue || "#000000");
	const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
	const mutedColor = hexMatch
		? `rgba(${parseInt(hexMatch[1], 16)}, ${parseInt(hexMatch[2], 16)}, ${parseInt(hexMatch[3], 16)}, 0.03)`
		: `color-mix(in srgb, ${color} 3%, transparent)`;
	const formatOffset = (value) => `${(Math.abs(value) < 0.0005 ? 0 : value).toFixed(3)}px`;

	return Array.from({ length: 16 }, (_, direction) => direction)
		.map((direction) => {
			const angle = (Math.PI * 2 * direction) / 16;
			return `${formatOffset(Math.cos(angle) * width)} ${formatOffset(Math.sin(angle) * width)} 0 ${mutedColor}`;
		})
		.join(", ");
};
