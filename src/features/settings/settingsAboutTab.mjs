export function renderSettingsAboutTab(react, {
  activeTab, SettingsSection, AccountSection, SettingsUiIcon, translate, appVersion,
  readClientId, copyText, openLink, notifySuccess, notifyError, renderUpdate,
}) {
  const renderAboutClientInfoSection = () =>
    react.createElement(
      "div",
      { className: "settings-group info-card about-info-card about-client-card", "data-section-content": "true" },
      react.createElement(
        "p",
        { className: "about-info-description about-info-description-compact" },
        translate("settingsAdvanced.aboutTab.clientInfo.description"),
      ),
      react.createElement(
        "div",
        { className: "about-client-id-row" },
        react.createElement(
          "code",
          { className: "about-client-id-box" },
          readClientId()
        ),
        react.createElement(
          "button",
          {
            type: "button",
            className: "btn about-client-copy-btn",
            onClick: () => {
              const clientId = readClientId();
              copyText(clientId).then(() => {
                notifySuccess(translate("settingsAdvanced.aboutTab.clientInfo.copied"));
              }).catch(() => {
                notifyError(translate("settingsAdvanced.aboutTab.clientInfo.copyFailed"));
              });
            },
          },
          translate("settingsAdvanced.aboutTab.clientInfo.copy")
        )
      )
    );

  const renderAboutAppInfoSection = () =>
    react.createElement(
      "div",
      { className: "settings-group info-card about-info-card", "data-section-content": "true" },
      react.createElement(
        "div",
        { className: "settings-app-card" },
        react.createElement("span", { className: "settings-app-logo", "aria-hidden": "true" }, "iv"),
        react.createElement(
          "div",
          { className: "settings-app-card-main" },
          react.createElement("h3", { className: "about-info-title" }, "ivLyrics"),
          react.createElement(
            "p",
            { className: "about-info-description" },
            `${translate("settingsAdvanced.aboutTab.versionPrefix")} ${appVersion} · ${translate("settingsAdvanced.aboutTab.appDescription")}`
          )
        )
      ),
      react.createElement(
        "dl",
        { className: "settings-kv about-info-meta" },
        react.createElement("dt", null, String(translate("settingsAdvanced.aboutTab.developer")).replace(/[:：]s*$/, "")),
        react.createElement("dd", { className: "about-info-line" }, "ivLis Studio"),
        react.createElement("dt", null, String(translate("settingsAdvanced.aboutTab.originalProject")).replace(/[:：]s*$/, "")),
        react.createElement("dd", { className: "about-info-line" }, "lyrics-plus by khanhas")
      ),
      react.createElement(
        "div",
        { className: "settings-group-foot" },
        react.createElement("p", { className: "about-info-note" }, translate("settingsAdvanced.aboutTab.thanks")),
        react.createElement(
          "div",
          { className: "settings-group-foot-actions" },
          react.createElement(
            "button",
            {
              type: "button",
              className: "btn btn-sm settings-github-btn",
              title: translate("settingsAdvanced.aboutTab.visitGithub"),
              onClick: () => openLink("https://github.com/ivLis-Studio/ivLyrics", "_blank"),
            },
            react.createElement(SettingsUiIcon, { name: "github", size: 15 }),
            react.createElement("span", null, translate("settingsAdvanced.aboutTab.viewOnGithub"))
          ),
          react.createElement(
            "button",
            {
              type: "button",
              className: "btn btn-sm settings-discord-btn",
              onClick: () => openLink("https://ivlis.kr/ivLyrics/discord.php", "_blank"),
            },
            react.createElement(SettingsUiIcon, { name: "discord", size: 15 }),
            react.createElement("span", null, translate("settingsAdvanced.aboutTab.joinDiscord"))
          ),
          react.createElement(
            "button",
            {
              type: "button",
              className: "btn btn-sm settings-coffee-btn",
              title: translate("settingsAdvanced.donate.title"),
              onClick: () => openLink("https://buymeacoffee.com/ivlis", "_blank"),
            },
            react.createElement(SettingsUiIcon, { name: "coffee", size: 15 }),
            react.createElement("span", null, translate("settingsAdvanced.donate.button"))
          ),
          react.createElement(
            "button",
            {
              type: "button",
              className: "btn btn-sm settings-fairy-btn",
              title: translate("settingsAdvanced.donate.fairyTitle"),
              onClick: () => openLink("https://fairy.hada.io/@ivlyrics", "_blank"),
            },
            react.createElement(SettingsUiIcon, { name: "fairy", size: 15 }),
            // Fairy is a platform name, so the label stays the same in every language.
            react.createElement("span", null, "Fairy")
          )
        )
      )
    );

  return react.createElement(
      "div",
      {
        className: `tab-content ${activeTab === "about" ? "active" : ""}`,
        "data-tab-id": "about",
      },
      // Discord 계정 연동 섹션 (최상단)
      react.createElement(
        SettingsSection,
        {
          sectionKey: "about-account",
          title: translate("settingsAdvanced.aboutTab.account.title"),
          subtitle: translate("settingsAdvanced.aboutTab.account.subtitle"),
        },
        react.createElement(AccountSection)
      ),
      react.createElement(
        SettingsSection,
        {
          sectionKey: "about-update",
          title: translate("settingsAdvanced.aboutTab.update.title"),
          subtitle: translate("settingsAdvanced.aboutTab.update.subtitle"),
        },
        renderUpdate()
      ),
      react.createElement(
        SettingsSection,
        {
          sectionKey: "about-app-info",
          title: translate("settingsAdvanced.aboutTab.appInfo.title"),
          subtitle: translate("settingsAdvanced.aboutTab.subtitle"),
        },
        renderAboutAppInfoSection()
      ),
      react.createElement(
        SettingsSection,
        {
          sectionKey: "about-client-info",
          title: translate("settingsAdvanced.aboutTab.clientInfo.title"),
          subtitle: translate("settingsAdvanced.aboutTab.clientInfo.subtitle"),
        },
        renderAboutClientInfoSection()
      ),
      react.createElement(
        SettingsSection,
        {
          sectionKey: "about-patch-notes",
          title: translate("settingsAdvanced.aboutTab.patchNotes.title"),
          subtitle: translate("settingsAdvanced.aboutTab.patchNotes.subtitle"),
        },
        react.createElement(
          "div",
          {
            id: "patch-notes-container",
            className: "settings-group settings-patch-notes is-loading",
            "data-section-content": "true",
          },
          translate("settingsAdvanced.aboutTab.patchNotes.loading")
        )
      )
    );
}
