import { readSettingFlag, readSettingNumber } from "./settingsPreviewValues.mjs";

// Same hue wheel as the CD canvas (CdVisualizer.js RAINBOW_HUES).
export const SETTINGS_CD_RAINBOW_HUES = [330, 20, 48, 140, 188, 228, 276, 330];
export const SETTINGS_CD_STYLE_ORDER = ["bars", "blocks", "spikes", "line", "wave", "dots", "aura", "pulse", "particles"];
const settingsCdRainbowColor = (fraction, mirror = false) => {
  const hues = SETTINGS_CD_RAINBOW_HUES;
  const turn = ((Number(fraction) % 1) + 1) % 1;
  const position = mirror ? (turn <= 0.5 ? turn * 2 : (1 - turn) * 2) * (hues.length - 2) : turn * (hues.length - 1);
  const index = Math.min(hues.length - 2, Math.floor(position));
  let delta = hues[index + 1] - hues[index];
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return `hsl(${Math.round((hues[index] + delta * (position - index) + 360) % 360)}, 82%, 68%)`;
};

export function createSettingsFullscreenPreview({
  react,
  getVisual,
  useSettingsConfigRevision,
  getCurrentSettingsBackgroundMode,
  normalizeSettingsHexColor,
}) {
  // Static schematics, not simulated audio. The even-odd paths leave the centre
  // transparent, including in the small presentation picker and shape cards.
  const SettingsCdDiscPreview = ({
    visualizer = true, style = "bars", color = "#b8cfdd", density = 64, thickness = 2,
    mirror = false, rainbow = false, albumGradient = false, variant = "full", rotation = false, rotationSpeed = 100,
  } = {}) => {
    const mini = variant === "mini";
    const ring = (outer, inner) => `M ${100 - outer} 100 a ${outer} ${outer} 0 1 0 ${outer * 2} 0 a ${outer} ${outer} 0 1 0 ${-outer * 2} 0 M ${100 - inner} 100 a ${inner} ${inner} 0 1 0 ${inner * 2} 0 a ${inner} ${inner} 0 1 0 ${-inner * 2} 0`;
    // Thumbnails use fewer, balanced bands so each shape reads at 48 px.
    const count = mini ? ({ spikes: 16, blocks: 20 }[style] || 24) : Math.max(24, Math.min(128, Number(density) || 64));
    const bandThickness = Math.max(1, Math.min(6, Number(thickness) || 2));
    const width = bandThickness * (mini ? 2.6 : 1);
    const disc = mini ? 58 : 76, base = mini ? 66 : 83, span = mini ? 30 : 10;
    const at = (angle, radius) => [100 + Math.sin(angle) * radius, 100 - Math.cos(angle) * radius];
    const round = (value) => Math.round(value * 100) / 100;
    const angleOf = (index) => index / count * Math.PI * 2;
    const level = (index) => {
      const band = mirror ? Math.min(index, count - index) : index;
      if (!mini) return (Math.sin(band * 0.73) + 1) / 2;
      const angle = angleOf(band);
      return 0.5 + 0.3 * Math.sin(3 * angle + 0.6) + 0.2 * Math.sin(5 * angle + 1.9);
    };
    const points = visualizer ? Array.from({ length: count }, (_, index) => {
      const angle = angleOf(index);
      const amplitude = level(index);
      const radius = base + 2 + amplitude * (span - 2);
      return { angle, amplitude, radius, point: at(angle, radius) };
    }) : [];
    const tone = (index) => rainbow ? settingsCdRainbowColor(index / count, mirror) : color;
    const gradientId = `ivl-cd-rainbow-${mini ? "mini" : "full"}-${mirror ? "m" : "c"}`;
    const albumPatternId = `ivl-cd-album-${mini ? "mini" : "full"}`;
    const paint = rainbow ? `url(#${gradientId})` : albumGradient ? `url(#${albumPatternId})` : color;
    const contour = (scale = 1) => {
      const tips = points.map(({ angle, amplitude }) => at(angle, base + 2 + amplitude * (span - 2) * scale));
      const mid = (a, b) => [round((a[0] + b[0]) / 2), round((a[1] + b[1]) / 2)];
      return `M ${mid(tips[count - 1], tips[0]).join(" ")} ${tips.map((tip, index) =>
        `Q ${round(tip[0])} ${round(tip[1])} ${mid(tip, tips[(index + 1) % count]).join(" ")}`).join(" ")} Z`;
    };
    const circlePath = (radius) => `M ${100 - radius} 100 a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
    const shapes = () => {
      if (style === "line") {
        if (!rainbow) return [react.createElement("path", { key: "line", d: `${points.map(({ point }, index) => `${index ? "L" : "M"}${point.join(" ")}`).join(" ")} Z` })];
        return points.map(({ point }, index) => {
          const next = points[(index + 1) % count].point;
          return react.createElement("line", { key: index, x1: point[0], y1: point[1], x2: next[0], y2: next[1], stroke: tone(index) });
        });
      }
      if (style === "dots") {
        return points.map(({ point }, index) => react.createElement("circle", { key: index, cx: point[0], cy: point[1], r: width, fill: rainbow ? tone(index) : undefined }));
      }
      if (style === "wave") {
        const crest = contour();
        return [
          react.createElement("path", { key: "fill", d: `${crest} ${circlePath(base)}`, fillRule: "evenodd", fill: paint, fillOpacity: 0.26, stroke: "none" }),
          react.createElement("path", { key: "crest", d: crest, fill: "none", stroke: paint }),
        ];
      }
      if (style === "aura") {
        return [[1, 0.16], [0.66, 0.22], [0.36, 0.3]].map(([scale, opacity]) =>
          react.createElement("path", { key: scale, d: `${contour(scale)} ${circlePath(disc)}`, fillRule: "evenodd", fill: paint, fillOpacity: opacity, stroke: "none" }));
      }
      if (style === "blocks") {
        const levels = mini ? 3 : 5;
        const start = base + 1.5, pitch = (span - 1.5) / (levels - 0.3), block = pitch * 0.7;
        const blockWidth = Math.min(width * 2.2 + 1, base * Math.PI * 2 / count * 0.72);
        return points.map(({ angle, amplitude }, index) => {
          const lit = Math.max(1, Math.round(amplitude * levels));
          const [x1, y1] = at(angle, start), [x2, y2] = at(angle, start + lit * pitch - (pitch - block));
          return react.createElement("line", { key: index, x1, y1, x2, y2, stroke: tone(index), strokeWidth: blockWidth, strokeLinecap: "butt", strokeDasharray: `${round(block)} ${round(pitch - block)}` });
        });
      }
      if (style === "spikes") {
        const half = Math.PI / count * Math.min(1, 0.55 + bandThickness * 0.075);
        return points.map(({ angle, radius }, index) => react.createElement("path", {
          key: index, fill: tone(index), stroke: "none",
          d: `M ${at(angle - half, base + 0.5).map(round).join(" ")} L ${at(angle, radius).map(round).join(" ")} L ${at(angle + half, base + 0.5).map(round).join(" ")} Z`,
        }));
      }
      if (style === "pulse") {
        return [[0.08, 1, 1.5], [0.36, 0.7, 1.2], [0.66, 0.42, 0.95], [0.94, 0.2, 0.7]].map(([reach, opacity, scale], index) =>
          react.createElement("circle", { key: index, cx: 100, cy: 100, r: round(base + reach * span), fill: "none", stroke: paint, strokeOpacity: opacity, strokeWidth: round(width * scale) }));
      }
      if (style === "particles") {
        const stride = Math.max(2, Math.round(count / 16));
        return [0, 1, 2].flatMap((generation) => points.filter((_, index) => index % stride === generation % stride).map(({ angle }, index) => {
          const band = index * stride + (generation % stride);
          const [x, y] = at(angle, base + 3 + (span - 4) * (0.12 + generation * 0.36) * (0.55 + 0.45 * level(band)));
          return react.createElement("circle", { key: `${generation}-${band}`, cx: round(x), cy: round(y), r: round(width * (1 - generation * 0.22)), fill: tone(band), fillOpacity: 1 - generation * 0.3 });
        }));
      }
      return points.map(({ angle, radius }, index) => react.createElement("line", {
        key: index, x1: at(angle, base)[0], y1: at(angle, base)[1], x2: at(angle, radius)[0], y2: at(angle, radius)[1], stroke: rainbow ? tone(index) : undefined,
      }));
    };
    const filled = style === "dots" || style === "spikes" || style === "particles";
    return react.createElement(
      "svg",
      {
        className: mini ? "settings-cd-style-thumb" : "settings-cd-disc-preview", viewBox: "0 0 200 200",
        width: mini ? 48 : "100%", height: mini ? 48 : "100%", "aria-hidden": "true", focusable: "false",
        "data-cd-style": style, "data-cd-mirror": mirror ? "true" : undefined, style: { display: "block", overflow: "visible" },
      },
      rainbow && visualizer ? react.createElement("defs", null,
        react.createElement("linearGradient", { id: gradientId, x1: 0, y1: 0, x2: mirror ? 0 : 1, y2: 1 },
          ...(mirror ? SETTINGS_CD_RAINBOW_HUES.slice(0, -1) : SETTINGS_CD_RAINBOW_HUES).map((hue, index, hues) =>
            react.createElement("stop", { key: index, offset: round(index / (hues.length - 1)), stopColor: `hsl(${hue}, 82%, 68%)` })))) : null,
      albumGradient && !rainbow && visualizer ? react.createElement("defs", null,
        ...["#c8ab83", "#557784", "#a5bfbc", "#c8ab83"].map((shade, index, shades) =>
          react.createElement("radialGradient", {
            key: index, id: `${albumPatternId}-${index}`, gradientUnits: "userSpaceOnUse",
            cx: at(index / shades.length * Math.PI * 2, 75)[0],
            cy: at(index / shades.length * Math.PI * 2, 75)[1], r: 145,
          }, react.createElement("stop", { offset: 0, stopColor: shade, stopOpacity: 1 }),
          react.createElement("stop", { offset: 1, stopColor: shade, stopOpacity: 0 }))),
        react.createElement("pattern", { id: albumPatternId, width: 200, height: 200, patternUnits: "userSpaceOnUse" },
          react.createElement("rect", { width: 200, height: 200, fill: "#557784" }),
          ...[0, 1, 2, 3].map(index => react.createElement("rect", {
            key: index, width: 200, height: 200, fill: `url(#${albumPatternId}-${index})`, opacity: .85,
          })))) : null,
      ...(mini ? [
        react.createElement("path", { key: "disc", d: ring(disc, 14), fillRule: "evenodd", fill: "currentColor", opacity: 0.2 }),
        react.createElement("circle", { key: "hub", cx: 100, cy: 100, r: 24, fill: "none", stroke: "currentColor", strokeWidth: 3, opacity: 0.32 }),
      ] : [
        react.createElement("path", { key: "disc", d: ring(76, 19), fillRule: "evenodd", fill: "#557784" }),
        react.createElement("path", { key: "art", className: `settings-cd-artwork${rotation ? " is-spinning" : ""}`,
          style: { "--cd-rotation-period": `${24 * 100 / Math.max(25, Math.min(200, Number(rotationSpeed) || 100))}s` },
          d: "M27 81 Q67 21 131 43 Q171 57 173 92 L120 83 Q77 57 27 81", fill: "#c8ab83", opacity: 0.65 }),
        react.createElement("path", { key: "rim", d: ring(76, 74), fillRule: "evenodd", fill: "#dce2e8", opacity: 0.7 }),
        react.createElement("path", { key: "hub-ring", d: ring(25, 9), fillRule: "evenodd", fill: "#dce2e8", opacity: 0.28 }),
        react.createElement("circle", { key: "hub-outer", cx: 100, cy: 100, r: 19, fill: "none", stroke: "#e3eaf0", strokeWidth: 0.8, opacity: 0.65 }),
        react.createElement("circle", { key: "hub-inner", cx: 100, cy: 100, r: 9, fill: "none", stroke: "#e3eaf0", strokeWidth: 0.8, opacity: 0.65 }),
      ]),
      visualizer ? react.createElement("g", {
        fill: filled ? paint : "none", stroke: filled ? "none" : paint, strokeWidth: width, strokeLinecap: "round", strokeLinejoin: "round",
      }, ...shapes()) : null
    );
  };

  // Schematic fullscreen layout that follows the fullscreen settings.
  const SettingsFullscreenPreview = ({ view = "basic" }) => {
    useSettingsConfigRevision();
    const visual = getVisual() || {};
    const flag = (key, fallback) => readSettingFlag(visual, key, fallback);
    const number = (key, fallback) => readSettingNumber(visual, key, fallback);
    const bars = (count, prefix) => react.createElement(
      "div",
      { className: "settings-fs-lyrics" },
      ...Array.from({ length: count }, (_, index) =>
        react.createElement("i", {
          key: `${prefix}-${index}`,
          className: index === 1 ? "is-on" : "",
          style: { width: `${[62, 84, 70, 54, 66][index % 5]}%` },
        })
      )
    );
    const tvMode = view === "tv" || (view === "basic" && flag("fullscreen-tv-mode", false));
    const focused = view === "vinyl";
    const twoColumn = flag("fullscreen-two-column", true);
    const reverse = flag("fullscreen-layout-reverse", false);
    const controlsPosition = visual["fullscreen-controls-position"] || "left-panel";
    const controls = flag("fullscreen-show-controls", true);
    const progress = flag("fullscreen-show-progress", true);
    const hasArtColumn = twoColumn && (flag("fullscreen-show-album", true) || flag("fullscreen-show-info", true) || controlsPosition === "left-panel");
    const info = (albumNameKey = "fullscreen-show-album-name") => react.createElement(
      "div",
      { className: "settings-fs-info" },
      react.createElement("b", null),
      react.createElement("small", null),
      flag(albumNameKey, true) ? react.createElement("em", null) : null
    );
    // Match the runtime hierarchy: volume is below the buttons, and the bottom bar
    // keeps its timeline inside the surface that owns the background.
    const player = (placement, showControls, showProgress, showVolume = false) => {
      if (!showControls && !showProgress) return null;
      const inSurface = placement === "bottom" || (placement === "left" && showControls);
      const progressRow = showProgress ? react.createElement("div", { className: "settings-fs-progress-row" },
          react.createElement("small", null, "1:24"),
          react.createElement("span", { className: "settings-fs-progress" }),
          react.createElement("small", null, "3:42")) : null;
      const surface = showControls || (showProgress && inSurface) ? react.createElement("div", {
          className: `settings-fs-control-surface${!tvMode && !focused && flag("fullscreen-controls-background", false) ? " has-bg" : ""}`,
        },
        inSurface ? progressRow : null,
        showControls ? react.createElement("span", { className: "settings-fs-controls" },
          ...(tvMode || focused ? [0, 1, 2] : [0, 1, 2, 3, 4, 5, 6]).map(index =>
            react.createElement("i", { key: index, className: index === (tvMode || focused ? 1 : 3) ? "is-play" : "" }))) : null,
        showControls && showVolume ? react.createElement("span", { className: "settings-fs-volume" }) : null) : null;
      return react.createElement("div", { key: `player-${placement}`, className: `settings-fs-player is-${placement}` },
        // TV puts its timeline below the transport, the bottom bar inside the
        // surface, and normal and LP above it.
        ...(tvMode ? [surface, progressRow] : inSurface ? [surface] : [progressRow, surface])
      );
    };
    const artChildren = (art) => [
      flag("fullscreen-show-album", true) ? art : null,
      flag("fullscreen-show-info", true) ? info() : null,
      // FullscreenOverlay retains an independent progress-only row in its
      // album column, even when the main player controls are turned off.
      controlsPosition === "left-panel" || !controls
        ? player("left", controlsPosition === "left-panel" && controls, progress, flag("fullscreen-show-volume", true)) : null,
    ];
    const nodes = [];
    if (view === "cd") {
      const colorMode = visual["fullscreen-cd-visualizer-color-mode"] || "album";
      const color = colorMode === "custom" ? normalizeSettingsHexColor(visual["fullscreen-cd-visualizer-color"]) || "#ffffff"
        : colorMode === "white" ? "#ffffff" : "#b8cfdd";
      if (hasArtColumn) nodes.push(react.createElement("div", { key: "cd-art", className: `settings-fs-el settings-fs-col settings-fs-col-art${reverse ? " is-right" : ""}` },
        ...artChildren(react.createElement("div", { className: "settings-fs-cd", style: { "--cd-size": number("fullscreen-cd-disc-size", 100) / 100 } },
          react.createElement(SettingsCdDiscPreview, {
            visualizer: flag("fullscreen-cd-visualizer-enabled", true),
            style: visual["fullscreen-cd-visualizer-style"] || "bars", color,
            density: number("fullscreen-cd-visualizer-density", 64),
            thickness: number("fullscreen-cd-visualizer-thickness", 2),
            mirror: flag("fullscreen-cd-visualizer-mirror", false),
            rainbow: colorMode === "rainbow",
            albumGradient: colorMode === "album" && flag("fullscreen-cd-visualizer-album-gradient", true),
            rotation: flag("fullscreen-cd-rotation-enabled", true) && !flag("reduce-motion", false),
            rotationSpeed: number("fullscreen-cd-rotation-speed", 100),
          })))));
      nodes.push(react.createElement("div", { key: "cd-lyrics", className: `settings-fs-el settings-fs-col settings-fs-col-lyrics${twoColumn ? "" : " is-single"}${reverse && twoColumn ? " is-left" : ""}` }, bars(5, "cd")));
    } else if (view === "vinyl") {
      const armStyle = visual["fullscreen-vinyl-tonearm-style"] || "s";
      const finish = { white: "#f2f2f2", silver: "#b9bec7", black: "#1d1f24" }[visual["fullscreen-vinyl-tonearm-finish"] || "white"] || "#f2f2f2";
      const vinylAnimations = flag("fullscreen-vinyl-animations", true);
      nodes.push(react.createElement(
        "div",
        {
          key: "record",
          className: `settings-fs-record${vinylAnimations ? " is-spin" : ""}`,
          style: {
            "--record": number("fullscreen-vinyl-record-size", 100),
            "--rpm": number("fullscreen-vinyl-rotation-speed", 100),
          },
        },
        react.createElement("span", {
          className: `settings-fs-record-label${vinylAnimations && flag("fullscreen-vinyl-center-rotation", true) ? " is-spin" : ""}`,
          style: { "--label": number("fullscreen-vinyl-album-size", 100) },
        })
      ));
      nodes.push(react.createElement("span", {
        key: "arm",
        className: `settings-fs-arm is-${armStyle}`,
        style: { "--arm": number("fullscreen-vinyl-tonearm-size", 100), "--arm-color": finish },
      }));
      if (flag("fullscreen-vinyl-lyrics-enabled", true)) {
        nodes.push(react.createElement("div", { key: "vinyl-lyrics", className: "settings-fs-el settings-fs-vinyl-lyrics" }, bars(2, "vinyl")));
      }
    } else if (tvMode) {
      nodes.push(react.createElement("div", { key: "tv-lyrics", className: "settings-fs-el settings-fs-tv-lyrics" }, bars(4, "tv")));
      nodes.push(react.createElement(
        "div",
        { key: "tv-info", className: "settings-fs-el settings-fs-tv-info" },
        react.createElement("span", { className: "settings-fs-album", style: { "--album": number("fullscreen-tv-album-size", 140) * 1.4 } }),
        info("fullscreen-tv-show-album-name")
      ));
    } else {
      if (hasArtColumn) nodes.push(react.createElement(
        "div",
        { key: "art", className: `settings-fs-el settings-fs-col settings-fs-col-art${reverse ? " is-right" : ""}` },
        ...artChildren(react.createElement("span", { className: `settings-fs-album${flag("fullscreen-album-shadow", true) ? " has-shadow" : ""}` }))
      ));
      nodes.push(react.createElement(
        "div",
        { key: "lyrics", className: `settings-fs-el settings-fs-col settings-fs-col-lyrics${twoColumn ? "" : " is-single"}${reverse && twoColumn ? " is-left" : ""}` },
        bars(5, "main")
      ));
    }
    if (!focused && (flag("fullscreen-show-clock", true) || flag("fullscreen-show-next-track", true))) {
      nodes.push(react.createElement("div", { key: "top-right", className: "settings-fs-el settings-fs-top-right" },
        flag("fullscreen-show-clock", true) ? react.createElement("span", { className: "settings-fs-clock" }, flag("fullscreen-clock-show-seconds", false) ? "21:47:08" : "21:47") : null,
        flag("fullscreen-show-next-track", true) ? react.createElement("span", { className: "settings-fs-next" }, react.createElement("i"), react.createElement("b")) : null));
    }
    if (!focused && !tvMode && flag("fullscreen-show-context", true)) {
      nodes.push(react.createElement(
        "span",
        { key: "context", className: "settings-fs-el settings-fs-context" },
        flag("fullscreen-show-context-image", true) ? react.createElement("i") : null,
        react.createElement("b")
      ));
    }
    const lyricProgress = !focused && flag("fullscreen-show-lyrics-progress", false)
      ? react.createElement("span", { key: "lprog", className: `settings-fs-el settings-fs-lprog${tvMode ? " is-tv" : ""}` },
        react.createElement("i"), react.createElement("small", null, "4 / 12")) : null;
    if (!tvMode) nodes.push(lyricProgress);
    if (!focused && flag("fullscreen-show-queue", true)) {
      nodes.push(react.createElement("span", { key: "queue", className: "settings-fs-el settings-fs-queue" }, react.createElement("i"), react.createElement("i"), react.createElement("i"), react.createElement("i")));
    }
    if (tvMode) {
      const tvPlayer = player("tv", flag("fullscreen-tv-show-controls", true), flag("fullscreen-tv-show-progress", true));
      if (tvPlayer || lyricProgress) nodes.push(react.createElement("div", { key: "tv-controls", className: "settings-fs-el settings-fs-tv-stack" }, lyricProgress, tvPlayer));
    }
    else if (focused) nodes.push(player("stage", controls, progress));
    else if (controlsPosition === "bottom") nodes.push(player("bottom", controls, progress, flag("fullscreen-show-volume", true)));
    nodes.push(react.createElement("span", { key: "menu", className: "settings-fs-el settings-fs-menu", "aria-hidden": "true" }, "≡"));
    const backgroundMode = getCurrentSettingsBackgroundMode();
    const brightness = number("background-brightness", 30);
    return react.createElement(
      "div",
      {
        className: `settings-preview-stage settings-fs-stage bg-${backgroundMode}${visual.noise ? " has-noise" : ""}`,
        "data-preview-mode": focused ? "vinyl" : view === "cd" ? "cd" : tvMode ? "tv" : "normal",
        style: {
          "--preview-solid": normalizeSettingsHexColor(visual["solid-background-color"]) || "#1e3a8a",
          "--preview-dim": backgroundMode === "solid-background" || backgroundMode === "none" ? 0 : (100 - brightness) / 100 * 0.72,
          "--clock": number("fullscreen-clock-size", 48),
          "--album": number("fullscreen-album-size", 400),
          "--radius": number("fullscreen-album-radius", 12),
          "--title": tvMode ? number("fullscreen-tv-album-size", 140) * 0.26 : number("fullscreen-title-size", 48),
          "--artist": tvMode ? number("fullscreen-tv-album-size", 140) * 0.16 : number("fullscreen-artist-size", 24),
          "--btn": tvMode || focused ? 36 : number("fullscreen-control-button-size", 36),
          "--info-gap": number("fullscreen-info-gap", 24) * 0.17 + "px",
        },
      },
      react.createElement("span", { className: "settings-preview-bg", "aria-hidden": "true" }),
      react.createElement("span", { className: "settings-preview-dim", "aria-hidden": "true" }),
      react.createElement("span", { className: "settings-preview-noise", "aria-hidden": "true" }),
      ...nodes
    );
  };

  return { SettingsCdDiscPreview, SettingsFullscreenPreview };
}
