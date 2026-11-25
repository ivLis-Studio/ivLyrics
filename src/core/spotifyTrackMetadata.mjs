export function trimTrackMetadataLabel(text) {
  if (!text) return text;
  const trimmed = text
    .replace(/\(.+?\)/g, "")
    .replace(/\[.+?\]/g, "")
    .replace(/\s-\s.+?$/g, "")
    .trim();
  return trimmed || text;
}

// Playback and queue payloads carry different fields for the same track.
export function createSpotifyTrackMetadata({ extractTrackId, readPlayerData, readNextTracks }) {
  return {
    /**
     * Spotify 트랙 데이터를 추출
     * @param {string} uri - Spotify URI (spotify:track:XXXX)
     * @returns {Object|null} spotifyData
     */
    extractSpotifyData(uri) {
      try {
        const trackId = extractTrackId(uri);
        if (!trackId) return null;

        const playerData = readPlayerData();
        const currentTrack = playerData?.item || playerData?.track?.metadata;

        if (!currentTrack) return null;

        const currentUri = currentTrack.uri || `spotify:track:${currentTrack.id}`;
        if (currentUri !== uri) {
          const queue = readNextTracks() || [];
          const nextTrack = queue.find(t => {
            const tUri = t.contextTrack?.uri || t.uri;
            return tUri === uri;
          });
          if (nextTrack) {
            const metadata = nextTrack.contextTrack?.metadata || nextTrack.metadata || {};
            return {
              name: metadata.title || nextTrack.name,
              artists: this._parseArtists(metadata),
              album: metadata.album_title || metadata.album,
              isrc: metadata.isrc || null,
              duration_ms: parseInt(metadata.duration) || nextTrack.duration_ms || 0
            };
          }
          return null;
        }

        const metadata = currentTrack.metadata || currentTrack;
        return {
          name: metadata.title || currentTrack.name,
          artists: this._parseArtists(metadata),
          album: metadata.album_title || metadata.album?.name || metadata.album,
          isrc: metadata.isrc || currentTrack.external_ids?.isrc || null,
          duration_ms: parseInt(metadata.duration) || currentTrack.duration_ms || 0
        };
      } catch (error) {
        console.warn('[SpotifyDataHelper] Failed to extract Spotify data:', error);
        return null;
      }
    },

    _parseArtists(metadata) {
      if (metadata.artist_name) {
        return metadata.artist_name.split(', ');
      }
      if (metadata.artists) {
        if (Array.isArray(metadata.artists)) {
          return metadata.artists.map(a => a.name || a);
        }
        return [metadata.artists];
      }
      return [];
    }
  };
}
