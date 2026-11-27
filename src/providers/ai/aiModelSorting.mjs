// Score each ID once. The original model objects and the alphabetical tie
// break are also used by the settings picker and research token lookup.
export function sortModelsByPreferredId(models, preferences) {
    return models.map(model => {
        const index = preferences.findIndex(fragment => model.id.includes(fragment));
        return { model, rank: index === -1 ? preferences.length : index };
    })
        .sort((a, b) => a.rank - b.rank || a.model.id.localeCompare(b.model.id))
        .map(entry => entry.model);
}
