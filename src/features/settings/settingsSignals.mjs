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
export function useSettingsConfigSignal(react, { host, requestFrame, cancelFrame }, previewEvent = null) {
  const [revision, setRevision] = react.useState(0);
  react.useEffect(() => {
    let frameId = null;
    let stopped = false;
    const schedule = () => {
      if (stopped || frameId != null) return;
      frameId = requestFrame(() => {
        frameId = null;
        if (!stopped) setRevision((value) => value + 1);
      });
    };
    const handleConfig = (event) => {
      if (event?.detail?.type === "config") schedule();
    };
    host.addEventListener("ivLyrics", handleConfig);
    if (previewEvent) host.addEventListener(previewEvent, schedule);
    return () => {
      stopped = true;
      host.removeEventListener("ivLyrics", handleConfig);
      if (previewEvent) host.removeEventListener(previewEvent, schedule);
      if (frameId != null) cancelFrame(frameId);
    };
  }, [previewEvent]);
  return revision;
}
