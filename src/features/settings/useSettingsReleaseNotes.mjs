// Release notes follow the settings theme through its CSS variables.
const SETTINGS_RELEASE_LINK_STYLE = "color: var(--settings-accent-text, #7aadff); text-decoration: none; border-bottom: 1px solid var(--settings-line-2, rgba(255, 255, 255, 0.24));";
const SETTINGS_RELEASE_CODE_STYLE = "background: var(--settings-surface-3, rgba(255,255,255,0.1)); padding: 2px 6px; border-radius: 4px; font-family: var(--settings-mono, monospace); font-size: 0.9em; color: var(--settings-text, #ededef);";
const SETTINGS_RELEASE_PARAGRAPH_STYLE = "margin: 12px 0; line-height: 1.7;";

function renderSettingsReleaseMarkdown(markdown, renderMarkdown) {
  return renderMarkdown(markdown, {
    linkStyle: SETTINGS_RELEASE_LINK_STYLE,
    codeStyle: SETTINGS_RELEASE_CODE_STYLE,
    paragraphStyle: SETTINGS_RELEASE_PARAGRAPH_STYLE,
    imageStyle: "max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0; display: block;",
    preStyle: "background: var(--settings-bg, rgba(0,0,0,0.3)); border: 1px solid var(--settings-line, rgba(255,255,255,0.08)); padding: 12px; border-radius: 6px; overflow-x: auto; margin: 12px 0;",
    blockCodeStyle: "font-family: var(--settings-mono, monospace); font-size: 12.5px; color: var(--settings-text-2, rgba(255,255,255,0.9));",
    blockquoteStyle: "margin: 12px 0; padding-left: 16px; border-left: 2px solid var(--settings-line-3, rgba(255, 255, 255, 0.24)); color: var(--settings-text-3, rgba(255,255,255,0.7));",
    hrStyle: "border: none; border-top: 1px solid var(--settings-line, rgba(255,255,255,0.1)); margin: 20px 0;",
    headingStyles: {
      1: { tag: "h2", style: "margin: 22px 0 10px; color: var(--settings-text, #fff); font-size: 17px; font-weight: 600;" },
      2: { tag: "h3", style: "margin: 18px 0 8px; color: var(--settings-text, #fff); font-size: 15px; font-weight: 600;" },
      3: { tag: "h4", style: "margin: 14px 0 6px; color: var(--settings-text, #fff); font-size: 14px; font-weight: 600;" },
      4: { tag: "h5", style: "margin: 12px 0 6px; color: var(--settings-text, #fff); font-size: 13.5px; font-weight: 600;" },
    },
  });
}

export function useSettingsReleaseNotes(react, {
  activeTab, uiTheme, findContainer, request, translate, escapeHtml, escapeAttribute, sanitizeHttpUrl,
  renderMarkdown, schedule, cancel, reportError,
}) {
  react.useEffect(() => {
    if (activeTab !== "about") return;
    let disposed = false;

    const loadPatchNotes = async () => {
      const container = findContainer();
      if (!container || disposed) return;

      try {
        const response = await request(
          "https://api.github.com/repos/ivLis-Studio/ivLyrics/releases/latest"
        );

        if (!response.ok) {
          throw new Error("Failed to fetch release notes");
        }

        const data = await response.json();
        if (disposed) return;
        const version = escapeHtml(data.tag_name || "Unknown");
        const publishedDate = escapeHtml(data.published_at
          ? new Date(data.published_at).toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
          : "Unknown");

        // Render release notes through the local sanitizer before assigning innerHTML.
        const releaseUrl = sanitizeHttpUrl(data.html_url);
        const body = renderSettingsReleaseMarkdown(
          data.body || translate("settingsAdvanced.patchNotes.empty"), renderMarkdown
        );
        const viewOnGithubLabel = escapeHtml(
          translate("settingsAdvanced.aboutTab.viewOnGithub")
        );
        const releaseLink = releaseUrl
          ? `<a class="btn btn-sm settings-release-link" href="${escapeAttribute(releaseUrl)}" target="_blank" rel="noopener noreferrer">
                ${viewOnGithubLabel}
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3.75 2A1.75 1.75 0 002 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 12.25v-3.5a.75.75 0 00-1.5 0v3.5a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25v-8.5a.25.25 0 01.25-.25h3.5a.75.75 0 000-1.5h-3.5z"/>
                  <path d="M10.75 1a.75.75 0 000 1.5h1.69L8.22 6.72a.75.75 0 001.06 1.06l4.22-4.22v1.69a.75.75 0 001.5 0V1h-4.25z"/>
                </svg>
              </a>`
          : `<span class="btn btn-sm settings-release-link is-disabled">
                ${viewOnGithubLabel}
              </span>`;
        container.classList.remove("is-loading", "is-error");
        container.innerHTML = `
          <div class="settings-release">
            <div class="settings-release-head">
              <div>
                <h3>${version}</h3>
                <p>${publishedDate}</p>
              </div>
              ${releaseLink}
            </div>
            <div class="settings-release-body">
              ${body}
            </div>
          </div>
        `;
      } catch (error) {
        if (disposed) return;
        reportError("Failed to load patch notes:", error);
        container.classList.remove("is-loading");
        container.classList.add("is-error");
        const patchNotesLoadFailed = escapeHtml(
          translate("settingsAdvanced.aboutTab.patchNotesLoadFailed")
        );
        const checkGithubReleases = escapeHtml(
          translate("settingsAdvanced.aboutTab.checkGithubReleases")
        );

        container.innerHTML = `
          <div class="settings-release-error">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke-width="2"/>
              <line x1="12" y1="8" x2="12" y2="12" stroke-width="2" stroke-linecap="round"/>
              <line x1="12" y1="16" x2="12.01" y2="16" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <p>${patchNotesLoadFailed}</p>
            <p class="settings-release-error-hint">${checkGithubReleases}</p>
          </div>
        `;
      }
    };

    const timer = schedule(loadPatchNotes, 100);
    return () => {
      disposed = true;
      cancel(timer);
    };
  }, [activeTab, uiTheme]);
}
