export const joinToolbarClasses = (...names) => names.filter(Boolean).join(" ");

export const moveToolbarFocus = (event, container, selector) => {
  if (!container || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return false;
  const items = Array.from(container.querySelectorAll(selector))
    .filter((item) => !item.disabled && item.getClientRects().length > 0);
  if (!items.length) return false;
  const index = items.indexOf(document.activeElement);
  let next = 0;
  if (event.key === "ArrowDown") next = index < 0 ? 0 : (index + 1) % items.length;
  else if (event.key === "ArrowUp") next = index <= 0 ? items.length - 1 : index - 1;
  else if (event.key === "End") next = items.length - 1;
  event.preventDefault();
  event.stopPropagation();
  items[next].focus();
  return true;
};

export const formatToolbarOffsetStep = (step) => {
  const sign = step > 0 ? "+" : "\u2212";
  const absoluteMs = Math.abs(step);
  if (absoluteMs >= 1000 && absoluteMs % 1000 === 0) return `${sign}${absoluteMs / 1000}s`;
  return `${sign}${absoluteMs}ms`;
};

// Keep component identities stable for the lifetime of the Spotify page.
export function createToolbarControls({ react, IvLyricsToolbarIcon, formatSyncOffset }) {
  const { useState, useRef, useEffect } = react;

  let toolbarControlIdSeq = 0;
  const useToolbarControlId = (prefix) => {
    const ref = useRef(null);
    if (!ref.current) {
      toolbarControlIdSeq += 1;
      ref.current = prefix + "-" + toolbarControlIdSeq.toString(36);
    }
    return ref.current;
  };

  const ToolbarGlyph = ({ name, size = 18, className = "" }) =>
    react.createElement(IvLyricsToolbarIcon, { name, size, className });

  const ToolbarPanelSection = ({ title, children, className = "" }) =>
    react.createElement(
      "section",
      { className: joinToolbarClasses("ivl-tb-sec", className) },
      title ? react.createElement("h3", { className: "ivl-tb-sec-title" }, title) : null,
      children
    );

  const ToolbarPanelGroup = ({ children, className = "" }) =>
    react.createElement("div", { className: joinToolbarClasses("ivl-tb-group", className) }, children);

  const ToolbarPanelRow = ({ label, desc, control, stack = false, indent = false, className = "", mainProps = null }) =>
    react.createElement(
      "div",
      { className: joinToolbarClasses("ivl-tb-row", stack ? "is-stack" : "is-inline", indent && "is-indent", className) },
      react.createElement(
        "div",
        { className: "ivl-tb-row-main", ...(mainProps || {}) },
        label ? react.createElement("div", { className: "ivl-tb-row-label" }, label) : null,
        desc ? react.createElement("div", { className: "ivl-tb-row-desc" }, desc) : null
      ),
      control ? react.createElement("div", { className: "ivl-tb-row-control" }, control) : null
    );

  const ToolbarButton = ({ children, onClick, variant = "", size = "sm", disabled = false, className = "", ...rest }) =>
    react.createElement(
      "button",
      {
        type: "button",
        className: joinToolbarClasses(
          "ivl-tb-btn",
          size === "sm" && "is-sm",
          variant && "is-" + variant,
          className
        ),
        disabled,
        onClick,
        ...rest,
      },
      children
    );

  const ToolbarSwitch = ({ checked, onChange, label, disabled = false }) =>
    react.createElement(
      "label",
      { className: "ivl-tb-switch" },
      react.createElement("input", {
        type: "checkbox",
        role: "switch",
        checked: !!checked,
        disabled,
        "aria-label": label,
        onChange: (event) => onChange(event.target.checked),
      }),
      react.createElement("span", { className: "ivl-tb-switch-track", "aria-hidden": "true" }),
      react.createElement("span", { className: "ivl-tb-switch-thumb", "aria-hidden": "true" })
    );

  // On/off rows: the title and description are part of the hit area. A press
  // that wandered (drag) or ended in a text selection is not a toggle.
  const ToolbarToggleRow = ({ label, desc, checked, onChange, indent = false, disabled = false }) => {
    const pressRef = useRef(null);
    return react.createElement(ToolbarPanelRow, {
      label,
      desc,
      indent,
      className: joinToolbarClasses("is-toggle-row", disabled && "is-disabled"),
      mainProps: {
        onPointerDown: (event) => {
          pressRef.current = { x: event.clientX, y: event.clientY };
        },
        onClick: (event) => {
          if (disabled || event.target.closest?.("a, button, input, select, textarea, label")) return;
          const press = pressRef.current;
          if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6) return;
          if (String(window.getSelection?.() || "")) return;
          onChange(!checked);
        },
      },
      control: react.createElement(ToolbarSwitch, { checked, onChange, label, disabled }),
    });
  };

  // Picker button with a listbox below (or above, when the panel has no room).
  // Esc and outside clicks close the list without closing the panel.
  const ToolbarSelect = ({ value, options, onChange, label, disabled = false }) => {
    const safeOptions = Array.isArray(options) ? options : [];
    const selectedIndex = Math.max(0, safeOptions.findIndex((option) => option.key === value));
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(selectedIndex);
    const [placement, setPlacement] = useState("below");
    const wrapRef = useRef(null);
    const buttonRef = useRef(null);
    const listRef = useRef(null);
    const listId = useToolbarControlId("ivl-tb-select");

    const openList = () => {
      setActiveIndex(selectedIndex);
      setPlacement("below");
      setIsOpen(true);
    };
    const closeList = (restoreFocus) => {
      setIsOpen(false);
      if (restoreFocus) buttonRef.current?.focus({ preventScroll: true });
    };
    const pick = (option) => {
      if (!option || option.disabled) return;
      closeList(true);
      if (option.key !== value) onChange(option.key);
    };

    useEffect(() => {
      if (!isOpen) return undefined;
      const handlePointerDown = (event) => {
        if (!wrapRef.current?.contains(event.target)) setIsOpen(false);
      };
      document.addEventListener("pointerdown", handlePointerDown, true);
      return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    }, [isOpen]);

    react.useLayoutEffect(() => {
      if (!isOpen) return;
      const list = listRef.current;
      const wrap = wrapRef.current;
      const scroller = wrap?.closest?.(".ivl-tb-fly-body");
      if (list && wrap && scroller) {
        const wrapRect = wrap.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        const below = scrollerRect.bottom - wrapRect.bottom;
        const above = wrapRect.top - scrollerRect.top;
        if (below < list.offsetHeight + 8 && above > below) setPlacement("above");
      }
      list?.focus({ preventScroll: true });
    }, [isOpen]);

    useEffect(() => {
      if (!isOpen) return;
      listRef.current?.children?.[activeIndex]?.scrollIntoView?.({ block: "nearest" });
    }, [isOpen, activeIndex]);

    const handleListKeyDown = (event) => {
      const last = safeOptions.length - 1;
      let next = null;
      if (event.key === "ArrowDown") next = Math.min(last, activeIndex + 1);
      else if (event.key === "ArrowUp") next = Math.max(0, activeIndex - 1);
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = last;
      if (next !== null) {
        event.preventDefault();
        event.stopPropagation();
        setActiveIndex(next);
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        pick(safeOptions[activeIndex]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeList(true);
      } else if (event.key === "Tab") {
        setIsOpen(false);
      }
    };

    return react.createElement(
      "div",
      { className: joinToolbarClasses("ivl-tb-select", isOpen && "is-open"), ref: wrapRef },
      react.createElement(
        "button",
        {
          type: "button",
          ref: buttonRef,
          className: "ivl-tb-picker",
          disabled,
          "aria-haspopup": "listbox",
          "aria-expanded": isOpen,
          "aria-controls": isOpen ? listId : undefined,
          "aria-label": label + ": " + (safeOptions[selectedIndex]?.value || ""),
          onClick: () => (isOpen ? closeList(false) : openList()),
          onKeyDown: (event) => {
            if (!isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              event.preventDefault();
              event.stopPropagation();
              openList();
            }
          },
        },
        react.createElement("span", { className: "ivl-tb-picker-value ivl-tb-trunc" }, safeOptions[selectedIndex]?.value || ""),
        react.createElement(ToolbarGlyph, { name: "chevronDown", size: 15 })
      ),
      isOpen && react.createElement(
        "div",
        {
          ref: listRef,
          id: listId,
          className: "ivl-tb-pop is-" + placement,
          role: "listbox",
          tabIndex: -1,
          "aria-label": label,
          "aria-activedescendant": listId + "-" + activeIndex,
          onKeyDown: handleListKeyDown,
        },
        safeOptions.map((option, index) => react.createElement(
          "div",
          {
            key: option.key,
            id: listId + "-" + index,
            role: "option",
            className: joinToolbarClasses("ivl-tb-opt", index === activeIndex && "is-active"),
            "aria-selected": index === selectedIndex,
            "aria-disabled": option.disabled ? "true" : undefined,
            onPointerDown: (event) => event.preventDefault(),
            onPointerMove: () => {
              if (index !== activeIndex) setActiveIndex(index);
            },
            onClick: () => pick(option),
          },
          react.createElement("span", { className: "ivl-tb-opt-label ivl-tb-trunc" }, option.value),
          react.createElement(ToolbarGlyph, { name: "check", size: 15, className: "ivl-tb-opt-check" })
        ))
      )
    );
  };

  // Inline option list (provider, background): the selected option is the tab
  // stop, arrows move between options, Enter, Space or a click picks one.
  const ToolbarOptionList = ({ options, value, onPick, label, disabled = false }) => {
    const listRef = useRef(null);
    const safeOptions = Array.isArray(options) ? options : [];
    const selectedKey = safeOptions.some((option) => option.key === value) ? value : safeOptions[0]?.key;
    return react.createElement(
      "div",
      {
        ref: listRef,
        className: joinToolbarClasses("ivl-tb-options", disabled && "is-disabled"),
        role: "listbox",
        "aria-label": label,
        "aria-disabled": disabled || undefined,
        onKeyDown: (event) => moveToolbarFocus(event, listRef.current, ".ivl-tb-opt"),
      },
      safeOptions.map((option) => react.createElement(
        "button",
        {
          key: option.key,
          type: "button",
          role: "option",
          className: "ivl-tb-opt",
          "aria-selected": option.key === value,
          tabIndex: option.key === selectedKey ? 0 : -1,
          disabled: disabled || option.disabled,
          onClick: () => onPick(option.key),
        },
        react.createElement("span", { className: "ivl-tb-opt-label ivl-tb-trunc" }, option.value),
        react.createElement(ToolbarGlyph, { name: "check", size: 15, className: "ivl-tb-opt-check" })
      ))
    );
  };

  const ToolbarMenuList = ({ label, children }) => {
    const listRef = useRef(null);
    return react.createElement(
      "div",
      {
        ref: listRef,
        className: "ivl-tb-group ivl-tb-menu",
        role: "menu",
        "aria-label": label,
        onKeyDown: (event) => moveToolbarFocus(event, listRef.current, ".ivl-tb-mi"),
      },
      children
    );
  };

  const ToolbarMenuItem = ({ icon, label, desc, value, drill = false, popup, checked, current = false, disabled = false, onClick }) =>
    react.createElement(
      "button",
      {
        type: "button",
        className: joinToolbarClasses("ivl-tb-mi", current && "is-current"),
        role: checked === undefined ? "menuitem" : "menuitemcheckbox",
        "aria-checked": checked === undefined ? undefined : !!checked,
        "aria-haspopup": popup || (drill ? "true" : undefined),
        "aria-current": current ? "page" : undefined,
        disabled,
        onClick,
      },
      react.createElement("span", { className: "ivl-tb-mi-ico" }, react.createElement(ToolbarGlyph, { name: icon, size: 18 })),
      react.createElement(
        "span",
        { className: "ivl-tb-mi-main" },
        react.createElement("span", { className: "ivl-tb-mi-label ivl-tb-trunc" }, label),
        desc ? react.createElement("small", null, desc) : null
      ),
      value ? react.createElement("span", { className: "ivl-tb-mi-value ivl-tb-trunc" }, value) : null,
      checked === undefined ? null : react.createElement("span", {
        className: joinToolbarClasses("ivl-tb-mi-state", checked && "is-on"),
        "aria-hidden": "true",
      }),
      current ? react.createElement(ToolbarGlyph, { name: "check", size: 16, className: "ivl-tb-mi-check" }) : null,
      drill ? react.createElement(ToolbarGlyph, { name: "chevronRight", size: 16, className: "ivl-tb-mi-chev" }) : null
    );

  const ToolbarNote = ({ children, actions = null }) =>
    react.createElement(
      "div",
      { className: "ivl-tb-note" },
      react.createElement(ToolbarGlyph, { name: "info", size: 16 }),
      react.createElement(
        "div",
        { className: "ivl-tb-note-body" },
        children,
        actions ? react.createElement("div", { className: "ivl-tb-note-actions" }, actions) : null
      )
    );

  const ToolbarOffsetSteps = ({ steps, onStep, label, disabled = false, unit = true }) =>
    react.createElement(
      "div",
      { className: "ivl-tb-offset-quick", role: "group", "aria-label": label },
      steps.map((step) => react.createElement(ToolbarButton, {
        key: step,
        disabled,
        "aria-label": label + " " + formatToolbarOffsetStep(step),
        onClick: () => onStep(step),
      }, unit ? formatToolbarOffsetStep(step) : (step > 0 ? "+" : "\u2212") + Math.abs(step)))
    );

  // Numeric value field: the wheel never changes it (it blurs, so the panel
  // scrolls), Enter commits and Esc puts the value from before back.
  const ToolbarNumberField = ({ value, min, max, step = 1, unit, label, onCommit }) => {
    const [draft, setDraft] = useState(null);
    const cancelRef = useRef(false);
    const commit = () => {
      if (cancelRef.current || draft === null) {
        cancelRef.current = false;
        setDraft(null);
        return;
      }
      const numericValue = Number(draft);
      setDraft(null);
      if (!Number.isFinite(numericValue)) return;
      const snapped = Math.round(numericValue / step) * step;
      onCommit(Math.max(min, Math.min(max, snapped)));
    };
    return react.createElement(
      "label",
      { className: "ivl-tb-value-chip" },
      react.createElement("input", {
        type: "number",
        inputMode: "numeric",
        min,
        max,
        step,
        value: draft === null ? String(value) : draft,
        "aria-label": label,
        onChange: (event) => setDraft(event.target.value),
        onBlur: commit,
        onWheel: (event) => {
          if (document.activeElement === event.currentTarget) event.currentTarget.blur();
        },
        onKeyDown: (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            // The value from before typing stays (nothing was committed). An
            // untouched field lets Esc through, so it still closes the panel.
            if (draft !== null) {
              event.preventDefault();
              event.stopPropagation();
            }
            cancelRef.current = true;
            event.currentTarget.blur();
          }
        },
      }),
      unit ? react.createElement("span", { className: "ivl-tb-unit" }, unit) : null
    );
  };

  const ToolbarRangeField = ({ value, min, max, step, label, unit, onChange }) => {
    const percent = ((Math.max(min, Math.min(max, value)) - min) / (max - min)) * 100;
    const zero = ((0 - min) / (max - min)) * 100;
    return react.createElement(
      "div",
      { className: "ivl-tb-range", style: { "--ivl-tb-p": percent, "--ivl-tb-d": zero } },
      react.createElement(
        "div",
        { className: "ivl-tb-range-track" },
        react.createElement("span", { className: "ivl-tb-range-rail" }, react.createElement("span", { className: "ivl-tb-range-fill" })),
        react.createElement("span", { className: "ivl-tb-range-default", "aria-hidden": "true" }),
        react.createElement("input", {
          type: "range",
          min,
          max,
          step,
          value,
          "aria-label": label,
          "aria-valuetext": formatSyncOffset(value),
          onChange: (event) => onChange(Number(event.target.value)),
        })
      ),
      react.createElement(ToolbarNumberField, { value, min, max, step, unit, label, onCommit: onChange })
    );
  };

  return {
    useToolbarControlId,
    ToolbarGlyph,
    ToolbarPanelSection,
    ToolbarPanelGroup,
    ToolbarPanelRow,
    ToolbarButton,
    ToolbarToggleRow,
    ToolbarSelect,
    ToolbarOptionList,
    ToolbarMenuList,
    ToolbarMenuItem,
    ToolbarNote,
    ToolbarOffsetSteps,
    ToolbarRangeField,
  };
}
