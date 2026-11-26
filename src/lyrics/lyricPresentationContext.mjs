const PRESENTATION_FIELDS = [
    'provider', 'lyricsType', 'karaokeSource', 'playbackPreferences',
    'displayMode1', 'displayMode2', 'detectedLanguage', 'pronunciationNotation',
    'translationTargetLanguage', 'translationStyle', 'translationSourceText', 'presentationComplete',
];

export function readLyricPresentationContext(presentation) {
    return Object.fromEntries(PRESENTATION_FIELDS.map(field => [field, presentation[field]]));
}
