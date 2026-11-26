import { createSyncAdjustmentControls } from "../../src/app/toolbar/sync/createSyncAdjustmentControls.mjs";
import { createTrackSyncOffsetEdits } from "../../src/core/trackSyncOffsetEdits.mjs";
import * as offsetValues from "../../src/app/toolbar/sync/syncOffsetValues.mjs";

export function createToolbarSyncFixture(context) {
  const react = {
    ...context.react,
    useState: (...args) => context.useState(...args),
    useRef: (...args) => context.useRef(...args),
    useEffect: (...args) => context.useEffect(...args),
  };
  const trackOffsets = createTrackSyncOffsetEdits({
    readOffset: uri => context.Utils.getTrackSyncOffset?.(uri) ?? 0,
    writeOffset: (...args) => context.Utils.setTrackSyncOffset(...args),
    publishOffset: (trackUri, offset) => context.window.dispatchEvent(new context.CustomEvent("ivLyrics:offset-changed", {
      detail: { trackUri, offset },
    })),
    reportError: (...args) => context.console.error(...args),
  });
  const sync = createSyncAdjustmentControls({
    react,
    host: context.window,
    readUtils: () => context.Utils,
    readTrackOffsets: () => trackOffsets,
    readCurrentTrackUri: () => context.playbackTrackUri,
    translate: (...args) => context.I18n.t(...args),
    notify: (type, message) => context.Toast?.[type]?.(message),
    createEvent: (type, init) => new context.CustomEvent(type, init),
    reportError: (...args) => context.console.error(...args),
    controls: context,
  });
  return { ...offsetValues, ...sync, ...sync.videoSync, trackOffsets };
}
