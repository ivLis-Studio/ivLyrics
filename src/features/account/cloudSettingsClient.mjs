import { accountSessionChangedError } from "./discordAccountSession.mjs";

export function createCloudSettingsClient({ readLocalStorage, getCrypto, request }) {
  const capabilities = new Map();
  const pendingCapabilities = new Map();
  const assertSession = (account, session) => {
    if (!account.isAccountSessionCurrent(session)) throw accountSessionChangedError();
    if (!session.authToken) {
      throw Object.assign(new Error("Discord login required."), { code: "discord_login_required", status: 401 });
    }
  };

  async function readResponse(account, session, url, options) {
    assertSession(account, session);
    try {
      const response = await request(url, options);
      const body = await response.json().catch(() => ({}));
      assertSession(account, session);
      return { response, body };
    } catch (error) {
      assertSession(account, session);
      throw error;
    }
  }

  return {
    getCloudSaveDeviceId() {
      const storageKey = "ivLyrics:cloud-save-device-id";
      try {
        const stored = readLocalStorage().getItem(storageKey);
        if (stored && /^[A-Za-z0-9._-]{8,128}$/.test(stored)) return stored;
        const value = `pc-${getCrypto()?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
        readLocalStorage().setItem(storageKey, value);
        return value;
      } catch {
        return `pc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
    },

    async requestCloudSaveCapability(scope = "sync", options = {}) {
      const normalizedScope = scope === "delete" ? "delete" : "sync";
      const session = options.session ?? this.captureAccountSession();
      assertSession(this, session);
      if (!options.forceRefresh) {
        const cached = capabilities.get(normalizedScope);
        if (cached && this.isAccountSessionCurrent(cached.session)
          && Number(cached.capability.expiresAt) > Math.floor(Date.now() / 1000) + 60) {
          return cached.capability;
        }
        const pending = pendingCapabilities.get(normalizedScope);
        if (pending && this.isAccountSessionCurrent(pending.session)) return pending.promise;
      }

      const pending = { session };
      pendingCapabilities.set(normalizedScope, pending);
      pending.promise = readResponse(this, session, `${session.apiBase}/cloud-save-token`, {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.authToken}`,
        },
        body: JSON.stringify({ scope: normalizedScope }),
      }).then(({ response, body }) => {
        assertSession(this, session);
        if (!response.ok || !body?.success || !body?.data?.token || !body?.data?.apiBaseUrl) {
          const error = new Error(body?.error?.message || body?.error || "Cloud save authorization failed.");
          error.status = response.status;
          error.code = body?.code || body?.error?.code || "";
          throw error;
        }
        const capability = { ...body.data, scope: normalizedScope };
        if (pendingCapabilities.get(normalizedScope) === pending) {
          capabilities.set(normalizedScope, { session, capability });
        }
        return capability;
      }).finally(() => {
        if (pendingCapabilities.get(normalizedScope) === pending) pendingCapabilities.delete(normalizedScope);
      });
      return pending.promise;
    },

    async requestCloudSettings(method, payload = null, options = {}) {
      const platform = options.platform || "pc";
      const session = options.session ?? this.captureAccountSession();
      const capability = await this.requestCloudSaveCapability(method === "DELETE" ? "delete" : "sync", { session });
      const { response, body } = await readResponse(this, session, `${String(capability.apiBaseUrl).replace(/\/+$/, "")}/settings/${platform}`, {
        method,
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${capability.token}`,
          ...(payload ? { "Content-Type": "application/json" } : {}),
          "X-ivLyrics-Client": "pc",
          "X-ivLyrics-Client-Version": this.currentVersion || "unknown",
        },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      assertSession(this, session);
      if (response.status === 404 && method === "GET") {
        return { exists: false, revision: 0, data: null };
      }
      if (!response.ok || !body?.success) {
        const error = new Error(body?.error?.message || body?.error || "Cloud settings request failed.");
        error.status = response.status;
        error.code = body?.error?.code || body?.code || "";
        error.details = body?.error?.details || null;
        throw error;
      }
      return { exists: true, revision: Number(body.data?.revision || 0), data: body.data };
    },

    fetchCloudSettings(options) {
      return this.requestCloudSettings("GET", null, options);
    },

    saveCloudSettings(settings, baseRevision = 0, options) {
      return this.requestCloudSettings("PUT", {
        schemaVersion: 1,
        baseRevision: Math.max(0, Number(baseRevision) || 0),
        appVersion: this.currentVersion || "unknown",
        deviceId: this.getCloudSaveDeviceId(),
        settings,
      }, options);
    },

    async deleteCloudSettings(options = {}) {
      const session = options.session ?? this.captureAccountSession();
      const result = await this.requestCloudSettings("DELETE", null, { ...options, session });
      assertSession(this, session);
      capabilities.delete("delete");
      return result;
    },
  };
}
