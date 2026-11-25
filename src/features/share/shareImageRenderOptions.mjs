export function getShareImageRenderOptions({ selectedLines, trackInfo, template, customSettings }, output) {
  return {
    lyrics: selectedLines,
    trackName: trackInfo.name || '',
    artistName: trackInfo.artist || '',
    albumCover: trackInfo.cover || '',
    template,
    customSettings,
    output,
  };
}
