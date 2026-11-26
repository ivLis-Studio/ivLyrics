export const RESEARCH_FONT_SIZE_KEY = "fullscreen-tmi-font-size";
export const RESEARCH_FONT_SIZE_MIN = 80;
export const RESEARCH_FONT_SIZE_MAX = 150;
export const RESEARCH_FONT_SIZE_STEP = 5;

const clampFontSize = (value) => Math.min(RESEARCH_FONT_SIZE_MAX, Math.max(RESEARCH_FONT_SIZE_MIN, Number(value) || 100));

export function getResearchFontSize(visual, scale) {
    return clampFontSize(scale == null ? visual?.[RESEARCH_FONT_SIZE_KEY] : Number(scale) * 100);
}

export function useResearchFontSize(react, sourceSize, { save, publish, subscribe }) {
    const { useRef, useState } = react;
    const useLayoutEffect = react.useLayoutEffect ?? react.useEffect;
    const [change, setChange] = useState(null);
    const fontSize = change?.sourceSize === sourceSize ? change.value : sourceSize;
    const currentSize = useRef(fontSize);

    function applySize(value) {
        currentSize.current = value;
        setChange({ sourceSize, value });
    }

    useLayoutEffect(() => {
        currentSize.current = fontSize;
        if (change && change.sourceSize !== sourceSize) setChange(null);
    }, [fontSize, sourceSize, change]);

    useLayoutEffect(() => subscribe(({ detail }) => {
        if (detail?.type !== "config" || detail.name !== RESEARCH_FONT_SIZE_KEY) return;
        const value = clampFontSize(detail.value);
        if (currentSize.current !== value) applySize(value);
    }), [sourceSize, subscribe]);

    function changeFontSize(direction) {
        const step = RESEARCH_FONT_SIZE_STEP;
        const value = clampFontSize(Math.round(currentSize.current / step + direction) * step);
        if (currentSize.current === value) return;
        try {
            save(value);
        } catch (error) {
            console.error("[SongResearch] Failed to save text size:", error);
            return;
        }
        applySize(value);
        publish(value);
    }

    return { fontSize, changeFontSize };
}
