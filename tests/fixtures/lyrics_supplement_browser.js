// Run with playwright-cli --session supplement run-code --filename this-file.
async (page) => {
  const origin = new URL(page.url()).origin;
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error('Open the loopback supplement fixture first');
  const results = [];
  for (const baseline of [true, false]) {
    for (const expanded of [false, true]) for (const style of ['classic', 'expressive']) {
      await page.goto(origin + '/' + (baseline ? '?baseline=1' : ''));
      await page.waitForFunction(() => window.supplementFixture?.entries.some(entry => entry.units.size > 0));
      const result = await page.evaluate(({ expanded, style }) => {
        const f = window.supplementFixture;
        f.reset({ expanded, style });
        // Advance the actual production clock/painter into the sung word.
        for (let i = 0; i < 30; i++) f.step();
        const activeEntry = () => f.entries.find(entry => entry.data?.timedChars?.[0]?.char === 'H');
        const rootSelector = expanded ? '.lyrics-lyricsContainer-UnsyncedLyricsPage' : '.lyrics-lyricsContainer-SyncedLyrics';
        const stages = [];
        for (const kind of ['phonetic', 'translation', 'culture']) {
          const before = activeEntry();
          if (!before || before.units.size === 0) throw new Error('Missing active production units');
          const units = new Map(before.units), root = document.querySelector(rootSelector);
          const nodes = new Map([...units].map(([key, unit]) => [key, [...unit.elements]]));
          const pose = new Map([...units].map(([key, unit]) => [key, new Map(unit.values)]));
          const preparations = window.__supplementPreparations;
          f.add(kind, 1);
          const after = activeEntry();
          let replacedUnits = 0, replacedNodes = 0, changedPausedPoses = 0;
          for (const [key, unit] of units) {
            const next = after?.units.get(key);
            if (next !== unit) replacedUnits++;
            if (!next || nodes.get(key).some((node, i) => node !== next.elements[i] || !node.isConnected)) replacedNodes++;
            for (const [name, value] of pose.get(key)) if (next?.values.get(name) !== value) changedPausedPoses++;
          }
          stages.push({ kind, rootRetained: root === document.querySelector(rootSelector),
            units: units.size, replacedUnits, replacedNodes, changedPausedPoses,
            preparations: window.__supplementPreparations - preparations,
            shown: document.getElementById('root').textContent.includes(kind === 'phonetic' ? 'reading 0'
              : kind === 'translation' ? 'meaning 0' : 'Cultural explanation') });
        }
        return { expanded, style, stages };
      }, { expanded, style });
      results.push({ baseline, ...result });
    }
  }
  const control = results.filter(result => result.baseline);
  if (!control.every(result => result.stages.some(stage => !stage.rootRetained || stage.replacedUnits > 0))) {
    throw new Error('The pre-fix canary did not reproduce the generation reset: ' + JSON.stringify(control));
  }
  const fixed = results.filter(result => !result.baseline);
  for (const result of fixed) for (const stage of result.stages) {
    if (!stage.rootRetained || stage.replacedUnits || stage.replacedNodes || stage.changedPausedPoses || !stage.shown) {
      throw new Error('Supplement generation interrupted the lyric: ' + JSON.stringify(result));
    }
  }
  const playing = [];
  for (const width of [1000, 390]) for (const style of ['classic', 'expressive']) {
    await page.setViewportSize({ width, height: 760 });
    await page.goto(origin + '/');
    await page.waitForFunction(() => window.supplementFixture?.entries.some(entry => entry.units.size > 0));
    playing.push(await page.evaluate(async ({ width, style }) => {
      const f = supplementFixture;
      f.reset({ style }); f.play();
      const intervals = [], updates = [];
      let last = performance.now();
      const stages = new Map([[8, ['phonetic', 1]], [16, ['translation', 1]], [24, ['culture', 1]],
        [35, ['phonetic', 8]], [50, ['translation', 8]], [65, ['phonetic', 36]], [80, ['translation', 36]]]);
      for (let frame = 0; frame < 110; frame++) {
        await new Promise(resolve => requestAnimationFrame(now => { intervals.push(now - last); last = now; resolve(); }));
        if (!stages.has(frame)) continue;
        const before = f.entries.find(entry => entry.data?.timedChars?.[0]?.char === 'H');
        const units = new Map(before.units), started = performance.now();
        f.add(...stages.get(frame));
        const after = f.entries.find(entry => entry.data?.timedChars?.[0]?.char === 'H');
        updates.push({ kind: stages.get(frame)[0], milliseconds: performance.now() - started,
          replacements: [...units].filter(([key, unit]) => after.units.get(key) !== unit).length });
      }
      f.pause();
      const sorted = intervals.slice(2).sort((a, b) => a - b);
      return { width, style, frames: intervals.length, p95FrameMs: sorted[Math.floor(sorted.length * .95)],
        maxFrameMs: sorted.at(-1), updates };
    }, { width, style }));
  }
  if (playing.some(result => result.updates.some(update => update.replacements))) {
    throw new Error('Streaming restarted an effect during playback: ' + JSON.stringify(playing));
  }
  const travel = [], words = [];
  for (const width of [1000, 390]) for (const style of ['classic', 'expressive']) {
    await page.setViewportSize({ width, height: 760 });
    await page.goto(origin + '/');
    travel.push(await page.evaluate(async ({ width, style }) => {
      const f = supplementFixture, frames = async (count = 4) => {
        for (let i = 0; i < count; i++) await new Promise(resolve => requestAnimationFrame(resolve));
      };
      f.reset({ style, reveal: false }); await frames();
      f.step(4700); await frames(2); // Cross the 6000ms lyric boundary into its normal row travel.
      const root = document.querySelector('.lyrics-lyricsContainer-SyncedLyrics');
      const pairs = [...root.children].flatMap(row => row.getAnimations().filter(animation =>
        animation.effect.getKeyframes().some(frame => typeof frame.transform === 'string')
      ).map(animation => ({ row, animation })));
      if (!pairs.length) throw new Error('Missing real row handoff animations');
      for (const { animation } of pairs) { animation.pause(); animation.currentTime = 100; }
      await frames(2);
      const samples = pairs.map(({ animation }) => ({ time: animation.currentTime,
        timing: animation.effect.getTiming(), frames: animation.effect.getKeyframes() }));
      const active = document.querySelector('.lyrics-lyricsContainer-LyricsLine-active');
      const center = () => { const rect = active.getBoundingClientRect(); return rect.top + rect.height / 2; };
      const initialCenter = center(), initialOffset = parseFloat(root.getAttribute('data-compact-offset'));
      const stages = [];
      for (const kind of ['phonetic', 'translation', 'culture']) {
        f.add(kind, 1); await frames();
        const offsetDelta = parseFloat(root.getAttribute('data-compact-offset')) - initialOffset;
        let maxCurveError = 0;
        pairs.forEach(({ row, animation }, index) => {
          const before = samples[index], after = animation.effect.getKeyframes();
          if (!row.getAnimations().includes(animation) || animation.playState !== 'paused'
            || animation.currentTime !== before.time || after.length !== before.frames.length
            || JSON.stringify(animation.effect.getTiming()) !== JSON.stringify(before.timing)) {
            throw new Error('Supplement interrupted the existing row timeline: ' + kind);
          }
          after.forEach((frame, i) => {
            maxCurveError = Math.max(maxCurveError, Math.abs(new DOMMatrix(frame.transform).m42
              - new DOMMatrix(before.frames[i].transform).m42 - offsetDelta));
            if (frame.offset !== before.frames[i].offset) throw new Error('Supplement changed the travel curve');
          });
        });
        const centerJump = Math.abs(center() - initialCenter);
        if (maxCurveError > .1 || centerJump > 1) throw new Error('Supplement moved the singing anchor: '
          + JSON.stringify({ kind, maxCurveError, centerJump, offsetDelta }));
        stages.push({ kind, retainedAnimations: pairs.length, maxCurveError, centerJump, offsetDelta });
      }
      return { width, style, stages };
    }, { width, style }));
    words.push(await page.evaluate(async ({ width, style }) => {
      const f = supplementFixture, frames = async (count = 5) => {
        for (let i = 0; i < count; i++) await new Promise(resolve => requestAnimationFrame(resolve));
      };
      f.reset({ style, words: true, reveal: false }); await frames();
      f.step(6000); await frames();
      document.getElementById('root').getAnimations({ subtree: true }).forEach(animation => animation.finish());
      await frames();
      f.resolveWords('reading', 'reading', 1); await frames();
      const active = document.querySelector('[data-lyrics-seek-time="6000"]');
      const predecessor = document.querySelector('[data-lyrics-seek-time="1000"]');
      const nodes = [...active.querySelectorAll('.lyrics-karaoke-word-stack')];
      if (!nodes.length) throw new Error('CJK active row did not receive real word-stack DOM');
      const contents = active.textContent;
      f.refreshWords(); await frames();
      const afterRefresh = [...active.querySelectorAll('.lyrics-karaoke-word-stack')];
      if (active.textContent !== contents || nodes.some((node, i) => node !== afterRefresh[i])) {
        throw new Error('A pending same-source word refresh removed cached word stacks');
      }
      const center = () => { const rect = active.getBoundingClientRect(); return rect.top + rect.height / 2; };
      const beforeCenter = center(), beforeHeight = predecessor.clientHeight;
      f.resolveWords('reading', 'reading', 0); await frames();
      const heightGrowth = predecessor.clientHeight - beforeHeight, centerJump = Math.abs(center() - beforeCenter);
      if (!(heightGrowth > 0) || centerJump > 1) {
        throw new Error('Predecessor word stacks displaced the unchanged active row: ' + JSON.stringify({ heightGrowth, centerJump }));
      }
      f.targetWords('ko'); await frames();
      if (active.querySelector('.lyrics-karaoke-word-stack')) throw new Error('Old-target words survived a target change');
      return { width, style, cachedNodesRetained: nodes.length, heightGrowth, centerJump, oldTargetHidden: true };
    }, { width, style }));
  }
  return { paused: results, playing, travel, words };
}
