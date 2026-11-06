// Production TV overlay regression: run on settings_hotfix_server.mjs with
// playwright-cli run-code --filename tests/fixtures/fullscreen_tv_metadata_browser.js
async page => {
  const origin = new URL(page.url()).origin;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("Use the offline Settings fixture");
  const assert = (value, message) => { if (!value) throw new Error(message); };
  await page.goto(`${origin}/?language=en&theme=dark&tab=fullscreen`);
  await page.waitForFunction(() => settingsFixture.state.ready);
  await page.addScriptTag({ url: origin + "/FullscreenOverlay.js" });
  await page.evaluate(() => {
    window.ivLyricsCloseConfig?.(true);
    Utils.getTrackArtwork = item => item?.metadata?.image_url || "";
    const host = document.createElement("div");
    host.id = "tv-metadata-runtime";
    host.className = "lyrics-lyricsContainer-LyricsContainer fullscreen-active tv-mode-active";
    host.style.cssText = "position:fixed;inset:0;background:#07090c;color:#fff;--spice-text:#fff;--spice-main:#07090c";
    document.body.append(host);
    const root = ReactDOM.createRoot(host);
    const art = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#6f5140"/><circle cx="100" cy="88" r="51" fill="#c8ab82"/><path d="M25 200v-60l75-25 75 25v60" fill="#384c51"/></svg>');
    const base = { title: "One of Us Must Know", artist: "Bob Dylan", album: "Blonde On Blonde",
      translated: { title: "우리 중 누군가는 알아야 해", artist: "밥 딜런" },
      romanized: { title: "Wan obu asu masuto nou", artist: "Bobu Diran" } };
    let options = {};
    let tick = 0;
    window.tvMetadataRuntime = {
      render(patch = {}) {
        options = { size: 140, mode: "original-translated", album: true, long: false, translated: true, ...options, ...patch };
        settingsFixture.setConfig({ ...settingsFixture.defaults, "fullscreen-tv-mode": true,
          "fullscreen-tv-album-size": options.size, "fullscreen-tv-show-album-name": options.album,
          "translate-metadata-mode": options.mode, "fullscreen-show-clock": false,
          "fullscreen-show-context": false, "fullscreen-show-next-track": false,
          "fullscreen-tv-show-controls": false, "fullscreen-tv-show-progress": false });
        const title = options.long ? `${base.title} — A very long title with extra words and 日本語の長いタイトル` : base.title;
        Object.assign(Spicetify.Player.data.item.metadata, { title, artist_name: base.artist,
          album_title: options.long ? base.album.repeat(12) : base.album, image_url: art });
        ReactDOM.flushSync(() => root.render(React.createElement(FullscreenOverlay, {
          isFullscreen: true, title, artist: options.long ? base.artist.repeat(10) : base.artist, coverUrl: art,
          translatedMetadata: options.translated ? base : null,
          trackUri: Spicetify.Player.data.item.uri, currentLyricIndex: ++tick,
          lyricsSettingsRevision: 0,
        })));
      },
      cleanup() { root.unmount(); host.remove(); },
    };
  });
  const settle = () => page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const metrics = () => page.evaluate(() => {
    const host = document.getElementById("tv-metadata-runtime");
    const info = host.querySelector(".fullscreen-tv-track-info");
    const stack = host.querySelector(".fullscreen-tv-metadata-stack");
    const rect = node => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
    return { info: rect(info), stack: rect(stack), art: rect(host.querySelector(".fullscreen-tv-album-wrapper")),
      scale: Number(getComputedStyle(info).getPropertyValue("--fullscreen-tv-metadata-scale")),
      lines: [...stack.querySelectorAll(".fullscreen-tv-title,.fullscreen-tv-artist,.fullscreen-tv-album-name")].map(node => ({
        ...rect(node), font: parseFloat(getComputedStyle(node).fontSize), lineHeight: parseFloat(getComputedStyle(node).lineHeight),
        title: node.classList.contains("fullscreen-tv-title") && !node.classList.contains("fullscreen-tv-title-secondary"),
        text: node.textContent,
      })), errors: settingsFixture.state.errors, network: settingsFixture.state.blockedNetwork };
  });
  const results = [];
  try {
    for (const [width, height] of [[1920, 1080], [1280, 720], [768, 1024], [480, 720]]) {
      await page.setViewportSize({ width, height });
      for (const size of [80, 140, 200]) for (const mode of ["original", "original-translated", "all"])
        for (const album of [false, true]) for (const long of [false, true]) {
          const label = `${width}/${size}/${mode}/${album}/${long}`;
          await page.evaluate(options => tvMetadataRuntime.render(options), { size, mode, album, long, translated: true });
          await settle();
          const m = await metrics();
          assert(Math.abs(m.art.height - size) < 1 && Math.abs(m.art.width - size) < 1, `${label}: changed artwork size`);
          assert(Math.abs(m.info.top - m.art.top) < 1 && Math.abs(m.info.bottom - m.art.bottom) < 1, `${label}: caption frame is not aligned`);
          assert(m.stack.top >= m.art.top - 1 && m.stack.bottom <= m.art.bottom + 1, `${label}: metadata escapes artwork height ${JSON.stringify(m)}`);
          assert(Math.abs((m.stack.top + m.stack.bottom) / 2 - (m.art.top + m.art.bottom) / 2) < 1, `${label}: metadata is not centered`);
          assert(m.info.right <= width + 1 && m.stack.width <= m.info.width + 1, `${label}: horizontal overflow`);
          assert(m.lines.every(line => line.height <= line.lineHeight * (line.title ? 2 : 1) + 1), `${label}: line limit lost`);
          assert(m.scale > 0 && m.scale <= 1, `${label}: invalid fit scale`);
          assert(m.errors.length === 0 && m.network.length === 0, `${label}: runtime or network error`);
          results.push(m.scale);
        }
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    for (const translated of [false, true, false]) {
      await page.evaluate(translated => tvMetadataRuntime.render({ size: 140, mode: "all", album: true, long: false, translated }), translated);
      await settle();
      const m = await metrics();
      assert(m.lines.length === (translated ? 7 : 3), "late translation did not update the existing overlay");
      assert(m.stack.height <= m.art.height + 1, "late translation is not fitted");
      if (!translated) assert(m.scale === 1, "removing translation did not restore normal typography");
    }
    await page.evaluate(() => tvMetadataRuntime.render({ mode: "original-translated", translated: true }));
    await settle();
    await page.screenshot({ path: "output/playwright/tv-metadata-fitted.png" });
    const writes = await page.evaluate(async () => {
      let count = 0;
      const info = document.querySelector("#tv-metadata-runtime .fullscreen-tv-track-info");
      const observer = new MutationObserver(entries => count += entries.length);
      observer.observe(info, { attributes: true, attributeFilter: ["style"] });
      for (let index = 0; index < 120; index++) tvMetadataRuntime.render();
      await new Promise(resolve => setTimeout(resolve, 100));
      observer.disconnect();
      return count;
    });
    assert(writes === 0, `playback-only updates measured/resized the caption ${writes} times`);
    return { cases: results.length, minScale: Math.min(...results), playbackFitWrites: writes, lateTranslation: "passed" };
  } finally {
    await page.evaluate(() => tvMetadataRuntime.cleanup());
  }
}
