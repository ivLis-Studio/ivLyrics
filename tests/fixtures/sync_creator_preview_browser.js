// Run against sync_creator_preview_server.mjs via playwright-cli run-code --filename.
async page => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const origin = new URL(page.url()).origin;
  assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin), 'Use the offline fixture');
  await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, route => route.fulfill({status:200,contentType:'text/css',body:''}));
  const results=[];
  for (const width of [1000,390]) {
    await page.setViewportSize({width,height:1000});
    await page.goto(origin);
    await page.locator('[data-locale="ja"] .lyrics-karaoke-char-reading').first().waitFor();
    for (const position of [1200,9000,1200]) {
      await page.evaluate(position=>window.paintPreview(position),position);
      const rows=await page.evaluate(()=>[...document.querySelectorAll('.preview-row')].map(row=>({
        locale:row.dataset.locale,
        glyphs:[...row.querySelectorAll('.lyrics-karaoke-glyph-fill')].map(node=>node.textContent),
        charReadings:row.querySelectorAll('.lyrics-karaoke-char-reading').length,
        runReadings:[...row.querySelectorAll('.lyrics-karaoke-run-reading')].map(node=>({text:node.textContent,width:node.getBoundingClientRect().width,color:getComputedStyle(node).webkitTextFillColor})),
        ruby:row.querySelectorAll('ruby rt').length,
      })));
      for (const row of rows) {
        if(row.locale==='ja'){assert(row.charReadings===4&&row.ruby===1,'Japanese glyph readings and ruby remain visible');continue;}
        assert(row.charReadings===0,'Shaped scripts retain whole text nodes');
        assert(row.runReadings.length===2,`${row.locale} has a reading for each contiguous word`);
        assert(row.runReadings.every(reading=>reading.width>0&&!/rgba\([^)]*,\s*0\)/.test(reading.color)),`${row.locale} readings stay painted after completion`);
      }
      const centered=await page.locator('#interlude').evaluate(node=>getComputedStyle(node).justifyContent==='center');
      assert(centered,'Interlude row centers inside preview');
      results.push({width,position,rows:rows.length});
    }
    await page.screenshot({path:`output/playwright/pr126-preview-${width}.png`,fullPage:true});
  }
  // A NORMAL lyric range must reset the line speaker's colour. DUET 4 colours the
  // row; the range has no colour of its own, so it has to fall back to the page
  // lyric colours instead of silently inheriting the row.
  const normalRange = await page.evaluate(() => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-2000px;top:0;width:900px;--lyrics-color-active:#ffffff;--lyrics-color-inactive:rgba(255,255,255,0.5)';
    const pageEl = document.createElement('div');
    pageEl.className = 'lyrics-lyricsContainer-SyncedLyricsPage is-karaoke';
    const list = document.createElement('div');
    list.className = 'lyrics-lyricsContainer-SyncedLyrics';
    const row = document.createElement('div');
    row.className = 'lyrics-lyricsContainer-LyricsLine speaker-duet-4';
    pageEl.append(list); list.append(row); host.append(pageEl); document.body.append(host);
    const root = ReactDOM.createRoot(row);
    const text = 'ABCDEF';
    const line = { text, startTime: 0, endTime: 6000, karaokeGranularity: 'character', speaker: 'DUET 4', kind: 'vocal',
      syllables: Array.from(text, (char, index) => ({ text: char, startTime: index * 1000, endTime: (index + 1) * 1000,
        ...(index >= 2 && index <= 3 ? { inlineStyle: true, styleKind: '', styleSpeaker: 'NORMAL' } : {}) })) };
    ReactDOM.flushSync(() => root.render(React.createElement(window.PreviewKaraokeLine, {
      line, position: 2500, isActive: true, isEffectFocused: true, isEffectLive: true, renderGranularity: 'character',
    })));
    const wrapper = row.querySelector('.ivlyrics-karaoke-range-style');
    const chars = [...row.querySelectorAll('.lyrics-karaoke-char')];
    const result = {
      wrapperClass: wrapper?.className || '',
      wrapperActive: wrapper ? getComputedStyle(wrapper).getPropertyValue('--lyrics-color-active').trim() : '',
      rowActive: getComputedStyle(row).getPropertyValue('--lyrics-color-active').trim(),
      normalColor: chars[3] ? getComputedStyle(chars[3]).color : '',
      duetColor: chars[5] ? getComputedStyle(chars[5]).color : '',
    };
    root.unmount(); host.remove();
    return result;
  });
  assert(/\bspeaker-normal\b/.test(normalRange.wrapperClass), 'NORMAL range keeps its reset class');
  assert(normalRange.wrapperActive === '#ffffff', 'NORMAL range resets to the page lyric colour');
  assert(normalRange.rowActive === '#bfaeff', 'the row keeps the line speaker colour');
  assert(normalRange.normalColor === 'rgba(255, 255, 255, 0.5)', 'NORMAL range uses the page inactive colour');
  assert(normalRange.duetColor !== 'rgba(255, 255, 255, 0.5)', 'other ranges keep the speaker colour');
  results.push({width: 'range-colour', position: 2500, rows: 1, normalRange});
  return results;
}
