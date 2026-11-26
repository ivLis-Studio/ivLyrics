// Parses a hex ("#rrggbb"/"rrggbb") or "rgb(r, g, b)" colour string into an
// {r, g, b} object, falling back to the default {30, 30, 40} otherwise. Pure.
const parseGradientColor = (color) => {
  if (!color) return { r: 30, g: 30, b: 40 };
  // hex 형식
  const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
  if (hexMatch) {
    return { r: parseInt(hexMatch[1], 16), g: parseInt(hexMatch[2], 16), b: parseInt(hexMatch[3], 16) };
  }
  // rgb() 형식
  const rgbMatch = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color);
  if (rgbMatch) {
    return { r: parseInt(rgbMatch[1]), g: parseInt(rgbMatch[2]), b: parseInt(rgbMatch[3]) };
  }
  return { r: 30, g: 30, b: 40 };
};

export function createLyricsBackgroundStyles({ getVisualSettings, isColorLight, getTrackArtwork }) {
  const computeBaseLyricsStyleVariables = ({
    isSyncCreatorActive,
    isFADMode,
    effectiveBackgroundMode,
    colors,
    baseLyricsStyleVariables,
  }) => {
    if (isSyncCreatorActive) {
      return {
        "--lyrics-color-active": "var(--spice-text, #ffffff)",
        "--lyrics-color-inactive": "var(--spice-subtext, rgba(255, 255, 255, 0.58))",
        "--lyrics-color-background": "var(--spice-main, #121212)",
        "--lyrics-highlight-background": "transparent",
        "--lyrics-background-noise": "unset",
      };
    }
    if (isFADMode) {
      // Text colors will be set by FAD extension
      // Disable colorful backgrounds in FAD mode
      return {};
    }
    if (effectiveBackgroundMode === "colorful" && colors.background) {
      const isLight = isColorLight(colors.background);
      return {
        "--lyrics-color-active": isLight ? "black" : "white",
        "--lyrics-color-inactive": isLight
          ? "rgba(0, 0, 0, 0.4)"
          : "rgba(255, 255, 255, 0.4)",
        "--lyrics-color-background": colors.background,
        "--lyrics-highlight-background": colors.inactive,
        "--lyrics-background-noise": getVisualSettings().noise
          ? "var(--background-noise)"
          : "unset",
      };
    }
    if (effectiveBackgroundMode === "solid-background") {
      const isLight = isColorLight(
        getVisualSettings()["solid-background-color"]
      );
      return {
        "--lyrics-color-active": isLight ? "black" : "white",
        "--lyrics-color-inactive": isLight
          ? "rgba(0, 0, 0, 0.4)"
          : "rgba(255, 255, 255, 0.4)",
        "--lyrics-color-background": getVisualSettings()["solid-background-color"],
        "--lyrics-highlight-background": isLight
          ? "rgba(0, 0, 0, 0.1)"
          : "rgba(255, 255, 255, 0.1)",
        "--lyrics-background-noise": getVisualSettings().noise
          ? "var(--background-noise)"
          : "unset",
      };
    }
    return baseLyricsStyleVariables;
  };

  const computeLyricsBackgroundStyle = ({
    isSyncCreatorActive,
    isFADMode,
    effectiveBackgroundMode,
    dynamicColors,
    colors,
  }) => {
    const backgroundStyle = {};
    // A static artwork blur is rasterized once with this layer. Naming filter
    // in will-change kept it on the compositor, which re-ran the full-screen
    // blur on every frame; the rasterized pixels are the same.
    const compositedBackgroundStyle = {
      willChange: "transform, opacity",
      backfaceVisibility: "hidden",
      WebkitBackfaceVisibility: "hidden",
      transform: "translateZ(0)",
      contain: "paint",
    };
    // Disable background features when in FAD mode (Full Screen extension)
    if (isSyncCreatorActive) {
      backgroundStyle.backgroundColor = "var(--spice-main, #121212)";
      backgroundStyle.filter = "none";
    } else if (!isFADMode && effectiveBackgroundMode === "video-background") {
      // Video background is handled by the component
    } else if (!isFADMode && effectiveBackgroundMode === "gradient-background") {
      const brightness = getVisualSettings()["background-brightness"] / 100;
      const blurAmount = getVisualSettings()["album-bg-blur"] ?? 20;
      // 앨범 커버 이미지 가져오기
      const albumArtUrl = getTrackArtwork();

      if (albumArtUrl) {
        Object.assign(backgroundStyle, compositedBackgroundStyle);
        backgroundStyle.backgroundImage = `url(${albumArtUrl})`;
        backgroundStyle.backgroundRepeat = "no-repeat";
        backgroundStyle.filter = `brightness(${brightness}) blur(${blurAmount}px)`;
        backgroundStyle.backgroundSize = "cover";
        backgroundStyle.backgroundPosition = "center";
      }
    } else if (!isFADMode && effectiveBackgroundMode === "blur-gradient-background") {
      const brightness = getVisualSettings()["background-brightness"] / 100;

      let c1 = { r: 30, g: 30, b: 40 };
      let c2 = { r: 60, g: 40, b: 70 };
      let c3 = { r: 20, g: 50, b: 60 };

      if (dynamicColors) {
        c1 = parseGradientColor(dynamicColors.minContrast);
        c2 = parseGradientColor(dynamicColors.highContrast);
        c3 = parseGradientColor(dynamicColors.overlayColor);
      }

      backgroundStyle["--ivLyrics-c1"] = `${c1.r}, ${c1.g}, ${c1.b}`;
      backgroundStyle["--ivLyrics-c2"] = `${c2.r}, ${c2.g}, ${c2.b}`;
      backgroundStyle["--ivLyrics-c3"] = `${c3.r}, ${c3.g}, ${c3.b}`;
      Object.assign(backgroundStyle, compositedBackgroundStyle);
      backgroundStyle.filter = `brightness(${brightness}) saturate(2.5)`;
    } else if (
      !isFADMode &&
      effectiveBackgroundMode === "colorful" &&
      colors.background
    ) {
      const brightness = getVisualSettings()["background-brightness"] / 100;
      backgroundStyle.backgroundColor = colors.background;
      backgroundStyle.filter = `brightness(${brightness})`;
    } else if (!isFADMode && effectiveBackgroundMode === "solid-background") {
      const brightness = getVisualSettings()["background-brightness"] / 100;
      backgroundStyle.backgroundColor = getVisualSettings()["solid-background-color"];
      backgroundStyle.filter = `brightness(${brightness})`;
    }

    return backgroundStyle;
  };

  return { computeBaseLyricsStyleVariables, computeLyricsBackgroundStyle };
}
