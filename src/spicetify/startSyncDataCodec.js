import codec from "../features/sync/SyncDataCodec.mjs";
import { publishSyncDataCodec } from "../features/sync/syncDataCodecRuntime.mjs";

export default function startSyncDataCodec() {
    publishSyncDataCodec(window, codec);
}
