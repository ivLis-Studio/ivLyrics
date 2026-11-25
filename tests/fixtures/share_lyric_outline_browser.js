// Open the loopback first_use_server.mjs fixture, then run with playwright-cli run-code --filename.
async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const origin = new URL(page.url()).origin;
  assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin), 'Use the loopback first-use fixture');
  await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, route => route.fulfill({
    status: 200, contentType: 'text/css', body: '/* Offline font fallback. */',
  }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const results = [];
  for (const theme of ['dark', 'light']) {
    for (const width of [1100, 390]) {
      await page.setViewportSize({ width, height: 840 });
      await page.goto(`${origin}/?surface=toolbar&language=en&theme=${theme}`);
      await page.evaluate(() => {
        openShareImageModal(Array.from({ length: 12 }, (_, i) => ({
          originalText: i % 2 ? `歌詞の選択 ${i + 1}` : `Lyric selection row ${i + 1}`,
          text2: i % 3 ? `Translation for row ${i + 1}` : null,
        })), { name: 'Offline fixture', artist: 'Fixture artist' });
      });
      const rows = page.locator('.share-image-modal-lyric-line');
      await rows.first().waitFor();
      await page.locator('#ivLyrics-share-image-overlay').evaluate(async root => {
        await document.fonts.ready;
        await Promise.all(root.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
      });
      const inspect = row => row.evaluate(element => {
        const css = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return { border: css.borderColor, borderWidth: css.borderWidth, background: css.backgroundColor,
          selected: element.dataset.selected, width: rect.width, height: rect.height };
      });
      const neutral = await inspect(rows.first());
      assert(neutral.borderWidth === '1px' && neutral.border !== 'rgba(0, 0, 0, 0)' && neutral.border !== 'transparent', `${theme}/${width}: missing neutral outline`);
      assert(neutral.background !== 'rgba(0, 0, 0, 0)', `${theme}/${width}: missing neutral surface`);
      await rows.first().click();
      await page.waitForFunction(border => {
        const row = document.querySelector('.share-image-modal-lyric-line');
        return row.dataset.selected === 'true' && getComputedStyle(row).borderColor !== border;
      }, neutral.border);
      await rows.first().evaluate(async row => {
        await Promise.all(row.getAnimations().map(animation => animation.finished.catch(() => {})));
      });
      const selected = await inspect(rows.first());
      assert(selected.selected === 'true' && selected.border !== neutral.border, 'selected row needs a distinct outline');
      assert(selected.background !== neutral.background, 'selected row needs a distinct fill');
      assert(Math.abs(selected.width - neutral.width) < 1 && Math.abs(selected.height - neutral.height) < 1,
        `selection must not move the rows: ${JSON.stringify({ neutral, selected })}`);
      const other = await inspect(rows.nth(1));
      assert(other.border === neutral.border && other.selected === 'false', 'unselected rows retain their outline');
      // Keep the target in view even when the narrow layout clips a pane.
      await rows.first().scrollIntoViewIfNeeded();
      await rows.first().click();
      await page.waitForFunction(border => {
        const row = document.querySelector('.share-image-modal-lyric-line');
        return row.dataset.selected === 'false' && getComputedStyle(row).borderColor === border;
      }, neutral.border);
      const deselected = await inspect(rows.first());
      assert(deselected.selected === 'false' && deselected.border === neutral.border, 'deselection restores the outline');
      await rows.nth(1).click();
      await rows.nth(2).click();
      await rows.first().scrollIntoViewIfNeeded();
      await page.mouse.move(1, 1);
      await page.screenshot({ path: `output/playwright/share-lyric-outline-${theme}-${width}.png` });
      results.push({ theme, width, neutral, selected, deselected });
      // No preview/export network calls or copyrighted song data are used.
      assert(await rows.count() === 12, 'all production selection rows are rendered');
    }
  }
  return results;
}
