export function createSettingsModalChrome(react, {
  appName, translate, getSettingsText, readVersions, components, menus, navigation,
  search, uiTheme, setUiTheme, changedCounts, changedViewTitle, settingsRegistry, onRequestClose,
}) {
  const { SettingsWordmark, SettingsCrumbs, SettingsUiIcon, SettingsOutlineIcon,
    SettingsSegmented, SettingsToc, handleSettingsRadioKeys } = components;
  const { activeTabMeta, sidebarTabs, sidebarGroups, fullscreenViews } = menus;
  const { activeTab, changedView, fullscreenView, settingsContentRef, pageHeadRef,
    activeSections, activeSectionSignal, pageWheelRef,
    toggleChangedView, openMenu, selectFullscreenView, selectSection } = navigation;
  const { searchQuery, searchPanelOpen, searchBoxRef, searchInputRef,
    handleSearchChange, setSearchPanelOpen, handleSearchKeyDown, handleClearSearch, renderSearchPanel } = search;

  const renderHeaderSection = () => {
    const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || "");
    const themeOptions = [
      {
        id: "light",
        label: getSettingsText("settingsUi.theme.lightShort", "Light"),
        title: getSettingsText("settingsUi.theme.light", "Switch to light mode"),
        icon: "sun",
      },
      {
        id: "dark",
        label: getSettingsText("settingsUi.theme.darkShort", "Dark"),
        title: getSettingsText("settingsUi.theme.dark", "Switch to dark mode"),
        icon: "moon",
      },
    ];
    const themeIndex = Math.max(0, themeOptions.findIndex((option) => option.id === uiTheme));
    const searchLabel = translate("search.placeholder");
    const searchExpanded = Boolean(searchQuery.trim() && searchPanelOpen);

    return react.createElement(
      "header",
      { className: "settings-topbar" },
      react.createElement(
        "div",
        { className: "settings-topbar-title" },
        react.createElement(SettingsWordmark),
        react.createElement(SettingsCrumbs, {
          menuLabel: changedView ? getSettingsText("settingsUi.changed.button", "Changed") : activeTabMeta.label,
          sections: activeSections,
          signal: activeSectionSignal,
        })
      ),
      react.createElement(
        "div",
        {
          className: `settings-search settings-search-wrapper${searchQuery ? " has-query" : ""}`,
          role: "search",
          ref: searchBoxRef,
        },
        react.createElement(SettingsUiIcon, { name: "search", size: 16, className: "settings-search-icon" }),
        react.createElement("input", {
          ref: searchInputRef,
          type: "search",
          className: "settings-search-input",
          placeholder: searchLabel,
          "aria-label": searchLabel,
          "aria-expanded": searchExpanded,
          autoComplete: "off",
          spellCheck: false,
          value: searchQuery,
          onChange: handleSearchChange,
          onFocus: () => setSearchPanelOpen(true),
          onKeyDown: handleSearchKeyDown,
        }),
        searchQuery && react.createElement(
          "button",
          {
            className: "settings-search-clear",
            type: "button",
            onClick: () => {
              handleClearSearch();
              searchInputRef.current?.focus();
            },
            title: translate("search.clear"),
            "aria-label": translate("search.clear"),
          },
          react.createElement(SettingsUiIcon, { name: "close", size: 14 })
        ),
        react.createElement("kbd", { className: "settings-kbd", "aria-hidden": "true" }, isMac ? "⌘K" : "Ctrl K"),
        renderSearchPanel()
      ),
      react.createElement(
        "div",
        { className: "settings-topbar-tools" },
        react.createElement(
          "button",
          {
            type: "button",
            className: `settings-changed-chip${changedCounts.total ? "" : " is-zero"}`,
            "aria-pressed": changedView,
            onClick: toggleChangedView,
          },
          react.createElement(SettingsUiIcon, { name: "dot", size: 14 }),
          react.createElement("span", null, getSettingsText("settingsUi.changed.button", "Changed")),
          react.createElement("b", null, String(changedCounts.total))
        ),
        react.createElement(
          "div",
          {
            className: "settings-seg settings-theme-control",
            role: "radiogroup",
            "aria-label": getSettingsText("settingsUi.theme.selector", "Settings theme"),
            style: { "--count": themeOptions.length, "--index": themeIndex },
          },
          react.createElement("span", { className: "settings-seg-thumb", "aria-hidden": "true" }),
          ...themeOptions.map((themeOption, optionIndex) =>
            react.createElement(
              "button",
              {
                key: themeOption.id,
                className: `settings-seg-option settings-theme-option${uiTheme === themeOption.id ? " is-on active" : ""}`,
                type: "button",
                role: "radio",
                title: themeOption.title,
                "aria-label": themeOption.label,
                "aria-checked": uiTheme === themeOption.id,
                tabIndex: optionIndex === themeIndex ? 0 : -1,
                onClick: () => setUiTheme(themeOption.id),
                onKeyDown: (event) =>
                  handleSettingsRadioKeys(
                    event,
                    themeOptions.map((option) => ({ value: option.id })),
                    themeIndex,
                    (value) => setUiTheme(value)
                  ),
              },
              react.createElement(SettingsUiIcon, { name: themeOption.icon, size: 15 }),
              react.createElement("span", { className: "settings-seg-text" }, themeOption.label)
            )
          )
        ),
        react.createElement(
          "button",
          {
            className: "settings-close-btn",
            type: "button",
            onClick: onRequestClose,
            title: getSettingsText("settingsUi.close", "Close settings"),
            "aria-label": getSettingsText("settingsUi.close", "Close settings"),
          },
          react.createElement(SettingsUiIcon, { name: "close", size: 16 })
        )
      )
    );
  };

  const renderRail = () => {
    const { appVersion, spicetifyVersion, spotifyVersion } = readVersions();
    return react.createElement(
      "nav",
      {
        className: "settings-rail",
        "aria-label": getSettingsText("menu.settings", "Settings"),
      },
      ...sidebarGroups.map((group) => {
        const groupTabs = sidebarTabs.filter((tab) => tab.group === group.id);
        if (!groupTabs.length) return null;
        const labelId = `${appName}-settings-rail-${group.id}`;
        return react.createElement(
          "section",
          { key: group.id, className: "settings-rail-group", "aria-labelledby": labelId },
          react.createElement("div", { id: labelId, className: "settings-rail-group-label" }, group.label),
          ...groupTabs.map((tab) => {
            const current = activeTab === tab.id && !changedView;
            const count = changedCounts.byTab[tab.id] || 0;
            return react.createElement(
              "button",
              {
                key: tab.id,
                type: "button",
                className: `settings-rail-item${current ? " is-active" : ""}${count ? " is-modified" : ""}`,
                title: tab.label,
                "aria-current": current ? "page" : undefined,
                onClick: () => openMenu(tab.id),
              },
              react.createElement(SettingsOutlineIcon, { name: tab.icon, className: "settings-rail-icon", size: 16 }),
              react.createElement("span", { className: "settings-rail-label" }, tab.label),
              count
                ? react.createElement("span", { className: "settings-rail-count" }, String(count))
                : null
            );
          })
        );
      }),
      react.createElement(
        "div",
        { className: "settings-rail-foot" },
        react.createElement("b", null, `ivLyrics v${appVersion}`),
        react.createElement(
          "span",
          null,
          [
            spotifyVersion ? `Spotify ${spotifyVersion}` : "Spotify",
            spicetifyVersion ? `Spicetify ${spicetifyVersion}` : "Spicetify",
          ].join(" · ")
        ),
        settingsRegistry
          ? react.createElement(
            "span",
            null,
            getSettingsText("settingsUi.footer.counts", "{settings} settings · {menus} menus")
              .replace("{settings}", String(settingsRegistry.length))
              .replace("{menus}", String(sidebarTabs.length))
          )
          : null
      )
    );
  };

  const renderPageHead = () =>
    react.createElement(
      "div",
      { className: "settings-page-head", ref: pageHeadRef },
      react.createElement(
        "div",
        { className: "settings-page-title-row" },
        react.createElement(
          "h2",
          { className: "settings-page-title" },
          changedView ? changedViewTitle : activeTabMeta.label
        )
      ),
      react.createElement(
        "p",
        { className: "settings-page-desc" },
        changedView
          ? getSettingsText("settingsUi.changed.desc", "Only the settings that differ from their defaults.")
          : activeTabMeta.description
      ),
      !changedView && activeTab === "fullscreen"
        ? react.createElement(SettingsSegmented, {
          className: "settings-view-switch",
          options: fullscreenViews,
          value: fullscreenView,
          label: activeTabMeta.label,
          onChange: selectFullscreenView,
        })
        : null,
      !changedView
        ? react.createElement(SettingsToc, {
          sections: activeSections,
          signal: activeSectionSignal,
          onSelect: selectSection,
          pageWheelRef,
          contentRef: settingsContentRef,
          label: activeTabMeta.label,
        })
        : null
    );

  return { renderHeaderSection, renderRail, renderPageHead };
}
