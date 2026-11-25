import { createAccountProfileSettingsActions } from "./accountProfileSettingsActions.mjs";
import { createAccountProfileSettingsSections } from "./accountProfileSettingsSections.mjs";

export function createAccountSettingsPanel({
  react, translate, accountApi, getTheme, notifySuccess, notifyError,
  clearSyncCache, listenForAccountChange, publishPrivacyChange,
}) {
  const { useState, useEffect, useRef } = react;
  const getProfileActions = createAccountProfileSettingsActions({ accountApi, clearSyncCache, publishPrivacyChange });
  const { NicknameSection, CreatorPrivacySection } = createAccountProfileSettingsSections({
    react, translate, getThemeTokens: getAboutAccountThemeTokens, notifySuccess, notifyError,
  });

  function getAboutAccountThemeTokens() {
    const isLightTheme = getTheme() === "light";

    return {
      textPrimary: "var(--text-primary, #f6f8fb)",
      textSecondary: "var(--text-secondary, rgba(246, 248, 251, 0.72))",
      textTertiary: "var(--text-tertiary, rgba(246, 248, 251, 0.48))",
      panelBackground: isLightTheme ? "rgba(15, 23, 42, 0.04)" : "rgba(255, 255, 255, 0.03)",
      panelBorder: isLightTheme ? "rgba(15, 23, 42, 0.12)" : "rgba(255, 255, 255, 0.1)",
      inputBackground: isLightTheme ? "rgba(255, 255, 255, 0.82)" : "rgba(0, 0, 0, 0.2)",
      inputBorder: isLightTheme ? "rgba(15, 23, 42, 0.12)" : "rgba(255, 255, 255, 0.1)",
      subtleButtonBackground: isLightTheme ? "rgba(15, 23, 42, 0.06)" : "rgba(255, 255, 255, 0.05)",
      subtleButtonBackgroundHover: isLightTheme ? "rgba(15, 23, 42, 0.1)" : "rgba(255, 255, 255, 0.1)",
      subtleButtonBorder: isLightTheme ? "rgba(15, 23, 42, 0.12)" : "rgba(255, 255, 255, 0.15)",
      subtleButtonBorderHover: isLightTheme ? "rgba(15, 23, 42, 0.2)" : "rgba(255, 255, 255, 0.25)",
      subtleButtonText: isLightTheme ? "rgba(15, 23, 42, 0.82)" : "rgba(255, 255, 255, 0.8)",
      subtleButtonTextHover: "var(--text-primary, #f6f8fb)",
      emptyText: isLightTheme ? "rgba(15, 23, 42, 0.46)" : "#888",
      sectionDivider: isLightTheme ? "rgba(15, 23, 42, 0.1)" : "rgba(255, 255, 255, 0.1)",
    };
  }

  function getDiscordAccountCopy() {
    const baseKey = "settingsAdvanced.aboutTab.account";
    return {
      provider: "Discord",
      description:
        translate(`${baseKey}.description`) ||
        "Connect your ivLyrics contributions and nickname with Discord.",
      info:
        translate(`${baseKey}.info`) ||
        "Sign in with Discord to manage your creator profile. Existing anonymous contributions are not transferred automatically without ownership verification.",
      loginButton:
        translate(`${baseKey}.loginButton`) || "Sign In With Discord",
      loggingIn:
        translate(`${baseKey}.loggingIn`) || "Opening browser...",
      loading:
        translate(`${baseKey}.loading`) || "Loading Discord account information...",
      linked:
        translate(`${baseKey}.linked`) || "Connected",
      refresh:
        translate(`${baseKey}.refresh`) || "Refresh",
      linkedAt:
        translate(`${baseKey}.linkedAt`) || "Linked",
      lastLoginAt:
        translate(`${baseKey}.lastSync`) || "Last login",
      switchAccount:
        translate(`${baseKey}.manageAccount`) || "Change Account",
      startHint:
        translate(`${baseKey}.startHint`) || "Complete the Discord sign-in flow in your browser.",
      failed:
        translate(`${baseKey}.failed`) || "Discord login failed.",
      loadFailed:
        translate(`${baseKey}.loadFailed`) || "Failed to load account information.",
      logout:
        translate(`${baseKey}.logout`) || "Log Out",
      logoutFailed:
        translate(`${baseKey}.logoutFailed`) ||
        "Failed to sign out from Discord.",
      logoutSuccess:
        translate(`${baseKey}.logoutSuccess`) ||
        "Signed out from Discord and created a new user hash.",
    };
  }

  function formatEpochLabel(epochSeconds) {
    if (!epochSeconds) return null;
    return new Date(epochSeconds * 1000).toLocaleString();
  }

  const AccountSection = () => {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loginLoading, setLoginLoading] = useState(false);
    const [logoutLoading, setLogoutLoading] = useState(false);
    const [error, setError] = useState(null);
    const profileRequest = useRef(0);
    const themeTokens = getAboutAccountThemeTokens();
    const copy = getDiscordAccountCopy();

    const loadAccountInfo = async () => {
      const requestId = ++profileRequest.current;
      try {
        setLoading(true);
        setError(null);
        const actions = getProfileActions();
        const data = await actions.readProfile();
        if (profileRequest.current !== requestId) return;
        if (actions.isCurrent() && data?.authenticated && data.linked && data.account) {
          setProfile({ accountInfo: data.account, nickname: data.nickname || "", actions, requestId });
        } else {
          setProfile(null);
        }
      } catch (err) {
        if (profileRequest.current !== requestId || err?.code === "account_session_changed") return;
        console.error("Failed to load Discord account info:", err);
        setError(err.message || copy.loadFailed);
        setProfile(null);
      } finally {
        if (profileRequest.current === requestId) setLoading(false);
      }
    };

    useEffect(() => {
      loadAccountInfo();

      const handleAccountChanged = () => {
        loadAccountInfo();
      };
      const unsubscribe = listenForAccountChange(handleAccountChanged);
      return () => {
        profileRequest.current++;
        unsubscribe();
      };
    }, []);

    const openLoginPage = async () => {
      try {
        setLoginLoading(true);
        if (await accountApi.startDiscordLogin()) notifySuccess(copy.startHint);
      } catch (err) {
        notifyError(err.message || copy.failed);
      } finally {
        setLoginLoading(false);
      }
    };

    const handleRefresh = () => {
      loadAccountInfo();
    };

    const handleLogout = async () => {
      try {
        setLogoutLoading(true);
        if (!await accountApi.logoutDiscordSession()) return;
        setProfile(null);
        setError(null);
        notifySuccess(copy.logoutSuccess);
        accountApi.restoreAccountSettings({
          initialTab: "about",
          initialSettingKey: "about-account",
        });
      } catch (err) {
        console.error("Failed to log out from Discord:", err);
        notifyError(err.message || copy.logoutFailed);
      } finally {
        setLogoutLoading(false);
      }
    };

    const renderAccountLinkedCard = ({ accountInfo, nickname, actions, requestId }) =>
  react.createElement(
      "div",
      {
        className: "info-card settings-account-card",
      },
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "16px",
          },
        },
        react.createElement(
          "div",
          {
            style: {
              width: "52px",
              height: "52px",
              borderRadius: "50%",
              background: accountInfo.profileImage
                ? `url(${accountInfo.profileImage}) center/cover no-repeat`
                : "#5865f2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              border: "1px solid var(--settings-line)",
              color: "#fff",
              fontSize: "18px",
              fontWeight: "700",
            },
          },
          !accountInfo.profileImage && (accountInfo.displayName || "D").slice(0, 1).toUpperCase()
        ),
        react.createElement(
          "div",
          { style: { flex: 1, minWidth: 0 } },
          react.createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "4px",
                flexWrap: "wrap",
              },
            },
            react.createElement(
              "h3",
              {
                style: {
                  margin: 0,
                  fontSize: "17px",
                  color: themeTokens.textPrimary,
                  fontWeight: "700",
                },
              },
              accountInfo.displayName || accountInfo.username || copy.provider
            ),
            react.createElement(
              "span",
              {
                style: {
                  fontSize: "10px",
                  padding: "3px 8px",
                  borderRadius: "999px",
                  backgroundColor: "rgba(34, 197, 94, 0.14)",
                  color: "#4ade80",
                  border: "1px solid rgba(34, 197, 94, 0.24)",
                  fontWeight: "700",
                },
              },
              copy.linked
            )
          ),
          react.createElement(
            "p",
            {
              style: {
                margin: 0,
                fontSize: "13px",
                color: themeTokens.textSecondary,
              },
            },
            `@${accountInfo.username || "discord"}`
          )
        ),
        react.createElement(
          "button",
          {
            onClick: handleRefresh,
            title: copy.refresh,
            style: {
              padding: "8px",
              background: themeTokens.subtleButtonBackground,
              border: `1px solid ${themeTokens.subtleButtonBorder}`,
              borderRadius: "8px",
              color: themeTokens.subtleButtonText,
              cursor: "pointer",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            },
          },
          react.createElement(
            "svg",
            {
              width: "16",
              height: "16",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "2",
            },
            react.createElement("polyline", { points: "23 4 23 10 17 10" }),
            react.createElement("path", { d: "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" })
          )
        )
      ),
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            gap: "16px",
            fontSize: "12px",
            color: themeTokens.textTertiary,
            marginBottom: "16px",
            flexWrap: "wrap",
          },
        },
        accountInfo.linkedAt &&
          react.createElement(
            "span",
            null,
            `${copy.linkedAt}: ${formatEpochLabel(accountInfo.linkedAt)}`
          ),
        accountInfo.lastLoginAt &&
          react.createElement(
            "span",
            null,
            `${copy.lastLoginAt}: ${formatEpochLabel(accountInfo.lastLoginAt)}`
          )
      ),
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            gap: "10px",
            marginBottom: "16px",
            flexWrap: "wrap",
          },
        },
        react.createElement(
          "button",
          {
            onClick: openLoginPage,
            disabled: loginLoading || logoutLoading,
            style: {
              flex: "1 1 220px",
              padding: "10px 16px",
              background: themeTokens.subtleButtonBackground,
              border: `1px solid ${themeTokens.subtleButtonBorder}`,
              borderRadius: "8px",
              color: themeTokens.subtleButtonText,
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
            },
          },
          loginLoading ? copy.loggingIn : copy.switchAccount
        ),
        react.createElement(
          "button",
          {
            onClick: handleLogout,
            disabled: loginLoading || logoutLoading,
            style: {
              flex: "1 1 160px",
              padding: "10px 16px",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "8px",
              color: "#f87171",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
            },
          },
          copy.logout
        )
      ),
      react.createElement(NicknameSection, { key: `nickname-${requestId}`, actions, initialNickname: nickname }),
      react.createElement(CreatorPrivacySection, { key: `privacy-${requestId}`, actions })
    );
    const renderAccountUnlinkedCard = () =>
  react.createElement(
        "div",
        {
          className: "info-card settings-account-card",
        },
        react.createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "16px",
              marginBottom: "16px",
            },
          },
          react.createElement(
            "div",
            {
              style: {
                width: "52px",
                height: "52px",
                borderRadius: "10px",
                background: "#5865f2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                flexShrink: 0,
              },
            },
            react.createElement(
              "svg",
              {
                width: "24",
                height: "24",
                viewBox: "0 0 24 24",
                fill: "currentColor",
              },
              react.createElement("path", {
                d: "M20.317 4.369A19.791 19.791 0 0 0 15.126 3c-.23.408-.499.957-.682 1.384a18.27 18.27 0 0 0-4.888 0A13.67 13.67 0 0 0 8.874 3a19.736 19.736 0 0 0-5.19 1.368C.533 9.067-.321 13.65.106 18.168a19.9 19.9 0 0 0 6.357 3.208c.513-.693.97-1.425 1.36-2.197-.748-.284-1.462-.634-2.134-1.04.178-.13.353-.267.522-.408 4.118 1.88 8.59 1.88 12.66 0 .17.141.344.278.523.408-.673.407-1.388.757-2.136 1.041.39.771.847 1.503 1.36 2.196a19.873 19.873 0 0 0 6.36-3.209c.5-5.238-.854-9.78-3.16-13.799ZM8.02 15.331c-1.24 0-2.26-1.131-2.26-2.525 0-1.394 1-2.525 2.26-2.525 1.26 0 2.279 1.15 2.26 2.525 0 1.394-1 2.525-2.26 2.525Zm7.96 0c-1.24 0-2.26-1.131-2.26-2.525 0-1.394 1-2.525 2.26-2.525 1.26 0 2.279 1.15 2.26 2.525 0 1.394-1 2.525-2.26 2.525Z",
              })
            )
          ),
          react.createElement(
            "div",
            { style: { flex: 1 } },
            react.createElement(
              "h3",
              {
                style: {
                  margin: "0 0 4px",
                  fontSize: "17px",
                  color: themeTokens.textPrimary,
                  fontWeight: "700",
                },
              },
              copy.provider
            ),
            react.createElement(
              "p",
              {
                style: {
                  margin: 0,
                  fontSize: "13px",
                  color: themeTokens.textSecondary,
                },
              },
              copy.description
            )
          )
        ),
        react.createElement(
          "p",
          {
            style: {
              margin: "0 0 16px",
              fontSize: "13px",
              color: themeTokens.textSecondary,
              lineHeight: "1.7",
            },
          },
          copy.info
        ),
        error &&
          react.createElement(
            "p",
            {
              style: {
                margin: "0 0 12px",
                fontSize: "12px",
                color: "#f87171",
              },
            },
            error
          ),
        react.createElement(
          "button",
          {
            onClick: openLoginPage,
            disabled: loginLoading || logoutLoading,
            type: "button",
            className: "btn btn-primary settings-account-login",
          },
          loginLoading ? copy.loggingIn : copy.loginButton
        )
      );
    const renderAccountLoadingCard = () =>
  react.createElement(
        "div",
        {
          className: "info-card settings-account-card",
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "110px",
          },
        },
        react.createElement(
          "span",
          { style: { color: themeTokens.textSecondary, fontSize: "14px" } },
          copy.loading
        )
      );
    if (loading) {
      return renderAccountLoadingCard();
    }

    if (!profile?.actions.isCurrent()) {
      return renderAccountUnlinkedCard();
    }

    return renderAccountLinkedCard(profile);
  };

  return AccountSection;
}
