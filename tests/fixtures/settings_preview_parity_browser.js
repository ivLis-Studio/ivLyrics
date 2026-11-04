// Compare the production Settings preview with the real FullscreenOverlay.
// All playback/account/network APIs remain the offline fixture's stubs.
async page => {
  const origin = new URL(page.url()).origin;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error('Use settings_hotfix_server');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  page.setDefaultTimeout(7000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${origin}/?language=en&theme=dark&tab=fullscreen`);
  await page.waitForFunction(() => settingsFixture.state.ready);
  await page.addScriptTag({ url: origin + '/VinylPlayerMode.js' });
  await page.addScriptTag({ url: origin + '/PlaylistPicker.js' });
  await page.addScriptTag({ url: origin + '/FullscreenOverlay.js' });
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-1600px;top:0;width:1280px;height:800px;';
    const container = document.createElement('div');
    container.id = 'preview-parity-runtime';
    container.className = 'lyrics-lyricsContainer-LyricsContainer fullscreen-active fullscreen-page-ui';
    container.style.cssText = 'position:absolute;inset:0;width:1280px;height:800px;';
    host.append(container); document.body.append(host);
    const root = ReactDOM.createRoot(container);
    const art = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#557784"/></svg>');
    Object.assign(Spicetify.Player.data.item.metadata, { title: 'Sample song', artist_name: 'Sample artist', album_title: 'Sample album', image_url: art });
    Spicetify.Player.data.context = { metadata: { context_description: 'Sample playlist', image_url: art } };
    Spicetify.Player.getProgress = () => 179000;
    Spicetify.Queue = { prevTracks: [], nextTracks: [{ contextTrack: { uri: 'spotify:track:nextSample',
      metadata: { title: 'Next sample', artist_name: 'Sample artist', image_url: art } } }] };
    let revision = 0;
    window.previewParityRuntime = { render(view) {
      container.classList.toggle('layout-reversed', CONFIG.visual['fullscreen-layout-reverse'] === true);
      container.classList.toggle('fullscreen-single-column', CONFIG.visual['fullscreen-two-column'] === false);
      container.classList.toggle('tv-mode-active', view === 'tv');
      ReactDOM.flushSync(() => root.render(React.createElement(FullscreenOverlay, { isFullscreen: true,
        coverUrl: art, title: 'Sample song', artist: 'Sample artist', currentLyricIndex: 3, totalLyrics: 12,
        activeLyric: 'Sample lyrics', trackUri: 'spotify:track:offlineSettingsFixture', lyricsSettingsRevision: ++revision,
        presentationMode: view === 'cd' ? 'compact-vinyl' : view === 'vinyl' ? 'vinyl' : 'standard' })));
    }, cleanup() { root.unmount(); host.remove(); } };
  });
  const stage = page.locator('.settings-fs-stage');
  const cases = [
    ['default', 'basic', {}],
    ['progress-only', 'basic', { 'fullscreen-show-controls': false }],
    ['no-progress', 'basic', { 'fullscreen-show-progress': false }],
    ['no-volume', 'basic', { 'fullscreen-show-volume': false }],
    ['no-album', 'normal', { 'fullscreen-show-album': false }],
    ['no-info', 'normal', { 'fullscreen-show-info': false }],
    ['no-album-name', 'normal', { 'fullscreen-show-album-name': false }],
    ['reverse', 'normal', { 'fullscreen-layout-reverse': true }],
    ['single-column', 'normal', { 'fullscreen-two-column': false }],
    ['bottom', 'normal', { 'fullscreen-controls-position': 'bottom' }],
    ['overlays-off', 'basic', { 'fullscreen-show-clock': false, 'fullscreen-show-context': false,
      'fullscreen-show-next-track': false, 'fullscreen-show-queue': false }],
    ['lyric-progress', 'basic', { 'fullscreen-show-lyrics-progress': true }],
    ['tv-default', 'tv', { 'fullscreen-tv-mode': true }],
    ['tv-progress', 'tv', { 'fullscreen-tv-mode': true, 'fullscreen-tv-show-progress': true, 'fullscreen-show-progress': false }],
    ['tv-controls', 'tv', { 'fullscreen-tv-mode': true, 'fullscreen-tv-show-controls': true, 'fullscreen-show-controls': false }],
    ['tv-name-off', 'tv', { 'fullscreen-tv-mode': true, 'fullscreen-tv-show-album-name': false }],
    ['cd', 'cd', {}], ['cd-art-off', 'cd', { 'fullscreen-show-album': false }],
    ['cd-reversed', 'cd', { 'fullscreen-layout-reverse': true }],
    ['lp', 'vinyl', {}], ['lp-progress-only', 'vinyl', { 'fullscreen-show-controls': false }],
    ['lp-progress-off', 'vinyl', { 'fullscreen-show-progress': false }],
  ];
  const results = [];
  try {
    for (const [label, view, patch] of cases) {
      await page.evaluate(patch => settingsFixture.setConfig({ ...settingsFixture.defaults,
        'fullscreen-controls-position': 'left-panel', 'fullscreen-auto-hide-ui': false,
        'fullscreen-clock-show-seconds': true, ...patch }), patch);
      await page.evaluate(() => settingsFixture.open('fullscreen'));
      const index = ['basic', 'normal', 'tv', 'cd', 'vinyl'].indexOf(view);
      await page.locator('.settings-page-head [role="radiogroup"]').first().getByRole('radio').nth(index).click();
      await stage.waitFor();
      await page.evaluate(view => previewParityRuntime.render(view), view);
      const pairs = [
        ['.settings-fs-progress', '.fullscreen-progress-bar, .fullscreen-tv-progress-bar, .fullscreen-stage-controls-progress'],
        ['.settings-fs-controls', '.fullscreen-player-controls, .fullscreen-tv-controls, .fullscreen-stage-controls-buttons'],
        ['.settings-fs-volume', '.fullscreen-volume-wrapper'],
        ['.settings-fs-clock', '.fullscreen-clock'],
        ['.settings-fs-context', '.fullscreen-context-info'],
        ['.settings-fs-queue', '.fullscreen-queue-wrapper'],
        ['.settings-fs-lprog', '.fullscreen-lyrics-progress'],
        ['.settings-fs-next', '.fullscreen-next-track'],
      ];
      if (view !== 'vinyl') pairs.push(
        ['.settings-fs-album, .settings-fs-cd', '.lyrics-fullscreen-album-container, .fullscreen-tv-album-wrapper'],
        ['.settings-fs-info', '.lyrics-fullscreen-track-info, .fullscreen-tv-track-info'],
        ['.settings-fs-info em', '.lyrics-fullscreen-album-name, .fullscreen-tv-album-name']);
      for (const [previewSelector, runtimeSelector] of pairs) {
        try {
          await page.waitForFunction(([previewSelector, runtimeSelector]) =>
            document.querySelector('.settings-fs-stage').querySelectorAll(previewSelector).length ===
            document.getElementById('preview-parity-runtime').querySelectorAll(runtimeSelector).length,
          [previewSelector, runtimeSelector]);
        } catch (error) { throw new Error(`${label}: ${previewSelector} differs from ${runtimeSelector}: ${error.message}`); }
      }
      await stage.evaluate(async node => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await Promise.all(node.getAnimations({ subtree: true }).filter(animation =>
          animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
      });
      const details = await page.evaluate(() => {
        const preview = document.querySelector('.settings-fs-stage'), runtime = document.getElementById('preview-parity-runtime');
        const quadrant = (host, selector) => {
          const element = host.querySelector(selector);
          if (!element) return null;
          const box = element.getBoundingClientRect(), parent = host.getBoundingClientRect();
          const x = (box.left + box.right - parent.left - parent.right) / 2 / parent.width;
          const y = (box.top + box.bottom - parent.top - parent.bottom) / 2 / parent.height;
          // With album art hidden, the in-column timeline sits near the
          // center. Font metrics and content-fit controls can put it a few
          // percent either side of the midpoint; that is not a new corner.
          return [Math.abs(x) < .04 ? 'center' : x < 0 ? 'left' : 'right',
            Math.abs(y) < .04 ? 'center' : y < 0 ? 'top' : 'bottom'].join('-');
        };
        const centerY = (host, selector) => {
          const element = host.querySelector(selector);
          if (!element) return null;
          const box = element.getBoundingClientRect(), parent = host.getBoundingClientRect();
          return ((box.top + box.bottom) / 2 - parent.top) / parent.height;
        };
        return { clock: [quadrant(preview, '.settings-fs-clock'), quadrant(runtime, '.fullscreen-clock')],
          context: [quadrant(preview, '.settings-fs-context'), quadrant(runtime, '.fullscreen-context-info')],
          lyricProgress: [quadrant(preview, '.settings-fs-lprog'), quadrant(runtime, '.fullscreen-lyrics-progress')],
          transport: [quadrant(preview, '.settings-fs-progress'), quadrant(runtime, '.fullscreen-progress-bar, .fullscreen-tv-progress-bar, .fullscreen-stage-controls-progress')],
          transportCenterY: [centerY(preview, '.settings-fs-progress'), centerY(runtime, '.fullscreen-progress-bar, .fullscreen-tv-progress-bar, .fullscreen-stage-controls-progress')],
          previewMode: preview.dataset.previewMode };
      });
      for (const key of ['clock', 'context', 'lyricProgress', 'transport']) {
        assert(details[key][0] === details[key][1], `${label}: ${key} in a different corner ${JSON.stringify(details)}`);
      }
      if (label === 'single-column') {
        const center = await stage.evaluate(node => {
          const box = node.getBoundingClientRect(), lyrics = node.querySelector('.settings-fs-col-lyrics').getBoundingClientRect();
          return ((lyrics.top + lyrics.bottom) / 2 - box.top) / box.height;
        });
        assert(Math.abs(center - .5) < .03, `single-column lyrics are not centered: ${center}`);
      }
      if (['default', 'progress-only', 'reverse', 'tv-progress', 'cd', 'lp'].includes(label)) {
        await page.screenshot({ path: `output/playwright/settings-preview-parity-${label}.png` });
      }
      results.push({ label, view, ...details });
    }
    // Exercise actual settings inputs, not just fixture changes.
    await page.evaluate(() => { settingsFixture.setConfig({ ...settingsFixture.defaults, 'fullscreen-controls-position': 'left-panel' });
      settingsFixture.open('fullscreen', 'fullscreen-show-progress'); });
    const row = key => page.locator(`.tab-content.active [data-setting-key="${key}"]`);
    await row('fullscreen-show-progress').getByRole('switch').click();
    await page.waitForFunction(() => !document.querySelector('.settings-fs-stage .settings-fs-progress'));
    await row('fullscreen-show-progress').getByRole('switch').click();
    await row('fullscreen-show-controls').getByRole('switch').click();
    await page.waitForFunction(() => !!document.querySelector('.settings-fs-stage .settings-fs-progress') &&
      !document.querySelector('.settings-fs-stage .settings-fs-controls'));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => { settingsFixture.setConfig({ 'fullscreen-cd-rotation-enabled': true, 'fullscreen-cd-rotation-speed': 100, 'reduce-motion': false });
      settingsFixture.open('fullscreen', 'fullscreen-cd-rotation-enabled'); });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.settings-cd-artwork')).animationName === 'settings-cd-spin');
    assert(await page.locator('.settings-cd-artwork').evaluate(node => getComputedStyle(node).animationDuration) === '24s', 'CD rotation period differs from playback');
    await row('fullscreen-cd-rotation-enabled').getByRole('switch').click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.settings-cd-artwork')).animationName === 'none');
    await row('fullscreen-cd-rotation-enabled').getByRole('switch').click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.settings-cd-artwork')).animationName === 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => { settingsFixture.setConfig({ 'fullscreen-vinyl-animations': true, 'fullscreen-vinyl-center-rotation': true });
      settingsFixture.open('fullscreen'); });
    await page.locator('.settings-page-head [role="radiogroup"]').first().getByRole('radio').nth(4).click();
    await page.waitForFunction(() => document.querySelector('.settings-fs-record-label')?.classList.contains('is-spin'));
    await row('fullscreen-vinyl-center-rotation').getByRole('switch').click();
    await page.waitForFunction(() => !document.querySelector('.settings-fs-record-label')?.classList.contains('is-spin'));
    assert(await page.locator('.settings-fs-record').evaluate(node => getComputedStyle(node).animationName) === 'ivlyrics-vinyl-spin-clock', 'center switch must not stop the record clock');
    const errors = await page.evaluate(() => settingsFixture.state.errors);
    assert(errors.length === 0, JSON.stringify(errors));
    return { passed: results.length, liveInputUpdates: true, results, errors };
  } finally { await page.evaluate(() => previewParityRuntime.cleanup()); }
}
