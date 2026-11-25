export function createCreatorProfileClient({ readLocalStorage, request, translate }) {
  // Parses a creator-profile account API response, throwing with the same message
  // precedence (server error -> localized key -> literal fallback) on failure and
  // returning `data.data` on success. Mirrors the identical validate-and-return
  // tail duplicated across several creator-profile fetch helpers.
  const readCreatorProfileApiResponseData = async (response, failureI18nKey, fallbackMessage) => {
    const data = await response.json();

    if (!response.ok || !data.success || !data.data) {
      throw new Error(
        data.error || translate(failureI18nKey) || fallbackMessage
      );
    }

    return data.data;
  };

  return {
    getCreatorDecorationDefaults() {
      return {
        mode: "solid",
        solidColor: "#1ABC9C",
        gradientStartColor: "#3498DB",
        gradientEndColor: "#9B59B6",
        gradientAngle: 90,
      };
    },

    getCachedDiscordSupportTier(discordId, options = {}) {
      if (!this.isDiscordUserHash(discordId)) return null;
      try {
        const raw = readLocalStorage().getItem("ivLyrics:discord-support-tier-cache");
        const cache = raw ? JSON.parse(raw) : {};
        const entry = cache[String(discordId)];
        if (
          entry &&
          ["none", "supporter", "monthly"].includes(entry.tier) &&
          (options.allowExpired || Number(entry.expiresAt) > Date.now())
        ) {
          return entry;
        }
      } catch (error) {
        console.warn("[ivLyrics] Failed to read Discord supporter cache:", error);
      }
      return null;
    },

    setCachedDiscordSupportTier(discordId, tier) {
      if (!this.isDiscordUserHash(discordId) || !["none", "supporter", "monthly"].includes(tier)) {
        return;
      }
      try {
        const storageKey = "ivLyrics:discord-support-tier-cache";
        const raw = readLocalStorage().getItem(storageKey);
        const cache = raw ? JSON.parse(raw) : {};
        const now = Date.now();
        for (const [key, entry] of Object.entries(cache)) {
          if (!entry || Number(entry.expiresAt) < now - 24 * 60 * 60 * 1000) {
            delete cache[key];
          }
        }
        cache[String(discordId)] = {
          tier,
          expiresAt: now + 60 * 60 * 1000,
        };
        readLocalStorage().setItem(storageKey, JSON.stringify(cache));
      } catch (error) {
        console.warn("[ivLyrics] Failed to update Discord supporter cache:", error);
      }
    },

    async fetchDiscordSupportTier(discordId, options = {}) {
      const normalizedId = String(discordId || "").trim();
      if (!this.isDiscordUserHash(normalizedId)) return "none";

      if (!options.forceRefresh) {
        const cached = this.getCachedDiscordSupportTier(normalizedId);
        if (cached) return cached.tier;
      }

      this._discordSupportTierRequests ||= new Map();
      if (!options.forceRefresh && this._discordSupportTierRequests.has(normalizedId)) {
        return await this._discordSupportTierRequests.get(normalizedId);
      }

      const pending = (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        try {
          const response = await request(
            `https://discord.ivl.is/v1/user/${encodeURIComponent(normalizedId)}`,
            {
              cache: "no-store",
              headers: { Accept: "application/json" },
              signal: controller.signal,
            }
          );
          if (!response.ok) throw new Error(`Discord member lookup failed (${response.status})`);
          const body = await response.json();
          const roleIds = new Set(
            (Array.isArray(body?.data?.roles) ? body.data.roles : []).map((role) => String(role?.id || ""))
          );
          const tier = roleIds.has("1530978173590966282")
            ? "monthly"
            : roleIds.has("1530978124073013478")
              ? "supporter"
              : "none";
          this.setCachedDiscordSupportTier(normalizedId, tier);
          return tier;
        } finally {
          clearTimeout(timeoutId);
        }
      })();

      this._discordSupportTierRequests.set(normalizedId, pending);
      try {
        return await pending;
      } finally {
        if (this._discordSupportTierRequests.get(normalizedId) === pending) {
          this._discordSupportTierRequests.delete(normalizedId);
        }
      }
    },

    async saveOwnCreatorDecoration(decoration) {
      const response = await request(`${this.getAccountApiBase()}/creator-decoration`, {
        method: "PUT",
        cache: "no-store",
        headers: this.getApiHeaders({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(decoration),
      });
      const body = await response.json();
      if (!response.ok || !body?.success) {
        const error = new Error(body?.error || "Failed to save creator decoration.");
        error.status = response.status;
        error.code = body?.code || "";
        throw error;
      }
      return body.data;
    },

    async resetOwnCreatorDecoration() {
      const response = await request(`${this.getAccountApiBase()}/creator-decoration`, {
        method: "DELETE",
        cache: "no-store",
        headers: this.getApiHeaders({ Accept: "application/json" }),
      });
      const body = await response.json();
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || "Failed to reset creator decoration.");
      }
      return body.data;
    },

    async fetchSyncCreatorProfile(userHash, options = {}) {
      if (!userHash || typeof userHash !== "string") {
        throw new Error(
          translate("creatorProfile.loadFailed") || "Failed to load creator profile."
        );
      }

      const params = new URLSearchParams({
        userHash,
      });

      if (Number.isFinite(options.limit) && options.limit > 0) {
        params.set("limit", String(Math.floor(options.limit)));
      }

      if (Number.isFinite(options.offset) && options.offset >= 0) {
        params.set("offset", String(Math.floor(options.offset)));
      }

      if (typeof options.artist === "string" && options.artist.trim()) {
        params.set("artist", options.artist.trim());
      }

      const response = await request(
        `${this.getAccountApiBase()}/creator-profile?${params.toString()}`,
        {
          cache: "no-store",
          headers: this.getApiHeaders({
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          }),
        }
      );
      const data = await response.json();

      if (!response.ok || !data.success || !data.data) {
        const error = new Error(
          data.error ||
            translate("creatorProfile.loadFailed") ||
            "Failed to load creator profile."
        );
        error.status = response.status;
        throw error;
      }

      return data.data;
    },

    async saveOwnNickname(userHash, nickname) {
      const response = await request(`${this.getAccountApiBase()}/nickname`, {
        method: "POST",
        headers: this.getApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ userHash, nickname }),
      });
      const data = await response.json();
      return { ok: response.ok, data };
    },

    async fetchSyncCreatorPrivacy() {
      if (!this.getAuthToken()) {
        throw new Error(
          translate("settingsAdvanced.aboutTab.account.creatorPrivacy.loginRequired") ||
            "Discord login is required to manage creator profile privacy."
        );
      }

      const response = await request(`${this.getAccountApiBase()}/creator-profile/privacy`, {
        cache: "no-store",
        headers: this.getApiHeaders({
          Accept: "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        }),
      });

      return await readCreatorProfileApiResponseData(
        response,
        "settingsAdvanced.aboutTab.account.creatorPrivacy.loadFailed",
        "Failed to load creator profile privacy."
      );
    },

    async setSyncCreatorPrivacy(isPrivate) {
      if (!this.getAuthToken()) {
        throw new Error(
          translate("settingsAdvanced.aboutTab.account.creatorPrivacy.loginRequired") ||
            "Discord login is required to manage creator profile privacy."
        );
      }

      const response = await request(`${this.getAccountApiBase()}/creator-profile/privacy`, {
        method: "PUT",
        cache: "no-store",
        headers: this.getApiHeaders({
          Accept: "application/json",
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        }),
        body: JSON.stringify({ isPrivate: !!isPrivate }),
      });

      return await readCreatorProfileApiResponseData(
        response,
        "settingsAdvanced.aboutTab.account.creatorPrivacy.saveFailed",
        "Failed to update creator profile privacy."
      );
    },

    async fetchSyncCreatorGreetingTranslation(userHash, locale) {
      if (!userHash || typeof userHash !== "string") {
        throw new Error(
          translate("creatorProfile.loadFailed") || "Failed to load creator profile."
        );
      }

      const params = new URLSearchParams({
        userHash,
      });

      if (typeof locale === "string" && locale.trim()) {
        params.set("locale", locale.trim());
      }

      const response = await request(
        `${this.getAccountApiBase()}/creator-profile/greeting-translation?${params.toString()}`,
        {
          cache: "no-store",
          headers: this.getApiHeaders({
            Accept: "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
          }),
        }
      );

      return await readCreatorProfileApiResponseData(
        response,
        "creatorProfile.greetingTranslateFailed",
        "Failed to translate creator greeting."
      );
    },

    async setSyncCreatorGreeting(greeting, options = {}) {
      if (!this.getAuthToken()) {
        throw new Error(
          translate("creatorProfile.greetingLoginRequired") ||
            "Discord login is required to edit your creator profile."
        );
      }

      const response = await request(`${this.getAccountApiBase()}/creator-profile/greeting`, {
        method: "POST",
        headers: this.getApiHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          creatorUserHash: options.creatorUserHash || this.getUserHash(),
          greeting,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success || !data.data) {
        throw new Error(
          data.error ||
            translate("creatorProfile.greetingSaveFailed") ||
            "Failed to update creator greeting."
        );
      }

      return data.data;
    },

    async setSyncCreatorLike(creatorUserHash, liked) {
      if (!this.getAuthToken()) {
        throw new Error(
          translate("creatorProfile.likeLoginRequired") ||
            "Discord login is required to like creators."
        );
      }

      const response = await request(`${this.getAccountApiBase()}/creator-like`, {
        method: "POST",
        headers: this.getApiHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          creatorUserHash,
          liked: !!liked,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success || !data.data) {
        throw new Error(
          data.error ||
            translate("creatorProfile.likeActionFailed") ||
            "Failed to update creator like."
        );
      }

      return data.data;
    },
  };
}
