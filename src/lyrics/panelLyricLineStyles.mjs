export const TEXT_EFFECT_KIND_CLASSES = new Set([
    'effect',
    'adlib',
    'pulse',
    'wave',
    'sparkle',
    'echo',
    'whisper',
    'bounce',
    'sway',
    'glow',
    'glitch',
    'flicker',
    'float',
    'blur',
    'pop'
]);

export function createPanelLyricLineStyles({ react, getVisualSetting, isPanelMotionReduced, getSpeakerColors }) {
    const areTextEffectsEnabled = () => (
        getVisualSetting('karaoke-text-effects', true) !== false && !isPanelMotionReduced()
    );

    const getPanelSpeakerPresentation = (speaker, speakerColor = '', speakerFallback = '') => {
        const presentation = getSpeakerColors()?.getPresentation?.(speaker, speakerColor, speakerFallback);
        if (presentation) return presentation;
        const normalized = String(speaker || '').trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toUpperCase();
        const normalizedFallback = String(speakerFallback || '').trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toUpperCase();
        const effectiveSpeaker = normalized === 'CUSTOM'
            ? (['MALE 1', 'FEMALE 1', 'DUET 1'].includes(normalizedFallback) ? normalizedFallback : 'MALE 1')
            : ({
            'MALE CUSTOM': 'MALE 1',
            'FEMALE CUSTOM': 'FEMALE 1',
            'DUET CUSTOM': 'DUET 1'
        }[normalized] || normalized);
        const normalizedColor = /^#[0-9a-f]{6}$/i.test(String(speakerColor || '').trim())
            ? String(speakerColor).trim().toLowerCase()
            : '';
        const creatorColorEnabled = getVisualSetting('sync-data-custom-speaker-colors-enabled', true) !== false;
        return {
            effectiveSpeaker,
            speakerClass: String(effectiveSpeaker || '').trim().toLowerCase().replace(/[_\s]+/g, '-').replace(/[^a-z0-9-]/g, ''),
            creatorColor: (normalized === 'CUSTOM' || normalized.endsWith(' CUSTOM')) && creatorColorEnabled ? normalizedColor : ''
        };
    };

    const getPanelSpeakerStyle = (speaker, speakerColor = '', speakerFallback = '') => {
        const presentation = getPanelSpeakerPresentation(speaker, speakerColor, speakerFallback);
        if (!presentation.creatorColor) return {};
        const cssVariable = getSpeakerColors()?.getCssVariableName?.(presentation.effectiveSpeaker)
            || (presentation.speakerClass ? `--ivlyrics-multi-vocal-speaker-color-${presentation.speakerClass}` : '');
        return {
            ...(cssVariable ? { [cssVariable]: presentation.creatorColor } : {}),
            '--ivlyrics-panel-vocal-color': presentation.creatorColor,
            '--ivlyrics-panel-karaoke-color': presentation.creatorColor
        };
    };

    const getTextEffectKindClassParts = (kind) => {
        const kindClass = String(kind || '').trim().toLowerCase();
        if (!kindClass || (kindClass !== 'vocal' && !TEXT_EFFECT_KIND_CLASSES.has(kindClass))) return [];

        const classes = [kindClass];
        if (TEXT_EFFECT_KIND_CLASSES.has(kindClass) && !areTextEffectsEnabled()) {
            classes.push('text-effects-disabled');
        }
        return classes;
    };

    const getPanelInlineStylePresentation = (syllable) => {
        if (syllable?.inlineStyle !== true) return null;

        const kindClasses = getTextEffectKindClassParts(syllable?.styleKind || '');
        const speakerPresentation = getPanelSpeakerPresentation(
            syllable?.styleSpeaker,
            syllable?.styleSpeakerColor,
            syllable?.styleSpeakerFallback
        );
        if (kindClasses.length === 0 && !speakerPresentation.speakerClass) return null;

        return {
            key: [
                kindClasses.join(' '),
                speakerPresentation.speakerClass,
                String(syllable?.styleSpeakerColor || '').trim().toLowerCase(),
                String(syllable?.styleSpeakerFallback || '').trim().toUpperCase()
            ].join('|'),
            className: [
                'ivlyrics-panel-range-style',
                ...kindClasses,
                speakerPresentation.speakerClass ? `speaker-${speakerPresentation.speakerClass}` : ''
            ].filter(Boolean).join(' '),
            style: getPanelSpeakerStyle(
                syllable?.styleSpeaker,
                syllable?.styleSpeakerColor,
                syllable?.styleSpeakerFallback
            )
        };
    };

    const PANEL_INLINE_STYLE_MAX_RUN_LENGTH = 12;

    const wrapPanelInlineStyleRuns = (
        items,
        elements,
        { keyPrefix = 'panel-inline-style', sourceIndexOffset = 0 } = {}
    ) => {
        if (!Array.isArray(items)
            || !Array.isArray(elements)
            || items.length !== elements.length
            || items.length === 0) {
            return elements;
        }

        const result = [];
        let run = null;
        const flush = () => {
            if (!run) return;
            if (!run.presentation) {
                result.push(...run.elements);
            } else {
                result.push(react.createElement('span', {
                    className: run.presentation.className,
                    style: {
                        ...run.presentation.style,
                        '--ivlyrics-range-index': sourceIndexOffset + run.startIndex
                    },
                    key: `${keyPrefix}-${sourceIndexOffset + run.startIndex}`
                }, run.elements));
            }
            run = null;
        };

        items.forEach((item, index) => {
            const presentation = getPanelInlineStylePresentation(item);
            const styleKey = presentation?.key || '';
            if (!run
                || run.styleKey !== styleKey
                || run.elements.length >= PANEL_INLINE_STYLE_MAX_RUN_LENGTH) {
                flush();
                run = {
                    styleKey,
                    presentation,
                    startIndex: index,
                    elements: []
                };
            }
            run.elements.push(elements[index]);
        });
        flush();
        return result;
    };

    return { getPanelSpeakerPresentation, getPanelSpeakerStyle, getTextEffectKindClassParts, wrapPanelInlineStyleRuns };
}
