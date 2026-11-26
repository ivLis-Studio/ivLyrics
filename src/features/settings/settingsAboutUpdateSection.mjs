export function renderSettingsAboutUpdateSection(react, {
  OptionList, ConfigButton, SettingsUpdateButton, translate, getCurrentVersion,
  openUpdaterProtocol, notifySuccess, notifyError,
}) {
  return react.createElement(OptionList, {
    items: [
      {
        desc: translate("settingsAdvanced.aboutTab.update.checkUpdate.desc"),
        info: translate("settingsAdvanced.update.currentVersionInfo").replace("{version}", getCurrentVersion()),
        key: "check-update",
        text: translate("settingsAdvanced.aboutTab.update.checkUpdate.button"),
        type: SettingsUpdateButton,
      },
      {
        desc: translate("settingsAdvanced.aboutTab.update.protocol.desc"),
        info: translate("settingsAdvanced.aboutTab.update.protocol.info"),
        key: "open-updater",
        text: translate("settingsAdvanced.aboutTab.update.protocol.button"),
        type: ConfigButton,
        onChange: () => {
          const opened = openUpdaterProtocol("update");
          if (opened) {
            notifySuccess(translate("settingsAdvanced.aboutTab.update.protocol.opening"));
          } else {
            notifyError(translate("settingsAdvanced.aboutTab.update.protocol.failed"));
          }
        },
      },
    ],
    onChange: () => {},
  });
}
