const OptionsMenuItemIcon = react.createElement(
  "svg",
  {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "currentColor",
  },
  react.createElement("path", {
    d: "M13.985 2.383L5.127 12.754 1.388 8.375l-.658.77 4.397 5.149 9.618-11.262z",
  })
);

// Optimized OptionsMenuItem with better performance
const OptionsMenuItem = react.memo(({ onSelect, value, isSelected }) => {
  // React 130 방지: Hook 순서 일관성 유지
  const menuItemProps = useMemo(
    () => ({
      onClick: onSelect,
      icon: isSelected ? OptionsMenuItemIcon : null,
      trailingIcon: isSelected ? OptionsMenuItemIcon : null,
    }),
    [onSelect, isSelected]
  );

  // React 31 방지: value가 유효한지 확인
  const safeValue = value || "";

  return react.createElement(
    Spicetify.ReactComponent.MenuItem,
    menuItemProps,
    safeValue
  );
});

const OptionsMenu = react.memo(
  ({ options, onSelect, selected, defaultValue, bold = false }) => {
    // Custom Dropdown State
    const [isOpen, setIsOpen] = react.useState(false);
    const containerRef = react.useRef(null);
    const dropdownRef = react.useRef(null);
    const [dropdownPosition, setDropdownPosition] = react.useState({ top: 0, left: 0, width: 0 });

    // React 31 방지: options 배열 유효성 검사
    const safeOptions = Array.isArray(options) ? options : [];

    // 초기 선택 값 결정 (selected 또는 defaultValue에서)
    const getInitialSelected = () => {
      let initialItem = selected || defaultValue;
      if (initialItem && typeof initialItem !== 'object') {
        initialItem = safeOptions.find(o => o.key === initialItem);
      } else if (initialItem && initialItem.key && !initialItem.value) {
        const found = safeOptions.find(o => o.key === initialItem.key);
        if (found) initialItem = found;
      }
      return initialItem;
    };

    // 내부 상태로 선택된 항목 관리
    const [selectedItem, setSelectedItem] = react.useState(getInitialSelected);

    // props가 변경되면 내부 상태 업데이트
    react.useEffect(() => {
      setSelectedItem(getInitialSelected());
    }, [selected, defaultValue]);

    // Resolve default item for display fallback
    let defaultItem = defaultValue;
    if (defaultValue && typeof defaultValue !== 'object') {
      defaultItem = safeOptions.find(o => o.key === defaultValue);
    } else if (defaultValue && defaultValue.key && !defaultValue.value) {
      const found = safeOptions.find(o => o.key === defaultValue.key);
      if (found) defaultItem = found;
    }

    // Determine display text
    const displayValue = selectedItem?.value || defaultItem?.value || (typeof defaultValue === 'string' ? defaultValue : "") || "";

    // Toggle Dropdown and Calculate Position
    const toggleDropdown = () => {
      if (!isOpen) {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          setDropdownPosition({
            top: rect.bottom + window.scrollY + 4,
            left: rect.right + window.scrollX, // Align Right
            width: Math.max(rect.width, 160)
          });
        }
      }
      setIsOpen(!isOpen);
    };

    // Close on outside click & scroll
    react.useEffect(() => {
      if (!isOpen) return;

      const handleOutsideClick = (e) => {
        // 드롭다운 내부 클릭은 무시 (개별 아이템 클릭 핸들러에서 처리)
        if (e.target.closest('.optionsMenu-dropdown-list')) return;

        if (containerRef.current && !containerRef.current.contains(e.target)) {
          setIsOpen(false);
        }
      };

      const handleScroll = (e) => {
        // 드롭다운 목록 내부 스크롤은 무시
        if (dropdownRef.current && dropdownRef.current.contains(e.target)) {
          return;
        }
        // 외부 스크롤 시 위치가 어긋나므로 닫음
        setIsOpen(false);
      };

      window.addEventListener('mousedown', handleOutsideClick);
      window.addEventListener('scroll', handleScroll, true); // Capture phase for all scrollable parents
      window.addEventListener('resize', handleScroll);

      return () => {
        window.removeEventListener('mousedown', handleOutsideClick);
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleScroll);
      };
    }, [isOpen]);

    // Render Dropdown via Portal
    const dropdownMenu = isOpen && Spicetify.ReactDOM.createPortal(
      react.createElement(
        "div",
        {
          ref: dropdownRef,
          className: "optionsMenu-dropdown-list",
          style: {
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: 'auto',
            right: `${window.innerWidth - dropdownPosition.left}px`, // Right Align
            width: 'max-content',
            minWidth: `${dropdownPosition.width}px`,
            maxWidth: '300px',
            marginTop: '0', // Portal 사용 시 margin 불필요
            zIndex: 99999 // 최상위
          }
        },
        safeOptions.map(({ key, value }) => {
          const isSelected = selectedItem?.key === key;
          return react.createElement(
            "div",
            {
              key: key,
              className: `optionsMenu-item ${isSelected ? "selected" : ""}`,
              onMouseDown: (e) => {
                // onClick 대신 onMouseDown 사용: window의 mousedown 리스너가 먼저 실행되어 메뉴를 닫는 것을 방지
                e.preventDefault();
                e.stopPropagation();

                // 내부 상태 업데이트
                const selectedOption = safeOptions.find(o => o.key === key);
                if (selectedOption) {
                  setSelectedItem(selectedOption);
                }

                // 외부 콜백 호출
                console.log('[OptionsMenu] Item clicked:', key, 'onSelect type:', typeof onSelect);
                if (typeof onSelect === 'function') {
                  onSelect(key);
                } else {
                  console.error('[OptionsMenu] onSelect is not a function:', onSelect);
                }
                setIsOpen(false);
              }
            },
            react.createElement("span", null, value),
            isSelected && react.createElement(
              "svg",
              {
                width: 16,
                height: 16,
                viewBox: "0 0 16 16",
                fill: "currentColor"
              },
              react.createElement("path", {
                d: "M13.985 2.383L5.127 12.754 1.388 8.375l-.658.77 4.397 5.149 9.618-11.262z"
              })
            )
          );
        })
      ),
      document.body // Body에 직접 렌더링
    );

    return react.createElement(
      "div",
      {
        ref: containerRef,
        style: { position: "relative" }
      },
      react.createElement(
        "button",
        {
          className: "optionsMenu-dropBox",
          onClick: toggleDropdown,
        },
        react.createElement(
          "span",
          {
            className: bold ? "main-type-mestoBold" : "main-type-mesto",
          },
          displayValue
        ),
        react.createElement(
          "svg",
          {
            height: "16",
            width: "16",
            fill: "currentColor",
            viewBox: "0 0 16 16",
            style: {
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease"
            }
          },
          react.createElement("path", {
            d: "M3 6l5 5.794L13 6z",
          })
        )
      ),
      dropdownMenu
    );
  }
);

const ICONS = {
  provider: `<path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zM8 10.93a2.93 2.93 0 1 1 0-5.86 2.93 2.93 0 0 1 0 5.86z"/>`,
  display: `<path d="M1 1h5v5H1V1zm6 0h8v5H7V1zm-6 6h5v8H1V7zm6 0h8v8H7V7z"/>`,
  mode: `<path d="M10.5 1a.5.5 0 0 1 .5.5v12a.5.5 0 0 1-1 0v-12a.5.5 0 0 1 .5-.5zm-4 0a.5.5 0 0 1 .5.5v12a.5.5 0 0 1-1 0v-12a.5.5 0 0 1 .5-.5zm-4 0a.5.5 0 0 1 .5.5v12a.5.5 0 0 1-1 0v-12a.5.5 0 0 1 .5-.5z"/>`,
  language: `<path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM1.026 7.5h1.332c.05.586.13 1.15.24 1.696-1.012-.34-1.782-.93-2.13-1.696zM14.974 7.5h-1.332a10.034 10.034 0 0 1-.24 1.696c1.012-.34 1.782-.93 2.13-1.696zM8 15c-1.07 0-2.096-.21-3.034-.604a.5.5 0 0 0-.416.924C5.59 15.8 6.758 16 8 16s2.41-.2 3.45-.68a.5.5 0 0 0-.416-.924C10.096 14.79 9.07 15 8 15zm0-1.5c.983 0 1.912-.18 2.76-.502.848-.323 1.543-.8 2.062-1.405.519-.604.85-1.353.972-2.155H2.206c.122.802.453 1.551.972 2.155.519.605 1.214 1.082 2.062 1.405C6.088 13.32 7.017 13.5 8 13.5z"/>`,
};

// 최적화 #5 - 공통 버튼 스타일 추출
const BUTTON_STYLES = {
  adjustBase: {
    background: "rgba(255, 255, 255, 0.08)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderRadius: "8px",
    color: "#ffffff",
    cursor: "pointer",
    padding: "6px 10px",
    fontSize: "12px",
    fontWeight: "600",
    minWidth: "52px",
    letterSpacing: "-0.01em",
    transition: "all 0.2s ease",
  },
  adjustHover: {
    background: "rgba(255, 255, 255, 0.12)",
    transform: "translateY(-1px)",
  },
  adjustNormal: {
    background: "rgba(255, 255, 255, 0.08)",
    transform: "translateY(0)",
  }
};

// 최적화 #5 - 재사용 가능한 Adjust 버튼 컴포넌트
const AdjustButton = ({ value, onClick }) => {
  return react.createElement("button", {
    onClick,
    style: BUTTON_STYLES.adjustBase,
    onMouseEnter: (e) => {
      Object.assign(e.target.style, BUTTON_STYLES.adjustHover);
    },
    onMouseLeave: (e) => {
      Object.assign(e.target.style, BUTTON_STYLES.adjustNormal);
    },
  }, value);
};

const SettingRowDescription = ({ icon, text }) => {
  return react.createElement(
    "div",
    { className: "setting-row-with-icon" },
    // React 310 방지: icon이 문자열이고 비어있지 않을 때만 렌더링
    icon &&
    typeof icon === "string" &&
    icon &&
    react.createElement("svg", {
      width: 16,
      height: 16,
      viewBox: "0 0 16 16",
      fill: "currentColor",
      dangerouslySetInnerHTML: { __html: icon },
    }),
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
      className: `switch-checkbox ${isActive ? "active" : ""}`,
      onClick: handleClick,
    },
    react.createElement("div", { className: "switch-knob" })
  );
});

// Helper Component: Simple Button
const IvConfigButton = react.memo(({ text, onClick }) => {
  return react.createElement(
    "button",
    {
      className: "btn",
      onClick: onClick,
    },
    text
  );
});

// OptionList Component (Renamed to avoid collision)
const IvOptionList = react.memo(({ items, onChange }) => {
  return react.createElement(
    "div",
    {},
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
        { key: key, className: "setting-row" },
        react.createElement(
          "div",
          { className: "setting-row-content" },
          react.createElement(
            "div",
            { className: "setting-row-left" },
            react.createElement("div", { className: "setting-name" }, desc),
            info && react.createElement("div", { className: "setting-description" }, info)
          ),
          react.createElement(
            "div",
            { className: "setting-row-right" },
            control
          )
        )
      );
    })
  );
});

// Helper: open a compact options modal using existing settings styles
function openOptionsModal(title, items, onChange, eventType = null) {
  const container = react.createElement(
    "div",
    { id: `${APP_NAME}-config-container` },
    react.createElement("style", {
      dangerouslySetInnerHTML: {
        __html: `
/* iOS 18 Design - 변환 설정 모달 */
#${APP_NAME}-config-container {
	padding: 0;
	background: transparent;
	color: #ffffff;
	font-family: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
	width: 100%;
}

/* 섹션 타이틀 - 카드 헤더 스타일 */
#${APP_NAME}-config-container .section-title {
	background: rgba(255, 255, 255, 0.03);
	border: 1px solid rgba(255, 255, 255, 0.08);
	border-top-left-radius: 12px;
	border-top-right-radius: 12px;
	border-bottom: none;
	backdrop-filter: blur(30px) saturate(150%);
	-webkit-backdrop-filter: blur(30px) saturate(150%);
	padding: 16px 16px 12px 16px;
	margin-top: 24px;
	margin-bottom: 0;
}

#${APP_NAME}-config-container .section-title:first-child {
	margin-top: 0;
}

#${APP_NAME}-config-container .section-title h3 {
	margin: 0 0 4px;
	font-size: 17px;
	font-weight: 600;
	color: #ffffff;
	letter-spacing: -0.02em;
}

#${APP_NAME}-config-container .section-title p {
	margin: 0;
	font-size: 13px;
	color: #8e8e93;
	line-height: 1.4;
	letter-spacing: -0.01em;
}

/* Setting Row */
#${APP_NAME}-config-container .setting-row {
	padding: 0;
	margin: 0;
	background: rgba(28, 28, 30, 0.5);
	backdrop-filter: blur(30px) saturate(150%);
	-webkit-backdrop-filter: blur(30px) saturate(150%);
	border-left: 1px solid rgba(255, 255, 255, 0.08);
	border-right: 1px solid rgba(255, 255, 255, 0.08);
	border-top: none;
	border-bottom: 0.5px solid rgba(255, 255, 255, 0.08);
	transition: background 0.15s ease;
}

#${APP_NAME}-config-container .section-title + .setting-row:first-of-type {
	border-top: none;
}

#${APP_NAME}-config-container .setting-row:last-of-type {
	border-bottom-left-radius: 12px;
	border-bottom-right-radius: 12px;
	border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

#${APP_NAME}-config-container .setting-row:hover {
	background: rgba(44, 44, 46, 0.6);
}

#${APP_NAME}-config-container .setting-row:active {
	background: rgba(58, 58, 60, 0.7);
}

#${APP_NAME}-config-container .setting-row-content {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 24px;
	padding: 12px 16px;
	min-height: 44px;
}

#${APP_NAME}-config-container .setting-row-left {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

#${APP_NAME}-config-container .setting-row-right {
	flex-shrink: 0;
	display: flex;
	align-items: center;
}

#${APP_NAME}-config-container .setting-name {
	font-weight: 400;
	font-size: 15px;
	color: #ffffff;
	line-height: 1.3;
	letter-spacing: -0.01em;
}

#${APP_NAME}-config-container .setting-description {
	font-size: 13px;
	color: #8e8e93;
	line-height: 1.35;
	letter-spacing: -0.01em;
}

#${APP_NAME}-config-container .setting-row-with-icon {
	display: flex;
	align-items: center;
	gap: 10px;
	color: #ffffff;
	font-weight: 400;
	font-size: 15px;
	letter-spacing: -0.01em;
}

#${APP_NAME}-config-container .setting-row-with-icon svg {
	flex-shrink: 0;
	opacity: 0.8;
	color: #8e8e93;
}

/* Button - iOS 스타일 */
#${APP_NAME}-config-container .btn {
	background: #007aff;
	border: none;
	border-radius: 10px;
	color: #ffffff;
	font-weight: 600;
	padding: 0 16px;
	min-height: 36px;
	cursor: pointer;
	transition: all 0.2s ease;
	font-size: 15px;
	letter-spacing: -0.01em;
}

#${APP_NAME}-config-container .btn:hover:not(:disabled) {
	background: #0066cc;
	transform: scale(1.02);
}

#${APP_NAME}-config-container .btn:active:not(:disabled) {
	background: #0055b3;
	transform: scale(0.98);
}

#${APP_NAME}-config-container .btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
	transform: none;
}

/* iOS 토글 스위치 - 완전히 새로 작성 */
#${APP_NAME}-config-container .switch-checkbox {
	width: 51px;
	height: 31px;
	border-radius: 15.5px;
	background-color: #3a3a3c;
	border: none;
	cursor: pointer;
	position: relative;
	flex-shrink: 0;
	transition: background-color 0.2s ease;
	-webkit-tap-highlight-color: transparent;
}

#${APP_NAME}-config-container .switch-checkbox::after {
	content: "";
	position: absolute;
	top: 2px;
	left: 2px;
	width: 27px;
	height: 27px;
	border-radius: 50%;
	background-color: #ffffff;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	transition: transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1);
}

#${APP_NAME}-config-container .switch-checkbox.active {
	background-color: #34c759;
}

#${APP_NAME}-config-container .switch-checkbox.active::after {
	transform: translateX(20px);
}

#${APP_NAME}-config-container .switch-checkbox svg {
	display: none;
	visibility: hidden;
}

/* Custom Modal Overlay - 커뮤니티 영상 모달과 동일한 스타일 */
#ivLyrics-translation-overlay {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	background: rgba(0, 0, 0, 0.5);
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
	z-index: 9999;
	display: flex;
	align-items: center;
	justify-content: center;
	animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

#ivLyrics-translation-modal {
	background: rgba(24, 24, 24, 0.95);
	backdrop-filter: blur(40px) saturate(180%);
	-webkit-backdrop-filter: blur(40px) saturate(180%);
	border-radius: 16px;
	border: 1px solid rgba(255, 255, 255, 0.1);
	box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
	max-width: 520px;
	width: 90%;
	max-height: 80vh;
	overflow-y: auto;
	animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes slideIn {
	from {
		opacity: 0;
		transform: scale(0.95) translateY(20px);
	}
	to {
		opacity: 1;
		transform: scale(1) translateY(0);
	}
}

/* 모달 헤더 */
#ivLyrics-translation-modal .modal-header {
	padding: 24px 24px 16px;
	border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	display: flex;
	align-items: center;
	justify-content: space-between;
}

/* Options Dropdown Button Style Fix */
#${APP_NAME}-config-container .optionsMenu-dropBox {
	background: rgba(255, 255, 255, 0.1);
	border: 1px solid rgba(255, 255, 255, 0.1);
	border-radius: 8px;
	color: #ffffff;
	padding: 6px 12px;
	font-size: 13px;
	font-weight: 500;
	cursor: pointer;
	display: flex;
	align-items: center;
	gap: 8px;
	transition: all 0.2s ease;
	min-width: 100px;
	justify-content: space-between;
}

#${APP_NAME}-config-container .optionsMenu-dropBox:hover {
	background: rgba(255, 255, 255, 0.15);
	border-color: rgba(255, 255, 255, 0.2);
}

#${APP_NAME}-config-container .optionsMenu-dropBox svg {
	fill: currentColor;
	opacity: 0.7;
}

/* Custom Dropdown Styles - Global (Portal로 이동되므로 컨테이너 ID 제거) */
.optionsMenu-dropdown-list {
	position: absolute;
	top: 100%;
	right: 0;
	min-width: 160px;
	width: max-content;
	max-width: 300px;
	margin-top: 6px;
	background: #2a2a2a;
	border: 1px solid rgba(255, 255, 255, 0.15);
	border-radius: 8px;
	box-shadow: 0 12px 28px rgba(0, 0, 0, 0.4);
	z-index: 10000;
	overflow: hidden;
	max-height: 250px;
	overflow-y: auto;
	pointer-events: auto;
}

.optionsMenu-item {
	padding: 10px 14px;
	font-size: 13px;
	color: rgba(255, 255, 255, 0.9);
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: space-between;
	transition: background 0.1s;
	white-space: nowrap;
}

.optionsMenu-item:hover {
	background: rgba(255, 255, 255, 0.1);
}

.optionsMenu-item.selected {
	color: #34c759;
	font-weight: 600;
	background: rgba(52, 199, 89, 0.1);
}

.optionsMenu-item svg {
	fill: currentColor;
	margin-left: 12px;
	flex-shrink: 0;
}

/* Scrollbar for dropdown */
.optionsMenu-dropdown-list::-webkit-scrollbar {
	width: 6px;
}
.optionsMenu-dropdown-list::-webkit-scrollbar-thumb {
	background: rgba(255, 255, 255, 0.3);
	border-radius: 3px;
}

#ivLyrics-translation-modal .modal-header h2 {
	margin: 0;
	font-size: 22px;
	font-weight: 700;
	background: linear-gradient(135deg, #ec4899 0%, #d946ef 50%, #a855f7 100%);
	-webkit-background-clip: text;
	-webkit-text-fill-color: transparent;
	background-clip: text;
	letter-spacing: -0.02em;
}

#ivLyrics-translation-modal .modal-close {
	background: rgba(255, 255, 255, 0.1);
	border: none;
	border-radius: 50%;
	width: 32px;
	height: 32px;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	transition: all 0.2s ease;
	color: #ffffff;
}

#ivLyrics-translation-modal .modal-close:hover {
	background: rgba(255, 255, 255, 0.15);
	transform: scale(1.05);
}

#ivLyrics-translation-modal .modal-close:active {
	transform: scale(0.95);
}

#ivLyrics-translation-modal .modal-close svg {
	width: 20px;
	height: 20px;
}

/* 모달 바디 */
#ivLyrics-translation-modal .modal-body {
	padding: 24px;
}

/* 스크롤바 스타일 */
#ivLyrics-translation-modal::-webkit-scrollbar {
	width: 8px;
}

#ivLyrics-translation-modal::-webkit-scrollbar-track {
	background: transparent;
}

#ivLyrics-translation-modal::-webkit-scrollbar-thumb {
	background: rgba(255, 255, 255, 0.2);
	border-radius: 4px;
}

#ivLyrics-translation-modal::-webkit-scrollbar-thumb:hover {
	background: rgba(255, 255, 255, 0.3);
}
`,
      },
    }),
    // Render sections
    items.map((section, sectionIndex) =>
      react.createElement(
        react.Fragment,
        { key: sectionIndex },
        // Section Title
        section.section &&
        react.createElement(
          "div",
          { className: "section-title" },
          react.createElement("h3", null, section.section),
          section.subtitle && react.createElement("p", null, section.subtitle)
        ),
        // Section Items
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

  // Create custom modal instead of using Spicetify.PopupModal
  const overlay = document.createElement("div");
  overlay.id = "ivLyrics-translation-overlay";

  const modal = document.createElement("div");
  modal.id = "ivLyrics-translation-modal";

  // Modal header
  const header = document.createElement("div");
  header.className = "modal-header";

  const headerTitle = document.createElement("h2");
  headerTitle.textContent = title;

  const closeBtn = document.createElement("button");
  closeBtn.className = "modal-close";
  closeBtn.innerHTML =
    '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/></svg>';
  closeBtn.onclick = () => overlay.remove();

  header.appendChild(headerTitle);
  header.appendChild(closeBtn);

  // Modal body
  const body = document.createElement("div");
  body.className = "modal-body";

  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);

  // Render React content in body
  Spicetify.ReactDOM.render(container, body);

  // Close on overlay click
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  };

  // Close on ESC key
  const handleEsc = (e) => {
    if (e.key === "Escape") {
      overlay.remove();
      document.removeEventListener("keydown", handleEsc);
    }
  };
  document.addEventListener("keydown", handleEsc);

  // Add to DOM
  document.body.appendChild(overlay);
}

// Debounce handle for adjustments modal
let adjustmentsDebounceTimeout = null;

// Define static options as a function to support i18n (called at render time)
const getStaticOptions = () => ({
  modeBase: {
    none: I18n.t("translationMenu.none"),
  },
  geminiModes: {
    gemini_romaji: I18n.t("translationMenu.geminiRomaji"),
    gemini_ko: I18n.t("translationMenu.geminiKo"),
  },
  languageModes: {
    japanese: {
      furigana: I18n.t("translationMenu.furigana"),
      romaji: I18n.t("translationMenu.romaji"),
      hiragana: I18n.t("translationMenu.hiragana"),
      katakana: I18n.t("translationMenu.katakana"),
    },
    korean: {
      romaja: I18n.t("translationMenu.romaji"),
    },
    chinese: {
      cn: I18n.t("translationMenu.simplifiedChinese"),
      hk: I18n.t("translationMenu.traditionalChineseHK"),
      tw: I18n.t("translationMenu.traditionalChineseTW"),
      pinyin: I18n.t("translationMenu.pinyin"),
    },
    // Gemini-powered languages
    russian: {
      gemini_romaji: I18n.t("translationMenu.romajiGemini"),
      gemini_ko: I18n.t("translationMenu.koGemini"),
    },
    vietnamese: {
      gemini_romaji: I18n.t("translationMenu.romajiGemini"),
      gemini_ko: I18n.t("translationMenu.koGemini"),
    },
    german: {
      gemini_romaji: I18n.t("translationMenu.romajiGemini"),
      gemini_ko: I18n.t("translationMenu.koGemini"),
    },
    spanish: {
      gemini_romaji: I18n.t("translationMenu.romajiGemini"),
      gemini_ko: I18n.t("translationMenu.koGemini"),
    },
    french: {
      gemini_romaji: I18n.t("translationMenu.romajiGemini"),
      gemini_ko: I18n.t("translationMenu.koGemini"),
    },
    italian: {
      gemini_romaji: I18n.t("translationMenu.romajiGemini"),
      gemini_ko: I18n.t("translationMenu.koGemini"),
    },
    portuguese: {
      gemini_romaji: I18n.t("translationMenu.romajiGemini"),
      gemini_ko: I18n.t("translationMenu.koGemini"),
    },
    dutch: {
      gemini_romaji: I18n.t("translationMenu.romajiGemini"),
      gemini_ko: I18n.t("translationMenu.koGemini"),
    },
    polish: {
      gemini_romaji: I18n.t("translationMenu.romajiGemini"),
      gemini_ko: I18n.t("translationMenu.koGemini"),
    },
    turkish: {
      gemini_romaji: I18n.t("translationMenu.romajiGemini"),
      gemini_ko: I18n.t("translationMenu.koGemini"),
    },
    arabic: {
      gemini_romaji: I18n.t("translationMenu.romajiGemini"),
      gemini_ko: I18n.t("translationMenu.koGemini"),
    },
    hindi: {
      gemini_romaji: I18n.t("translationMenu.romajiGemini"),
      gemini_ko: I18n.t("translationMenu.koGemini"),
    },
    thai: {
      gemini_romaji: I18n.t("translationMenu.romajiGemini"),
      gemini_ko: I18n.t("translationMenu.koGemini"),
    },
    indonesian: {
      gemini_romaji: I18n.t("translationMenu.romajiGemini"),
      gemini_ko: I18n.t("translationMenu.koGemini"),
    },
  },
});

const TranslationMenu = react.memo(({ friendlyLanguage, hasTranslation }) => {
  // Open modal on click instead of ContextMenu to avoid xpui hook errors
  const open = () => {
    // Force geminiKo provider
    CONFIG.visual["translate:translated-lyrics-source"] = "geminiKo";
    StorageManager.setItem(
      `${APP_NAME}:visual:translate:translated-lyrics-source`,
      "geminiKo"
    );

    // Force "below" display mode
    CONFIG.visual["translate:display-mode"] = "below";
    StorageManager.setItem(
      `${APP_NAME}:visual:translate:display-mode`,
      "below"
    );

    // Determine the correct mode key based on language
    const provider = CONFIG.visual["translate:translated-lyrics-source"];
    const modeKey =
      provider === "geminiKo" && !friendlyLanguage
        ? "gemini"
        : friendlyLanguage;

    console.log(
      "[TranslationMenu] Language:",
      friendlyLanguage,
      "ModeKey:",
      modeKey
    );
    console.log("[TranslationMenu] Current values:");
    console.log(
      `translation-mode:${modeKey} =`,
      CONFIG.visual[`translation-mode:${modeKey}`]
    );
    console.log(
      `translation-mode-2:${modeKey} =`,
      CONFIG.visual[`translation-mode-2:${modeKey}`]
    );

    const STATIC_OPTIONS = getStaticOptions();
    let modeOptions = STATIC_OPTIONS.geminiModes;

    // 감지된 언어를 사용자 친화적인 이름으로 변환
    const getDisplayLanguageName = (lang) => {
      if (!lang) return I18n.t("menu.unknownLanguage");
      try {
        // 현재 UI 언어로 언어 이름 표시
        const uiLang = I18n.getCurrentLanguage();
        const displayName = new Intl.DisplayNames([uiLang], { type: "language" }).of(lang);
        return displayName || lang;
      } catch {
        return lang;
      }
    };

    const displayLanguageName = getDisplayLanguageName(friendlyLanguage);

    // 현재 트랙 URI 가져오기
    const currentTrackUri = Spicetify.Player.data?.item?.uri || "";

    // 지원되는 언어 목록
    const supportedLanguages = [
      { key: "auto", value: I18n.t("menu.autoDetect") || "자동 감지" },
      { key: "ja", value: getDisplayLanguageName("ja") },
      { key: "ko", value: getDisplayLanguageName("ko") },
      { key: "zh-hans", value: getDisplayLanguageName("zh-Hans") },
      { key: "zh-hant", value: getDisplayLanguageName("zh-Hant") },
      { key: "en", value: getDisplayLanguageName("en") },
      { key: "ru", value: getDisplayLanguageName("ru") },
      { key: "vi", value: getDisplayLanguageName("vi") },
      { key: "de", value: getDisplayLanguageName("de") },
      { key: "es", value: getDisplayLanguageName("es") },
      { key: "fr", value: getDisplayLanguageName("fr") },
      { key: "pt", value: getDisplayLanguageName("pt") },
      { key: "tr", value: getDisplayLanguageName("tr") },
      { key: "pl", value: getDisplayLanguageName("pl") },
      { key: "ar", value: getDisplayLanguageName("ar") },
      { key: "th", value: getDisplayLanguageName("th") },
      { key: "hi", value: getDisplayLanguageName("hi") },
    ];

    // 현재 트랙의 언어 오버라이드 상태 (비동기로 로드)
    let currentOverride = window.lyricContainer?.trackLanguageOverride || null;

    const items = [
      {
        section: I18n.t("menu.detectedLanguage"),
        subtitle: I18n.t("menu.detectedLanguageInfo"),
        items: [
          {
            desc: react.createElement(SettingRowDescription, {
              icon: ICONS.language,
              text: displayLanguageName,
            }),
            key: "detected-language-display",
            type: "info",
          },
          {
            desc: react.createElement(SettingRowDescription, {
              icon: ICONS.language,
              text: I18n.t("menu.overrideLanguage") || "언어 수동 설정",
            }),
            key: "track-language-override",
            type: OptionsMenu,
            options: supportedLanguages,
            defaultValue: currentOverride
              ? supportedLanguages.find(l => l.key === currentOverride)
              : supportedLanguages[0],
            info: I18n.t("menu.overrideLanguageInfo") || "이 곡의 언어를 수동으로 설정합니다. 자동 감지 대신 선택한 언어로 번역됩니다.",
          },
        ],
      },
      {
        section: I18n.t("menu.translationOptions"),
        subtitle: I18n.t("menu.translationOptionsSubtitle"),
        items: [
          {
            desc: react.createElement(SettingRowDescription, {
              icon: ICONS.mode,
              text: I18n.t("menu.pronunciation"),
            }),
            key: `translation-mode:${modeKey}`,
            type: ConfigSlider,
            defaultValue:
              CONFIG.visual[`translation-mode:${modeKey}`] !== "none",
            renderInline: true,
            info: I18n.t("menu.pronunciationInfo"),
          },
          {
            desc: react.createElement(SettingRowDescription, {
              icon: ICONS.mode,
              text: I18n.t("menu.translationLabel"),
            }),
            key: `translation-mode-2:${modeKey}`,
            type: ConfigSlider,
            defaultValue:
              CONFIG.visual[`translation-mode-2:${modeKey}`] !== "none",
            renderInline: true,
            info: I18n.t("menu.translationInfo"),
          },
        ],
      },
      {
        section: I18n.t("menu.apiSettings"),
        subtitle: I18n.t("menu.apiSettingsSubtitle"),
        items: [
          {
            desc: react.createElement(SettingRowDescription, {
              icon: ICONS.provider,
              text: I18n.t("menu.apiKeySettings"),
            }),
            key: "open-api-settings",
            type: ConfigButton,
            text: I18n.t("menu.openSettings"),
            onChange: () => {
              // Close the current modal and open settings at API tab
              const overlay = document.getElementById(
                "ivLyrics-settings-overlay"
              );
              if (overlay) {
                overlay.remove();
              }
              // Open main settings and switch to advanced tab
              setTimeout(() => {
                openConfig();
                // Wait for modal to render, then switch to advanced tab
                setTimeout(() => {
                  const advancedTab = document.querySelector(
                    '[data-tab-id="advanced"]'
                  );
                  if (advancedTab) {
                    advancedTab.click();
                  }
                }, 100);
              }, 100);
            },
            info: I18n.t("menu.apiKeySettingsInfo"),
          },
        ],
      },
    ];

    openOptionsModal(I18n.t("menu.translationSettings"), items, async (name, value) => {
      // Skip processing for button items
      if (name === "open-api-settings") {
        return;
      }

      // 트랙별 언어 오버라이드 처리
      if (name === "track-language-override") {
        const trackUri = Spicetify.Player.data?.item?.uri;
        if (!trackUri) return;

        if (value === "auto") {
          // 자동 감지로 되돌리기 - DB에서 삭제
          await window.TrackLanguageDB?.clearLanguage(trackUri);
          if (window.lyricContainer) {
            window.lyricContainer.trackLanguageOverride = null;
          }
        } else {
          // 언어 오버라이드 저장
          await window.TrackLanguageDB?.setLanguage(trackUri, value);
          if (window.lyricContainer) {
            window.lyricContainer.trackLanguageOverride = value;
          }
        }

        // 번역 캐시 클리어 및 강제 리로드
        if (window.lyricContainer) {
          window.lyricContainer._dmResults = {};
          window.lyricContainer.lastProcessedUri = null;
          window.lyricContainer.lastProcessedMode = null;
          window.lyricContainer.forceUpdate();
        }
        lyricContainerUpdate?.();
        return;
      }

      // Handle toggle values - convert boolean to appropriate mode string
      if (name.startsWith("translation-mode")) {
        // For first line (발음), set to romaji or none
        if (name.startsWith(`translation-mode:`) && !name.includes("mode-2")) {
          value = value ? "gemini_romaji" : "none";
        }
        // For second line (번역), set to korean or none
        else if (name.startsWith(`translation-mode-2:`)) {
          value = value ? "gemini_ko" : "none";
        }
      }

      CONFIG.visual[name] = value;
      StorageManager.setItem(`${APP_NAME}:visual:${name}`, value);

      if (name.startsWith("translation-mode")) {
        if (window.lyricContainer) {
          // Clear translation cache to force reload with new settings
          window.lyricContainer._dmResults = {};
          window.lyricContainer.lastProcessedUri = null;
          window.lyricContainer.lastProcessedMode = null;
          window.lyricContainer.forceUpdate();
        }
      }

      lyricContainerUpdate?.();
    });
  };

  return react.createElement(
    Spicetify.ReactComponent.TooltipWrapper,
    { label: I18n.t("menu.translation") },
    react.createElement(
      "button",
      { className: "lyrics-config-button", onClick: open },
      react.createElement(
        "svg",
        { width: 16, height: 16, viewBox: "0 0 16 16", fill: "currentColor" },
        react.createElement("path", {
          d: "M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM5.78 8.5a.5.5 0 0 1-.5.5H3.5a.5.5 0 0 1 0-1h1.78a.5.5 0 0 1 .5.5zm6.72 0a.5.5 0 0 1-.5.5h-1.78a.5.5 0 0 1 0-1H12a.5.5 0 0 1 .5.5zM8 12a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 1 0v7a.5.5 0 0 1-.5.5z",
        }),
        react.createElement("path", {
          d: "M6.854 5.854a.5.5 0 1 0-.708-.708l-2 2a.5.5 0 0 0 0 .708l2 2a.5.5 0 0 0 .708-.708L5.207 7.5l1.647-1.646zm2.292 0a.5.5 0 0 1 .708-.708l2 2a.5.5 0 0 1 0 .708l-2 2a.5.5 0 0 1-.708-.708L10.793 7.5 9.146 5.854z",
        })
      )
    )
  );
});

const RegenerateTranslationButton = react.memo(
  ({ onRegenerate, isEnabled, isLoading }) => {
    return react.createElement(
      Spicetify.ReactComponent.TooltipWrapper,
      { label: I18n.t("menu.regenerateTranslation") },
      react.createElement(
        "button",
        {
          className: "lyrics-config-button",
          onClick: onRegenerate,
          disabled: !isEnabled || isLoading,
          style: {
            opacity: !isEnabled || isLoading ? 0.4 : 1,
            cursor: !isEnabled || isLoading ? "not-allowed" : "pointer",
          },
        },
        react.createElement(
          "svg",
          { width: 16, height: 16, viewBox: "0 0 16 16", fill: "currentColor" },
          react.createElement("path", {
            d: "M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z",
          }),
          react.createElement("path", {
            d: "M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z",
          })
        )
      )
    );
  }
);

const SyncAdjustButton = react.memo(
  ({ trackUri, onOffsetChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [offset, setOffset] = useState(0);
    const [communityData, setCommunityData] = useState(null);
    const [isLoadingCommunity, setIsLoadingCommunity] = useState(false);
    const [feedbackStatus, setFeedbackStatus] = useState(null); // 'positive', 'negative', null
    const [isSubmitting, setIsSubmitting] = useState(false);
    const buttonRef = useRef(null);
    const submitTimeoutRef = useRef(null);

    // Load offset when trackUri changes
    useEffect(() => {
      const loadOffset = async () => {
        const savedOffset = (await Utils.getTrackSyncOffset(trackUri)) || 0;
        setOffset(savedOffset);
      };
      loadOffset();
    }, [trackUri]);

    // Load community data when modal opens
    useEffect(() => {
      if (isOpen && CONFIG.visual["community-sync-enabled"]) {
        loadCommunityData();
      }
    }, [isOpen, trackUri]);

    const loadCommunityData = async () => {
      setIsLoadingCommunity(true);
      try {
        const data = await Utils.getCommunityOffset(trackUri);
        setCommunityData(data);
        // 사용자의 기존 피드백 상태 복원
        if (data?.user?.userFeedback !== null && data?.user?.userFeedback !== undefined) {
          setFeedbackStatus(data.user.userFeedback ? 'positive' : 'negative');
        }
      } catch (error) {
        console.error("[ivLyrics] Failed to load community data:", error);
      } finally {
        setIsLoadingCommunity(false);
      }
    };

    // Listen for community offset changes
    useEffect(() => {
      const handleCommunityOffsetChange = (event) => {
        if (event.detail?.trackUri === trackUri) {
          setOffset(event.detail.offset);
        }
      };
      window.addEventListener('ivLyrics:offset-changed', handleCommunityOffsetChange);
      return () => {
        window.removeEventListener('ivLyrics:offset-changed', handleCommunityOffsetChange);
      };
    }, [trackUri]);

    // Cleanup timeout on unmount
    useEffect(() => {
      return () => {
        if (submitTimeoutRef.current) {
          clearTimeout(submitTimeoutRef.current);
        }
      };
    }, []);

    const handleOffsetChange = async (newOffset) => {
      setOffset(newOffset);
      await Utils.setTrackSyncOffset(trackUri, newOffset);
      if (onOffsetChange) {
        onOffsetChange(newOffset);
      }

      // 커뮤니티 싱크 자동 제출 (디바운스 적용)
      if (CONFIG.visual["community-sync-enabled"] && CONFIG.visual["community-sync-auto-submit"]) {
        // 이전 타이머 취소
        if (submitTimeoutRef.current) {
          clearTimeout(submitTimeoutRef.current);
        }

        // 1초 후에 제출 (사용자가 조정을 멈추면)
        submitTimeoutRef.current = setTimeout(async () => {
          try {
            await Utils.submitCommunityOffset(trackUri, newOffset);
            loadCommunityData(); // 제출 후 커뮤니티 데이터 새로고침
          } catch (error) {
            console.error("[ivLyrics] Failed to auto-submit offset:", error);
          }
        }, 1000);
      }
    };

    const adjustOffset = (delta) => {
      const newOffset = Math.max(-10000, Math.min(10000, offset + delta));
      handleOffsetChange(newOffset);
    };

    const handleSliderChange = (event) => {
      const newOffset = Number(event.target.value);
      handleOffsetChange(newOffset);
    };

    const resetOffset = () => {
      handleOffsetChange(0);
    };

    const toggleModal = () => {
      setIsOpen(!isOpen);
      if (!isOpen) {
        setFeedbackStatus(null);
      }
    };

    // 커뮤니티 오프셋 적용
    const applyCommunityOffset = async () => {
      if (!communityData) return;
      const communityOffset = communityData.medianOffsetMs ?? communityData.offsetMs ?? 0;
      handleOffsetChange(communityOffset);
    };

    // 수동 제출
    const submitOffset = async () => {
      if (!CONFIG.visual["community-sync-enabled"]) return;
      setIsSubmitting(true);
      try {
        await Utils.submitCommunityOffset(trackUri, offset);
        // 로컬 캐시 삭제하여 새 데이터 반영
        const trackId = Utils.extractTrackId(trackUri);
        if (trackId) {
          await LyricsCache.deleteSync(trackId);
        }
        Toast.success(I18n.t("syncAdjust.submitSuccess"));
        loadCommunityData();
      } catch (error) {
        Toast.error(I18n.t("syncAdjust.submitFailed"));
      } finally {
        setIsSubmitting(false);
      }
    };

    // 피드백 제출
    const submitFeedback = async (isPositive) => {
      if (!CONFIG.visual["community-sync-enabled"]) return;
      // 자신이 제출한 오프셋에는 피드백 불가
      if (communityData?.user?.hasSubmitted) {
        Toast.error(I18n.t("syncAdjust.cannotFeedbackOwnSubmission"));
        return;
      }
      try {
        await Utils.submitCommunityFeedback(trackUri, isPositive);
        setFeedbackStatus(isPositive ? 'positive' : 'negative');
        Toast.success(
          isPositive ? I18n.t("syncAdjust.feedbackPositiveSuccess") : I18n.t("syncAdjust.feedbackNegativeSuccess")
        );
      } catch (error) {
        console.error("[ivLyrics] Failed to submit feedback:", error);
        Toast.error(I18n.t("syncAdjust.feedbackFailed"));
      }
    };

    // 신뢰도 표시 색상
    const getConfidenceColor = (confidence) => {
      if (confidence >= 0.8) return "#34c759"; // 녹색
      if (confidence >= 0.5) return "#ff9500"; // 주황
      return "#ff3b30"; // 빨강
    };

    // 신뢰도 레벨 텍스트
    const getConfidenceLevel = (confidence) => {
      if (confidence >= 0.8) return I18n.t("syncAdjust.confidenceHigh");
      if (confidence >= 0.5) return I18n.t("syncAdjust.confidenceMedium");
      return I18n.t("syncAdjust.confidenceLow");
    };

    // 버튼 위치 기반으로 모달 위치 계산
    const getModalStyle = () => {
      // 전체화면 모드인지 확인
      const isFullscreen = document.querySelector('.lyrics-lyricsContainer-LyricsContainer.fullscreen-active');

      if (isFullscreen && buttonRef.current) {
        // 전체화면: 버튼 기준으로 위치 계산
        const rect = buttonRef.current.getBoundingClientRect();
        return {
          bottom: `${window.innerHeight - rect.top + 8}px`,
          right: `${window.innerWidth - rect.right}px`
        };
      } else {
        // 일반 모드: 버튼 컨테이너가 우측 하단에 고정되어 있으므로 고정 위치 사용
        return {
          bottom: "80px",
          right: "32px"
        };
      }
    };

    const isCommunityEnabled = CONFIG.visual["community-sync-enabled"];

    return react.createElement(
      react.Fragment,
      null,
      react.createElement(
        Spicetify.ReactComponent.TooltipWrapper,
        { label: I18n.t("menu.syncAdjust") },
        react.createElement(
          "button",
          {
            ref: buttonRef,
            className: "lyrics-config-button",
            onClick: toggleModal,
          },
          react.createElement(
            "svg",
            {
              width: 16,
              height: 16,
              viewBox: "0 0 16 16",
              fill: "currentColor",
            },
            react.createElement("path", {
              d: "M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z",
            }),
            react.createElement("path", {
              d: "M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z",
            })
          )
        )
      ),
      isOpen &&
      (() => {
        const modalStyle = getModalStyle();
        return react.createElement(
          "div",
          {
            className: "lyrics-sync-adjust-modal",
            style: {
              position: "fixed",
              bottom: modalStyle.bottom,
              right: modalStyle.right,
              background: "rgba(24, 24, 24, 0.95)",
              backdropFilter: "blur(40px) saturate(180%)",
              WebkitBackdropFilter: "blur(40px) saturate(180%)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "16px",
              padding: "20px 24px",
              zIndex: 99999,
              minWidth: "520px",
              boxShadow: "0 24px 64px rgba(0, 0, 0, 0.5)",
              fontFamily:
                "Pretendard Variable, -apple-system, BlinkMacSystemFont, sans-serif",
            },
          },
          react.createElement("style", {
            dangerouslySetInnerHTML: {
              __html: `
.lyrics-sync-adjust-modal .slider-container {
	flex: 1;
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 8px 0;
}
.lyrics-sync-adjust-modal .sync-slider {
	width: 100%;
	height: 28px;
	background: transparent;
	outline: none;
	-webkit-appearance: none;
	appearance: none;
	cursor: pointer;
}

.lyrics-sync-adjust-modal .sync-slider::-webkit-slider-runnable-track {
	width: 100%;
	height: 6px;
	background: linear-gradient(to right, #007aff var(--progress-percent, 50%), #3a3a3c var(--progress-percent, 50%));
	border-radius: 3px;
	transition: background 0.1s ease;
}

.lyrics-sync-adjust-modal .sync-slider::-webkit-slider-thumb {
	-webkit-appearance: none;
	appearance: none;
	width: 28px;
	height: 28px;
	background: #ffffff;
	border-radius: 50%;
	cursor: pointer;
	box-shadow: 0 3px 8px rgba(0, 0, 0, 0.2), 0 0 1px rgba(0, 0, 0, 0.1);
	margin-top: -11px;
	transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.lyrics-sync-adjust-modal .sync-slider:hover::-webkit-slider-thumb {
	transform: scale(1.05);
}

.lyrics-sync-adjust-modal .sync-slider:active::-webkit-slider-thumb {
	transform: scale(0.98);
	box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

/* Firefox Styles */
.lyrics-sync-adjust-modal .sync-slider::-moz-range-track {
	width: 100%;
	height: 6px;
	background: #3a3a3c;
	border-radius: 3px;
	border: none;
}

.lyrics-sync-adjust-modal .sync-slider::-moz-range-progress {
	height: 6px;
	background: #007aff;
	border-radius: 3px;
}

.lyrics-sync-adjust-modal .sync-slider::-moz-range-thumb {
	width: 28px;
	height: 28px;
	background: #ffffff;
	border: none;
	border-radius: 50%;
	cursor: pointer;
	box-shadow: 0 3px 8px rgba(0, 0, 0, 0.2), 0 0 1px rgba(0, 0, 0, 0.1);
}

.lyrics-sync-adjust-modal .community-section {
	margin-top: 16px;
	padding-top: 16px;
	border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.lyrics-sync-adjust-modal .community-info-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.lyrics-sync-adjust-modal .community-stats {
	display: flex;
	align-items: center;
	gap: 16px;
}

.lyrics-sync-adjust-modal .stat-item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2px;
}

.lyrics-sync-adjust-modal .stat-value {
	font-size: 16px;
	font-weight: 600;
	color: #ffffff;
}

.lyrics-sync-adjust-modal .stat-label {
	font-size: 10px;
	color: #8e8e93;
	text-transform: uppercase;
	letter-spacing: 0.5px;
}

.lyrics-sync-adjust-modal .community-actions {
	display: flex;
	gap: 8px;
}

.lyrics-sync-adjust-modal .feedback-btn {
	width: 36px;
	height: 36px;
	border-radius: 50%;
	border: 1px solid rgba(255, 255, 255, 0.15);
	background: rgba(255, 255, 255, 0.05);
	cursor: pointer;
	display: flex;
	align-items: center;
	justify-content: center;
	transition: all 0.2s ease;
	font-size: 16px;
}

.lyrics-sync-adjust-modal .feedback-btn:hover {
	background: rgba(255, 255, 255, 0.1);
	transform: scale(1.05);
}

.lyrics-sync-adjust-modal .feedback-btn.active-positive {
	background: rgba(52, 199, 89, 0.2);
	border-color: rgba(52, 199, 89, 0.5);
}

.lyrics-sync-adjust-modal .feedback-btn.active-negative {
	background: rgba(255, 59, 48, 0.2);
	border-color: rgba(255, 59, 48, 0.5);
}

.lyrics-sync-adjust-modal .feedback-btn:disabled {
	opacity: 0.4;
	cursor: not-allowed;
	pointer-events: none;
}

.lyrics-sync-adjust-modal .action-btn {
	padding: 8px 14px;
	border-radius: 8px;
	border: 1px solid rgba(255, 255, 255, 0.15);
	background: rgba(255, 255, 255, 0.05);
	color: #ffffff;
	font-size: 12px;
	font-weight: 500;
	cursor: pointer;
	transition: all 0.2s ease;
	white-space: nowrap;
}

.lyrics-sync-adjust-modal .action-btn:hover:not(:disabled) {
	background: rgba(255, 255, 255, 0.1);
	transform: translateY(-1px);
}

.lyrics-sync-adjust-modal .action-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.lyrics-sync-adjust-modal .action-btn.primary {
	background: rgba(0, 122, 255, 0.2);
	border-color: rgba(0, 122, 255, 0.4);
	color: #007aff;
}

.lyrics-sync-adjust-modal .action-btn.primary:hover:not(:disabled) {
	background: rgba(0, 122, 255, 0.3);
}
`,
            },
          }),
          // Header
          react.createElement(
            "div",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              },
            },
            react.createElement(
              "div",
              {
                style: {
                  fontSize: "20px",
                  fontWeight: "700",
                  background: "linear-gradient(135deg, #0ea5e9 0%, #06b6d4 50%, #14b8a6 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  letterSpacing: "-0.02em",
                },
              },
              I18n.t("menu.syncAdjustTitle")
            ),
            react.createElement(
              "button",
              {
                onClick: toggleModal,
                style: {
                  background: "rgba(255, 255, 255, 0.1)",
                  border: "none",
                  borderRadius: "50%",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: "18px",
                  padding: "0",
                  width: "28px",
                  height: "28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s ease",
                },
                onMouseEnter: (e) => {
                  e.target.style.background = "rgba(255, 255, 255, 0.15)";
                  e.target.style.transform = "scale(1.05)";
                },
                onMouseLeave: (e) => {
                  e.target.style.background = "rgba(255, 255, 255, 0.1)";
                  e.target.style.transform = "scale(1)";
                },
              },
              "×"
            )
          ),
          // Info text
          react.createElement(
            "div",
            {
              style: {
                fontSize: "13px",
                color: "#8e8e93",
                marginBottom: "16px",
                letterSpacing: "-0.01em",
              },
            },
            I18n.t("syncAdjust.info")
          ),
          // Slider section
          react.createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "12px",
              },
            },
            // Slider
            react.createElement(
              "div",
              {
                className: "slider-container",
              },
              react.createElement("input", {
                type: "range",
                className: "sync-slider",
                min: -10000,
                max: 10000,
                step: 10,
                value: offset,
                onInput: handleSliderChange,
                style: {
                  "--progress-percent": `${((offset + 10000) / 20000) * 100}%`,
                },
              }),
              react.createElement(
                "div",
                {
                  style: {
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    color: "#8e8e93",
                    fontWeight: "500",
                    padding: "0 4px",
                  },
                },
                react.createElement("span", null, "-10s"),
                react.createElement(
                  "span",
                  {
                    style: {
                      color: "#ffffff",
                      fontWeight: "600",
                      fontSize: "14px",
                      letterSpacing: "-0.01em",
                    },
                  },
                  `${offset}ms`
                ),
                react.createElement("span", null, "+10s")
              )
            ),
            // Fine adjustment buttons
            react.createElement(
              "div",
              {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                },
              },
              react.createElement(
                "div",
                {
                  style: {
                    display: "flex",
                    gap: "6px",
                  },
                },
                react.createElement(AdjustButton, { value: "-1000", onClick: () => adjustOffset(-1000) }),
                react.createElement(AdjustButton, { value: "-100", onClick: () => adjustOffset(-100) }),
                react.createElement(AdjustButton, { value: "-10", onClick: () => adjustOffset(-10) })
              ),
              react.createElement(
                "div",
                {
                  style: {
                    display: "flex",
                    gap: "6px",
                  },
                },
                react.createElement(AdjustButton, { value: "+1000", onClick: () => adjustOffset(1000) }),
                react.createElement(AdjustButton, { value: "+100", onClick: () => adjustOffset(100) }),
                react.createElement(AdjustButton, { value: "+10", onClick: () => adjustOffset(10) })
              )
            ),
            // Reset button
            react.createElement(
              "button",
              {
                onClick: resetOffset,
                style: {
                  background: "rgba(255, 59, 48, 0.15)",
                  border: "1px solid rgba(255, 59, 48, 0.3)",
                  borderRadius: "10px",
                  color: "#ff3b30",
                  cursor: "pointer",
                  padding: "10px 16px",
                  fontSize: "13px",
                  fontWeight: "600",
                  letterSpacing: "-0.01em",
                  transition: "all 0.2s ease",
                  whiteSpace: "nowrap",
                },
                onMouseEnter: (e) => {
                  e.target.style.background = "rgba(255, 59, 48, 0.2)";
                  e.target.style.borderColor = "rgba(255, 59, 48, 0.4)";
                  e.target.style.transform = "translateY(-1px)";
                },
                onMouseLeave: (e) => {
                  e.target.style.background = "rgba(255, 59, 48, 0.15)";
                  e.target.style.borderColor = "rgba(255, 59, 48, 0.3)";
                  e.target.style.transform = "translateY(0)";
                },
              },
              I18n.t("syncAdjust.reset")
            )
          ),
          // Community Sync Section
          isCommunityEnabled && react.createElement(
            "div",
            { className: "community-section" },
            react.createElement(
              "div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "12px",
                },
              },
              react.createElement(
                "svg",
                { width: 14, height: 14, viewBox: "0 0 16 16", fill: "#8e8e93" },
                react.createElement("path", {
                  d: "M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1h8zm-7.978-1A.261.261 0 0 1 7 12.996c.001-.264.167-1.03.76-1.72C8.312 10.629 9.282 10 11 10c1.717 0 2.687.63 3.24 1.276.593.69.758 1.457.76 1.72l-.008.002a.274.274 0 0 1-.014.002H7.022zM11 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm3-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM6.936 9.28a5.88 5.88 0 0 0-1.23-.247A7.35 7.35 0 0 0 5 9c-4 0-5 3-5 4 0 .667.333 1 1 1h4.216A2.238 2.238 0 0 1 5 13c0-1.01.377-2.042 1.09-2.904.243-.294.526-.569.846-.816zM4.92 10A5.493 5.493 0 0 0 4 13H1c0-.26.164-1.03.76-1.724.545-.636 1.492-1.256 3.16-1.275zM1.5 5.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0zm3-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
                })
              ),
              react.createElement(
                "span",
                {
                  style: {
                    fontSize: "13px",
                    fontWeight: "600",
                    color: "#ffffff",
                  },
                },
                I18n.t("syncAdjust.communityTitle")
              )
            ),
            isLoadingCommunity
              ? react.createElement(
                "div",
                {
                  style: {
                    color: "#8e8e93",
                    fontSize: "12px",
                    textAlign: "center",
                    padding: "12px 0",
                  },
                },
                I18n.t("syncAdjust.loading")
              )
              : communityData
                ? react.createElement(
                  "div",
                  { className: "community-info-row" },
                  // Stats
                  react.createElement(
                    "div",
                    { className: "community-stats" },
                    // Offset
                    react.createElement(
                      "div",
                      { className: "stat-item" },
                      react.createElement(
                        "span",
                        { className: "stat-value" },
                        `${communityData.medianOffsetMs ?? communityData.offsetMs ?? 0}ms`
                      ),
                      react.createElement(
                        "span",
                        { className: "stat-label" },
                        I18n.t("syncAdjust.communityOffset")
                      )
                    ),
                    // Submissions
                    react.createElement(
                      "div",
                      { className: "stat-item" },
                      react.createElement(
                        "span",
                        { className: "stat-value" },
                        communityData.submissionCount ?? 0
                      ),
                      react.createElement(
                        "span",
                        { className: "stat-label" },
                        I18n.t("syncAdjust.submissions")
                      )
                    ),
                    // Confidence
                    react.createElement(
                      "div",
                      { className: "stat-item" },
                      react.createElement(
                        "span",
                        {
                          className: "stat-value",
                          style: { color: getConfidenceColor(communityData.confidence ?? 0) },
                        },
                        `${Math.round((communityData.confidence ?? 0) * 100)}%`
                      ),
                      react.createElement(
                        "span",
                        { className: "stat-label" },
                        getConfidenceLevel(communityData.confidence ?? 0)
                      )
                    )
                  ),
                  // Actions
                  react.createElement(
                    "div",
                    { className: "community-actions" },
                    // Feedback buttons
                    react.createElement(
                      "button",
                      {
                        className: `feedback-btn ${feedbackStatus === 'positive' ? 'active-positive' : ''}`,
                        onClick: () => submitFeedback(true),
                        title: communityData?.user?.hasSubmitted
                          ? I18n.t("syncAdjust.cannotFeedbackOwnSubmission")
                          : I18n.t("syncAdjust.feedbackGood"),
                        disabled: communityData?.user?.hasSubmitted,
                      },
                      "👍"
                    ),
                    react.createElement(
                      "button",
                      {
                        className: `feedback-btn ${feedbackStatus === 'negative' ? 'active-negative' : ''}`,
                        onClick: () => submitFeedback(false),
                        title: communityData?.user?.hasSubmitted
                          ? I18n.t("syncAdjust.cannotFeedbackOwnSubmission")
                          : I18n.t("syncAdjust.feedbackBad"),
                        disabled: communityData?.user?.hasSubmitted,
                      },
                      "👎"
                    ),
                    // Apply button
                    react.createElement(
                      "button",
                      {
                        className: "action-btn primary",
                        onClick: applyCommunityOffset,
                      },
                      I18n.t("syncAdjust.applyCommunity")
                    )
                  )
                )
                : react.createElement(
                  "div",
                  {
                    style: {
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    },
                  },
                  react.createElement(
                    "span",
                    {
                      style: {
                        color: "#8e8e93",
                        fontSize: "12px",
                      },
                    },
                    I18n.t("syncAdjust.noData")
                  ),
                  react.createElement(
                    "button",
                    {
                      className: "action-btn primary",
                      onClick: submitOffset,
                      disabled: isSubmitting || offset === 0,
                    },
                    isSubmitting ? I18n.t("syncAdjust.submitting") : I18n.t("syncAdjust.submitMine")
                  )
                ),
            // Auto-submit status indicator
            CONFIG.visual["community-sync-auto-submit"] && react.createElement(
              "div",
              {
                style: {
                  marginTop: "12px",
                  padding: "8px 12px",
                  background: "rgba(52, 199, 89, 0.1)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "#34c759",
                  textAlign: "center",
                },
              },
              I18n.t("syncAdjust.autoSubmitEnabled")
            ),
            // Submit button (always show when community data exists)
            communityData && react.createElement(
              "div",
              {
                style: {
                  marginTop: "12px",
                  display: "flex",
                  justifyContent: "flex-end",
                },
              },
              react.createElement(
                "button",
                {
                  className: "action-btn",
                  onClick: submitOffset,
                  disabled: isSubmitting,
                },
                isSubmitting ? I18n.t("syncAdjust.submitting") : I18n.t("syncAdjust.submitMine")
              )
            )
          )
        );
      })()
    );
  }
);

// Community Video Selector를 document.body에 직접 렌더링
function openCommunityVideoSelector(trackUri, currentVideoId, onVideoSelect) {
  // 이미 열려있으면 무시
  if (document.getElementById("ivLyrics-community-video-overlay")) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "ivLyrics-community-video-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  `;

  const modalContainer = document.createElement("div");
  modalContainer.style.cssText = `
    background: rgba(24, 24, 24, 0.95);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    border-radius: 16px;
    max-width: 90vw;
    max-height: 70vh;
    width: 560px;
    overflow: hidden;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
  `;

  const closeModal = () => {
    if (overlay.parentNode) {
      document.body.removeChild(overlay);
    }
    document.removeEventListener("keydown", handleEscape);
  };

  // Close on outside click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });

  // Close on escape key
  const handleEscape = (e) => {
    if (e.key === "Escape") {
      closeModal();
    }
  };
  document.addEventListener("keydown", handleEscape);

  overlay.appendChild(modalContainer);
  document.body.appendChild(overlay);

  // Render React component
  const dom = window.Spicetify?.ReactDOM ?? window.ReactDOM ?? null;
  if (!dom?.render) {
    return;
  }

  const selectorComponent = react.createElement(CommunityVideoSelector, {
    trackUri: trackUri,
    currentVideoId: currentVideoId,
    onVideoSelect: (newVideoInfo) => {
      if (onVideoSelect) {
        onVideoSelect(newVideoInfo);
      }
      closeModal();
    },
    onClose: closeModal
  });

  dom.render(selectorComponent, modalContainer);
}

// Community Video Selector Button
const CommunityVideoButton = react.memo(({ trackUri, videoInfo, onVideoSelect }) => {
  // 비디오 배경이 비활성화되어 있으면 버튼 숨김
  if (!CONFIG.visual["video-background"]) {
    return null;
  }

  const handleClick = () => {
    openCommunityVideoSelector(
      trackUri,
      videoInfo?.youtubeVideoId,
      onVideoSelect
    );
  };

  return react.createElement(
    Spicetify.ReactComponent.TooltipWrapper,
    { label: I18n.t("communityVideo.selectVideo") },
    react.createElement(
      "button",
      {
        className: "lyrics-config-button",
        onClick: handleClick
      },
      react.createElement(
        "svg",
        { width: 16, height: 16, viewBox: "0 0 16 16", fill: "currentColor" },
        react.createElement("path", {
          d: "M2 3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1H2zm0-1h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
        }),
        react.createElement("path", {
          d: "M6 5.5a.5.5 0 0 1 .79-.407l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5z"
        })
      )
    )
  );
});

const SettingsMenu = react.memo(() => {
  const openSettings = () => {
    openConfig();
  };

  return react.createElement(
    Spicetify.ReactComponent.TooltipWrapper,
    { label: I18n.t("menu.settings") },
    react.createElement(
      "button",
      { className: "lyrics-config-button", onClick: openSettings },
      react.createElement(
        "svg",
        { width: 16, height: 16, viewBox: "0 0 16 16", fill: "currentColor" },
        react.createElement("path", {
          d: "M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zM8 10.93a2.93 2.93 0 1 1 0-5.86 2.93 2.93 0 0 1 0 5.86z",
        })
      )
    )
  );
});
// Share Lyrics Image Modal Component
const ShareImageModal = ({ lyrics, trackInfo, onClose }) => {
  const [selectedIndices, setSelectedIndices] = react.useState([]);
  const [template, setTemplate] = react.useState('cover');
  const [previewUrl, setPreviewUrl] = react.useState(null);
  const [isGenerating, setIsGenerating] = react.useState(false);
  const [showAdvanced, setShowAdvanced] = react.useState(false);
  const [customSettings, setCustomSettings] = react.useState({});
  const [showCopyrightModal, setShowCopyrightModal] = react.useState(false);
  const [pendingAction, setPendingAction] = react.useState(null); // 'copy' | 'download' | 'share'
  const MAX_LINES = 3;

  const presets = Object.entries(LyricsShareImage?.PRESETS || {}).map(([key, val]) => ({
    key,
    name: I18n.t(`shareImage.templates.${key}`) || val.name
  }));

  // 현재 프리셋의 기본 설정값 가져오기
  const getPresetSettings = (presetKey) => {
    const preset = LyricsShareImage?.PRESETS?.[presetKey]?.settings || {};
    const defaults = LyricsShareImage?.DEFAULT_SETTINGS || {};
    return { ...defaults, ...preset };
  };

  // 현재 유효한 설정값 계산 (프리셋 + 커스텀 설정)
  const currentSettings = react.useMemo(() => {
    const base = getPresetSettings(template);
    // customSettings의 값이 존재하면 (숫자 0 포함) 사용
    const merged = { ...base };
    for (const key in customSettings) {
      if (customSettings[key] !== undefined) {
        merged[key] = customSettings[key];
      }
    }
    return merged;
  }, [template, customSettings]);

  // 템플릿 변경 시 커스텀 설정을 프리셋 값으로 초기화
  const handleTemplateChange = (newTemplate) => {
    setTemplate(newTemplate);
    // 프리셋의 설정값을 커스텀 설정으로 복사
    const presetSettings = getPresetSettings(newTemplate);
    setCustomSettings({ ...presetSettings });
  };

  // 개별 설정 변경
  const updateSetting = (key, value) => {
    setCustomSettings(prev => ({ ...prev, [key]: value }));
  };

  // 컴포넌트 마운트 시 초기 프리셋 설정 로드
  react.useEffect(() => {
    const initialSettings = getPresetSettings(template);
    setCustomSettings({ ...initialSettings });
  }, []); // 마운트 시 한 번만 실행

  // 가사 라인을 정규화 (원어/발음/번역 추출)
  const normalizedLyrics = react.useMemo(() => {
    return (lyrics || []).map((line, idx) => {
      // 원어 텍스트
      const originalText = line.originalText || line.text || '';
      // 발음 텍스트 (text와 originalText가 다르면 발음)
      const pronText = (line.text && line.text !== line.originalText && line.originalText) ? line.text : null;
      // 번역 텍스트
      const transText = line.text2 || line.translation || line.transText || null;

      return {
        idx,
        originalText: originalText.trim(),
        pronText: pronText ? pronText.trim() : null,
        transText: transText ? transText.trim() : null,
        // 표시용 텍스트 (원어 우선)
        displayText: originalText.trim() || pronText?.trim() || ''
      };
    }).filter(l => l.displayText && !l.displayText.startsWith('♪'));
  }, [lyrics]);

  // 선택된 가사 라인 객체들
  const selectedLines = react.useMemo(() => {
    return selectedIndices.map(idx => normalizedLyrics.find(l => l.idx === idx)).filter(Boolean);
  }, [selectedIndices, normalizedLyrics]);

  // Generate preview when selection or template changes
  react.useEffect(() => {
    if (selectedLines.length === 0 || !trackInfo) {
      setPreviewUrl(null);
      return;
    }

    const generatePreview = async () => {
      setIsGenerating(true);
      try {
        const result = await LyricsShareImage.generateImage({
          lyrics: selectedLines,
          trackName: trackInfo.name || '',
          artistName: trackInfo.artist || '',
          albumCover: trackInfo.cover || '',
          template,
          customSettings,
          width: 800, // smaller for preview
        });
        setPreviewUrl(result.dataUrl);
      } catch (e) {
        console.error('[ShareImage] Preview generation failed:', e);
      }
      setIsGenerating(false);
    };

    generatePreview();
  }, [selectedLines, template, customSettings, trackInfo]);

  const toggleLine = (lineIdx) => {
    setSelectedIndices(prev => {
      if (prev.includes(lineIdx)) {
        return prev.filter(i => i !== lineIdx);
      }
      if (prev.length >= MAX_LINES) {
        Toast.error(I18n.t("shareImage.maxLinesReached"));
        return prev;
      }
      return [...prev, lineIdx];
    });
  };

  // 저작권 경고 모달 확인 처리
  const handleCopyrightConfirm = async () => {
    setShowCopyrightModal(false);
    const action = pendingAction;
    setPendingAction(null);

    if (action === 'copy') {
      await executeCopy();
    } else if (action === 'download') {
      await executeDownload();
    } else if (action === 'share') {
      await executeShare();
    }
  };

  const handleCopyrightCancel = () => {
    setShowCopyrightModal(false);
    setPendingAction(null);
  };

  // 실제 복사 실행
  const executeCopy = async () => {
    setIsGenerating(true);
    try {
      const result = await LyricsShareImage.generateImage({
        lyrics: selectedLines,
        trackName: trackInfo.name || '',
        artistName: trackInfo.artist || '',
        albumCover: trackInfo.cover || '',
        template,
        customSettings,
        width: 1080,
      });
      const success = await LyricsShareImage.copyToClipboard(result.blob);
      if (success) {
        Toast.success(I18n.t("notifications.shareImageCopied"));
        onClose();
      }
    } catch (e) {
      Toast.error(I18n.t("notifications.shareImageFailed"));
    }
    setIsGenerating(false);
  };

  // 실제 다운로드 실행
  const executeDownload = async () => {
    setIsGenerating(true);
    try {
      const result = await LyricsShareImage.generateImage({
        lyrics: selectedLines,
        trackName: trackInfo.name || '',
        artistName: trackInfo.artist || '',
        albumCover: trackInfo.cover || '',
        template,
        customSettings,
        width: 1080,
      });
      const filename = `${trackInfo.name || 'lyrics'} - ${trackInfo.artist || 'unknown'}.png`.replace(/[/\\?%*:|"<>]/g, '-');
      LyricsShareImage.download(result.dataUrl, filename);
      Toast.success(I18n.t("notifications.shareImageDownloaded"));
      onClose();
    } catch (e) {
      Toast.error(I18n.t("notifications.shareImageFailed"));
    }
    setIsGenerating(false);
  };

  // 실제 공유 실행
  const executeShare = async () => {
    setIsGenerating(true);
    try {
      const result = await LyricsShareImage.generateImage({
        lyrics: selectedLines,
        trackName: trackInfo.name || '',
        artistName: trackInfo.artist || '',
        albumCover: trackInfo.cover || '',
        template,
        customSettings,
        width: 1080,
      });
      const success = await LyricsShareImage.share(result.blob, trackInfo.name, trackInfo.artist);
      if (success) {
        Toast.success(I18n.t("notifications.shareImageShared"));
        onClose();
      } else {
        // Fallback to download if share not supported
        executeDownload();
      }
    } catch (e) {
      Toast.error(I18n.t("notifications.shareImageFailed"));
    }
    setIsGenerating(false);
  };

  const handleCopy = async () => {
    if (selectedIndices.length === 0) {
      Toast.error(I18n.t("shareImage.noSelection"));
      return;
    }
    setPendingAction('copy');
    setShowCopyrightModal(true);
  };

  const handleDownload = async () => {
    if (selectedIndices.length === 0) {
      Toast.error(I18n.t("shareImage.noSelection"));
      return;
    }
    setPendingAction('download');
    setShowCopyrightModal(true);
  };

  const handleShare = async () => {
    if (selectedIndices.length === 0) {
      Toast.error(I18n.t("shareImage.noSelection"));
      return;
    }
    setPendingAction('share');
    setShowCopyrightModal(true);
  };

  return react.createElement("div", {
    className: "share-image-modal",
    style: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      maxHeight: '80vh',
    }
  },
    // Header
    react.createElement("div", {
      style: {
        padding: '20px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }
    },
      react.createElement("h2", {
        style: {
          margin: 0,
          fontSize: '22px',
          fontWeight: '700',
          background: "linear-gradient(135deg, #22c55e 0%, #10b981 50%, #14b8a6 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          letterSpacing: "-0.02em",
        }
      }, I18n.t("shareImage.title")),
      react.createElement("p", {
        style: { margin: '8px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.6)' }
      }, I18n.t("shareImage.subtitle"))
    ),

    // Content
    react.createElement("div", {
      style: {
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        minHeight: 0,
      }
    },
      // Left: Lyrics selection
      react.createElement("div", {
        style: {
          width: '45%',
          borderRight: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          flexDirection: 'column',
        }
      },
        react.createElement("div", {
          style: {
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            fontSize: '13px',
            fontWeight: '500',
            color: 'rgba(255,255,255,0.7)',
          }
        }, `${I18n.t("shareImage.selectLyrics")} (${selectedIndices.length}/${MAX_LINES})`),
        react.createElement("div", {
          style: {
            flex: 1,
            overflowY: 'auto',
            padding: '8px',
          }
        },
          normalizedLyrics.map((line) =>
            react.createElement("div", {
              key: line.idx,
              onClick: () => toggleLine(line.idx),
              style: {
                padding: '10px 12px',
                marginBottom: '4px',
                borderRadius: '8px',
                cursor: 'pointer',
                background: selectedIndices.includes(line.idx) ? 'rgba(29, 185, 84, 0.2)' : 'rgba(255,255,255,0.05)',
                border: selectedIndices.includes(line.idx) ? '1px solid rgba(29, 185, 84, 0.5)' : '1px solid transparent',
                transition: 'all 0.15s ease',
              }
            },
              // 원어 텍스트
              react.createElement("div", {
                style: { fontSize: '14px', fontWeight: '500', color: '#fff' }
              }, line.originalText || line.pronText),
              // 발음 텍스트 (원어와 다를 때만)
              line.pronText && line.originalText && react.createElement("div", {
                style: { fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }
              }, line.pronText),
              // 번역 텍스트
              line.transText && react.createElement("div", {
                style: { fontSize: '12px', color: 'rgba(29, 185, 84, 0.8)', marginTop: '2px' }
              }, line.transText)
            )
          )
        )
      ),

      // Right: Preview & Options
      react.createElement("div", {
        style: {
          width: '55%',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          overflowY: 'auto',
        }
      },
        // Preset selector
        react.createElement("div", {
          style: { marginBottom: '12px' }
        },
          react.createElement("label", {
            style: { fontSize: '13px', fontWeight: '500', marginBottom: '8px', display: 'block' }
          }, I18n.t("shareImage.template")),
          react.createElement("div", {
            style: { display: 'flex', gap: '6px', flexWrap: 'wrap' }
          },
            presets.map(t =>
              react.createElement("button", {
                key: t.key,
                onClick: () => handleTemplateChange(t.key),
                style: {
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: template === t.key ? '2px solid #1db954' : '1px solid rgba(255,255,255,0.2)',
                  background: template === t.key ? 'rgba(29, 185, 84, 0.15)' : 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  fontSize: '11px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }
              }, t.name)
            )
          )
        ),

        // Advanced settings toggle
        react.createElement("button", {
          onClick: () => setShowAdvanced(!showAdvanced),
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 0',
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.6)',
            fontSize: '12px',
            cursor: 'pointer',
            marginBottom: showAdvanced ? '12px' : '0',
          }
        },
          react.createElement("span", {
            style: {
              transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }
          }, "▶"),
          I18n.t("shareImage.advancedSettings") || "세부 설정"
        ),

        // Advanced settings panel
        showAdvanced && react.createElement("div", {
          style: {
            background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.2) 100%)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '12px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            fontSize: '11px',
            maxHeight: '320px',
            overflowY: 'auto',
            border: '1px solid rgba(255,255,255,0.05)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
          }
        },
          // === 배경 설정 섹션 ===
          react.createElement("div", {
            style: {
              gridColumn: 'span 2',
              fontSize: '12px',
              fontWeight: '600',
              color: '#1db954',
              marginBottom: '4px',
              borderBottom: '1px solid rgba(29,185,84,0.2)',
              paddingBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              letterSpacing: '0.5px',
              textTransform: 'uppercase'
            }
          }, I18n.t("shareImage.sections.background") || "배경"),

          // 배경 타입
          react.createElement("div", { style: { gridColumn: 'span 2' } },
            react.createElement("label", { style: { color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' } },
              I18n.t("shareImage.settings.backgroundType") || "배경 스타일"
            ),
            react.createElement("div", { style: { display: 'flex', gap: '4px' } },
              ['coverBlur', 'gradient', 'solid'].map(type =>
                react.createElement("button", {
                  key: type,
                  onClick: () => updateSetting('backgroundType', type),
                  style: {
                    flex: 1,
                    padding: '5px 8px',
                    borderRadius: '4px',
                    border: currentSettings.backgroundType === type ? '1px solid #1db954' : '1px solid rgba(255,255,255,0.15)',
                    background: currentSettings.backgroundType === type ? 'rgba(29,185,84,0.15)' : 'rgba(255,255,255,0.05)',
                    color: '#fff',
                    fontSize: '10px',
                    cursor: 'pointer',
                  }
                }, type === 'coverBlur' ? (I18n.t("shareImage.settings.coverBlur") || '블러') :
                  type === 'gradient' ? (I18n.t("shareImage.settings.gradient") || '그라디언트') :
                    (I18n.t("shareImage.settings.solid") || '단색'))
              )
            )
          ),

          // 배경 블러 강도 (coverBlur일 때만)
          currentSettings.backgroundType === 'coverBlur' && react.createElement("div", { style: { gridColumn: 'span 2' } },
            react.createElement("label", { style: { color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' } },
              `${I18n.t("shareImage.settings.backgroundBlur") || "배경 블러"}: ${currentSettings.backgroundBlur ?? 30}px`
            ),
            react.createElement("input", {
              type: 'range',
              min: 0,
              max: 80,
              value: currentSettings.backgroundBlur ?? 30,
              onChange: (e) => updateSetting('backgroundBlur', parseInt(e.target.value)),
              style: { width: '100%', accentColor: '#1db954' }
            })
          ),

          // 배경 어둡기
          react.createElement("div", { style: { gridColumn: 'span 2' } },
            react.createElement("label", { style: { color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' } },
              `${I18n.t("shareImage.settings.backgroundOpacity") || "배경 어둡기"}: ${Math.round((currentSettings.backgroundOpacity ?? 0.6) * 100)}%`
            ),
            react.createElement("input", {
              type: 'range',
              min: 20,
              max: 90,
              value: Math.round((currentSettings.backgroundOpacity ?? 0.6) * 100),
              onChange: (e) => updateSetting('backgroundOpacity', parseInt(e.target.value) / 100),
              style: { width: '100%', accentColor: '#1db954' }
            })
          ),

          // === 앨범 커버 설정 섹션 ===
          react.createElement("div", {
            style: {
              gridColumn: 'span 2',
              fontSize: '12px',
              fontWeight: '600',
              color: '#1db954',
              marginTop: '12px',
              marginBottom: '4px',
              borderBottom: '1px solid rgba(29,185,84,0.2)',
              paddingBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              letterSpacing: '0.5px',
              textTransform: 'uppercase'
            }
          }, I18n.t("shareImage.sections.cover") || "앨범 커버"),

          // 커버 표시
          react.createElement("div", null,
            react.createElement("label", {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
              }
            },
              react.createElement("input", {
                type: 'checkbox',
                checked: currentSettings.showCover !== false,
                onChange: (e) => updateSetting('showCover', e.target.checked),
                style: { accentColor: '#1db954' }
              }),
              I18n.t("shareImage.settings.showCover") || "앨범 커버"
            )
          ),

          // 곡 정보 표시
          react.createElement("div", null,
            react.createElement("label", {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
              }
            },
              react.createElement("input", {
                type: 'checkbox',
                checked: currentSettings.showTrackInfo !== false,
                onChange: (e) => updateSetting('showTrackInfo', e.target.checked),
                style: { accentColor: '#1db954' }
              }),
              I18n.t("shareImage.settings.showTrackInfo") || "곡 정보"
            )
          ),

          // 커버 위치
          currentSettings.showCover && react.createElement("div", { style: { gridColumn: 'span 2' } },
            react.createElement("label", { style: { color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' } },
              I18n.t("shareImage.settings.coverPosition") || "커버 위치"
            ),
            react.createElement("div", { style: { display: 'flex', gap: '4px' } },
              ['left', 'center'].map(pos =>
                react.createElement("button", {
                  key: pos,
                  onClick: () => updateSetting('coverPosition', pos),
                  style: {
                    flex: 1,
                    padding: '5px 8px',
                    borderRadius: '4px',
                    border: currentSettings.coverPosition === pos ? '1px solid #1db954' : '1px solid rgba(255,255,255,0.15)',
                    background: currentSettings.coverPosition === pos ? 'rgba(29,185,84,0.15)' : 'rgba(255,255,255,0.05)',
                    color: '#fff',
                    fontSize: '10px',
                    cursor: 'pointer',
                  }
                }, pos === 'left' ? (I18n.t("shareImage.settings.posLeft") || '좌측') : (I18n.t("shareImage.settings.posCenter") || '중앙'))
              )
            )
          ),

          // 커버 크기
          currentSettings.showCover && react.createElement("div", { style: { gridColumn: 'span 2' } },
            react.createElement("label", { style: { color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' } },
              `${I18n.t("shareImage.settings.coverSize") || "커버 크기"}: ${currentSettings.coverSize ?? 120}px`
            ),
            react.createElement("input", {
              type: 'range',
              min: 60,
              max: 200,
              value: currentSettings.coverSize ?? 120,
              onChange: (e) => updateSetting('coverSize', parseInt(e.target.value)),
              style: { width: '100%', accentColor: '#1db954' }
            })
          ),

          // 커버 둥글기
          currentSettings.showCover && react.createElement("div", { style: { gridColumn: 'span 2' } },
            react.createElement("label", { style: { color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' } },
              `${I18n.t("shareImage.settings.coverRadius") || "커버 둥글기"}: ${currentSettings.coverRadius ?? 16}px`
            ),
            react.createElement("input", {
              type: 'range',
              min: 0,
              max: 50,
              value: currentSettings.coverRadius ?? 16,
              onChange: (e) => updateSetting('coverRadius', parseInt(e.target.value)),
              style: { width: '100%', accentColor: '#1db954' }
            })
          ),

          // 커버 블러
          currentSettings.showCover && react.createElement("div", { style: { gridColumn: 'span 2' } },
            react.createElement("label", { style: { color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' } },
              `${I18n.t("shareImage.settings.coverBlur") || "커버 블러"}: ${currentSettings.coverBlur ?? 0}px`
            ),
            react.createElement("input", {
              type: 'range',
              min: 0,
              max: 30,
              value: currentSettings.coverBlur ?? 0,
              onChange: (e) => updateSetting('coverBlur', parseInt(e.target.value)),
              style: { width: '100%', accentColor: '#1db954' }
            })
          ),

          // === 가사 설정 섹션 ===
          react.createElement("div", {
            style: {
              gridColumn: 'span 2',
              fontSize: '12px',
              fontWeight: '600',
              color: '#1db954',
              marginTop: '12px',
              marginBottom: '4px',
              borderBottom: '1px solid rgba(29,185,84,0.2)',
              paddingBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              letterSpacing: '0.5px',
              textTransform: 'uppercase'
            }
          }, I18n.t("shareImage.sections.lyrics") || "가사"),

          // 발음 표시
          react.createElement("div", null,
            react.createElement("label", {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
              }
            },
              react.createElement("input", {
                type: 'checkbox',
                checked: currentSettings.showPronunciation !== false,
                onChange: (e) => updateSetting('showPronunciation', e.target.checked),
                style: { accentColor: '#1db954' }
              }),
              I18n.t("shareImage.settings.showPronunciation") || "발음"
            )
          ),

          // 번역 표시
          react.createElement("div", null,
            react.createElement("label", {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
              }
            },
              react.createElement("input", {
                type: 'checkbox',
                checked: currentSettings.showTranslation !== false,
                onChange: (e) => updateSetting('showTranslation', e.target.checked),
                style: { accentColor: '#1db954' }
              }),
              I18n.t("shareImage.settings.showTranslation") || "번역"
            )
          ),

          // 가사 정렬
          react.createElement("div", { style: { gridColumn: 'span 2' } },
            react.createElement("label", { style: { color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' } },
              I18n.t("shareImage.settings.lyricsAlign") || "가사 정렬"
            ),
            react.createElement("div", { style: { display: 'flex', gap: '4px' } },
              ['left', 'center'].map(align =>
                react.createElement("button", {
                  key: align,
                  onClick: () => updateSetting('lyricsAlign', align),
                  style: {
                    flex: 1,
                    padding: '5px 8px',
                    borderRadius: '4px',
                    border: currentSettings.lyricsAlign === align ? '1px solid #1db954' : '1px solid rgba(255,255,255,0.15)',
                    background: currentSettings.lyricsAlign === align ? 'rgba(29,185,84,0.15)' : 'rgba(255,255,255,0.05)',
                    color: '#fff',
                    fontSize: '10px',
                    cursor: 'pointer',
                  }
                }, align === 'left' ? (I18n.t("shareImage.settings.alignLeft") || '왼쪽') : (I18n.t("shareImage.settings.alignCenter") || '가운데'))
              )
            )
          ),

          // 글꼴 크기
          react.createElement("div", { style: { gridColumn: 'span 2' } },
            react.createElement("label", { style: { color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' } },
              `${I18n.t("shareImage.settings.fontSize") || "글꼴 크기"}: ${currentSettings.fontSize ?? 32}px`
            ),
            react.createElement("input", {
              type: 'range',
              min: 20,
              max: 48,
              value: currentSettings.fontSize ?? 32,
              onChange: (e) => updateSetting('fontSize', parseInt(e.target.value)),
              style: { width: '100%', accentColor: '#1db954' }
            })
          ),

          // 블록 간격
          react.createElement("div", { style: { gridColumn: 'span 2' } },
            react.createElement("label", { style: { color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' } },
              `${I18n.t("shareImage.settings.blockGap") || "줄 간격"}: ${currentSettings.blockGap ?? 32}px`
            ),
            react.createElement("input", {
              type: 'range',
              min: 16,
              max: 60,
              value: currentSettings.blockGap ?? 32,
              onChange: (e) => updateSetting('blockGap', parseInt(e.target.value)),
              style: { width: '100%', accentColor: '#1db954' }
            })
          ),

          // === 레이아웃 설정 섹션 ===
          react.createElement("div", {
            style: {
              gridColumn: 'span 2',
              fontSize: '12px',
              fontWeight: '600',
              color: '#1db954',
              marginTop: '12px',
              marginBottom: '4px',
              borderBottom: '1px solid rgba(29,185,84,0.2)',
              paddingBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              letterSpacing: '0.5px',
              textTransform: 'uppercase'
            }
          }, I18n.t("shareImage.sections.layout") || "레이아웃"),

          // 이미지 비율
          react.createElement("div", { style: { gridColumn: 'span 2' } },
            react.createElement("label", { style: { color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' } },
              I18n.t("shareImage.settings.aspectRatio") || "이미지 비율"
            ),
            react.createElement("div", { style: { display: 'flex', gap: '4px' } },
              [
                { key: null, label: '자동' },
                { key: 1, label: '1:1' },
                { key: 9 / 16, label: '9:16' },
                { key: 16 / 9, label: '16:9' },
              ].map(ratio =>
                react.createElement("button", {
                  key: ratio.key === null ? 'auto' : ratio.key,
                  onClick: () => updateSetting('aspectRatio', ratio.key),
                  style: {
                    flex: 1,
                    padding: '5px 6px',
                    borderRadius: '4px',
                    border: currentSettings.aspectRatio === ratio.key ? '1px solid #1db954' : '1px solid rgba(255,255,255,0.15)',
                    background: currentSettings.aspectRatio === ratio.key ? 'rgba(29,185,84,0.15)' : 'rgba(255,255,255,0.05)',
                    color: '#fff',
                    fontSize: '9px',
                    cursor: 'pointer',
                  }
                }, ratio.label)
              )
            )
          ),

          // 이미지 너비
          react.createElement("div", { style: { gridColumn: 'span 2' } },
            react.createElement("label", { style: { color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' } },
              `${I18n.t("shareImage.settings.imageWidth") || "이미지 너비"}: ${currentSettings.imageWidth ?? 1080}px`
            ),
            react.createElement("input", {
              type: 'range',
              min: 720,
              max: 1920,
              step: 60,
              value: currentSettings.imageWidth ?? 1080,
              onChange: (e) => updateSetting('imageWidth', parseInt(e.target.value)),
              style: { width: '100%', accentColor: '#1db954' }
            })
          ),

          // 여백
          react.createElement("div", { style: { gridColumn: 'span 2' } },
            react.createElement("label", { style: { color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' } },
              `${I18n.t("shareImage.settings.padding") || "여백"}: ${currentSettings.padding ?? 60}px`
            ),
            react.createElement("input", {
              type: 'range',
              min: 30,
              max: 100,
              value: currentSettings.padding ?? 60,
              onChange: (e) => updateSetting('padding', parseInt(e.target.value)),
              style: { width: '100%', accentColor: '#1db954' }
            })
          ),

          // === 기타 설정 ===
          react.createElement("div", {
            style: {
              gridColumn: 'span 2',
              fontSize: '12px',
              fontWeight: '600',
              color: '#1db954',
              marginTop: '12px',
              marginBottom: '4px',
              borderBottom: '1px solid rgba(29,185,84,0.2)',
              paddingBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              letterSpacing: '0.5px',
              textTransform: 'uppercase'
            }
          }, I18n.t("shareImage.sections.other") || "기타"),

          // 워터마크
          react.createElement("div", { style: { gridColumn: 'span 2' } },
            react.createElement("label", {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
              }
            },
              react.createElement("input", {
                type: 'checkbox',
                checked: currentSettings.showWatermark !== false,
                onChange: (e) => updateSetting('showWatermark', e.target.checked),
                style: { accentColor: '#1db954' }
              }),
              I18n.t("shareImage.settings.showWatermark") || "워터마크 표시"
            )
          )
        ),

        // Preview
        react.createElement("div", {
          style: {
            flex: 1,
            borderRadius: '12px',
            background: 'rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            minHeight: '180px',
          }
        },
          isGenerating ? react.createElement("div", {
            style: { color: 'rgba(255,255,255,0.5)', fontSize: '14px' }
          }, "...") :
            previewUrl ? react.createElement("img", {
              src: previewUrl,
              style: {
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: '8px',
              }
            }) : react.createElement("div", {
              style: { color: 'rgba(255,255,255,0.4)', fontSize: '14px', textAlign: 'center' }
            }, I18n.t("shareImage.selectLyricsHint"))
        )
      )
    ),

    // Footer: Actions
    react.createElement("div", {
      style: {
        padding: '16px 24px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '10px',
      }
    },
      react.createElement("button", {
        onClick: onClose,
        style: {
          padding: '10px 20px',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.2)',
          background: 'transparent',
          color: '#fff',
          fontSize: '14px',
          fontWeight: '500',
          cursor: 'pointer',
        }
      }, I18n.t("buttons.cancel")),
      react.createElement("button", {
        onClick: handleCopy,
        disabled: selectedIndices.length === 0 || isGenerating,
        style: {
          padding: '10px 20px',
          borderRadius: '8px',
          border: 'none',
          background: selectedIndices.length === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.15)',
          color: selectedIndices.length === 0 ? 'rgba(255,255,255,0.3)' : '#fff',
          fontSize: '14px',
          fontWeight: '500',
          cursor: selectedIndices.length === 0 ? 'not-allowed' : 'pointer',
        }
      }, I18n.t("shareImage.actions.copy")),
      react.createElement("button", {
        onClick: handleDownload,
        disabled: selectedIndices.length === 0 || isGenerating,
        style: {
          padding: '10px 20px',
          borderRadius: '8px',
          border: 'none',
          background: selectedIndices.length === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.15)',
          color: selectedIndices.length === 0 ? 'rgba(255,255,255,0.3)' : '#fff',
          fontSize: '14px',
          fontWeight: '500',
          cursor: selectedIndices.length === 0 ? 'not-allowed' : 'pointer',
        }
      }, I18n.t("shareImage.actions.download")),
      navigator.canShare && react.createElement("button", {
        onClick: handleShare,
        disabled: selectedIndices.length === 0 || isGenerating,
        style: {
          padding: '10px 20px',
          borderRadius: '8px',
          border: 'none',
          background: selectedIndices.length === 0 ? 'rgba(29, 185, 84, 0.3)' : '#1db954',
          color: selectedIndices.length === 0 ? 'rgba(255,255,255,0.5)' : '#000',
          fontSize: '14px',
          fontWeight: '600',
          cursor: selectedIndices.length === 0 ? 'not-allowed' : 'pointer',
        }
      }, I18n.t("shareImage.actions.share"))
    ),

    // 저작권 경고 모달
    showCopyrightModal && react.createElement("div", {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        backdropFilter: 'blur(8px)',
      },
      onClick: (e) => {
        if (e.target === e.currentTarget) handleCopyrightCancel();
      }
    },
      react.createElement("div", {
        style: {
          background: 'linear-gradient(180deg, #282828 0%, #1a1a1a 100%)',
          borderRadius: '16px',
          padding: '28px 32px',
          maxWidth: '420px',
          width: '90%',
          boxShadow: '0 24px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
          animation: 'fadeInScale 0.2s ease-out',
        }
      },
        // 아이콘
        react.createElement("div", {
          style: {
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(255, 179, 0, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }
        },
          react.createElement("span", {
            style: { fontSize: '28px' }
          }, "⚠️")
        ),

        // 제목
        react.createElement("h3", {
          style: {
            margin: '0 0 16px',
            fontSize: '18px',
            fontWeight: '600',
            textAlign: 'center',
            color: '#fff',
          }
        }, I18n.t("shareImage.copyrightTitle") || "저작권 알림"),

        // 설명
        react.createElement("p", {
          style: {
            margin: '0 0 20px',
            fontSize: '14px',
            lineHeight: '1.6',
            color: 'rgba(255,255,255,0.7)',
            textAlign: 'center',
          }
        }, I18n.t("shareImage.copyrightDesc") || "이 가사 이미지에는 저작권이 있는 콘텐츠가 포함될 수 있습니다."),

        // 주의사항 리스트
        react.createElement("div", {
          style: {
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '24px',
          }
        },
          react.createElement("ul", {
            style: {
              margin: 0,
              padding: '0 0 0 20px',
              fontSize: '13px',
              lineHeight: '1.8',
              color: 'rgba(255,255,255,0.6)',
            }
          },
            react.createElement("li", null, I18n.t("shareImage.copyrightPoint1") || "개인적인 용도로만 사용해 주세요"),
            react.createElement("li", null, I18n.t("shareImage.copyrightPoint2") || "상업적 목적으로 사용하지 마세요"),
            react.createElement("li", null, I18n.t("shareImage.copyrightPoint3") || "SNS 공유 시 원작자를 존중해 주세요")
          )
        ),

        // 버튼들
        react.createElement("div", {
          style: {
            display: 'flex',
            gap: '12px',
          }
        },
          react.createElement("button", {
            onClick: handleCopyrightCancel,
            style: {
              flex: 1,
              padding: '12px 20px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'transparent',
              color: '#fff',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }
          }, I18n.t("buttons.cancel") || "취소"),
          react.createElement("button", {
            onClick: handleCopyrightConfirm,
            style: {
              flex: 1,
              padding: '12px 20px',
              borderRadius: '8px',
              border: 'none',
              background: '#1db954',
              color: '#000',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }
          }, I18n.t("shareImage.copyrightConfirm") || "동의 후 계속")
        )
      )
    )
  );
};

// Open Share Image Modal
function openShareImageModal(lyrics, trackInfo) {
  const existingOverlay = document.getElementById("ivLyrics-share-image-overlay");
  if (existingOverlay) {
    existingOverlay.remove();
  }

  const overlay = document.createElement("div");
  overlay.id = "ivLyrics-share-image-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease-out;
  `;

  const modalContainer = document.createElement("div");
  modalContainer.style.cssText = `
    background: rgba(24, 24, 24, 0.95);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    border-radius: 16px;
    width: 90%;
    max-width: 900px;
    max-height: 85vh;
    overflow: hidden;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
  `;

  const closeModal = () => {
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 200);
  };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });

  const handleEscape = (e) => {
    if (e.key === "Escape") {
      closeModal();
      document.removeEventListener("keydown", handleEscape);
    }
  };
  document.addEventListener("keydown", handleEscape);

  overlay.appendChild(modalContainer);
  document.body.appendChild(overlay);

  const dom = window.Spicetify?.ReactDOM ?? window.ReactDOM ?? null;
  if (!dom?.render) {
    return;
  }

  const modalComponent = react.createElement(ShareImageModal, {
    lyrics,
    trackInfo,
    onClose: closeModal,
  });

  dom.render(modalComponent, modalContainer);
}

// Share Image Button
const ShareImageButton = react.memo(({ lyrics, trackInfo }) => {
  const handleClick = () => {
    if (!lyrics || lyrics.length === 0) {
      Toast.error(I18n.t("notifications.shareImageNoLyrics"));
      return;
    }
    openShareImageModal(lyrics, trackInfo);
  };

  return react.createElement(
    Spicetify.ReactComponent.TooltipWrapper,
    { label: I18n.t("menu.shareImage") },
    react.createElement(
      "button",
      {
        className: "lyrics-config-button",
        onClick: handleClick,
      },
      react.createElement(
        "svg",
        { width: 16, height: 16, viewBox: "0 0 16 16", fill: "currentColor" },
        react.createElement("path", {
          d: "M4.502 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"
        }),
        react.createElement("path", {
          d: "M14.002 13a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V5A2 2 0 0 1 2 3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-1.998 2zM14 2H4a1 1 0 0 0-1 1h9.002a2 2 0 0 1 2 2v7A1 1 0 0 0 15 11V3a1 1 0 0 0-1-1zM2.002 4a1 1 0 0 0-1 1v8l2.646-2.354a.5.5 0 0 1 .63-.062l2.66 1.773 3.71-3.71a.5.5 0 0 1 .577-.094l1.777 1.947V5a1 1 0 0 0-1-1h-10z"
        })
      )
    )
  );
});