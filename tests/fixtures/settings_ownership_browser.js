// Run with playwright-cli run-code --filename against settings_hotfix_server.mjs.
// Uses production Settings/React/CSS; host APIs and persistence stay offline.
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const origin = new URL(page.url()).origin;
  assert(new URL(origin).hostname === "127.0.0.1", "Use the loopback Settings fixture");
  const results = [];
  const settle = async () => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(async () => Promise.all(
      [...document.querySelectorAll(".ivlyrics-settings-modal-shell")]
        .flatMap(node => node.getAnimations()).map(animation => animation.finished.catch(() => {}))
    ));
  };
  const open = async (tab, setting = null, destination = tab) => {
    await page.evaluate(([tab, setting]) => window.settingsFixture.open(tab, setting), [tab, setting]);
    await page.waitForFunction(tab => document.querySelector(".tab-content.active")?.dataset.tabId === tab, destination);
    await settle();
  };
  const counts = () => page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll(".settings-rail-item")].map(node => [
      node.querySelector(".settings-rail-label").textContent,
      Number(node.querySelector(".settings-rail-count")?.textContent || 0),
    ])
  ));
  const keys = ["performance-frame-rate", "reduce-motion", "karaoke-bounce", "karaoke-line-transition",
    "karaoke-text-effects", "fade-blur", "highlight-mode", "text-shadow-enabled",
    "prefetch-enabled", "prefetch-video-enabled", "prefetch-word-details-enabled"];
  for (const [width, height, language, theme] of [[1440, 900, "en", "dark"], [640, 900, "ko", "light"], [390, 844, "ko", "dark"]]) {
    const label = `${width}-${language}-${theme}`;
    await page.setViewportSize({ width, height });
    await page.goto(`${origin}/?language=${language}&theme=${theme}&tab=performance`);
    await page.waitForFunction(() => window.settingsFixture?.state.ready);
    await settle();
    const labels = await page.evaluate(() => ({
      performance: I18n.t("tabs.performance"), appearance: I18n.t("tabs.appearance"),
      motion: I18n.t("settings.reduceMotion.label"), prefetch: I18n.t("settingsAdvanced.prefetch.enabled.label"),
    }));
    const owners = {};
    // About has no editable controls and intentionally fetches remote patch notes.
    for (const tab of await page.evaluate(() => window.settingsFixture.tabs.filter(tab => tab !== "about"))) {
      await open(tab);
      const visible = await page.locator(".tab-content.active [data-setting-key]").evaluateAll(nodes => [...new Set(
        nodes.map(node => node.dataset.settingKey).filter(key => FIXTURE_RESETTABLE_SETTINGS.has(key))
      )]);
      for (const key of visible) (owners[key] ||= []).push(tab);
    }
    assert(Object.values(owners).every(tabs => tabs.length === 1), `${label}: duplicate editors ${JSON.stringify(owners)}`);
    for (const key of keys) assert(JSON.stringify(owners[key]) === '["performance"]', `${label}: ${key} has wrong owner`);
    await open("performance");
    const baseline = await counts();
    for (let index = 0; index < keys.length; index++) {
      const row = page.locator(`.tab-content.active [data-setting-key="${keys[index]}"]`);
      if (keys[index] === "performance-frame-rate") await row.getByRole("button", { name: "120", exact: true }).click();
      else await row.getByRole("switch").click();
      await settle();
      const changed = await counts();
      for (const [tab, count] of Object.entries(baseline)) {
        assert(changed[tab] === count + (tab === labels.performance ? index + 1 : 0), `${label}: ${keys[index]} changed ${tab} count`);
      }
    }
    await page.locator(".settings-changed-chip").click();
    await page.waitForSelector('.tab-content[data-tab-id="changed"]');
    const groups = await page.locator(".settings-changed-menu").evaluateAll(nodes => nodes.map(node => ({
      title: node.querySelector(".settings-changed-menu-title").textContent.trim(),
      keys: [...node.querySelectorAll("[data-setting-key]")].map(row => row.dataset.settingKey),
    })));
    for (const key of keys) {
      assert(groups.filter(group => group.keys.includes(key)).length === 1 &&
        groups.find(group => group.keys.includes(key)).title === labels.performance, `${label}: changed list misfiles ${key}`);
    }
    await page.locator('[data-setting-key="reduce-motion"] .settings-jump-link').click();
    await page.waitForSelector('.tab-content.active[data-tab-id="performance"]');
    await page.locator(".settings-changed-chip").click();
    for (const key of keys) {
      const row = page.locator(`.tab-content.active [data-setting-key="${key}"]`);
      if (key === "performance-frame-rate") await row.locator(".settings-reset-btn").click();
      else await row.getByRole("switch").click();
      await settle();
    }
    assert(JSON.stringify(await counts()) === JSON.stringify(baseline), `${label}: reset did not restore menu counts`);
    const publishConfig = (values) => page.evaluate((values) => {
      Object.assign(CONFIG.visual, values);
      for (const [name, value] of Object.entries(values)) {
        window.dispatchEvent(new CustomEvent("ivLyrics", { detail: { type: "config", name, value } }));
      }
    }, values);
    const first = "prefetch-video-enabled", second = "prefetch-word-details-enabled";
    const changedRow = key => page.locator(`.tab-content[data-tab-id="changed"] [data-setting-key="${key}"]`);
    await publishConfig({ [first]: false });
    await changedRow(first).waitFor();
    const previousCounts = await counts();
    await publishConfig({ [first]: true, [second]: false });
    await changedRow(second).waitFor();
    assert(await changedRow(first).count() === 0, `${label}: an old changed row remains after a same-count preset`);
    assert(JSON.stringify(await counts()) === JSON.stringify(previousCounts), `${label}: a same-count preset changed menu counts`);
    await publishConfig({ [second]: true });
    await changedRow(second).waitFor({ state: "detached" });
    for (const [text, key] of [[labels.motion, "reduce-motion"], [labels.prefetch, "prefetch-enabled"]]) {
      const search = page.locator(".settings-search-input");
      await search.fill(text);
      const option = page.getByRole("group", { name: labels.performance, exact: true })
        .getByRole("option").filter({ has: page.locator("b", { hasText: text }) });
      await option.waitFor();
      assert(await option.count() === 1, `${label}: duplicate search destination for ${key}`);
      await option.click();
      await page.waitForSelector('.tab-content.active[data-tab-id="performance"]');
      await page.waitForSelector(`.tab-content.active [data-setting-key="${key}"].setting-highlight-flash`);
    }
    await open("appearance", "reduce-motion", "performance");
    await open("lyrics", "prefetch", "performance");
    const beforeVideo = await page.evaluate(() => JSON.stringify(CONFIG.visual));
    await page.locator('[data-setting-key="video-background-settings"] button').click();
    await page.waitForSelector('.tab-content.active[data-tab-id="appearance"]');
    assert(await page.evaluate(() => JSON.stringify(CONFIG.visual)) === beforeVideo, `${label}: video shortcut mutated config`);
    await page.locator('.tab-content.active [data-setting-key="video-background"]').click();
    await settle();
    const videoCounts = await counts();
    assert(videoCounts[labels.performance] === baseline[labels.performance], `${label}: video counts as Performance editor`);
    assert(await page.evaluate(() => window.ivLyricsGetCurrentSettingsBackgroundMode()) === "video-background", `${label}: video preset did not save`);
    await page.locator(".settings-changed-chip").click();
    // Keep the CLI's native-dialog interception from pausing this batch.
    await page.evaluate(() => { window.confirm = () => true; });
    await page.locator(".settings-changed-tools button").click();
    await settle();
    assert(await page.evaluate(() => window.ivLyricsGetCurrentSettingsBackgroundMode()) === "gradient-background", `${label}: background reset lost default`);
    await open("performance", "video-background", "appearance");
    await open("performance");
    const metrics = await page.evaluate(() => {
      const content = document.querySelector(".settings-content");
      return { overflow: content.scrollWidth - content.clientWidth,
        errors: window.settingsFixture.state.errors, network: window.settingsFixture.state.blockedNetwork,
        rows: [...document.querySelectorAll(".tab-content.active [data-setting-key]")].map(node => node.dataset.settingKey),
      };
    });
    assert(metrics.overflow <= 1, `${label}: horizontal overflow`);
    assert(metrics.errors.length === 0 && metrics.network.length === 0, `${label}: runtime or network error ${JSON.stringify(metrics)}`);
    await page.screenshot({ path: `output/playwright/settings-ownership-${label}.png` });
    results.push({ label, uniqueVisibleSettings: Object.keys(owners).length, editedAndReset: keys.length, ...metrics });
  }
  console.log(JSON.stringify({ settingsOwnership: results }));
  return results;
}
