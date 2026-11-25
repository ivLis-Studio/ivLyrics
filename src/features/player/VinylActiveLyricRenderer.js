import { createVinylActiveLyricRenderer } from "#ivlyrics/features/player/createVinylActiveLyricRenderer.mjs";
import { isLyricFuriganaReady as isVinylFuriganaReady, readLyricRenderingLocale as readVinylLyricLocale } from "#ivlyrics/lyrics/lyricsTextRuntime.mjs";

export function createPageVinylLyricRenderer({ react, host, document, primitives, getVisualSettings, getFramePosition }) {
    return createVinylActiveLyricRenderer({
        react, primitives, browser: host,
        getFonts: () => document.fonts,
        getVisualSettings, getFramePosition,
        isFuriganaReady: () => isVinylFuriganaReady(host),
        getLyricsLocale: () => readVinylLyricLocale(host),
    });
}
