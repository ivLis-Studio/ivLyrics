import { parseTextLines } from "./aiResponseParsing.mjs";

function requiredPrompt(prompt, provider, description) {
    if (!prompt) throw new Error(`[${provider}] Central ${description} prompt is unavailable.`);
    return prompt;
}

function requireTrackMetadata(title, artist) {
    if (!title || !artist) throw new Error('Title and artist are required');
}

export function requireResearchPrompt(provider, title, artist, prompt, signal) {
    signal?.throwIfAborted();
    requireTrackMetadata(title, artist);
    return requiredPrompt(prompt, provider, 'TMI');
}

export function createPromptedAiCapabilities({
    provider, lineParserName = provider, requestLyrics, requestJson, allowNullMetadata = false,
    forwardLineGenerationSignal = false,
}) {
    function requestForLines(params, key, description, capability, forwardSignal) {
        if (!Array.isArray(params?.lines) || params.lines.length === 0) {
            throw new Error('No lyrics lines provided');
        }
        const prompt = requiredPrompt(params[key], provider, description);
        return requestJson(prompt, forwardSignal ? params.signal : undefined, capability);
    }

    return {
        async translateLyrics({ text, wantSmartPhonetic, translationPrompt, phoneticPrompt, onLine, onStreamReset, endpointCapability, signal }) {
            if (!text?.trim()) throw new Error('No text provided');
            const sourceLines = String(text).replace(/\r\n?/g, '\n').split('\n');
            const prompt = requiredPrompt(wantSmartPhonetic ? phoneticPrompt : translationPrompt, provider, 'lyrics');
            const capability = endpointCapability || (wantSmartPhonetic ? 'pronunciation' : 'translate');
            // Validation runs inside each transport attempt so rejected lines can be retried.
            const parseLines = raw => parseTextLines(raw, sourceLines, lineParserName);
            const lines = await requestLyrics({ prompt, onLine, onStreamReset, parseLines, capability, signal });
            return wantSmartPhonetic ? { phonetic: lines } : { translation: lines };
        },

        async generateCharacterPronunciation(params) {
            const { lines, characterPronunciationPrompt, endpointCapability } = params;
            if (!Array.isArray(lines) || lines.length === 0) throw new Error('No lines provided');
            const prompt = requiredPrompt(characterPronunciationPrompt, provider, 'character pronunciation');
            const result = await requestJson(prompt, params.signal, endpointCapability || 'characterPronunciation');
            if (!result || !(Array.isArray(result.l) || Array.isArray(result.lines))) {
                throw new Error('Invalid character pronunciation response');
            }
            return result;
        },

        async translateMetadata(params) {
            const { title, artist, metadataPrompt } = params;
            requireTrackMetadata(title, artist);
            const prompt = requiredPrompt(metadataPrompt, provider, 'metadata translation');
            const response = await requestJson(prompt, params.signal, 'metadata');
            const result = allowNullMetadata ? response ?? {} : response;
            return {
                translated: {
                    title: result.translatedTitle || result.title || title,
                    artist: result.translatedArtist || result.artist || artist,
                },
                romanized: {
                    title: result.romanizedTitle || title,
                    artist: result.romanizedArtist || artist,
                },
            };
        },

        async generateMotionDirection(params) {
            return await requestForLines(params, 'motionDirectionPrompt', 'motion direction', 'motionDirection', forwardLineGenerationSignal);
        },

        async generateLyricsStudy(params) {
            return await requestForLines(params, 'lyricsStudyPrompt', 'lyrics study', 'lyricsStudy', forwardLineGenerationSignal);
        },

        async generateCulturalAnnotations(params) {
            return await requestForLines(params, 'culturalAnnotationsPrompt', 'cultural annotations', 'culturalAnnotations', true);
        },

        async generateSettingsAssistant(params) {
            const prompt = params?.settingsAssistantPrompt;
            if (!prompt || typeof prompt !== 'object' || !prompt.userPrompt) {
                throw new Error(`[${provider}] Settings assistant prompt is unavailable.`);
            }
            return await requestJson(prompt, params.signal, 'settingsAssistant');
        },
    };
}
