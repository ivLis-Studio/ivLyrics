import { getNonEmptyString } from "./fullscreenTracks.mjs";

function selectOverlayMetadataLines({ mode, original, translated, romanized, includeRomanizedInAll }) {
    if (mode === "translated") return [{ kind: "main", value: translated || original }];
    if (mode === "romanized") return [{ kind: "main", value: romanized || original }];

    const lines = [{ kind: "original", value: original }];
    if (mode !== "original-romanized" && translated && translated !== original) {
        lines.push({ kind: "translated", value: translated });
    }
    if (mode === "original-romanized") {
        if (romanized && romanized !== original) lines.push({ kind: "romanized", value: romanized });
    } else if (mode !== "original-translated" && includeRomanizedInAll
        && romanized && romanized !== original && romanized !== translated) {
        lines.push({ kind: "romanized", value: romanized });
    }
    return lines;
}

export function createFullscreenMetadataViews({ react, trimTitle, readMetadataMode }) {
    // TMI FullView의 trackName/artistName IIFE에서 반복되던 표시 모드 해석 로직.
    // 축소 레이아웃(TV/Portrait 위 오버레이)은 translated/romanized 두 모드만 처리하고,
    // 전체 레이아웃은 original-translated/original-romanized/all 합성 모드까지 처리하던
    // 동작 차이를 includeCompositeModes 플래그로 명시적으로 유지한다.
    const resolveTmiMetadataName = (mode, original, trans, rom, includeCompositeModes) => {
        if (mode === "translated") return trans || original;
        if (mode === "romanized") return rom || original;
        if (includeCompositeModes) {
            if (mode === "original-translated") return (trans && trans !== original) ? `${original} (${trans})` : original;
            if (mode === "original-romanized") return (rom && rom !== original) ? `${original} (${rom})` : original;
            if (mode === "all") return (trans && trans !== original) ? `${original} (${trans})` : original;
        }
        return original;
    };

    const buildOverlayMetadataLines = ({
        mode,
        original,
        translated,
        romanized,
        applyTrim,
        keyPrefix,
        mainClass,
        translatedClass,
        romanizedClass,
        mainSize,
        translatedSize,
        romanizedSize,
        includeRomanizedInAll,
    }) => {
        const lineStyles = {
            main: [mainClass, mainSize],
            original: [mainClass, mainSize],
            translated: [translatedClass, translatedSize],
            romanized: [romanizedClass, romanizedSize],
        };
        const lines = selectOverlayMetadataLines({ mode, original, translated, romanized, includeRomanizedInAll });
        return lines.map(({ kind, value }) => {
            const [className, size] = lineStyles[kind];
            return react.createElement("div", {
                key: `${keyPrefix}-${kind}`,
                className,
                style: { fontSize: `${size}px` },
            }, applyTrim(value));
        });
    };

    const renderPortraitMetadataLines = ({
        type, original, translated, romanized, uri, trimTitleEnabled, createNavigationProps,
    }) => {
        const mode = readMetadataMode();
        const lines = selectOverlayMetadataLines({
            mode, original, translated, romanized, includeRomanizedInAll: type === "title",
        });
        return lines.map(({ kind, value }, index) => {
            const className = `portrait-track-${type}${index === 0 ? "" : "-sub"}`;
            let key = `pt-${type}`;
            if (index > 0) {
                if (mode === "original-translated" || mode === "original-romanized") key += "-sub";
                else key += kind === "translated" ? "-trans" : "-rom";
            }
            return react.createElement("div", {
                key,
                ...createNavigationProps(uri, className),
            }, trimTitleEnabled ? trimTitle(value) : value);
        });
    };

    const resolveTvMetadataLines = (mode, originalValue, translatedValue, romanizedValue) => {
        const values = {
            original: getNonEmptyString(originalValue),
            translated: getNonEmptyString(translatedValue),
            romanized: getNonEmptyString(romanizedValue)
        };
        const requestedKinds = (() => {
            switch (mode) {
                case "translated":
                    return [values.translated ? "translated" : "original"];
                case "romanized":
                    return [values.romanized ? "romanized" : "original"];
                case "original-translated":
                    return ["original", "translated"];
                case "original-romanized":
                    return ["original", "romanized"];
                case "all":
                    return ["original", "translated", "romanized"];
                default:
                    return ["original"];
            }
        })();
        const seen = new Set();

        return requestedKinds.reduce((lines, kind) => {
            const value = values[kind];
            if (!value || seen.has(value)) return lines;
            seen.add(value);
            lines.push({ kind, value });
            return lines;
        }, []);
    };

    const renderTvMetadataLines = ({
        type,
        original,
        translated,
        romanized,
        fontSize, trimTitleEnabled,
    }) => {
        const mode = readMetadataMode();
        const applyTrim = (text) => trimTitleEnabled ? trimTitle(text) : text;
        const lines = resolveTvMetadataLines(
            mode,
            applyTrim(original),
            applyTrim(translated),
            applyTrim(romanized)
        );
        const secondaryScale = type === "title" ? 0.6 : 0.8;

        return lines.map((line, index) => react.createElement("div", {
            key: `${type}-${line.kind}`,
            className: `fullscreen-tv-${type}${index > 0 ? ` fullscreen-tv-${type}-secondary` : ""}`,
            style: {
                fontSize: `calc(${index === 0 ? fontSize : Math.round(fontSize * secondaryScale)}px * var(--fullscreen-tv-metadata-scale, 1))`
            }
        }, line.value));
    };

    return { resolveTmiMetadataName, buildOverlayMetadataLines, renderPortraitMetadataLines, renderTvMetadataLines };
}
