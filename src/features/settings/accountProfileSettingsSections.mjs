export function createAccountProfileSettingsSections({ react, translate, getThemeTokens, notifySuccess, notifyError }) {
  const { useState, useEffect, useRef } = react;
  const useLayoutEffect = react.useLayoutEffect || useEffect;

  function useProfileView(actions) {
    const mounted = useRef(false);
    useLayoutEffect(() => {
      mounted.current = true;
      return () => { mounted.current = false; };
    }, []);
    return () => mounted.current && actions.isCurrent();
  }

  function NicknameSection({ actions, initialNickname }) {
    const [nickname, setNickname] = useState(initialNickname);
    const [inputNickname, setInputNickname] = useState(initialNickname);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState(false);
    const isCurrent = useProfileView(actions);
    const themeTokens = getThemeTokens();

    const handleSave = async () => {
      if (!isCurrent()) return;
      if (!inputNickname.trim()) {
        notifyError(translate("settingsAdvanced.aboutTab.account.nickname.enter"));
        return;
      }

      const save = actions.saveNickname(inputNickname);
      if (!save) return;
      setLoading(true);
      try {
        const result = await save;
        if (!isCurrent() || !result) return;
        const { ok, data } = result;
        if (ok && data.success) {
          setNickname(data.nickname);
          setInputNickname(data.nickname);
          setEditing(false);
          notifySuccess(translate("settingsAdvanced.aboutTab.account.nickname.changed"));
        } else {
          notifyError(data.error || translate("settingsAdvanced.aboutTab.account.nickname.failed"));
        }
      } catch {
        if (isCurrent()) notifyError(translate("settingsAdvanced.aboutTab.account.nickname.error"));
      } finally {
        if (isCurrent()) setLoading(false);
      }
    };

    return react.createElement(
      "div",
      {
        style: {
          padding: "16px",
          background: themeTokens.panelBackground,
          borderRadius: "12px",
          border: `1px solid ${themeTokens.panelBorder}`,
          marginTop: "16px",
          marginBottom: "16px",
        },
      },
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
          },
        },
        react.createElement(
          "div",
          { style: { minWidth: 0 } },
          react.createElement(
            "div",
            { style: { fontSize: "12px", color: themeTokens.textTertiary, marginBottom: "4px" } },
            translate("settingsAdvanced.aboutTab.account.nickname.label")
          ),
          editing
            ? react.createElement("input", {
                type: "text",
                value: inputNickname,
                disabled: loading,
                onChange: (e) => setInputNickname(e.target.value),
                placeholder: translate("settingsAdvanced.aboutTab.account.nickname.placeholder"),
                autoFocus: true,
                maxLength: 20,
                style: {
                  background: themeTokens.inputBackground,
                  border: "1px solid var(--settings-accent-line)",
                  borderRadius: "6px",
                  color: themeTokens.textPrimary,
                  padding: "8px 10px",
                  fontSize: "14px",
                  width: "180px",
                  maxWidth: "100%",
                },
              })
            : react.createElement(
                "div",
                { style: { fontSize: "16px", fontWeight: "600", color: themeTokens.textPrimary } },
                nickname || translate("settingsAdvanced.aboutTab.account.nickname.none")
              )
        ),
        react.createElement(
          "button",
          {
            onClick: editing ? handleSave : () => setEditing(true),
            disabled: loading,
            style: {
              padding: "8px 12px",
              borderRadius: "6px",
              background: editing ? "var(--settings-ink)" : themeTokens.subtleButtonBackground,
              color: editing ? "var(--settings-ink-text)" : themeTokens.subtleButtonText,
              border: "none",
              fontSize: "12px",
              cursor: "pointer",
              transition: "all 0.2s",
              whiteSpace: "nowrap",
            },
          },
          loading
            ? translate("settingsAdvanced.aboutTab.account.nickname.saving")
            : editing
              ? translate("settingsAdvanced.aboutTab.account.nickname.save")
              : translate("settingsAdvanced.aboutTab.account.nickname.change")
        )
      )
    );
  }

  function getCreatorPrivacyCopy() {
    const baseKey = "settingsAdvanced.aboutTab.account.creatorPrivacy";
    return {
      title: translate(`${baseKey}.title`) || "Private creator profile",
      description:
        translate(`${baseKey}.description`) ||
        "Private profiles remain in contributor lists, but your name, photo, and profile links are hidden.",
      publicLabel: translate(`${baseKey}.public`) || "Public",
      privateLabel: translate(`${baseKey}.private`) || "Private",
      loading: translate(`${baseKey}.loading`) || "Loading privacy setting...",
      loadFailed:
        translate(`${baseKey}.loadFailed`) || "Failed to load creator profile privacy.",
      saveFailed:
        translate(`${baseKey}.saveFailed`) || "Failed to update creator profile privacy.",
      savedPublic:
        translate(`${baseKey}.savedPublic`) || "Your creator profile is now public.",
      savedPrivate:
        translate(`${baseKey}.savedPrivate`) || "Your creator profile is now private.",
    };
  }

  function CreatorPrivacySection({ actions }) {
    const [isPrivate, setIsPrivate] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const isCurrent = useProfileView(actions);
    const themeTokens = getThemeTokens();
    const copy = getCreatorPrivacyCopy();

    useEffect(() => {
      let cancelled = false;
      const canApply = () => !cancelled && isCurrent();
      async function load() {
        try {
          const data = await actions.readPrivacy();
          if (canApply() && data) setIsPrivate(data.isPrivate === true || data.profilePublic === false);
        } catch (privacyError) {
          if (!canApply()) return;
          console.error("Failed to load creator profile privacy:", privacyError);
          setError(privacyError.message || copy.loadFailed);
        } finally {
          if (canApply()) setLoading(false);
        }
      }
      void load();
      return () => { cancelled = true; };
    }, [actions]);

    const handleToggle = async () => {
      if (loading || saving || isPrivate === null || !isCurrent()) return;
      const save = actions.savePrivacy(!isPrivate);
      if (!save) return;
      setSaving(true);
      setError(null);
      try {
        const result = await save;
        if (!isCurrent() || !result) return;
        setIsPrivate(result.isPrivate);
        notifySuccess(result.isPrivate ? copy.savedPrivate : copy.savedPublic);
      } catch (privacyError) {
        if (!isCurrent()) return;
        console.error("Failed to update creator profile privacy:", privacyError);
        const message = privacyError.message || copy.saveFailed;
        setError(message);
        notifyError(message);
      } finally {
        if (isCurrent()) setSaving(false);
      }
    };

    const disabled = loading || saving || isPrivate === null;
    const statusLabel = loading ? copy.loading : (isPrivate ? copy.privateLabel : copy.publicLabel);

    return react.createElement(
      "div",
      {
        style: {
          marginTop: "4px",
          padding: "18px 2px 2px",
          borderTop: `1px solid ${themeTokens.panelBorder}`,
        },
      },
      react.createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "20px",
          },
        },
        react.createElement(
          "div",
          { style: { minWidth: 0, flex: 1 } },
          react.createElement(
            "div",
            {
              style: {
                color: themeTokens.textPrimary,
                fontSize: "14px",
                fontWeight: "700",
                marginBottom: "5px",
              },
            },
            copy.title
          ),
          react.createElement(
            "p",
            {
              style: {
                margin: 0,
                color: themeTokens.textSecondary,
                fontSize: "12px",
                lineHeight: "1.55",
                maxWidth: "620px",
              },
            },
            copy.description
          )
        ),
        react.createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexShrink: 0,
            },
          },
          react.createElement(
            "span",
            {
              style: {
                color: error ? "#f87171" : themeTokens.textSecondary,
                fontSize: "12px",
                fontWeight: "700",
                whiteSpace: "nowrap",
              },
            },
            error || statusLabel
          ),
          react.createElement(
            "button",
            {
              type: "button",
              role: "switch",
              "aria-checked": isPrivate === true,
              "aria-label": copy.title,
              disabled,
              onClick: handleToggle,
              style: {
                width: "42px",
                height: "24px",
                padding: "2px",
                borderRadius: "999px",
                border: `1px solid ${isPrivate ? "rgba(34, 197, 94, 0.55)" : themeTokens.subtleButtonBorder}`,
                background: isPrivate ? "rgba(34, 197, 94, 0.2)" : themeTokens.subtleButtonBackground,
                cursor: disabled ? "wait" : "pointer",
                opacity: disabled ? 0.55 : 1,
                transition: "background 160ms ease, border-color 160ms ease, opacity 160ms ease",
                flexShrink: 0,
              },
            },
            react.createElement("span", {
              "aria-hidden": "true",
              style: {
                display: "block",
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                background: isPrivate ? "#22c55e" : themeTokens.textTertiary,
                transform: isPrivate ? "translateX(18px)" : "translateX(0)",
                transition: "transform 180ms cubic-bezier(.2,.8,.2,1), background 160ms ease",
              },
            })
          )
        )
      )
    );
  }

  return { NicknameSection, CreatorPrivacySection };
}
