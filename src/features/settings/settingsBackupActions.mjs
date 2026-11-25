import { isSettingsBackupFile } from "../../core/settingsBackupPolicy.mjs";

function selectBackupFile(document) {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.hidden = true;
    const cleanup = () => {
      input.onchange = null;
      input.oncancel = null;
      input.remove();
    };
    const finish = file => {
      cleanup();
      resolve(file);
    };
    input.onchange = () => finish(input.files?.[0] || null);
    input.oncancel = () => finish(null);
    document.body.appendChild(input);
    try {
      input.click();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export function createSettingsBackupActions({
  document, translate, confirm, requestSaveTarget, saveBlob,
  exportConfig, importConfig, exportDatabases, importDatabases,
  clearSettings, reload,
  createFileReader = () => new FileReader(),
}) {
  const invalidFormat = () => new Error(translate("settingsAdvanced.aboutTab.account.backup.invalidFormat"));
  const listeners = new Set();
  let snapshot = { active: null, reloadQueued: false, results: {} };
  const update = changes => {
    snapshot = { ...snapshot, ...changes };
    listeners.forEach(listener => listener());
  };
  const reloadAfterRestore = () => {
    reload();
    update({ reloadQueued: true });
  };

  const runBackup = ({ key, processing }, action) => async () => {
    if (snapshot.active || snapshot.reloadQueued) return;
    update({ active: { key, label: translate(processing) } });
    try {
      await action();
    } finally {
      update({ active: null });
    }
  };

  const readBackup = async file => {
    const contents = await new Promise((resolve, reject) => {
      const reader = createFileReader();
      reader.onload = event => resolve(event.target.result);
      const readFailed = () => reject(reader.error || invalidFormat());
      reader.onerror = readFailed;
      reader.onabort = readFailed;
      reader.readAsText(file, "utf-8");
    });
    if (typeof contents !== "string") throw invalidFormat();
    return JSON.parse(contents);
  };

  const setResult = ({ key, resultId }, result) => {
    update({ results: { ...snapshot.results, [key]: { id: resultId, ...result } } });
  };
  const reportError = (operation, title, error, flatBottom) => {
    const message = error?.message || error?.reason || String(error);
    const cause = error?.cause?.message;
    setResult(operation, {
      title: translate(title),
      detail: cause && cause !== message ? `${message} ${cause}` : message,
      failed: true,
      flatBottom,
    });
  };

  const exportBackup = (operation) => {
    const { fileName, description, success, saved, failure, load } = operation;
    return runBackup(operation, async () => {
      try {
        const saveTarget = await requestSaveTarget(fileName, {
          description,
          mimeType: "application/json",
          extensions: [".json"],
        });
        if (saveTarget.canceled) return;
        const data = await load();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        await saveBlob(blob, fileName, saveTarget);
        setResult(operation, { title: translate(success), detail: translate(saved) });
      } catch (error) {
        reportError(operation, failure, error);
      }
    });
  };

  const importBackup = (operation) => {
    const { success, restored, failure, flatBottomOnFailure, restore } = operation;
    return runBackup(operation, async () => {
      try {
        const file = await selectBackupFile(document);
        if (!file || !(await restore(file))) return;
        setResult(operation, {
          title: translate(success),
          detail: translate(restored),
          flatBottom: true,
        });
        reloadAfterRestore();
      } catch (error) {
        reportError(operation, failure, error, flatBottomOnFailure);
      }
    });
  };

  const resetOperation = {
    key: "reset-settings",
    resultId: "reset-result-container",
    processing: "settingsAdvanced.resetSettings.reset.processing",
  };
  const resetSettings = runBackup(resetOperation, async () => {
    if (!confirm(translate("settingsAdvanced.resetSettings.reset.confirm"))) return;
    try {
      await clearSettings();
      setResult(resetOperation, {
        title: translate("notifications.resetSuccess"),
        detail: translate("notifications.importSuccessDesc"),
        flatBottom: true,
      });
      reloadAfterRestore();
    } catch (error) {
      reportError(resetOperation, "notifications.resetFailed", error, true);
    }
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    exportSettings: exportBackup({
      key: "export-settings",
      resultId: "export-result-container",
      processing: "settingsAdvanced.exportImport.export.processing",
      fileName: "ivLyrics-settings.json",
      description: "ivLyrics Settings",
      success: "notifications.exportSuccess",
      saved: "notifications.exportSuccessDesc",
      failure: "notifications.exportFailed",
      load: exportConfig,
    }),
    importSettings: importBackup({
      key: "import-settings",
      resultId: "import-result-container",
      processing: "settingsAdvanced.exportImport.import.processing",
      success: "notifications.importSuccess",
      restored: "notifications.importSuccessDesc",
      failure: "notifications.importFailed",
      flatBottomOnFailure: true,
      restore: async file => {
        const config = await readBackup(file);
        if (!isSettingsBackupFile(config)) throw invalidFormat();
        // The confirmation must precede writing the imported settings.
        const count = Object.keys(config).length;
        if (!confirm(translate("settingsAdvanced.exportImport.import.confirm", { count }))) return false;
        await importConfig(config);
        return true;
      },
    }),
    exportDatabaseBackup: exportBackup({
      key: "export-db",
      resultId: "db-export-result-container",
      processing: "settingsAdvanced.dbExportImport.export.processing",
      fileName: "ivLyrics-db.json",
      description: "ivLyrics Database",
      success: "notifications.dbExportSuccess",
      saved: "notifications.dbExportSuccessDesc",
      failure: "notifications.dbExportFailed",
      load: exportDatabases,
    }),
    importDatabaseBackup: importBackup({
      key: "import-db",
      resultId: "db-import-result-container",
      processing: "settingsAdvanced.dbExportImport.import.processing",
      success: "notifications.dbImportSuccess",
      restored: "notifications.dbImportSuccessDesc",
      failure: "notifications.dbImportFailed",
      restore: async file => {
        if (!confirm(translate("settingsAdvanced.dbExportImport.import.confirm"))) return false;
        await importDatabases(await readBackup(file));
        return true;
      },
    }),
    resetSettings,
  };
}
