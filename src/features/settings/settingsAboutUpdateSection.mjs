const renderUpdateError = (translate) => `
                        <div style="
                          padding: 16px 20px;
                          background: var(--settings-surface-2, rgba(255, 255, 255, 0.03));
                          border: 1px solid rgba(255, 107, 107, 0.2);
                          border-left: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                          border-right: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                          border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                          border-bottom-left-radius: 0;
                          border-bottom-right-radius: 0;
                        ">
                          <div style="
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            color: var(--danger, rgba(255, 107, 107, 0.9));
                            font-size: 13px;
                            font-weight: 500;
                          ">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                            </svg>
                            <div>
                              <div style="font-weight: 600; margin-bottom: 2px;">${translate("notifications.updateCheckFailed")}</div>
                              <div style="opacity: 0.8; font-size: 12px;">${translate("notifications.checkNetworkConnection")}</div>
                            </div>
                          </div>
                        </div>
                      `;

export function renderSettingsAboutUpdateSection(react, {
  OptionList, ConfigButton, translate, getCurrentVersion, checkForUpdates,
  getSettingsResultContainer, escapeHtml, escapeAttribute, sanitizeHttpUrl,
  openUpdaterProtocol, notifySuccess, notifyError,
}) {
  return react.createElement(OptionList, {
    items: [
      {
        desc: translate("settingsAdvanced.aboutTab.update.checkUpdate.desc"),
        info: translate("settingsAdvanced.update.currentVersionInfo").replace("{version}", getCurrentVersion()),
        key: "check-update",
        text: translate("settingsAdvanced.aboutTab.update.checkUpdate.button"),
        type: ConfigButton,
        onChange: async (_, event) => {
          const button = event?.currentTarget || event?.target;
          if (!button || button.disabled) return;
          const originalText = button.textContent;
          button.textContent = translate("settingsAdvanced.aboutTab.update.checkUpdate.checking");
          button.disabled = true;

          let resultContainer;
          try {
            resultContainer = getSettingsResultContainer(button, "update-result-container", "has-update-result");
            if (resultContainer) resultContainer.innerHTML = "";
            const updateInfo = await checkForUpdates();

            if (resultContainer) {
              if (updateInfo.error) {
                resultContainer.innerHTML = renderUpdateError(translate);
              } else if (updateInfo.hasUpdate) {
                const safeUpdateAvailable = escapeHtml(
                  translate("notifications.updateAvailable")
                );
                const safeVersionChange = escapeHtml(
                  translate("update.versionChange")
                );
                const safeCurrentVersion = escapeHtml(
                  updateInfo.currentVersion
                );
                const safeLatestVersion = escapeHtml(
                  updateInfo.latestVersion
                );
                const safeUpdatePageInfo = escapeHtml(
                  translate("settingsAdvanced.aboutTab.update.protocol.info")
                );
                const releaseNotesUrl = sanitizeHttpUrl(getAppReleaseUrl(updateInfo.latestVersion));
                const releaseNotesHref = releaseNotesUrl
                  ? escapeAttribute(releaseNotesUrl)
                  : APP_RELEASES_URL;
                const releaseNotesLabel = escapeHtml(
                  translate("update.releaseNotes")
                );
                const updatePageLabel = escapeHtml(
                  translate("settingsAdvanced.aboutTab.update.protocol.button")
                );

                resultContainer.innerHTML = `
                        <div style="
                          padding: 20px;
                          background: var(--settings-surface-2, rgba(255, 255, 255, 0.04));
                          border: 1px solid rgba(74, 222, 128, 0.15);
                          border-left: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                          border-right: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                          border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                          border-bottom-left-radius: 0;
                          border-bottom-right-radius: 0;
                        ">
                          <div style="margin-bottom: 16px;">
                            <div style="
                              display: flex;
                              align-items: center;
                              gap: 12px;
                              margin-bottom: 12px;
                            ">
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(74, 222, 128, 0.9)" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M12 6v6l4 2"/>
                              </svg>
                              <div>
                                <div style="
                                  font-size: 14px;
                                  font-weight: 600;
                                  color: var(--settings-text, rgba(255, 255, 255, 0.95));
                                  margin-bottom: 2px;
                                  letter-spacing: -0.01em;
                                ">${safeUpdateAvailable}</div>
                                <div style="
                                  font-size: 12px;
                                  color: var(--settings-text-3, rgba(255, 255, 255, 0.5));
                                ">${safeVersionChange} ${safeCurrentVersion} → ${safeLatestVersion}</div>
                              </div>
                            </div>
                          </div>

                          <div style="
                            background: var(--settings-bg, rgba(0, 0, 0, 0.25));
                            border: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                            border-radius: 8px;
                            padding: 12px 14px;
                            margin-bottom: 12px;
                          ">
                            <div style="
                              font-size: 12px;
                              color: var(--settings-text-3, rgba(255, 255, 255, 0.6));
                              margin-bottom: 8px;
                              font-weight: 500;
                            ">${safeUpdatePageInfo}</div>
                          </div>

                          <div style="display: flex; gap: 8px;">
                            <a href="${APP_UPDATE_PAGE_URL}"
                               target="_blank"
                               rel="noopener noreferrer"
                               style="
                              flex: 1;
                              background: var(--settings-surface-3, rgba(255, 255, 255, 0.1));
                              border: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.15));
                              color: var(--settings-text, rgba(255, 255, 255, 0.9));
                              padding: 10px 16px;
                              border-radius: 8px;
                              cursor: pointer;
                              font-size: 13px;
                              font-weight: 600;
                              transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                              letter-spacing: -0.01em;
                            ">${updatePageLabel}</a>
                            <a href="${releaseNotesHref}"
                               target="_blank"
                               rel="noopener noreferrer"
                               style="
                              flex: 1;
                              background: var(--settings-surface-3, rgba(255, 255, 255, 0.08));
                              border: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.15));
                              color: var(--settings-text, rgba(255, 255, 255, 0.9));
                              padding: 10px 16px;
                              border-radius: 8px;
                              text-decoration: none;
                              font-size: 13px;
                              font-weight: 600;
                              transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                              display: flex;
                              align-items: center;
                              justify-content: center;
                              letter-spacing: -0.01em;
                            ">${releaseNotesLabel}</a>
                          </div>
                        </div>
                      `;
              } else {
                const latestVersionLabel = escapeHtml(
                  translate("notifications.latestVersion")
                );
                const safeVersionChange = escapeHtml(
                  translate("update.versionChange")
                );
                const safeCurrentVersion = escapeHtml(
                  updateInfo.currentVersion
                );

                resultContainer.innerHTML = `
                        <div style="
                          padding: 16px 20px;
                          background: var(--settings-surface-2, rgba(255, 255, 255, 0.03));
                          border: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.12));
                          border-left: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                          border-right: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                          border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.08));
                          border-bottom-left-radius: 0;
                          border-bottom-right-radius: 0;
                        ">
                          <div style="
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            color: var(--settings-text, rgba(248, 250, 252, 0.9));
                            font-size: 13px;
                          ">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                            </svg>
                            <div>
                              <div style="font-weight: 600; margin-bottom: 2px;">${latestVersionLabel}</div>
                              <div style="opacity: 0.8; font-size: 12px;">${safeVersionChange} ${safeCurrentVersion}</div>
                            </div>
                          </div>
                        </div>
                      `;
              }
            }
          } catch {
            if (resultContainer) {
              resultContainer.innerHTML = renderUpdateError(translate);
            }
          } finally {
            button.textContent = originalText;
            button.disabled = false;
          }
        },
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
    onChange: () => { },
  });
}
import { APP_RELEASES_URL, APP_UPDATE_PAGE_URL, getAppReleaseUrl } from "../updates/updateLinks.mjs";

