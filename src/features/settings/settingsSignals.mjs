import { INTERFACE_LANGUAGE_CHANGED } from "../../i18n/interfaceLanguage.mjs";

export function useSettingsInterfaceLanguage(react, host, readLanguage) {
  const [language, setLanguage] = react.useState(readLanguage);
  react.useEffect(() => {
    const update = () => setLanguage(readLanguage());
    host.addEventListener(INTERFACE_LANGUAGE_CHANGED, update);
    update();
    return () => host.removeEventListener(INTERFACE_LANGUAGE_CHANGED, update);
  }, [host, readLanguage]);
  return language;
}

export function useSettingsSignal(react, signal) {
  const [value, setValue] = react.useState(() => (signal ? signal.get() : undefined));
  react.useEffect(() => {
    if (!signal) return undefined;
    setValue(signal.get());
    return signal.subscribe(setValue);
  }, [signal]);
  return value;
}

// Read current CONFIG after config or optional preview notifications, once per frame.
export function useSettingsConfigSignal(react, { host, requestFrame, cancelFrame }, previewEvent = null, readSnapshot) {
  const [revision, setRevision] = react.useState(0);
  react.useEffect(() => {
    let frameId = null;
    let stopped = false;
    let previous = readSnapshot?.();
    let forceRefresh = false;
    const schedule = () => {
      if (stopped || frameId != null) return;
      frameId = requestFrame(() => {
        frameId = null;
        if (stopped) return;
        const next = readSnapshot?.();
        const refresh = forceRefresh || !readSnapshot
          || Object.keys(next).length !== Object.keys(previous).length
          || Object.keys(next).some(key => !Object.is(next[key], previous[key]));
        previous = next;
        forceRefresh = false;
        if (refresh) setRevision((value) => value + 1);
      });
    };
    const handleConfig = (event) => {
      if (event?.detail?.type === "config") schedule();
    };
    const handlePreview = () => {
      forceRefresh = true;
      schedule();
    };
    host.addEventListener("ivLyrics", handleConfig);
    if (previewEvent) host.addEventListener(previewEvent, handlePreview);
    return () => {
      stopped = true;
      host.removeEventListener("ivLyrics", handleConfig);
      if (previewEvent) host.removeEventListener(previewEvent, handlePreview);
      if (frameId != null) cancelFrame(frameId);
    };
  }, [previewEvent, readSnapshot]);
  return revision;
}
