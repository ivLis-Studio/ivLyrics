export function createTrackRevisions() {
    const revisions = new Map();
    let nextRevision = 0;
    let globalRevision = 0;

    const getRevision = trackId => revisions.get(trackId) ?? globalRevision;

    function invalidate(trackId) {
        const revision = ++nextRevision;
        if (trackId) {
            revisions.set(trackId, revision);
        } else {
            globalRevision = revision;
            revisions.clear();
        }
    }

    return { getRevision, invalidate };
}
