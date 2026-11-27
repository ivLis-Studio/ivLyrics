import { normalizeLrcRedIsrc } from "./lrcRedWordTiming.mjs";

const normalizeString = (str) => String(str || '')
    .normalize('NFKC')
    .toLowerCase()
    // Fold Latin accents without dropping Japanese voicing or marks in
    // other scripts. Canonical spellings still compare identically.
    .normalize('NFD')
    .replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .replace(/['’‘`´]/g, '')
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const compactTitle = value => normalizeString(value).replace(/ /g, '');
const VERSION_LABEL = /\b(?:feat(?:uring)?|ft|version|remaster(?:ed)?|remix|mix|edit|edition|live|acoustic|mono|stereo)\b|\bfrom the vault\b/i;

// Query simplification can remove a subtitle. Identity matching may ignore
// only known version labels, never a meaningful subtitle like Song (Part II).
const titleCore = value => compactTitle(String(value || '')
    .replace(/\(([^()]*)\)|\[([^\[\]]*)\]/g,
        (whole, parentheses, brackets) => VERSION_LABEL.test(parentheses ?? brackets) ? ' ' : whole)
    .replace(/\s+-\s+(.+)$/, (whole, suffix) => VERSION_LABEL.test(suffix) ? '' : whole));

// Catalogs may include featured artists where Spotify supplies only the lead.
const leadArtist = value => normalizeString(String(value || '').split(
    /\s+(?:feat(?:uring)?\.?|ft\.?|with|[x×])\s+|[,;&]/iu
)[0]);

export function createLrcRedSearchHitScorer(info, durationSeconds) {
    const title = compactTitle(info?.title);
    const core = titleCore(info?.title);
    const artist = normalizeString(info?.artist);
    const lead = leadArtist(info?.artist);

    return hit => {
        if (!title || !artist || !normalizeLrcRedIsrc(hit?.isrc)) return null;
        const candidateTitle = compactTitle(hit.title);
        if (!candidateTitle) return null;
        const titleScore = candidateTitle === title ? 1
            : (core && titleCore(hit.title) === core ? 0.9 : 0);
        if (!titleScore) return null;

        const candidateArtist = normalizeString(hit.artist);
        if (!candidateArtist || (candidateArtist !== artist && (!lead || leadArtist(hit.artist) !== lead))) return null;
        const candidateDuration = Number(hit.duration);
        const durationScore = durationSeconds > 0 && candidateDuration > 0
            ? Math.max(0, 1 - Math.abs(durationSeconds - candidateDuration) / 30)
            : 0;
        // Duration ranks only candidates already identified as the same song.
        return titleScore * 0.6 + 0.3 + durationScore * 0.1;
    };
}
