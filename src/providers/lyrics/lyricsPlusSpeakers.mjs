import { normalizeDisplayText } from "./lyricsPlusInput.mjs";

const OBJECT_PROPERTY_IS_ENUMERABLE = Object.prototype.propertyIsEnumerable;
const SPEAKER_PALETTE = [
    { color: '#a8ccff', fallback: 'MALE 1' },
    { color: '#ffb8c7', fallback: 'FEMALE 1' },
    { color: '#e4d8ff', fallback: 'DUET 1' },
    { color: '#9ae8d4', fallback: 'MALE 2' },
    { color: '#ffd6b3', fallback: 'FEMALE 2' },
    { color: '#d6e4ff', fallback: 'DUET 2' },
    { color: '#bfe8ff', fallback: 'MALE 3' },
    { color: '#f6c8ff', fallback: 'FEMALE 3' },
    { color: '#ffddf2', fallback: 'DUET 3' }
];
const GROUP_SPEAKER_PALETTE = SPEAKER_PALETTE.filter(item => item.fallback.startsWith('DUET'));

function getAgentMetadata(singer, agents = {}) {
    const singerId = String(singer || '').trim();
    if (!singerId) return null;

    const agentSource = agents || {};
    if (OBJECT_PROPERTY_IS_ENUMERABLE.call(agentSource, singerId)) {
        const agent = agentSource[singerId];
        return {
            id: singerId,
            type: normalizeDisplayText(agent?.type).toLowerCase(),
            name: normalizeDisplayText(agent?.name),
            alias: normalizeDisplayText(agent?.alias)
        };
    }

    const entries = Object.entries(agentSource);
    const normalizedSingerId = normalizeDisplayText(singerId).toLocaleLowerCase();
    const match = entries.find(([id]) => normalizeDisplayText(id).toLocaleLowerCase() === normalizedSingerId)
        || entries.find(([_id, agent]) => (
            normalizeDisplayText(agent?.alias).toLocaleLowerCase() === normalizedSingerId
        ));
    if (!match) return null;

    const [id, agent] = match;
    return {
        id,
        type: normalizeDisplayText(agent?.type).toLowerCase(),
        name: normalizeDisplayText(agent?.name),
        alias: normalizeDisplayText(agent?.alias)
    };
}

export function getSpeakerPresentation(singer, singerOrder, agents = {}, cache = null) {
    const rawSingerId = String(singer || '').trim();
    if (cache?.has(rawSingerId)) return cache.get(rawSingerId);
    if (!rawSingerId) {
        const presentation = { speaker: 'NORMAL', lyricsPlusSinger: '' };
        cache?.set(rawSingerId, presentation);
        return presentation;
    }

    const agent = getAgentMetadata(rawSingerId, agents);
    const singerId = agent?.id || rawSingerId;
    if (!singerOrder.has(singerId)) singerOrder.set(singerId, singerOrder.size);
    const index = singerOrder.get(singerId) || 0;
    const agentFields = {
        lyricsPlusSinger: singerId,
        lyricsPlusAgentType: agent?.type || '',
        lyricsPlusAgentName: agent?.name || '',
        lyricsPlusAgentAlias: agent?.alias || ''
    };
    if (index === 0) {
        const presentation = { speaker: 'NORMAL', ...agentFields };
        cache?.set(rawSingerId, presentation);
        return presentation;
    }

    let palette = SPEAKER_PALETTE[(index - 1) % SPEAKER_PALETTE.length];
    if (agent?.type === 'group' && GROUP_SPEAKER_PALETTE.length > 0) {
        const priorGroupCount = Array.from(singerOrder.entries())
            .filter(([candidate, candidateIndex]) => (
                candidateIndex < index && getAgentMetadata(candidate, agents)?.type === 'group'
            ))
            .length;
        palette = GROUP_SPEAKER_PALETTE[priorGroupCount % GROUP_SPEAKER_PALETTE.length];
    }

    const presentation = {
        speaker: 'CUSTOM',
        'speaker-color': palette.color,
        'speaker-fallback': palette.fallback,
        ...agentFields
    };
    cache?.set(rawSingerId, presentation);
    return presentation;
}
