import { readPcStylesheet } from "../../.github/scripts/pc_stylesheet.mjs";
import { readInstrumentedKaraokeFixture, readWordSegmenterFixture } from "./legacy-page-source.mjs";
// Offline production fixture. No Spotify session, build or network CDN needed.
// node tests/fixtures/karaoke_expressive_server.mjs /path/to/react18/node_modules [port]
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const modules = process.argv[2];
if (!modules) throw new Error('Pass a React 18 node_modules directory');
const section = (source, start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  if (from < 0 || to <= from) throw new Error('Missing production section: ' + start);
  return source.slice(from, to);
};
function renderer() {
  const source = readInstrumentedKaraokeFixture();
  return [
    source.slice(0, source.indexOf('const CREATOR_PROFILE_THEME_KEY =')),
    section(source, 'const prefersReducedLyricsMotion =', '\nconst '),
    section(source, 'const getTimedSyllablesFromLine', 'const { getInterludeInfo'),
    section(source, 'const KARAOKE_PRE_SPACE_MIN_DURATION_MS', 'const shouldHideSyncedLine'),
    section(source, 'const getKaraokeLineBounds', 'const useLyricsTrackReveal ='),
    'window.ProductionKaraoke = { Line: KaraokeLine, painter: KaraokeLivePainter, paint: paintKaraokeLiveEntry };',
  ].join('\n');
}

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PR #125 production karaoke fixture</title><link rel="stylesheet" href="/style.css">
<style>
html,body{margin:0;background:#101214;color:#fff;font-family:Arial,sans-serif}
main{max-width:1000px;margin:auto;padding:20px;box-sizing:border-box}
header{display:flex;gap:12px;flex-wrap:wrap;padding:12px 0;font-size:14px}
header label{display:flex;align-items:center;gap:6px}select,button{color:#fff;background:#282b30;padding:6px}
button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #80bdff;outline-offset:2px}
.preview-row{padding:28px 18px 40px;margin:16px 0;border:1px solid #444;border-radius:12px;line-height:1.25;font-size:32px;text-align:center}
.preview-row h2{font:12px Arial,sans-serif;color:#bbb;margin:0 0 20px}.lyric-host{overflow:visible}
</style>
<script src="/react.js"></script><script src="/react-dom.js"></script><script>
const react=React;const {useState,useRef,useEffect,useMemo,useCallback}=React;
const CONFIG={visual:{'karaoke-bounce':true,'karaoke-text-effects':true,'karaoke-motion-style':'classic','furigana-enabled':false}};
window.CONFIG=CONFIG;
const Utils={getDetectedLanguage:()=>window.previewLocale||'en',applyFuriganaIfEnabled:text=>text};window.Utils=Utils;
const getTrackPositionFPS=()=>60;
window.FuriganaConverter={isAvailable:()=>false};
</script><script src="/LyricsWordSegmenter.js"></script><script src="/renderer.js"></script></head><body>
<main class="sync-creator-live-preview-exact" style="--lyrics-color-active:#fff;--lyrics-color-inactive:rgba(255,255,255,.5);--font-family:Arial,sans-serif">
<h1 style="font:20px Arial,sans-serif">Production karaoke: Classic / Expressive</h1>
<header>
<label>Motion style <select id="style"><option value="classic">Classic</option><option value="expressive">Expressive</option><option value="unset">Default (unset)</option></select></label>
<label><input id="bounce" type="checkbox" checked>Bounce</label>
<label><input id="effects" type="checkbox" checked>Text Effects</label>
<label><input id="live" type="checkbox" checked>Production live painter</label>
<label><input id="reduced" type="checkbox">App reduced motion</label>
<label>Position <input id="position" type="range" min="0" max="8000" step="1" value="1000"></label>
<button id="step">Advance 60 frames</button><button id="reset">Reset</button>
</header><div id="rows"></div></main>
<script>
// Lines, readings and ruby maps are constructed once, so repeated commits test
// production caches rather than replacing source data on every frame.
const sourceLine=(text,step=140,inline=false)=>({text,startTime:1000,endTime:1000+Array.from(text).length*step,
  syllables:Array.from(text,(char,index)=>({text:char,startTime:1000+index*step,endTime:1000+(index+1)*step,
    ...(inline?{inlineStyle:true,styleKind:'wave',styleSpeaker:'FEMALE 1'}:{})}))});
const specs=[
  ['short','Hi yo','en'],['unspaced','Hello','en'],['held','Gooooooosey','en'],
  ['accent','Gooo\u0301oooosey voice','en'],['arabic','مرحبا بالعالم','ar'],
  ['thai','ภาษาไทย สวัสดี','th'],['devanagari','अच्छा गाना','hi'],
  ['cjk','漢字の歌','ja'],['styled','Hello styled voice','en'],['word','Word timed voice','en'],
].map(([id,text,locale])=>{
  const labels={short:['hi','yo'],unspaced:['h'],held:['g'],accent:['go','voice'],
    arabic:['marhaban','bilalam'],thai:['phasa thai','sawatdi'],devanagari:['accha','gana'],
    cjk:['kan'],styled:['h','s'],word:['w','t']}[id];
  const readings=new Map([[0,{text:labels[0],dx:0}]]);
  if(text.includes(' '))readings.set(Array.from(text.split(' ')[0]).length+1,{text:labels[1],dx:0});
  return {id,locale,line:sourceLine(text,id==='held'?180:140,id==='styled'),readings,
    ruby:locale==='ja'?new Map([[0,'かん']]):null,granularity:id==='word'?'word':'character'};
});
const voiceA=sourceLine('Lead vocal'),voiceB=sourceLine('Background voice');
specs.push({id:'vocals',locale:'en',line:{text:'Lead / Background',startTime:1000,endTime:voiceB.endTime,
  vocals:{lead:voiceA,background:[voiceB]}},readings:null,ruby:null,granularity:'character'});
// Optional feature-request replay: keep the established 11-row baseline intact.
if(new URLSearchParams(location.search).has('longWords')){
  for(const [id,text,locale,step] of [
    ['long-latin','together again','en',110],
    ['long-cyrillic','длинный красивый','ru',110],
    ['longer-cyrillic','синхронизация сейчас','ru',110],
    ['quick-cyrillic','длинный красивый','ru',40],
    ['long-compound','electric-blue again','en',110],
  ])specs.push({id,locale,line:sourceLine(text,step),readings:null,ruby:null,granularity:'character'});
}
let position=1000,revision=0,live=true,frameTime=performance.now();
const clock={getPosition:()=>position};
const previewRoot=ReactDOM.createRoot(document.getElementById('rows'));
function ProductionRow({spec,position,revision,live}){
  window.previewLocale=spec.locale;
  return react.createElement('section',{className:'preview-row','data-case':spec.id,'data-locale':spec.locale},
    react.createElement('h2',null,spec.id+' / '+spec.locale),
    react.createElement('div',{className:'lyric-host'},react.createElement(window.ProductionKaraoke.Line,{
      line:spec.line,position,isActive:true,isEffectLive:true,settingsRevision:revision,renderGranularity:spec.granularity,
      charReadings:spec.readings,furiganaMapOverride:spec.ruby,...(live?{liveClock:clock}:{})})));
}
function paint(){
  ReactDOM.flushSync(()=>previewRoot.render(react.createElement(react.Fragment,null,
    ...specs.map(spec=>react.createElement(ProductionRow,{key:spec.id,spec,position,revision,live})))));
  // Keep fixture stepping deterministic. Effects register real production live
  // entries; only the RAF scheduling is driven manually for this offline page.
  const {painter,paint}=window.ProductionKaraoke;
  if(painter.frameId!==null){cancelAnimationFrame(painter.frameId);painter.frameId=null;}
  for(const entry of painter.entries)paint(entry,frameTime);
  document.getElementById('position').value=position;
}
window.expressiveFixture={
  apply(options={}){
    for(const [key,setting] of [['bounce','karaoke-bounce'],['effects','karaoke-text-effects'],['reduced','reduce-motion']]){
      if(key in options){CONFIG.visual[setting]=options[key];document.getElementById(key).checked=options[key];}
    }
    if('style' in options){
      if(options.style==='unset')delete CONFIG.visual['karaoke-motion-style'];else CONFIG.visual['karaoke-motion-style']=options.style;
      document.getElementById('style').value=options.style;
    }
    if('live' in options){live=options.live;document.getElementById('live').checked=live;}
    if('position' in options)position=options.position;
    revision++;frameTime=Math.max(frameTime,performance.now());paint();
  },
  seek(next){position=next;frameTime=Math.max(frameTime,performance.now());paint();},
  tick(frames=60,delta=1000/120){for(let frame=0;frame<frames;frame++){position+=delta;frameTime+=delta;paint();}},
  repaint(){paint();},
  get position(){return position;},
  get entryCount(){return window.ProductionKaraoke.painter.entries.size;},
};
for(const id of ['style','bounce','effects','live','reduced'])document.getElementById(id).addEventListener('change',event=>
  window.expressiveFixture.apply({[id]:id==='style'?event.target.value:event.target.checked}));
document.getElementById('position').addEventListener('input',event=>window.expressiveFixture.seek(Number(event.target.value)));
document.getElementById('step').addEventListener('click',()=>window.expressiveFixture.tick());
document.getElementById('reset').addEventListener('click',()=>window.expressiveFixture.seek(1000));
paint();
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
    let body = path === '/' ? html : path === '/renderer.js' ? renderer()
      : path === '/LyricsWordSegmenter.js' ? readWordSegmenterFixture() : (path === '/style.css' ? readPcStylesheet() : readFileSync(files.get(path)));
    // Remove only the external font import; all production karaoke CSS remains.
    if (path === '/style.css') body = body.toString().replace(/^@import\s+[^;]+;/gm, '');
    response.writeHead(200, {'Content-Type': path === '/' ? 'text/html; charset=utf-8' : path.endsWith('.css') ? 'text/css' : 'application/javascript', 'Cache-Control':'no-store'});
    response.end(body);
  } catch (error) { response.writeHead(500); response.end(error.message); }
});
server.listen(Number(process.argv[3] || 0), '127.0.0.1', () => console.log('Expressive fixture: http://127.0.0.1:' + server.address().port));
