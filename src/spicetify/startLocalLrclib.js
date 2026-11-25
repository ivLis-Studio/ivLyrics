import workerSource from "ivlyrics:lrclib-worker";
import { installLocalLrclibDatabase } from "../providers/lyrics/LrclibLocalDatabase.js";

export default function startLocalLrclib() {
    installLocalLrclibDatabase(window, workerSource);
}
