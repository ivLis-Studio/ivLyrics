import { getSettingsSurfaceTheme } from "../../features/settings/settingsSurfaceTheme.mjs";

export function createOptionsDropdown({ react, host, document, readReactDom, debug }) {
  return react.memo(
    ({ options, onSelect, selected, defaultValue, bold = false }) => {
      // Custom Dropdown State
      const [isOpen, setIsOpen] = react.useState(false);
      const containerRef = react.useRef(null);
      const dropdownRef = react.useRef(null);
      const [dropdownPosition, setDropdownPosition] = react.useState({ top: 0, left: 0, width: 0 });

      // React 31 방지: options 배열 유효성 검사
      const safeOptions = Array.isArray(options) ? options : [];
      const optionByKey = react.useMemo(
        () => new Map(safeOptions.map((option) => [option.key, option])),
        [safeOptions]
      );

      // 초기 선택 값 결정 (selected 또는 defaultValue에서)
      const resolveOptionItem = (candidate) => {
        let item = candidate;
        if (item && typeof item !== 'object') {
          item = optionByKey.get(item);
        } else if (item && item.key && !item.value) {
          const found = optionByKey.get(item.key);
          if (found) item = found;
        }
        return item;
      };
      const getInitialSelected = () => resolveOptionItem(selected || defaultValue);

      // 내부 상태로 선택된 항목 관리
      const [selectedItem, setSelectedItem] = react.useState(getInitialSelected);

      // props가 변경되면 내부 상태 업데이트
      react.useEffect(() => {
        setSelectedItem(getInitialSelected());
      }, [selected, defaultValue, optionByKey]);

      // Resolve default item for display fallback
      const defaultItem = resolveOptionItem(defaultValue);

      // Determine display text
      const displayValue = selectedItem?.value || defaultItem?.value || (typeof defaultValue === 'string' ? defaultValue : "") || "";

      // Toggle Dropdown and Calculate Position
      const toggleDropdown = () => {
        if (!isOpen) {
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setDropdownPosition({
              top: rect.bottom + host.scrollY + 4,
              left: rect.right + host.scrollX, // Align Right
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

        host.addEventListener('mousedown', handleOutsideClick);
        host.addEventListener('scroll', handleScroll, true); // Capture phase for all scrollable parents
        host.addEventListener('resize', handleScroll);

        return () => {
          host.removeEventListener('mousedown', handleOutsideClick);
          host.removeEventListener('scroll', handleScroll, true);
          host.removeEventListener('resize', handleScroll);
        };
      }, [isOpen]);

      // Render Dropdown via Portal
      const surfaceTheme = getSettingsSurfaceTheme();
      const dropdownMenu = isOpen && readReactDom().createPortal(
        react.createElement(
          "div",
          {
            ref: dropdownRef,
            className: "optionsMenu-dropdown-list",
            "data-ui-theme": surfaceTheme,
            style: {
              position: 'fixed',
              top: `${dropdownPosition.top}px`,
              left: 'auto',
              right: `${host.innerWidth - dropdownPosition.left}px`, // Right Align
              width: 'max-content',
              minWidth: `${dropdownPosition.width}px`,
              maxWidth: '300px',
              marginTop: '0', // Portal 사용 시 margin 불필요
              zIndex: 'var(--iv-layer-modal, 2147483647)' // 최상위
            }
          },
          safeOptions.map(({ key, value }) => {
            const isSelected = selectedItem?.key === key;
            return react.createElement(
              "div",
              {
                key,
                className: `optionsMenu-item ${isSelected ? "selected" : ""}`,
                onMouseDown: (e) => {
                  // onClick 대신 onMouseDown 사용: window의 mousedown 리스너가 먼저 실행되어 메뉴를 닫는 것을 방지
                  e.preventDefault();
                  e.stopPropagation();

                  // 내부 상태 업데이트
                  const selectedOption = optionByKey.get(key);
                  if (selectedOption) {
                    setSelectedItem(selectedOption);
                  }

                  // 외부 콜백 호출
                  debug?.('[OptionsMenu] Item clicked:', key, 'onSelect type:', typeof onSelect);
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
}
