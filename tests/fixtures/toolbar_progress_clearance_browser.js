// Production toolbar + fullscreen overlay/CSS on the offline first-use fixture.
async page => {
  const origin = new URL(page.url()).origin;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error('Use the loopback first-use fixture');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  page.setDefaultTimeout(7000);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const errors = [], results = [];
  const recordError = error => errors.push(error.message);
  page.on('pageerror', recordError);
  const geometry = () => page.evaluate(() => {
    const root = document.getElementById('fixture'), progress = root.querySelector('.fullscreen-lyrics-progress-container');
    const column = root.querySelector('.ivl-tb-col'), p = progress.getBoundingClientRect(), t = column.getBoundingClientRect();
    const bounds = root.classList.contains('fullscreen-page-ui') ? root.getBoundingClientRect() : { left: 0, right: innerWidth };
    return { gap: t.left - p.right, progress: { left: p.left, right: p.right, width: p.width },
      column: { left: t.left, right: t.right, width: t.width }, right: parseFloat(getComputedStyle(progress).right),
      text: progress.textContent.trim(), bounds: { left: bounds.left, right: bounds.right },
      publishedWidth: root.style.getPropertyValue('--iv-fullscreen-toolbar-width'),
      toolbarOpacity: Number(getComputedStyle(root.querySelector('.ivl-tb')).opacity) };
  });
  const waitClear = async stage => {
    try {
      await page.waitForFunction(() => {
        const root = document.getElementById('fixture'), progress = root.querySelector('.fullscreen-lyrics-progress-container');
        const column = root.querySelector('.ivl-tb-col'), p = progress.getBoundingClientRect(), t = column.getBoundingClientRect();
        const left = root.classList.contains('fullscreen-page-ui') ? root.getBoundingClientRect().left : 0;
        return t.left - p.right >= 11 && p.left >= left + 23;
      });
    } catch (error) { throw new Error(`${stage}: ${error.message}; ${JSON.stringify(await geometry())}`); }
  };
  try {
    for (const [width, height, language, pageOnly, appReduced, osReduced] of [
      [1280, 900, 'en', false, false, false], [1000, 800, 'de', true, false, false],
      [390, 844, 'ko', true, true, false], [320, 740, 'ru', false, false, true],
    ]) {
      const label = `${width}-${language}-${pageOnly ? 'page' : 'fullscreen'}`;
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: osReduced ? 'reduce' : 'no-preference' });
      await page.goto(`${origin}/?surface=toolbar&language=${language}&theme=dark`);
      await page.addScriptTag({ url: origin + '/PlaylistPicker.js' });
      await page.addScriptTag({ url: origin + '/FullscreenOverlay.js' });
      await page.evaluate(({ pageOnly, appReduced, width }) => {
        const root = document.getElementById('fixture'), mount = document.getElementById('toolbar');
        ReactDOM.unmountComponentAtNode(mount);
        document.documentElement.style.height = '100%';
        document.body.style.height = '100vh';
        document.getElementById('fixture-note').remove();
        root.classList.add('fullscreen-active');
        root.classList.toggle('fullscreen-page-ui', pageOnly);
        root.classList.toggle('motion-reduced', appReduced);
        root.style.setProperty('--spice-text', '#fff');
        root.style.setProperty('--spice-subtext', '#aaa');
        root.style.background = '#27333d';
        // The first-use fixture normally sizes #fixture to the viewport; the
        // embedded fullscreen case must instead follow its Spotify-like host.
        root.style.width = '100%';
        root.style.height = '100%';
        mount.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
        if (pageOnly && width > 600) {
          const host = document.createElement('main');
          host.style.cssText = 'position:fixed;inset:40px 60px;';
          root.before(host);
          host.append(root);
        }
        Object.assign(CONFIG.visual, { 'fullscreen-auto-hide-ui': false, 'fullscreen-two-column': false,
          'fullscreen-show-controls': false, 'fullscreen-show-progress': false, 'fullscreen-show-clock': false,
          'fullscreen-show-context': false, 'fullscreen-show-next-track': false, 'fullscreen-show-queue': false,
          'fullscreen-show-lyrics-progress': true });
        window.progressReplay = { idle(value) { root.classList.toggle('controls-hidden', value); } };
        function Scene() {
          const [open, setOpen] = React.useState(false), [mounted, setMounted] = React.useState(true);
          const [closing, setClosing] = React.useState(false), [line, setLine] = React.useState(18);
          Object.assign(window.progressReplay, { setMounted, setClosing, setLine });
          return React.createElement(React.Fragment, null,
            React.createElement(FullscreenOverlay, { isFullscreen: true, currentLyricIndex: line,
              totalLyrics: 72, trackUri: track.uri, title: track.name, artist: 'Offline artist' }),
            mounted && React.createElement(IvLyricsFloatingToolbar, {
              actions: { onToggleMenu: () => setOpen(value => !value), onCloseMenu: () => setOpen(false) },
              isFullscreen: true, isMenuOpen: open, isMenuClosing: closing,
              modeKey: 'synced', showConvert: true, hasLyrics: true, hasSynced: true,
              karaokeEnabled: true, trackUri: track.uri, syncTrackUri: track.uri,
              trackTitle: track.name, trackArtist: 'Offline artist', lyrics, canToggleFullscreen: true,
            })
          );
        }
        ReactDOM.render(React.createElement(Scene), mount);
      }, { pageOnly, appReduced, width });
      const progress = page.locator('.fullscreen-lyrics-progress-container'), toolbar = page.locator('.ivl-tb');
      await progress.waitFor();
      if (appReduced || osReduced) {
        assert(await progress.evaluate(node => getComputedStyle(node).transitionDuration.split(',')
          .every(duration => parseFloat(duration) === 0)), `${label}: reduced motion still animates`);
      }
      await page.mouse.move(1, 1);
      await page.evaluate(() => progressReplay.idle(true));
      await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.fullscreen-lyrics-progress-container')).right) === 24 &&
        Number(getComputedStyle(document.querySelector('.ivl-tb')).opacity) === 0);
      const idle = await geometry();
      assert(idle.text === '19 / 72', `${label}: progress data changed`);

      await page.evaluate(() => progressReplay.idle(false));
      await page.screenshot({ path: `output/playwright/progress-clearance-${label}-initial.png` });
      await waitClear(`${label}: folded`);
      const folded = await geometry();
      await toolbar.locator('[data-entry="menu"]').click();
      await waitClear(`${label}: expanded`);
      const expanded = await geometry();
      assert(expanded.text === idle.text, `${label}: opening the menu changed progress`);
      assert(Math.abs(Number.parseFloat(expanded.publishedWidth) - expanded.column.width) <= 1, `${label}: incorrect measured menu width`);
      await page.screenshot({ path: `output/playwright/progress-clearance-${label}-expanded.png` });

      // An open popup keeps the toolbar visible even after the host idles.
      await toolbar.locator('[data-entry="track"]').click();
      await toolbar.locator('.ivl-tb-fly').waitFor();
      await page.evaluate(() => progressReplay.idle(true));
      await page.mouse.move(1, 1);
      await waitClear(`${label}: popup`);
      assert((await geometry()).toolbarOpacity > 0.99, `${label}: engaged toolbar was hidden`);
      await page.keyboard.press('Escape');
      await toolbar.locator('.ivl-tb-fly').waitFor({ state: 'detached' });
      // Escape returns keyboard focus to the entry, which must retain clearance.
      await waitClear(`${label}: Escape focus`);
      await page.evaluate(() => document.activeElement.blur());
      await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.fullscreen-lyrics-progress-container')).right) === 24);
      await toolbar.hover();
      await waitClear(`${label}: hover`);
      await page.mouse.move(1, 1);
      await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.fullscreen-lyrics-progress-container')).right) === 24);
      await toolbar.locator('[data-entry="menu"]').press('Shift+Tab');
      await waitClear(`${label}: keyboard`);
      await page.evaluate(() => { document.activeElement.blur(); progressReplay.idle(false); });
      await waitClear(`${label}: awake again`);

      const before = await geometry();
      await page.evaluate(() => progressReplay.setLine(35));
      await page.waitForFunction(() => document.querySelector('.fullscreen-lyrics-progress-text').textContent === '36 / 72');
      assert(Math.abs((await geometry()).right - before.right) < 1, `${label}: playback updates moved the progress pill`);
      await page.evaluate(() => progressReplay.setMounted(false));
      await page.waitForFunction(() => !document.getElementById('fixture').style.getPropertyValue('--iv-fullscreen-toolbar-width') &&
        parseFloat(getComputedStyle(document.querySelector('.fullscreen-lyrics-progress-container')).right) === 24);
      assert(errors.length === 0, `${label}: renderer errors: ${errors.join('; ')}`);
      results.push({ label, appReduced, osReduced, idle, folded, expanded, popup: true, hover: true,
        keyboard: true, playbackStable: true, unmountRestoresPosition: true });
    }
    return { passed: results.length, results, errors };
  } finally { page.off('pageerror', recordError); }
}
