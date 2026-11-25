import { openFluentReactModal } from "./fluentModalHost.mjs";

export function createOptionsDialog({ react, OptionsMenu, ConfigSlider, ConfigButton }) {
  const SettingRowDescription = ({ icon, text }) => {
    return react.createElement(
      "div",
      { className: "ivlyrics-popup-row-with-icon" },
      // React 310 방지: icon이 문자열이고 비어있지 않을 때만 렌더링
      icon &&
      typeof icon === "string" &&
      icon &&
      react.createElement(
        "span",
        { className: "ivlyrics-popup-row-icon" },
        react.createElement("svg", {
          width: 16,
          height: 16,
          viewBox: "0 0 16 16",
          fill: "currentColor",
          dangerouslySetInnerHTML: { __html: icon },
        })
      ),
      react.createElement("span", null, text || "")
    );
  };

  // Helper Component: Toggle Switch
  const IvConfigSlider = react.memo(({ defaultValue, onToggle }) => {
    const [isActive, setIsActive] = react.useState(defaultValue);

    const handleClick = () => {
      const newState = !isActive;
      setIsActive(newState);
      onToggle(newState);
    };

    return react.createElement(
      "button",
      {
        className: `ivlyrics-popup-switch ${isActive ? "active" : ""}`,
        onClick: handleClick,
      },
      react.createElement("div", { className: "ivlyrics-popup-switch-knob" })
    );
  });

  // Helper Component: Simple Button
  const IvConfigButton = react.memo(({ text, onClick }) => {
    return react.createElement(
      "button",
      {
        className: "ivlyrics-fluent-btn",
        onClick,
      },
      text
    );
  });

  // OptionList Component (Renamed to avoid collision)
  const IvOptionList = react.memo(({ items, onChange }) => {
    return react.createElement(
      "div",
      { className: "ivlyrics-popup-section-list" },
      items.map((item) => {
        const { key, type, desc, info, ...props } = item;

        let control = null;
        if (type === OptionsMenu) {
          control = react.createElement(OptionsMenu, {
            ...props,
            onSelect: (val) => onChange(key, val),
            selected: props.defaultValue
          });
        } else if (type === IvConfigSlider || type === ConfigSlider) { // Handle both just in case
          control = react.createElement(IvConfigSlider, {
            defaultValue: props.defaultValue,
            onToggle: (val) => onChange(key, val)
          });
        } else if (type === IvConfigButton || type === ConfigButton) {
          control = react.createElement(IvConfigButton, {
            text: props.text,
            onClick: props.onChange || (() => { })
          });
        }

        // info 타입은 컨트롤 없음

        return react.createElement(
          "div",
          { key, className: `ivlyrics-popup-setting-row${control ? "" : " no-control"}` },
          react.createElement(
            "div",
            { className: "ivlyrics-popup-setting-row-content" },
            react.createElement(
              "div",
              { className: "ivlyrics-popup-setting-row-left" },
              react.createElement("div", { className: "ivlyrics-popup-setting-name" }, desc),
              info && react.createElement("div", { className: "ivlyrics-popup-setting-description" }, info)
            ),
            react.createElement(
              "div",
              { className: "ivlyrics-popup-setting-row-right" },
              control
            )
          )
        );
      })
    );
  });

  // Helper: open a compact options modal using Fluent shell styles
  function openOptionsModal(title, items, onChange, eventType = null) {
    const container = react.createElement(
      "div",
      { className: "ivlyrics-options-root" },
      items.map((section, sectionIndex) =>
        react.createElement(
          react.Fragment,
          { key: sectionIndex },
          section.section &&
            react.createElement(
              "div",
              { className: "ivlyrics-popup-section-title" },
              react.createElement("h3", null, section.section),
              section.subtitle && react.createElement("p", null, section.subtitle)
            ),
          react.createElement(
            IvOptionList,
            Object.assign(
              {
                items: section.items || [section],
                onChange,
              },
              eventType ? { type: eventType } : {}
            )
          )
        )
      )
    );

    const closeModal = openFluentReactModal({
      react,
      overlayId: "ivLyrics-options-overlay",
      shellId: "ivLyrics-options-modal",
      shellClassName: "ivlyrics-options-modal-shell",
      render: onClose => react.createElement(
        react.Fragment,
        null,
        react.createElement(
          "div", { className: "ivlyrics-fluent-header" },
          react.createElement("div", { className: "ivlyrics-fluent-title-wrap" },
            react.createElement("h2", { className: "ivlyrics-fluent-title" }, title)),
          react.createElement("button", { className: "ivlyrics-fluent-close", onClick: onClose },
            react.createElement("svg", { viewBox: "0 0 16 16", fill: "currentColor" },
              react.createElement("path", {
                d: "M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z",
              })))
        ),
        react.createElement("div", { className: "ivlyrics-fluent-body ivlyrics-options-modal-body" }, container)
      ),
    });
    return closeModal ?? undefined;
  }

  return { openOptionsModal, SettingRowDescription };
}
