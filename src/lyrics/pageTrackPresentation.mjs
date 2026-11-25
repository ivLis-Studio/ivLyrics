export function needsDynamicTrackColors(mode, visual) {
  return mode === "blur-gradient-background"
    || (mode === "video-background" && visual["video-fallback-background"] === "blur-gradient");
}

const rgbaToHex = (rgba) => {
  const channels = [rgba.red, rgba.green, rgba.blue].map(channel => Math.round(channel * 255));
  return `#${channels.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
};

const sameAppearance = (a, b) => a && a.needsGradient === b.needsGradient && a.artwork === b.artwork;

export function createPageTrackPresentation({
  page, spotifyArtworkColors, readVisualSettings, readCurrentArtwork,
  convertIntToRGB, extractTrackId, fetchAudioFeatures,
}) {
  let trackColors = null;
  let latestTempo = null;
  const isCurrentTrack = (uri, transition) => page._isComponentMounted
    && page.currentTrackUri === uri && page._lyricsTransitionSeq === transition
    && page.isPlaybackUriCurrent(uri);

  const ownsTrackColors = (session) => trackColors === session && isCurrentTrack(session.uri, session.transition);

  async function readVibrantColor(session) {
    try {
      const hex = await spotifyArtworkColors.readTrackColorHex(session.uri);
      return Number.parseInt(hex.replace("#", ""), 16);
    } catch {
      if (!ownsTrackColors(session)) return null;
      try {
        return await spotifyArtworkColors.readTrackColorSwatch(session.uri);
      } catch {
        return 8747370;
      }
    }
  }

  async function readGradientPalette(session, artwork, vibrant) {
    try {
      const colors = await spotifyArtworkColors.readDynamicColors(artwork);
      if (colors) {
        return {
          minContrast: colors.minContrast?.backgroundBase
            ? rgbaToHex(colors.minContrast.backgroundBase)
            : convertIntToRGB(vibrant),
          highContrast: colors.highContrast?.backgroundBase
            ? rgbaToHex(colors.highContrast.backgroundBase)
            : convertIntToRGB(vibrant, 0.7),
          overlayColor: colors.higherContrast?.backgroundBase
            ? rgbaToHex(colors.higherContrast.backgroundBase)
            : convertIntToRGB(vibrant, 0.5),
        };
      }
    } catch (error) {
      if (ownsTrackColors(session)) console.warn("[ivLyrics] Failed to fetch dynamic colors:", error);
    }
    return {
      minContrast: convertIntToRGB(vibrant),
      highContrast: convertIntToRGB(vibrant, 0.6),
      overlayColor: convertIntToRGB(vibrant, 0.3),
    };
  }

  function readAppearance() {
    const needsGradient = needsDynamicTrackColors(page.getEffectiveBackgroundMode(), readVisualSettings());
    return { needsGradient, artwork: needsGradient ? readCurrentArtwork() : null };
  }

  async function publishColors(session, request) {
    const isCurrent = () => ownsTrackColors(session) && session.request === request;
    const vibrant = await session.vibrant;
    if (!isCurrent()) return;
    const { needsGradient, artwork } = request.appearance;
    if (!sameAppearance(request.appearance, readAppearance())) return fetchColors(session.uri);

    let dynamicColors = null;
    if (needsGradient) {
      if (!session.palette || session.palette.artwork !== artwork) {
        session.palette = { artwork, value: readGradientPalette(session, artwork, vibrant) };
      }
      dynamicColors = await session.palette.value;
      if (!isCurrent()) return;
      if (!sameAppearance(request.appearance, readAppearance())) return fetchColors(session.uri);
    }

    const patch = {
      colors: {
        background: convertIntToRGB(vibrant),
        inactive: convertIntToRGB(vibrant, 3),
      },
      colorsUri: session.uri,
      dynamicColors,
    };
    page.setState(() => isCurrent() ? patch : null);
  }

  function fetchColors(uri) {
    const transition = page._lyricsTransitionSeq;
    if (!uri || !isCurrentTrack(uri, transition)) return;
    if (trackColors?.uri !== uri || trackColors.transition !== transition) {
      trackColors = { uri, transition };
      trackColors.vibrant = readVibrantColor(trackColors);
    }
    const session = trackColors;
    const appearance = readAppearance();
    if (sameAppearance(session.request?.appearance, appearance)) return session.request.promise;

    // The song load and a settings batch can both request the same palette.
    const request = { appearance };
    session.request = request;
    request.promise = publishColors(session, request);
    return request.promise;
  }

  async function fetchTempo(uri) {
    const trackId = extractTrackId(uri);
    const transition = page._lyricsTransitionSeq;
    if (!trackId || !isCurrentTrack(uri, transition)) return;
    const request = {};
    latestTempo = request;
    const isCurrent = () => latestTempo === request && isCurrentTrack(uri, transition);
    let audio;
    try {
      audio = await fetchAudioFeatures(
        `wg://audio-attributes/v1/audio-features/${trackId}?format=json`
      );
    } catch (error) {
      if (isCurrent()) console.warn("[ivLyrics] Failed to fetch audio features:", error);
      return;
    }

    if (!isCurrent()) return;

    const MIN_TEMPO = 60;
    const MAX_TEMPO = 150;
    const MAX_PERIOD = 0.4;
    const tempo = Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, Number(audio?.tempo) || 105));

    let period =
      MAX_PERIOD - ((tempo - MIN_TEMPO) / (MAX_TEMPO - MIN_TEMPO)) * MAX_PERIOD;
    period = Math.round(period * 100) / 100;

    page.setState(() => isCurrent() ? {
      tempo: `${String(period)}s`,
    } : null);
  }

  function cancelPending() {
    trackColors = null;
    latestTempo = null;
  }

  return { fetchColors, fetchTempo, cancelPending };
}
