export const SETTINGS_TEXT_DRAFT_ATTRIBUTE = "data-iv-settings-draft";
const discardedFields = new WeakSet();

export function discardFocusedSettingsTextDraft(field) {
  if (!field.hasAttribute?.(SETTINGS_TEXT_DRAFT_ATTRIBUTE)) return false;
  discardedFields.add(field);
  try {
    field.blur();
  } finally {
    discardedFields.delete(field);
  }
  return true;
}

export function useSettingsTextDraft(react, value, readConfiguredValue) {
  const [draft, setDraft] = react.useState(null);
  const latest = react.useRef(null);
  const cancel = () => {
    latest.current = null;
    setDraft(null);
  };
  const syncDraft = react.useLayoutEffect ?? react.useEffect;
  syncDraft(() => {
    if (latest.current && latest.current.from !== value) cancel();
  }, [value]);

  return {
    text: draft?.from === value ? draft.text : value,
    cancel,
    change(text) {
      const next = { from: value, text, configured: readConfiguredValue?.() };
      latest.current = next;
      setDraft(next);
    },
    finish(event, commit) {
      const pending = latest.current;
      cancel();
      if (!pending || pending.from !== value || discardedFields.has(event.currentTarget ?? event.target)) return;
      if (readConfiguredValue && !Object.is(pending.configured, readConfiguredValue())) return;
      commit(pending.text);
    },
  };
}
