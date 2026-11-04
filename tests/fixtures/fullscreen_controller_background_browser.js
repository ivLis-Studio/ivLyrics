// Actual production overlay + production lyric layout, with offline playback.
// Run via playwright-cli run-code --filename on settings_hotfix_server.mjs.
async page => {
  const origin = new URL(page.url()).origin;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("Use the offline Settings fixture");
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  page.setDefaultTimeout(7000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/?language=en&theme=dark&tab=fullscreen`);
  await page.waitForFunction(() => settingsFixture.state.ready);
  await page.addScriptTag({ url: origin + "/VinylPlayerMode.js" });
  await page.addScriptTag({ url: origin + "/PlaylistPicker.js" });
  await page.addScriptTag({ url: origin + "/FullscreenOverlay.js" });
  await page.evaluate(() => {
    window.ivLyricsCloseConfig?.(true);
    const container = document.createElement("div");
    container.id = "controller-background-runtime";
    container.style.cssText = "position:fixed;inset:0;color:#fff;--spice-text:#fff;--spice-main:#17191d;--lyrics-color-active:#fff;--lyrics-color-inactive:rgba(255,255,255,.7);--lyrics-align-text:center;--lyrics-original-font-size:36px;";
    document.body.append(container);
    const root = ReactDOM.createRoot(container);
    const art = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#335976"/><circle cx="250" cy="180" r="160" fill="#cf794f"/><path d="M0 350 400 120v280H0" fill="#222d50"/></svg>');
    Object.assign(Spicetify.Player.data.item.metadata, { title: "Sample song", artist_name: "Sample artist", album_title: "Sample album", image_url: art });
    Spicetify.Player.getProgress = () => 90000;
    Spicetify.Platform.RootlistAPI = { getContents: async () => ({ items: Array.from({ length: 12 }, (_, index) => ({
      type: "playlist", uri: `spotify:playlist:offline${index}`, name: `Offline playlist ${index + 1}`, isOwnedBySelf: true,
    })) }) };
    Spicetify.Platform.PlaylistAPI = {
      getMetadata: async () => null,
      getContents: async () => ({ items: [{ uri: "spotify:track:offlineSettingsFixture" }] }),
    };
    // Provide local icon data only; the player component and all sizing/layout
    // are the real production implementations, not a controller mock.
    for (const name of ["heart", "heart-active", "shuffle", "play", "pause", "skip-back", "skip-forward", "repeat", "repeat-once", "volume-one-wave", "volume-two-wave", "volume-off"]) {
      Spicetify.SVGIcons[name] = '<path d="M4 3 13 8 4 13Z"/>';
    }
    let revision = 0;
    window.controllerBackgroundRuntime = {
      render({ view = "normal", reversed = false, portrait = false, ...patch }) {
        settingsFixture.setConfig({ ...settingsFixture.defaults,
          "fullscreen-controls-position": "left-panel", "fullscreen-auto-hide-ui": false,
          "fullscreen-show-clock": false, "fullscreen-show-context": false,
          "fullscreen-show-next-track": false, "fullscreen-show-queue": false,
          "fullscreen-two-column": true, "fullscreen-show-album-name": false,
          "fullscreen-layout-reverse": reversed, "fullscreen-tv-mode": view === "tv",
          "fullscreen-tv-show-controls": true, "fullscreen-tv-show-progress": true,
          "fullscreen-cd-visualizer-enabled": false, ...patch });
        container.className = "lyrics-lyricsContainer-LyricsContainer fullscreen-active fullscreen-page-ui"
          + (reversed ? " layout-reversed" : "") + (portrait ? " portrait-mode" : "")
          + (view === "tv" ? " tv-mode-active" : "");
        ReactDOM.flushSync(() => root.render(React.createElement(React.Fragment, null,
          React.createElement(FullscreenOverlay, { isFullscreen: true, coverUrl: art,
            title: "Sample song", artist: "Sample artist", currentLyricIndex: 2, totalLyrics: 12,
            activeLyric: "A long lyric line stays clear of the playback controller",
            trackUri: "spotify:track:offlineSettingsFixture", lyricsSettingsRevision: ++revision,
            presentationMode: view === "cd" ? "compact-vinyl" : "standard" }),
          React.createElement("div", { className: "lyrics-lyricsContainer-UnsyncedLyricsPage", "data-fixture-lyrics": true },
            ...["A long lyric line stays clear of the playback controller", "此処に長い歌詞が表示されます", "가사가 길어져도 재생 버튼 배경과 겹치지 않아요"].map((text, index) =>
              React.createElement("div", { key: index, className: "lyrics-lyricsContainer-LyricsLine" },
                React.createElement("p", null, text)))))));
      },
      cleanup() { root.unmount(); container.remove(); },
    };
  });
  const results = [];
  try {
    for (const [width, height, album] of [[1440, 900, 400], [1100, 800, 200], [960, 720, 300]]) {
      await page.setViewportSize({ width, height });
      for (const view of ["normal", "cd"]) for (const reversed of [false, true]) for (const background of [false, true]) {
        const label = `${width}-${view}-${reversed ? "reversed" : "standard"}-${background ? "background" : "bare"}`;
        await page.evaluate(options => controllerBackgroundRuntime.render(options), { view, reversed,
          "fullscreen-album-size": album, "fullscreen-cd-disc-size": width === 1100 ? 70 : 140,
          "fullscreen-control-button-size": width === 960 ? 28 : 48,
          "fullscreen-controls-background": background, "fullscreen-show-volume": width !== 960,
          "fullscreen-show-progress": width !== 1100 });
        await page.waitForFunction(() => document.getElementById("controller-background-runtime").dataset.albumCenteredLyrics === "true");
        await page.locator("#controller-background-runtime").evaluate(async node => {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          await Promise.all(node.getAnimations({ subtree: true }).filter(animation =>
            animation.effect.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
          node.querySelector(".lyrics-fullscreen-left-panel").scrollTop = 0;
        });
        const metrics = await page.evaluate(() => {
          const host = document.getElementById("controller-background-runtime");
          const rect = node => { const { left, right, top, bottom, width, height } = node.getBoundingClientRect(); return { left, right, top, bottom, width, height }; };
          const controls = host.querySelector(".fullscreen-left-controls .fullscreen-player-controls");
          const lyrics = host.querySelector("[data-fixture-lyrics]");
          return { controls: rect(controls), lyrics: rect(lyrics),
            parent: rect(controls.parentElement), surface: getComputedStyle(controls).backgroundColor,
            overflow: controls.scrollWidth - controls.clientWidth,
            buttons: [...controls.querySelectorAll("button")].map(rect),
            panel: { clientHeight: controls.closest(".lyrics-fullscreen-left-panel").clientHeight,
              scrollHeight: controls.closest(".lyrics-fullscreen-left-panel").scrollHeight,
              overflowY: getComputedStyle(controls.closest(".lyrics-fullscreen-left-panel")).overflowY },
            errors: settingsFixture.state.errors, network: settingsFixture.state.blockedNetwork };
        });
        assert(metrics.controls.width <= metrics.parent.width + 1, `${label}: control background exceeds its column`);
        assert(reversed ? metrics.controls.left >= metrics.lyrics.right - 1 : metrics.controls.right <= metrics.lyrics.left + 1,
          `${label}: controller still overlaps lyrics ${JSON.stringify(metrics)}`);
        assert(metrics.overflow <= 1, `${label}: controls horizontally clipped`);
        assert(metrics.buttons.every(button => button.left >= metrics.controls.left - 1 && button.right <= metrics.controls.right + 1 &&
          button.top >= metrics.controls.top - 1 && button.bottom <= metrics.controls.bottom + 1), `${label}: buttons escape their background`);
        const needsScroll = !metrics.buttons.every(button => button.top >= -1 && button.bottom <= height + 1);
        if (needsScroll) {
          assert(metrics.panel.overflowY === "auto" && metrics.panel.scrollHeight > metrics.panel.clientHeight,
            `${label}: oversized controls are clipped without a scroll path`);
          const buttons = page.locator("#controller-background-runtime .fullscreen-left-controls button");
          for (const button of await buttons.all()) {
            await button.scrollIntoViewIfNeeded();
            const box = await button.boundingBox();
            assert(box.y >= -1 && box.y + box.height <= height + 1,
              `${label}: scrolling cannot reach a controller button`);
          }
        }
        assert(background === (metrics.surface !== "rgba(0, 0, 0, 0)"), `${label}: background switch ignored`);
        assert(metrics.errors.length === 0 && metrics.network.length === 0, `${label}: runtime/external operation`);
        if (background && view === "cd" && !reversed) await page.screenshot({ path: `output/playwright/controller-background-${width}.png` });
        results.push({ label, width: Math.round(metrics.controls.width), scrollFallback: needsScroll, lyricGap: Math.round(reversed
          ? metrics.controls.left - metrics.lyrics.right : metrics.lyrics.left - metrics.controls.right) });
      }
    }
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.evaluate(() => controllerBackgroundRuntime.render({ view: "cd",
      "fullscreen-album-size": 200, "fullscreen-cd-disc-size": 70,
      "fullscreen-control-button-size": 48, "fullscreen-controls-background": true,
      "fullscreen-show-volume": true, "fullscreen-auto-hide-ui": true, "fullscreen-auto-hide-delay": 1 }));
    const zoneCenter = async () => page.evaluate(() => {
      const zone = document.querySelector("#controller-background-runtime .lyrics-fullscreen-hover-zone");
      if (!zone) throw new Error("hover zone is not rendered");
      const { left, right, top, bottom } = zone.getBoundingClientRect();
      return { x: (left + right) / 2, y: (top + bottom) / 2 };
    });
    const hiddenState = async () => page.evaluate(() => ({
      hidden: document.querySelector("#controller-background-runtime .lyrics-fullscreen-left-panel")
        ?.classList.contains("controls-hidden"),
      maxHeight: getComputedStyle(document.querySelector("#controller-background-runtime .fullscreen-left-controls")).maxHeight,
    }));
    const waitHidden = hidden => page.waitForFunction(expected => document.querySelector(
      "#controller-background-runtime .lyrics-fullscreen-left-panel")?.classList.contains("controls-hidden") === expected, hidden);
    // Under the hover gate the controller starts hidden, so reveal it from the album column first.
    const revealAt = await zoneCenter();
    await page.mouse.move(revealAt.x, revealAt.y);
    await waitHidden(false);
    await page.locator("#controller-background-runtime .fullscreen-volume-wrapper").hover();
    await page.locator("#controller-background-runtime .fullscreen-volume-percent").waitFor({ state: "visible" });
    const volumeFits = await page.locator("#controller-background-runtime .fullscreen-player-controls").evaluate(node => {
      const surface = node.getBoundingClientRect();
      const percent = node.querySelector(".fullscreen-volume-percent").getBoundingClientRect();
      return percent.left >= surface.left - 1 && percent.right <= surface.right + 1;
    });
    assert(volumeFits, "hovered volume percentage escapes the controller background");
    // Moving anywhere in the lyrics column must not bring the controller back.
    await page.mouse.move(1050, 400);
    await page.waitForFunction(() => document.querySelector("#controller-background-runtime .lyrics-fullscreen-left-panel")?.classList.contains("controls-hidden"));
    await page.waitForFunction(() => getComputedStyle(document.querySelector("#controller-background-runtime .fullscreen-left-controls")).maxHeight === "0px");
    await page.mouse.move(1050, 420);
    await page.waitForTimeout(400);
    assert((await hiddenState()).hidden, "moving inside the lyrics pane revealed the left-panel controls");
    // Only the album column reveals it.
    const zone = await zoneCenter();
    await page.mouse.move(zone.x, zone.y);
    await page.waitForFunction(() => !document.querySelector("#controller-background-runtime .lyrics-fullscreen-left-panel")?.classList.contains("controls-hidden"));
    await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector("#controller-background-runtime .fullscreen-left-controls")).maxHeight) > 0);
    // Leaving the column hides it again.
    await page.mouse.move(1050, 400);
    await page.waitForFunction(() => document.querySelector("#controller-background-runtime .lyrics-fullscreen-left-panel")?.classList.contains("controls-hidden"));
    // A click must not pin the controller: press a transport button, leave, and it hides.
    await page.evaluate(() => { Spicetify.Player.togglePlay = () => {}; });
    const play = page.locator("#controller-background-runtime .left-controls-player .fullscreen-control-play");
    await page.mouse.move(zone.x, zone.y);
    await waitHidden(false);
    await play.click();
    await page.mouse.move(1050, 400);
    await waitHidden(true);
    // Keyboard focus inside the controller does pin it, until focus leaves.
    await page.mouse.move(zone.x, zone.y);
    await waitHidden(false);
    await play.click();
    await page.keyboard.press("Tab");
    assert(await page.evaluate(() => !!document.activeElement?.closest("#controller-background-runtime .left-controls-player")
      && document.activeElement.matches(":focus-visible")), "Tab did not move keyboard focus inside the controller");
    await page.mouse.move(1050, 400);
    await page.waitForTimeout(900);
    assert(!(await hiddenState()).hidden, "keyboard focus inside the controller no longer pins it");
    await page.mouse.click(1050, 400);
    await waitHidden(true);
    results.push({ label: "volume-hover-and-column-hover-gate", bounded: true, lyricsPaneStaysHidden: true,
      clickThenLeaveHides: true, keyboardFocusPins: true });
    // The under-album constraint must not replace the independent TV, portrait
    // or bottom-controller paths.
    for (const [label, width, height, options, selector] of [
      ["tv", 1280, 800, { view: "tv" }, ".fullscreen-tv-controls"],
      ["portrait", 390, 844, { portrait: true }, ".portrait-overlay-bottom .fullscreen-player-controls"],
      ["bottom", 1280, 800, { "fullscreen-controls-position": "bottom" }, ".fullscreen-bottom .fullscreen-player-controls"],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(options => controllerBackgroundRuntime.render({ "fullscreen-controls-background": true, ...options }), options);
      await page.locator(`#controller-background-runtime ${selector}`).waitFor({ state: "visible" });
      results.push({ label, preserved: true });
    }
    for (const reversed of [false, true]) {
      await page.setViewportSize({ width: 1100, height: 800 });
      await page.evaluate(reversed => controllerBackgroundRuntime.render({ view: "cd", reversed,
        "fullscreen-album-size": 200, "fullscreen-cd-disc-size": 70,
        "fullscreen-control-button-size": 48, "fullscreen-controls-background": true }), reversed);
      const picker = page.locator("#controller-background-runtime .fullscreen-playlist-control > button");
      await picker.click();
      const popover = page.locator("#controller-background-runtime .fullscreen-playlist-popover");
      await popover.locator(".fullscreen-playlist-item").first().waitFor();
      const bounds = await popover.evaluate(node => {
        const popup = node.getBoundingClientRect(), panel = node.closest(".lyrics-fullscreen-left-panel").getBoundingClientRect();
        return { left: popup.left, right: popup.right, top: popup.top, bottom: popup.bottom,
          panelLeft: panel.left, panelRight: panel.right, panelTop: panel.top, panelBottom: panel.bottom };
      });
      assert(bounds.left >= bounds.panelLeft - 1 && bounds.right <= bounds.panelRight + 1 &&
        bounds.top >= bounds.panelTop - 1 && bounds.bottom <= bounds.panelBottom + 1,
        `playlist popover is clipped by the scroll column: ${JSON.stringify(bounds)}`);
      await picker.click();
      results.push({ label: `playlist-${reversed ? "reversed" : "standard"}`, unclipped: true });
    }
    assert((await page.evaluate(() => settingsFixture.state.errors.length + settingsFixture.state.blockedNetwork.length)) === 0,
      "controller replay raised a runtime error or attempted a live API operation");
    return { passed: results.length, results };
  } finally { await page.evaluate(() => controllerBackgroundRuntime.cleanup()); }
}
