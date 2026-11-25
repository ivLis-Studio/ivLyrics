const parseThemeCssColorToLuminance = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim().toLowerCase();
  if (!text || text === "transparent" || text === "inherit" || text === "initial") {
    return null;
  }

  let red = null;
  let green = null;
  let blue = null;

  const hexMatch = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      red = parseInt(hex[0] + hex[0], 16);
      green = parseInt(hex[1] + hex[1], 16);
      blue = parseInt(hex[2] + hex[2], 16);
    } else {
      red = parseInt(hex.slice(0, 2), 16);
      green = parseInt(hex.slice(2, 4), 16);
      blue = parseInt(hex.slice(4, 6), 16);
    }
  } else {
    const rgbMatch = text.match(/^rgba?\(\s*([0-9.]+%?)\s*,\s*([0-9.]+%?)\s*,\s*([0-9.]+%?)/);
    if (!rgbMatch) {
      return null;
    }
    const channel = (part) => part.endsWith("%")
      ? (parseFloat(part) / 100) * 255
      : parseFloat(part);
    red = channel(rgbMatch[1]);
    green = channel(rgbMatch[2]);
    blue = channel(rgbMatch[3]);
  }

  if (![red, green, blue].every((channel) => Number.isFinite(channel))) {
    return null;
  }

  const toLinear = (channel) => {
    const normalized = Math.min(255, Math.max(0, channel)) / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);
};

export function createSettingsUiTheme({ readTheme, matchMedia, getAppliedColorScheme, getRootComputedStyle }) {
  const getSettingsUiTheme = () => {
    const storedTheme = readTheme();
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }

    // The settings window offers light and dark only. An older "auto" choice
    // (or no choice) is settled from the system/Spotify theme; ConfigModal then
    // stores the result.
    return getSystemSettingsUiTheme();
  };

  const querySystemThemeMatchMedia = (query) => {
    try {
      return matchMedia(query) ?? null;
    } catch (error) {
      return null;
    }
  };

  // Spotify's Chromium build can report prefers-color-scheme: dark even when the
  // OS uses a light theme (forced dark mode / dark app-mode). When the media
  // queries are inconclusive, fall back to the brightness of the actually
  // applied Spotify theme so Auto still responds to theming instead of sticking
  // to dark.
  const getSpicetifyAppliedUiTheme = () => {
    try {
      const candidates = [];
      const colorScheme = getAppliedColorScheme();
      if (colorScheme && typeof colorScheme === "object") {
        for (const key of ["main", "sidebar", "player", "card", "background"]) {
          if (typeof colorScheme[key] === "string") {
            candidates.push(colorScheme[key]);
          }
        }
      }

      let computed = null;
      try {
        computed = getRootComputedStyle();
      } catch (error) {
        computed = null;
      }
      if (computed) {
        for (const variable of ["--spice-main", "--spice-sidebar", "--spice-player", "--spice-card"]) {
          try {
            const cssValue = computed.getPropertyValue(variable);
            if (cssValue && cssValue.trim()) {
              candidates.push(cssValue);
            }
          } catch (error) {
            // Ignore unreadable variables and keep trying the next candidate.
          }
        }
      }

      for (const candidate of candidates) {
        const luminance = parseThemeCssColorToLuminance(candidate);
        if (luminance !== null) {
          return luminance > 0.5 ? "light" : "dark";
        }
      }
    } catch (error) {
      // Fall through to null below.
    }
    return null;
  };

  const getSystemSettingsUiTheme = () => {
    const lightQuery = querySystemThemeMatchMedia("(prefers-color-scheme: light)");
    if (lightQuery?.matches === true) {
      return "light";
    }

    const darkQuery = querySystemThemeMatchMedia("(prefers-color-scheme: dark)");
    if (darkQuery?.matches === true) {
      return "dark";
    }

    // Neither query matched: the OS reports no preference, or this Chromium
    // build does not expose it. Prefer the applied Spotify theme over a
    // hard-coded dark fallback.
    try {
      return getSpicetifyAppliedUiTheme() ?? "dark";
    } catch (error) {
      return "dark";
    }
  };

  const getEffectiveSettingsUiTheme = (themePreference, systemTheme) =>
    themePreference === "auto" ? systemTheme : themePreference;

  const resolveEffectiveSettingsUiTheme = (themePreference) => {
    const preference = themePreference ?? getSettingsUiTheme();
    if (preference === "light" || preference === "dark") {
      return preference;
    }
    return getSystemSettingsUiTheme();
  };

  const subscribeSystemSettingsUiTheme = (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const emit = () => {
      try {
        callback(getSystemSettingsUiTheme());
      } catch (error) {
        // Ignore subscriber failures so one listener never breaks the rest.
      }
    };

    const cleanups = [];
    for (const query of ["(prefers-color-scheme: light)", "(prefers-color-scheme: dark)"]) {
      const media = querySystemThemeMatchMedia(query);
      if (!media) {
        continue;
      }

      const handleChange = () => emit();
      try {
        if (typeof media.addEventListener === "function") {
          media.addEventListener("change", handleChange);
          cleanups.push(() => {
            try {
              media.removeEventListener("change", handleChange);
            } catch (error) {
              // Ignore cleanup failures in hardened runtimes.
            }
          });
        } else if (typeof media.addListener === "function") {
          media.addListener(handleChange);
          cleanups.push(() => {
            try {
              media.removeListener?.(handleChange);
            } catch (error) {
              // Ignore cleanup failures in hardened runtimes.
            }
          });
        }
      } catch (error) {
        // Ignore unsubscribable queries and keep the remaining listeners.
      }
    }

    return () => {
      cleanups.forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {
          // Ignore cleanup failures in hardened runtimes.
        }
      });
    };
  };

  const getSettingsUiThemeDebugInfo = () => {
    let preference = null;
    let systemTheme = null;
    let effectiveTheme = null;
    let matchMediaLight = null;
    let matchMediaDark = null;
    let spicetifyTheme = null;
    try {
      preference = getSettingsUiTheme();
    } catch (error) {
      preference = `error: ${error?.message || error}`;
    }
    try {
      matchMediaLight = querySystemThemeMatchMedia("(prefers-color-scheme: light)")?.matches ?? null;
    } catch (error) {
      matchMediaLight = `error: ${error?.message || error}`;
    }
    try {
      matchMediaDark = querySystemThemeMatchMedia("(prefers-color-scheme: dark)")?.matches ?? null;
    } catch (error) {
      matchMediaDark = `error: ${error?.message || error}`;
    }
    try {
      spicetifyTheme = getSpicetifyAppliedUiTheme();
    } catch (error) {
      spicetifyTheme = `error: ${error?.message || error}`;
    }
    try {
      systemTheme = getSystemSettingsUiTheme();
    } catch (error) {
      systemTheme = `error: ${error?.message || error}`;
    }
    try {
      effectiveTheme = resolveEffectiveSettingsUiTheme(preference);
    } catch (error) {
      effectiveTheme = `error: ${error?.message || error}`;
    }
    return {
      preference,
      systemTheme,
      effectiveTheme,
      matchMediaLight,
      matchMediaDark,
      spicetifyTheme,
    };
  };

  return {
    getSettingsUiTheme,
    getSystemSettingsUiTheme,
    getEffectiveSettingsUiTheme,
    resolveEffectiveSettingsUiTheme,
    subscribeSystemSettingsUiTheme,
    getSettingsUiThemeDebugInfo,
  };
}
