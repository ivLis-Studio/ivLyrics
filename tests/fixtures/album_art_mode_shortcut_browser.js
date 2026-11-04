// Run against settings_hotfix_server; settings, overlay and LP/CD/video modes
// are production components. All playback/account/network APIs remain offline.
async page => {
  const origin = new URL(page.url()).origin, results = [], errors = [];
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error('Open the local Settings fixture');
  page.setDefaultTimeout(7000);
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  const key = 'fullscreen-album-open-lp';
  try {
    for (const [width, height, language] of [[1280, 900, 'en'], [390, 844, 'ko']]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${origin}/?language=${language}&theme=dark&tab=fullscreen`);
      await page.waitForFunction(() => window.settingsFixture?.state.ready);
      await page.evaluate(key => settingsFixture.open('fullscreen', key), key);
      const row = page.locator(`.tab-content.active [data-setting-key="${key}"]`);
      await row.waitFor({ state: 'visible' });
      const toggle = row.getByRole('switch');
      if (await toggle.getAttribute('aria-checked') !== 'true') throw new Error('Default must preserve album shortcuts');
      await toggle.click();
      await page.waitForFunction(key => CONFIG.visual[key] === false && StorageManager.get(`ivLyrics:visual:${key}`) === false, key);
      await page.locator('.settings-search-input').fill(await page.evaluate(() => I18n.t('vinyl.settings.albumClickOpensModeLabel')));
      const result = page.getByRole('option').filter({ has: page.locator('b', { hasText: await page.evaluate(() => I18n.t('vinyl.settings.albumClickOpensModeLabel')) }) });
      await result.waitFor();
      if (await result.count() !== 1) throw new Error('Setting has duplicate/missing search destinations');
      await result.click();
      await row.waitFor({ state: 'visible' });
      if (await toggle.getAttribute('aria-checked') !== 'false') throw new Error('Search navigation lost the persisted choice');
      await page.screenshot({ path: `output/playwright/album-shortcut-setting-${width}.png` });
      await page.evaluate(() => window.ivLyricsCloseConfig(true));
      await page.addScriptTag({ url: origin + '/VinylPlayerMode.js' });
      await page.addScriptTag({ url: origin + '/PlaylistPicker.js' });
      await page.addScriptTag({ url: origin + '/FullscreenOverlay.js' });
      await page.evaluate(() => {
        Object.assign(CONFIG.visual, { 'reduce-motion': true, 'fullscreen-auto-hide-ui': false,
          'fullscreen-show-clock': false, 'fullscreen-show-queue': false, 'fullscreen-show-next-track': false });
        const host = document.createElement('main');
        host.className = 'fullscreen-active';
        host.id = 'album-shortcut-replay';
        host.style.cssText = 'position:fixed;inset:0;background:#15151a;color:white;';
        document.body.append(host);
        const root = ReactDOM.createRoot(host), changes = [];
        let mode = 'standard', revision = 0;
        const art = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#397b81"/><text x="40" y="210" fill="white" font-size="34">ALBUM ART</text></svg>');
        const render = () => ReactDOM.flushSync(() => root.render(React.createElement(window.FullscreenOverlay, {
          isFullscreen: true, presentationMode: mode, lyricsSettingsRevision: revision,
          trackUri: 'spotify:track:offlineSettingsFixture', title: 'Artwork shortcut replay', artist: 'Offline fixture', coverUrl: art,
          onPresentationModeChange: next => { changes.push(next); mode = next; render(); },
        })));
        window.albumShortcutReplay = { get mode() { return mode; }, changes,
          enable(value) { CONFIG.visual['fullscreen-album-open-lp'] = value; revision++; render(); } };
        render();
      });
      const album = () => page.locator('#album-shortcut-replay .clickable-album-container').first();
      await album().click();
      await album().focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space');
      if (await page.evaluate(() => albumShortcutReplay.mode) !== 'standard') throw new Error('Disabled artwork still opens a focused mode');
      if (await album().getAttribute('aria-keyshortcuts') !== 'Shift+F10') throw new Error('Disabled action is advertised to keyboard users');
      const switcher = () => page.locator('#album-shortcut-replay .fullscreen-presentation-switcher');
      const labels = await page.evaluate(() => ({ vinyl: I18n.t('vinyl.presentation.vinylLabel'),
        cd: I18n.t('vinyl.presentation.compactLabel'), video: I18n.t('vinyl.presentation.videoLabel'),
        standard: I18n.t('vinyl.presentation.standardLabel') }));
      for (const [mode, label] of [['vinyl', labels.vinyl], ['compact-vinyl', labels.cd], ['video', labels.video]]) {
        await page.locator('#album-shortcut-replay .fullscreen-presentation-dock').hover();
        await switcher().getByRole('button', { name: label, exact: true }).click();
        await page.waitForFunction(mode => albumShortcutReplay.mode === mode, mode);
        // LP has its active artwork, CD uses the normal album slot. Video has
        // no album, so its existing Standard switcher is the exit route.
        if (mode === 'video') {
          await page.locator('#album-shortcut-replay .fullscreen-presentation-dock').hover();
          await switcher().getByRole('button', { name: labels.standard, exact: true }).click();
        } else {
          await page.locator('#album-shortcut-replay [aria-keyshortcuts="Enter Space Shift+F10"]').first().click();
        }
        await page.waitForFunction(() => albumShortcutReplay.mode === 'standard');
      }
      await page.evaluate(() => albumShortcutReplay.enable(true));
      await album().click();
      await page.waitForFunction(() => albumShortcutReplay.mode === 'vinyl');
      await page.screenshot({ path: `output/playwright/album-shortcut-explicit-lp-${width}.png` });
      results.push({ width, language, savedOff: true, searchDestination: true,
        blockedPointerAndKeys: true, explicitModesAndExit: 3, liveReenable: true });
    }
    if (errors.length) throw new Error('Production renderer errors: ' + errors.join('; '));
    return { passed: results.length, results, errors };
  } finally { page.off('pageerror', onError); }
}
