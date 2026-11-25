export const IVLYRICS_ROUTE = "/ivLyrics";

export function isIvLyricsRoute(pathname) {
    return typeof pathname === "string"
        && (pathname === IVLYRICS_ROUTE || pathname.startsWith(IVLYRICS_ROUTE + "/"));
}
