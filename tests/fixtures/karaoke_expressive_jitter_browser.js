// Offline native-DOM reproduction: layout-effect paint followed by the older
// RAF timestamp from that same display frame. Includes an unguarded canary.
async page => {
  const origin = new URL(page.url()).origin;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error('Open the loopback karaoke fixture');
  const guard = /if \(expressive && Number\.isFinite\(frameTime\) && Number\.isFinite\(entry\.lastMotionFrameTime\)\s*&& frameTime < entry\.lastMotionFrameTime\) return false;/;
  let canary = false;
  await page.route(origin + '/renderer.js', async route => {
    const response = await route.fetch();
    const source = await response.text();
    if (!guard.test(source)) throw new Error('Production frame-order guard is missing');
    await route.fulfill({response, body: canary ? source.replace(guard, '') : source});
  });
  const results = [];
  try {
    for (canary of [true, false]) {
      await page.goto(origin);
      await page.waitForFunction(() => window.expressiveFixture?.entryCount > 0);
      await page.evaluate(() => window.expressiveFixture.apply({style: 'expressive', position: 1000}));
      const result = await page.evaluate(() => {
        const {painter, paint} = window.ProductionKaraoke;
        const entry = [...painter.entries].find(item => item.data.timedChars.map(char => char.char).join('') === '漢字の歌');
        if (!entry) throw new Error('Production Japanese glyph entry is missing');
        entry.clock = {getPosition: timestamp => 1000 + timestamp};
        entry.lastPosition = NaN;
        entry.lastMotionFrameTime = NaN;
        const unit = entry.units.get('g:0'), element = unit.elements[0];
        const pose = () => ['--karaoke-bounce-scale', '--karaoke-bounce-y', '--karaoke-motion-glow', '--karaoke-char-fill']
          .map(name => element.style.getPropertyValue(name));
        let changedByStale = 0, rejected = 0, maxScaleJump = 0;
        const samples = [];
        paint(entry, 0);
        for (let frame = 1; frame <= 72; frame++) {
          const timestamp = frame * 1000 / 120;
          paint(entry, timestamp + 4); // React layout effect paints later in the frame.
          const before = pose();
          if (paint(entry, timestamp) === false) rejected++;
          const after = pose();
          if (JSON.stringify(before) !== JSON.stringify(after)) changedByStale++;
          maxScaleJump = Math.max(maxScaleJump, Math.abs(Number(before[0]) - Number(after[0])));
          samples.push(Number(after[0]));
        }
        const beforeSeek = pose();
        entry.clock = {getPosition: () => 1200};
        const sought = paint(entry, 650); // New timestamp, genuinely earlier playback position.
        if (!sought || Number(pose()[0]) !== 0.95) throw new Error('Real backward seek no longer resets motion');
        return {changedByStale, rejected, maxScaleJump, peak: Math.max(...samples),
          keptDOM: element.isConnected, beforeSeek, sought};
      });
      if (canary && result.changedByStale === 0) throw new Error('Canary did not reproduce the stale-frame reset');
      if (!canary && (result.changedByStale !== 0 || result.rejected !== 72 || !result.keptDOM)) {
        throw new Error('Fixed frame path changed a pose or DOM: ' + JSON.stringify(result));
      }
      results.push({canary, ...result});
    }
    return {passed: true, results};
  } finally {
    await page.unroute(origin + '/renderer.js');
  }
}
