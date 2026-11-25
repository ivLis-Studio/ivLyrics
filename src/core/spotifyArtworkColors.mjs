export function createSpotifyArtworkColors({ readGraphQL, readCosmos }) {
    async function readTrackColorHex(uri) {
        const graphQL = readGraphQL();
        const definition = graphQL.Definitions.fetchExtractedColorForTrackEntity;
        const { data } = await graphQL.Request(definition, { uri });
        return data.trackUnion.albumOfTrack.coverArt.extractedColors.colorDark.hex;
    }

    async function readTrackColorSwatch(uri) {
        const colors = await readCosmos().get(
            `https://spclient.wg.spotify.com/colorextractor/v1/extract-presets?uri=${uri}&format=json`
        );
        return colors.entries[0].color_swatches.find(
            (color) => color.preset === "VIBRANT_NON_ALARMING"
        ).color;
    }

    async function readDynamicColors(artworkUrl) {
        if (!artworkUrl) return null;
        const graphQL = readGraphQL();
        const definition = graphQL?.Definitions?.getDynamicColorsByUris;
        if (!definition) return null;
        const result = await graphQL.Request(definition, { imageUris: [artworkUrl] });
        return result?.data?.getDynamicColorsByUris?.[0] ?? null;
    }

    return { readTrackColorHex, readTrackColorSwatch, readDynamicColors };
}
