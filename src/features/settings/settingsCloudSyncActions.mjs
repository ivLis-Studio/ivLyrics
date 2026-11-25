import { accountSessionChangedError } from "../account/discordAccountSession.mjs";

const emptyCloud = { loading: false, exists: false, revision: 0, updatedAt: null };

export function createSettingsCloudSyncActions({
  text, format, account, confirm, notifyError, exportConfig, importConfig,
  reloadSettings, listenForAccountChange, isClosing,
}) {
  const monthlyRequired = () => text("monthlyRequired", "Cloud sync is available to Monthly Supporters only.");
  const initialState = () => ({ cloud: emptyCloud, busyAction: "", message: monthlyRequired(), messageType: "info" });
  let state = initialState();
  let listener = null;
  let activeOperation = null;
  let reloadQueued = false;

  const update = changes => {
    state = { ...state, ...changes };
    listener?.();
  };
  const showMessage = (message, messageType = "info") => update({ message, messageType });

  const describeError = (error) => {
    switch (error?.code) {
      case "monthly_supporter_required":
        return monthlyRequired();
      case "revision_conflict":
        return text("conflict", "Cloud settings changed on another device. Refresh before uploading again.");
      case "discord_login_required":
        return text("loginRequired", "Sign in with Discord to use cloud sync.");
      default:
        if (error?.status === 401) return text("loginRequired", "Sign in with Discord to use cloud sync.");
        return format("failed", "Cloud sync failed: {error}", {
          error: error?.message || String(error || "Unknown error"),
        });
    }
  };

  const run = async (action, work) => {
    if (!listener || isClosing() || activeOperation || reloadQueued) return;
    const session = account.captureAccountSession();
    const isAccountCurrent = () => account.isAccountSessionCurrent(session);
    const isCurrent = () => activeOperation === operation && isAccountCurrent() && !isClosing();
    const operation = {
      session, isCurrent,
      assertCurrent() {
        if (!isCurrent()) throw accountSessionChangedError();
      },
    };
    activeOperation = operation;
    update({ busyAction: action });
    try {
      await work(operation);
    } catch (error) {
      if (!isCurrent()) return;
      if (error?.code === "monthly_supporter_required") {
        account.setCachedDiscordSupportTier(session.userHash, "none");
      }
      const message = describeError(error);
      showMessage(message, "error");
      notifyError(message);
    } finally {
      if (activeOperation === operation) {
        activeOperation = null;
        update(isAccountCurrent()
          ? { busyAction: "", cloud: { ...state.cloud, loading: false } }
          : initialState());
      }
    }
  };

  const ensureMonthlySupporter = async ({ session, assertCurrent }) => {
    if (!session.authToken || !account.isDiscordUserHash(session.userHash)) {
      const message = text("loginRequired", "Sign in with Discord to use cloud sync.");
      showMessage(message, "warning");
      notifyError(message);
      return false;
    }
    showMessage(text("checking", "Checking cloud settings…"));
    const tier = await account.fetchDiscordSupportTier(session.userHash, { forceRefresh: true });
    assertCurrent();
    if (tier === "monthly") return true;
    const message = monthlyRequired();
    showMessage(message, "warning");
    notifyError(message);
    return false;
  };

  const publishCloudRevision = result => update({ cloud: {
    loading: false,
    exists: result.exists,
    revision: result.revision,
    updatedAt: result.data?.updatedAt || null,
  } });

  const getCloud = async ({ session, assertCurrent }) => {
    assertCurrent();
    const result = await account.fetchCloudSettings({ session });
    assertCurrent();
    publishCloudRevision(result);
    return result;
  };

  const refresh = () => run("refresh", async operation => {
    if (!await ensureMonthlySupporter(operation)) return;
    operation.assertCurrent();
    update({ cloud: { ...state.cloud, loading: true } });
    const result = await getCloud(operation);
    operation.assertCurrent();
    showMessage(result.exists
      ? format("remoteFound", "Cloud revision {revision} is available.", { revision: result.revision })
      : text("empty", "No PC settings have been saved to the cloud yet."));
  });

  const upload = () => run("upload", async operation => {
    if (!await ensureMonthlySupporter(operation)) return;
    const current = await getCloud(operation);
    operation.assertCurrent();
    const settings = await exportConfig();
    operation.assertCurrent();
    const saved = await account.saveCloudSettings(settings, current.revision, { session: operation.session });
    operation.assertCurrent();
    publishCloudRevision(saved);
    showMessage(format("uploaded", "PC settings uploaded as revision {revision}.", { revision: saved.revision }), "success");
  });

  const download = () => run("download", async operation => {
    if (!await ensureMonthlySupporter(operation)) return;
    operation.assertCurrent();
    if (!confirm(text("confirmDownload", "Apply cloud PC settings and reload ivLyrics?"))) return;
    const result = await getCloud(operation);
    operation.assertCurrent();
    if (!result.exists || !result.data?.settings) {
      showMessage(text("empty", "No PC settings have been saved to the cloud yet."), "warning");
      return;
    }
    await importConfig(result.data.settings, operation.assertCurrent);
    // The account and panel guard owns the write. A completed restore also
    // has to rebuild runtime settings after that panel no longer owns the UI.
    const reopenSettings = operation.isCurrent();
    if (reopenSettings) {
      showMessage(text("downloaded", "Cloud PC settings were applied. Reloading ivLyrics…"), "success");
    }
    reloadSettings({ reopenSettings, initialTab: "advanced", initialSettingKey: "cloud-sync", delay: 700 });
    reloadQueued = true;
  });

  const remove = () => run("delete", async ({ session, assertCurrent }) => {
    if (!confirm(text("confirmDelete", "Permanently delete your cloud PC settings?"))) return;
    assertCurrent();
    await account.deleteCloudSettings({ session });
    assertCurrent();
    update({ cloud: emptyCloud });
    showMessage(text("deleted", "Cloud PC settings were deleted."), "success");
  });

  return {
    getSnapshot: () => state,
    connect(onChange) {
      listener = onChange;
      const unsubscribe = listenForAccountChange(() => {
        activeOperation = null;
        update(initialState());
      });
      return () => {
        activeOperation = null;
        listener = null;
        unsubscribe();
      };
    },
    refresh, upload, download, remove,
  };
}
