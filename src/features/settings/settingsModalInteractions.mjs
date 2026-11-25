export const isSettingsEditableField = (element) => {
  if (!element || element.disabled || element.readOnly) return false;
  if (element.tagName === "TEXTAREA") return true;
  if (element.tagName !== "INPUT") return false;
  if (element.classList?.contains("settings-search-input")) return false;
  return ["text", "number", "search", "url", "email", "password", "tel", ""].includes(element.type || "");
};

export function useSettingsModalInteractions(react, { host, document, rootRef, searchBoxRef, setSearchPanelOpen }) {
  react.useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    // A focused number field must not swallow the page scroll; the wheel
    // would otherwise change its value without the reader noticing.
    const handleWheel = (event) => {
      const field = document.activeElement;
      if (field && field.tagName === "INPUT" && field.type === "number" && field.contains(event.target)) {
        field.blur();
      }
    };
    // Escape (handled by openConfig) restores the value from before the edit.
    const handleFocusIn = (event) => {
      if (isSettingsEditableField(event.target)) {
        event.target.dataset.ivBefore = event.target.value;
      }
    };
    // Text cut off with an ellipsis shows its full wording on hover.
    const handlePointerOver = (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      let node = event.target instanceof host.Element ? event.target : null;
      for (let depth = 0; node && depth < 3 && node !== root; depth += 1, node = node.parentElement) {
        if (node.hasAttribute("title") && !node.hasAttribute("data-auto-title")) return;
        if (host.getComputedStyle(node).textOverflow !== "ellipsis") continue;
        if (node.scrollWidth > node.clientWidth + 1) {
          node.title = node.textContent.trim();
          node.setAttribute("data-auto-title", "");
        } else if (node.hasAttribute("data-auto-title")) {
          node.removeAttribute("title");
          node.removeAttribute("data-auto-title");
        }
        return;
      }
    };
    const handlePointerDown = (event) => {
      if (!searchBoxRef.current?.contains(event.target)) setSearchPanelOpen(false);
    };
    root.addEventListener("wheel", handleWheel, { capture: true, passive: true });
    root.addEventListener("focusin", handleFocusIn, true);
    root.addEventListener("pointerover", handlePointerOver, { passive: true });
    root.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      root.removeEventListener("wheel", handleWheel, { capture: true });
      root.removeEventListener("focusin", handleFocusIn, true);
      root.removeEventListener("pointerover", handlePointerOver);
      root.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, []);
}
