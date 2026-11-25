export function createAccountProfileSettingsActions({ accountApi, clearSyncCache, publishPrivacyChange }) {
  let activeScope;

  return function getProfileActions() {
    if (activeScope?.isCurrent()) return activeScope;

    const session = accountApi.captureAccountSession();
    const isCurrent = () => accountApi.isAccountSessionCurrent(session);
    const nickname = { pending: null, revision: 0 };
    const privacy = { pending: null, revision: 0 };

    async function readAfterSave(field, read) {
      while (isCurrent()) {
        if (field.pending) {
          await field.pending.catch(() => {});
          continue;
        }
        const revision = field.revision;
        try {
          const value = await read();
          if (revision === field.revision) return value;
        } catch (error) {
          if (revision === field.revision) throw error;
        }
      }
      return null;
    }

    function save(field, write, apply) {
      if (!isCurrent() || field.pending) return null;
      // Register the write before any view can start another write or refresh.
      field.revision++;
      field.pending = Promise.resolve()
        .then(() => isCurrent() ? write() : null)
        .then(value => isCurrent() && value ? apply(value) : null)
        .finally(() => { field.pending = null; });
      return field.pending;
    }

    activeScope = {
      isCurrent,
      readProfile: () => readAfterSave(nickname, () => accountApi.fetchAccountProfile()),
      readPrivacy: () => readAfterSave(privacy, () => accountApi.fetchSyncCreatorPrivacy()),
      saveNickname: value => save(nickname, () => accountApi.saveOwnNickname(session.userHash, value), result => {
        if (result.ok && result.data.success) clearSyncCache();
        return result;
      }),
      savePrivacy: isPrivate => save(privacy, () => accountApi.setSyncCreatorPrivacy(isPrivate), result => {
        const savedPrivate = result.isPrivate === true || result.profilePublic === false;
        clearSyncCache();
        publishPrivacyChange({ isPrivate: savedPrivate, profilePublic: !savedPrivate });
        return { isPrivate: savedPrivate };
      }),
    };
    return activeScope;
  };
}
