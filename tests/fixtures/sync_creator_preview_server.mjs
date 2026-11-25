import { readPcStylesheet } from "../../.github/scripts/pc_stylesheet.mjs";
import { readInstrumentedKaraokeFixture, readWordSegmenterFixture } from "./legacy-page-source.mjs";
// Offline preview fixture using the production karaoke renderer and preview CSS.
// node tests/fixtures/sync_creator_preview_server.mjs /path/to/react18/node_modules [port]
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const modules = process.argv[2];
if (!modules) throw new Error('Pass a React 18 node_modules directory');
const section = (source, start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  if (from < 0 || to <= from) throw new Error(`Missing production section: ${start}`);
  return source.slice(from, to);
};
function renderer() {
  const source = readInstrumentedKaraokeFixture();
  return [
    source.slice(0, source.indexOf('const CREATOR_PROFILE_THEME_KEY =')),
    section(source, 'const getTrackPositionFPS =', 'const readLyricsGlobalOffset ='),
    section(source, 'const prefersReducedLyricsMotion =', '\nconst '),
    section(source, 'const getTimedSyllablesFromLine', 'const { getInterludeInfo'),
    section(source, 'const KARAOKE_PRE_SPACE_MIN_DURATION_MS', 'const shouldHideSyncedLine'),
    section(source, 'const getKaraokeLineBounds', 'const useLyricsTrackReveal ='),
    'window.PreviewKaraokeLine = KaraokeLine;',
  ].join('\n');
}
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sync creator production preview</title><link rel="stylesheet" href="/style.css">
<style>html,body{margin:0;background:#101214;color:#fff;font-family:system-ui}main{max-width:1000px;margin:24px auto;padding:20px;box-sizing:border-box}.preview-row{padding:32px 18px 38px;margin:16px 0;border:1px solid #444;border-radius:12px;line-height:1.2;font-size:32px;text-align:center}.preview-row h2{font:12px system-ui;color:#aaa;margin:0 0 18px}#interlude{display:flex;font-size:16px;gap:8px}</style>
<script src="/react.js"></script><script src="/react-dom.js"></script><script>
const react=React;const {useState,useRef,useEffect,useMemo,useCallback}=React;
const CONFIG={visual:{'karaoke-bounce':false,'karaoke-text-effects':false,'furigana-enabled':false}};window.CONFIG=CONFIG;
const Utils={getDetectedLanguage:()=>window.previewLocale||'ja',applyFuriganaIfEnabled:text=>text};window.Utils=Utils;
window.FuriganaConverter={isAvailable:()=>false};
</script><script src="/LyricsWordSegmenter.js"></script><script src="/renderer.js"></script></head><body>
<main class="sync-creator-live-preview-exact" style="--lyrics-color-active:#fff;--lyrics-color-inactive:rgba(255,255,255,.5)"><div id="rows"></div><p id="interlude" class="lyrics-lyricsContainer-LyricsLine-interludeMain"><span>♫</span><span>Interlude</span></p></main>
<script>
window.previewRows=[['漢字の歌','ja',['kan','ji','no','uta']],['مرحبا بالعالم','ar',['marhaban','bilalam']],['ภาษาไทย สวัสดี','th',['phasa thai','sawatdi']],['अच्छा गाना','hi',['accha','gana']],['á voice','en',['accent','voice']]];
const previewRoot=ReactDOM.createRoot(document.getElementById('rows'));
window.paintPreview=(position=1200)=>ReactDOM.flushSync(()=>previewRoot.render(react.createElement(react.Fragment,null,...window.previewRows.map(([text,locale,readings],row)=>{
window.previewLocale=locale;const chars=Array.from(text),line={text,startTime:1000,endTime:5000,syllables:chars.map((char,index)=>({text:char,startTime:1000+index*110,endTime:1110+index*110}))};
const map=new Map();if(locale==='ja')readings.forEach((reading,index)=>map.set(index,{text:reading,dx:0}));else {map.set(0,{text:readings[0],dx:0});map.set(chars.indexOf(' ')+1,{text:readings[1],dx:0});}
return react.createElement('section',{className:'preview-row',key:row,'data-locale':locale},react.createElement('h2',null,locale),react.createElement(window.PreviewKaraokeLine,{line,position,isActive:true,renderGranularity:'character',charReadings:map,furiganaMapOverride:locale==='ja'?new Map([[0,'かん']]):null}));
}))));window.paintPreview();
</script></body></html>`;
const files = new Map([
  ['/react.js', resolve(modules, 'react/umd/react.development.js')],
  ['/react-dom.js', resolve(modules, 'react-dom/umd/react-dom.development.js')],
]);
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  try {
    if (path === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    if (path !== '/' && path !== '/renderer.js' && path !== '/LyricsWordSegmenter.js' && path !== '/style.css' && !files.has(path)) { response.writeHead(404); response.end(); return; }
    const body = path === '/' ? html : path === '/renderer.js' ? renderer()
      : path === '/LyricsWordSegmenter.js' ? readWordSegmenterFixture() : (path === '/style.css' ? readPcStylesheet() : readFileSync(files.get(path)));
    response.writeHead(200, {'Content-Type': path === '/' ? 'text/html; charset=utf-8' : path.endsWith('.css') ? 'text/css' : 'application/javascript', 'Cache-Control':'no-store'});
    response.end(body);
  } catch (error) { response.writeHead(500); response.end(error.message); }
});
server.listen(Number(process.argv[3]||0),'127.0.0.1',()=>console.log(`Sync preview fixture: http://127.0.0.1:${server.address().port}`));
