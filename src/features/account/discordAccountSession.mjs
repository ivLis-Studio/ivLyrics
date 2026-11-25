import { queueSettingsReturn, requestAppRouteReload } from "#ivlyrics/spicetify/routeReload.mjs";

const IV_LYRICS_DISCORD_LOGIN_PENDING_KEY = "ivLyrics:discord-login-pending";
const IV_LYRICS_DISCORD_LOGIN_PENDING_TTL_MS = 10 * 60 * 1000;
const IV_LYRICS_DISCORD_CLIENT_NONCE_REGEX = /^[A-Za-z0-9_-]{43,128}$/;

const accountSettingsDestination = (options) => ({
  initialTab: options.initialTab || "about",
  initialSettingKey: options.initialSettingKey || "about-account",
});

export function accountSessionChangedError() {
  return Object.assign(new Error("Discord account changed during the request."), { code: "account_session_changed" });
}

export function createDiscordAccountSession({
  host, spicetify, readStorage, readLocalStorage, readLyricsService,
  invalidateSyncCache, request, translate, toast, now = () => Date.now(),
}) {
  // Successful checks are reusable only within the same short submission operation.
  const discordAuthOperations = new WeakMap();
  const discordCallbacksInFlight = new Set();
  const DISCORD_AUTH_OPERATION_MAX_AGE_MS = 30_000;
  let sessionRevision = 0;
  let loginAttemptRevision = 0;

  function isPendingLoginCurrent(account, clientNonce) {
    const pending = account.getPendingDiscordLogin();
    return !!pending && account.constantTimeStringEqual(pending.clientNonce, clientNonce);
  }

  function announceAccountChange(detail) {
    invalidateSyncCache();
    host.dispatchEvent(new host.CustomEvent("ivLyrics:account-changed", { detail }));
  }

  return {
    /**
     * 사용자 해시 가져오기 (없으면 생성)
     */
    getUserHash() {
      const lyricsService = readLyricsService();
      if (lyricsService?.getUserHash) {
        return lyricsService.getUserHash();
      }
      // Fallback logic in case LyricsService is not available (should not happen usually)
      let hash = readStorage().getPersisted("ivLyrics:user-hash");
      if (!hash) {
        hash = this.generateUserHash();
        readStorage().setPersisted("ivLyrics:user-hash", hash);
      }
      return hash;
    },

    generateUserHash() {
      return host.crypto.randomUUID
        ? host.crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
    },

    generateDiscordClientNonce() {
      const bytes = new Uint8Array(32);
      host.crypto.getRandomValues(bytes);
      return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    },

    isValidDiscordClientNonce(clientNonce) {
      return (
        typeof clientNonce === "string" &&
        IV_LYRICS_DISCORD_CLIENT_NONCE_REGEX.test(clientNonce)
      );
    },

    constantTimeStringEqual(left, right) {
      const leftBytes = new TextEncoder().encode(typeof left === "string" ? left : "");
      const rightBytes = new TextEncoder().encode(typeof right === "string" ? right : "");
      const maxLength = Math.max(leftBytes.length, rightBytes.length);
      let difference = leftBytes.length ^ rightBytes.length;

      for (let index = 0; index < maxLength; index += 1) {
        difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
      }

      return difference === 0;
    },

    setPendingDiscordLogin(clientNonce) {
      if (!this.isValidDiscordClientNonce(clientNonce)) {
        throw new Error("Invalid Discord login client nonce.");
      }

      loginAttemptRevision++;
      const pending = JSON.stringify({
        clientNonce,
        expiresAt: now() + IV_LYRICS_DISCORD_LOGIN_PENDING_TTL_MS,
      });

      try {
        spicetify?.LocalStorage?.set?.(IV_LYRICS_DISCORD_LOGIN_PENDING_KEY, pending);
      } catch (error) {
        console.error("[ivLyrics] Failed to store pending Discord login:", error);
      }

      try {
        readStorage()?.setPersisted?.(IV_LYRICS_DISCORD_LOGIN_PENDING_KEY, pending);
      } catch (error) {
        console.error("[ivLyrics] Failed to persist pending Discord login:", error);
      }

      return { clientNonce, expiresAt: JSON.parse(pending).expiresAt };
    },

    getPendingDiscordLogin() {
      const candidates = [];

      try {
        candidates.push(
          spicetify?.LocalStorage?.get?.(IV_LYRICS_DISCORD_LOGIN_PENDING_KEY) || null
        );
      } catch (error) {
        console.error("[ivLyrics] Failed to read pending Discord login:", error);
      }

      try {
        candidates.push(
          readStorage()?.getPersisted?.(IV_LYRICS_DISCORD_LOGIN_PENDING_KEY) || null
        );
      } catch (error) {
        console.error("[ivLyrics] Failed to read persisted Discord login:", error);
      }

      for (const rawValue of candidates) {
        if (!rawValue || typeof rawValue !== "string") continue;
        try {
          const pending = JSON.parse(rawValue);
          if (
            this.isValidDiscordClientNonce(pending?.clientNonce) &&
            Number.isFinite(Number(pending?.expiresAt)) &&
            Number(pending.expiresAt) > now()
          ) {
            return {
              clientNonce: pending.clientNonce,
              expiresAt: Number(pending.expiresAt),
            };
          }
        } catch (error) {
          console.error("[ivLyrics] Failed to parse pending Discord login:", error);
        }
      }

      this.clearPendingDiscordLogin();
      return null;
    },

    clearPendingDiscordLogin(expectedClientNonce = null) {
      if (expectedClientNonce) {
        const current = this.getPendingDiscordLogin();
        if (
          current &&
          !this.constantTimeStringEqual(current.clientNonce, expectedClientNonce)
        ) {
          return false;
        }
      }

      try {
        spicetify?.LocalStorage?.remove?.(IV_LYRICS_DISCORD_LOGIN_PENDING_KEY);
      } catch (error) {
        console.error("[ivLyrics] Failed to clear pending Discord login:", error);
      }

      try {
        readStorage()?.setPersisted?.(IV_LYRICS_DISCORD_LOGIN_PENDING_KEY, "");
      } catch (error) {
        console.error("[ivLyrics] Failed to clear persisted Discord login:", error);
      }

      return true;
    },

    isDiscordUserHash(userHash) {
      return typeof userHash === "string" && /^\d{15,22}$/.test(userHash.trim());
    },

    setUserHash(userHash) {
      if (!userHash || typeof userHash !== "string") return;
      sessionRevision++;

      try {
        spicetify?.LocalStorage?.set?.("ivLyrics:user-hash", userHash);
      } catch (error) {
        console.error("[ivLyrics] Failed to update Spicetify user hash:", error);
      }

      try {
        readStorage()?.setPersisted?.("ivLyrics:user-hash", userHash);
      } catch (error) {
        console.error("[ivLyrics] Failed to update persisted user hash:", error);
      }
    },

    getAuthToken() {
      let token = null;

      try {
        token = spicetify?.LocalStorage?.get?.("ivLyrics:auth-token") || null;
      } catch (error) {
        console.error("[ivLyrics] Failed to read auth token from Spicetify storage:", error);
      }

      if (!token) {
        try {
          token = readStorage()?.getPersisted?.("ivLyrics:auth-token") || null;
        } catch (error) {
          console.error("[ivLyrics] Failed to read auth token from persisted storage:", error);
        }
      }

      return typeof token === "string" && token.trim() ? token.trim() : null;
    },

    setAuthToken(token) {
      if (!token || typeof token !== "string") return;
      sessionRevision++;

      try {
        spicetify?.LocalStorage?.set?.("ivLyrics:auth-token", token);
      } catch (error) {
        console.error("[ivLyrics] Failed to store auth token in spicetify storage:", error);
      }

      try {
        readStorage()?.setPersisted?.("ivLyrics:auth-token", token);
      } catch (error) {
        console.error("[ivLyrics] Failed to store auth token in persisted storage:", error);
      }
    },

    clearAuthToken() {
      sessionRevision++;
      try {
        spicetify?.LocalStorage?.remove?.("ivLyrics:auth-token");
      } catch (error) {
        console.error("[ivLyrics] Failed to clear auth token from Spicetify storage:", error);
      }

      try {
        readStorage()?.setPersisted?.("ivLyrics:auth-token", "");
      } catch (error) {
        console.error("[ivLyrics] Failed to clear auth token from persisted storage:", error);
      }
    },

    getApiHeaders(headers = {}) {
      const nextHeaders = { ...headers };
      const authToken = this.getAuthToken();
      if (authToken) {
        nextHeaders.Authorization = `Bearer ${authToken}`;
      }
      return nextHeaders;
    },

    queueReturnToSettings(options = {}) {
      try {
        queueSettingsReturn(readLocalStorage(), accountSettingsDestination(options));
      } catch (error) {
        console.error("[ivLyrics] Failed to queue return-to-settings state:", error);
      }
    },

    restoreAccountSettings(options = {}) {
      requestAppRouteReload({
        host,
        getStorage: readLocalStorage,
        getHistory: () => spicetify?.Platform?.History,
        settingsReturn: accountSettingsDestination(options),
        delay: Number(options.reloadDelay) || 300,
      });

      return true;
    },

    resetUserHash() {
      const nextUserHash = this.generateUserHash();
      this.setUserHash(nextUserHash);
      this.clearAuthToken();
      this.clearPendingDiscordLogin();
      return nextUserHash;
    },

    getAccountApiBase() {
      return "https://lyrics.api.ivl.is/user";
    },

    captureAccountSession() {
      return {
        revision: sessionRevision,
        authToken: this.getAuthToken(),
        userHash: this.getUserHash(),
        apiBase: this.getAccountApiBase(),
      };
    },

    isAccountSessionCurrent(session) {
      return session?.revision === sessionRevision
        && session.authToken === this.getAuthToken()
        && session.userHash === this.getUserHash()
        && session.apiBase === this.getAccountApiBase();
    },

    async fetchAccountProfile(options = {}) {
      const includeUserHash = options.includeUserHash !== false;
      const session = this.captureAccountSession();
      const { userHash: currentUserHash, authToken } = session;

      if (includeUserHash && this.isDiscordUserHash(currentUserHash) && !authToken) {
        return {
          success: true,
          authenticated: false,
          linked: false,
          account: null,
          nickname: null,
          userHash: currentUserHash,
          staleDiscordSession: true,
        };
      }

      const requestUrl = new URL(`${session.apiBase}/profile`);
      if (includeUserHash) {
        requestUrl.searchParams.set("userHash", currentUserHash);
      }

      const response = await request(
        requestUrl.toString(),
        {
          cache: "no-store",
          headers: this.getApiHeaders({
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          }),
        }
      );
      const data = await response.json();
      if (!this.isAccountSessionCurrent(session)) throw accountSessionChangedError();

      if (!response.ok) {
        const errorMessage =
          data.error ||
            translate("settingsAdvanced.aboutTab.account.loadFailed") ||
            "Failed to load account information.";

        if (
          includeUserHash &&
          this.isDiscordUserHash(currentUserHash) &&
          (response.status === 400 || response.status === 401) &&
          /(?:valid userhash|discord login is required)/i.test(errorMessage)
        ) {
          this.clearAuthToken();
          return {
            success: true,
            authenticated: false,
            linked: false,
            account: null,
            nickname: null,
            userHash: currentUserHash,
            staleDiscordSession: true,
          };
        }

        const error = new Error(errorMessage);
        error.status = response.status;
        error.data = data;
        throw error;
      }

      return data;
    },

    async requireDiscordAuth(message, options = {}) {
      const checkingMessage = options.checkingMessage;
      const showProgress = !!checkingMessage && !!toast?.progress;
      const loginRequiredMessage =
        message || translate("settingsAdvanced.aboutTab.account.loginRequired");

      if (showProgress) {
        toast.progress(checkingMessage, 0);
      }

      const operation = options.operation && typeof options.operation === "object" ? options.operation : null;
      const session = this.captureAccountSession();
      try {
        if (!session.authToken) {
          throw new Error(loginRequiredMessage);
        }

        const verified = operation ? discordAuthOperations.get(operation) : null;
        if (verified && this.isAccountSessionCurrent(verified.session)
          && now() - verified.checkedAt < DISCORD_AUTH_OPERATION_MAX_AGE_MS) {
          return verified.profile;
        }
        if (operation) discordAuthOperations.delete(operation);
        const profile = await this.fetchAccountProfile({ includeUserHash: false });
        if (!this.isAccountSessionCurrent(session)) {
          throw new Error(loginRequiredMessage);
        }
        if (!profile?.authenticated || !profile?.linked || !profile?.account) {
          throw new Error(loginRequiredMessage);
        }

        if (operation) {
          discordAuthOperations.set(operation, { session, profile, checkedAt: now() });
        }
        return profile;
      } catch (error) {
        if (operation) discordAuthOperations.delete(operation);
        if (error?.code === "account_session_changed") throw new Error(loginRequiredMessage);
        if (error?.status === 400 || error?.status === 401 || error?.status === 404) {
          if (this.isAccountSessionCurrent(session)) this.clearAuthToken();
          throw new Error(loginRequiredMessage);
        }
        throw error;
      } finally {
        if (showProgress && toast?.dismissProgress) {
          toast.dismissProgress();
        }
      }
    },

    promptDiscordLoginRequired(message, options = {}) {
      const text = message || translate("settingsAdvanced.aboutTab.account.loginRequired");

      toast?.error?.(text);
      this.restoreAccountSettings({
        initialTab: "about",
        initialSettingKey: "about-account",
        reloadDelay: options.reloadDelay || 900,
      });

      return text;
    },

    async startDiscordLogin(options = {}) {
      let currentUserHash = this.getUserHash();

      if (this.isDiscordUserHash(currentUserHash) && !this.getAuthToken()) {
        currentUserHash = this.resetUserHash();
        announceAccountChange({ linked: false, userHash: currentUserHash, staleDiscordSession: true });
      }

      const clientNonce = this.generateDiscordClientNonce();
      this.setPendingDiscordLogin(clientNonce);
      const session = this.captureAccountSession();

      let response;
      let data;
      try {
        response = await request(`${this.getAccountApiBase()}/discord/start`, {
          method: "POST",
          headers: this.getApiHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ currentUserHash, clientNonce }),
        });
        data = await response.json();
      } catch (error) {
        if (!isPendingLoginCurrent(this, clientNonce)) return null;
        this.clearPendingDiscordLogin(clientNonce);
        if (!this.isAccountSessionCurrent(session)) return null;
        throw error;
      }

      if (!isPendingLoginCurrent(this, clientNonce)) return null;
      if (!this.isAccountSessionCurrent(session)) {
        this.clearPendingDiscordLogin(clientNonce);
        return null;
      }
      if (!response.ok || !data.success || !data.authorizeUrl) {
        const errorMessage =
          data.error ||
            translate("settingsAdvanced.aboutTab.account.failed") ||
            "Discord login failed.";

        if (
          options.retryOnStaleDiscordHash !== false &&
          response.status === 401 &&
          this.isDiscordUserHash(currentUserHash) &&
          /discord login is required.*discord account id/i.test(errorMessage)
        ) {
          this.clearPendingDiscordLogin(clientNonce);
          const nextUserHash = this.resetUserHash();
          announceAccountChange({ linked: false, userHash: nextUserHash, staleDiscordSession: true });
          return this.startDiscordLogin({ ...options, retryOnStaleDiscordHash: false });
        }

        this.clearPendingDiscordLogin(clientNonce);
        throw new Error(errorMessage);
      }

      host.open(data.authorizeUrl, "_blank", "noopener,noreferrer");
      return data;
    },

    async handleDiscordAuthCallback(loginToken) {
      if (!loginToken) return false;

      const pendingLogin = this.getPendingDiscordLogin();
      if (!pendingLogin) {
        toast?.error?.(
          translate("settingsAdvanced.aboutTab.account.failed") ||
            "Discord login failed."
        );
        return false;
      }

      if (discordCallbacksInFlight.has(loginToken)) {
        return false;
      }
      const session = this.captureAccountSession();
      discordCallbacksInFlight.add(loginToken);
      const isCurrent = () => this.isAccountSessionCurrent(session)
        && isPendingLoginCurrent(this, pendingLogin.clientNonce);

      try {
        const response = await request(
          `${this.getAccountApiBase()}/discord/session?loginToken=${encodeURIComponent(loginToken)}`,
          {
            cache: "no-store",
            headers: this.getApiHeaders({
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
            }),
          }
        );
        const data = await response.json();
        if (!isCurrent()) return false;

        if (!response.ok || !data.success) {
          throw new Error(
            data.error ||
              translate("settingsAdvanced.aboutTab.account.failed") ||
              "Discord login failed."
          );
        }

        const newUserHash = data.data?.userHash || data.data?.discordId;
        const authToken = data.data?.authToken;
        const returnedClientNonce = data.data?.clientNonce;
        if (
          !this.isDiscordUserHash(newUserHash) ||
          typeof authToken !== "string" || !authToken.trim() ||
          !this.isValidDiscordClientNonce(returnedClientNonce) ||
          !this.constantTimeStringEqual(
            pendingLogin.clientNonce,
            returnedClientNonce
          )
        ) {
          throw new Error(
            translate("settingsAdvanced.aboutTab.account.failed") ||
              "Discord login failed."
          );
        }

        this.setUserHash(newUserHash);
        this.setAuthToken(authToken);
        this.clearPendingDiscordLogin(pendingLogin.clientNonce);
        const { authToken: _authToken, clientNonce: _clientNonce, ...accountDetail } = data.data;
        announceAccountChange(accountDetail);

        toast?.success?.(
          translate("settingsAdvanced.aboutTab.account.discordLoginSuccess") ||
            "Discord account linked successfully."
        );

        this.restoreAccountSettings({
          initialTab: "about",
          initialSettingKey: "about-account",
        });

        return true;
      } catch (error) {
        if (!isCurrent()) return false;
        toast?.error?.(
          error.message ||
            translate("settingsAdvanced.aboutTab.account.failed") ||
            "Discord login failed."
        );
        return false;
      } finally {
        discordCallbacksInFlight.delete(loginToken);
      }
    },

    async logoutDiscordSession({ resetIdentity = false } = {}) {
      const session = this.captureAccountSession();
      const pendingNonce = this.getPendingDiscordLogin()?.clientNonce;
      const loginRevision = loginAttemptRevision;
      const isCurrent = () => {
        if (!this.isAccountSessionCurrent(session) || loginAttemptRevision !== loginRevision) return false;
        const currentNonce = this.getPendingDiscordLogin()?.clientNonce;
        return !currentNonce || currentNonce === pendingNonce;
      };
      const finish = () => {
        if (!isCurrent()) return false;
        if (resetIdentity) {
          const userHash = this.resetUserHash();
          announceAccountChange({ linked: false, userHash });
        } else if (session.authToken) {
          this.clearAuthToken();
        }
        return true;
      };
      if (!session.authToken) return finish();

      let response;
      try {
        response = await request(`${this.getAccountApiBase()}/logout`, {
          method: "POST",
          headers: this.getApiHeaders({
            "Content-Type": "application/json",
          }),
        });
      } catch (error) {
        if (!isCurrent()) return false;
        console.error("[ivLyrics] Failed to revoke Discord session:", error);
        throw error;
      }

      if (response.ok || response.status === 401 || response.status === 403) {
        return finish();
      }

      let data = null;
      try {
        data = await response.json();
      } catch {
        // A non-JSON response still reports the HTTP status below.
      }
      if (!isCurrent()) return false;

      const error = new Error(
        data?.error ||
          data?.message ||
          translate("settingsAdvanced.aboutTab.account.logoutFailed") ||
          "Failed to sign out from Discord."
      );
      error.status = response.status;
      error.data = data;
      throw error;
    },
  };
}
