import { getRuntimeService } from "../../spicetify/runtimeServices.mjs";

export function readLyricsTextParser(host) {
    return getRuntimeService("ivLyricsLyricsParser", host) || host.__ivLyricsUnisonDebug;
}
