import { createSyncAdjustmentControls } from "../../src/app/toolbar/sync/createSyncAdjustmentControls.mjs";
import * as offsetValues from "../../src/app/toolbar/sync/syncOffsetValues.mjs";

export function createToolbarSyncFixture(context) {
  const react = {
    ...context.react,
    useState: (...args) => context.useState(...args),
    useRef: (...args) => context.useRef(...args),
    useEffect: (...args) => context.useEffect(...args),
  };
  const sync = createSyncAdjustmentControls({
    react,
    host: context.window,
    readUtils: () => context.Utils,
    translate: (...args) => context.I18n.t(...args),
    notify: (type, message) => context.Toast?.[type]?.(message),
    createEvent: (type, init) => new context.CustomEvent(type, init),
    reportError: (...args) => context.console.error(...args),
    controls: context,
  });
  return { ...offsetValues, ...sync, ...sync.videoSync };
}
