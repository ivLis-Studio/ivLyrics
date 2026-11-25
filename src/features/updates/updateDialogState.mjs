import { getRuntimeService, publishRuntimeService } from "../../spicetify/runtimeServices.mjs";

const UPDATE_INFO_SERVICE = "ivLyrics_updateInfo";
const UPDATE_DIALOG_EVENT = "ivLyrics:update-dialog-state";

export function getAppUpdateInfo(host) {
  return getRuntimeService(UPDATE_INFO_SERVICE, host);
}

export function setAppUpdateInfo(host, info) {
  publishRuntimeService(UPDATE_INFO_SERVICE, info, host);
  host.dispatchEvent(new host.CustomEvent(UPDATE_DIALOG_EVENT, {
    detail: { open: !!info },
  }));
}

export function subscribeAppUpdateInfo(host, listener) {
  host.addEventListener(UPDATE_DIALOG_EVENT, listener);
  return () => host.removeEventListener(UPDATE_DIALOG_EVENT, listener);
}

export function waitForAppUpdateDialogClose(host) {
  if (!getAppUpdateInfo(host)?.available) return;

  return new Promise(resolve => {
    const unsubscribe = subscribeAppUpdateInfo(host, event => {
      if (event.detail?.open === false) {
        unsubscribe();
        resolve();
      }
    });
  });
}
