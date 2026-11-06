// Offline acceptance of production CSS and karaoke rendering.
// node tests/fixtures/cjk_wrap_server.mjs /path/to/react18/node_modules [port]
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const modules = process.argv[2];
if (!modules) throw new Error('Pass a React 18 node_modules directory');
const section = (source, start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  if (from < 0 || to <= from) throw new Error('Missing production section: ' + start);
  return source.slice(from, to);
};
const renderer = () => {
  const source = readFileSync(resolve(root, 'Pages.js'), 'utf8');
  return [
    section(source, 'const prefersReducedLyricsMotion =', '\nconst '),
    section(source, 'const getTimedSyllablesFromLine', 'const getInterludeInfo'),
    section(source, 'const KARAOKE_PRE_SPACE_MIN_DURATION_MS', 'const getSyncedAnimationIndex'),
    section(source, 'const getKaraokeLineBounds', 'const SyncedLyricsPage = react.memo'),
    'window.ProductionLine = KaraokeLine;',
  ].join('\n');
};
const html = String.raw`<!doctype html><html><head><meta charset="utf-8">
<title>CJK whitespace wrapping regression</title><link rel="stylesheet" href="/style.css">
<style>
html,body{margin:0;background:#15171b;color:white;font-family:Arial,sans-serif}
main{padding:24px}.cases{display:flex;flex-wrap:wrap;align-items:flex-start;gap:20px}
section{padding:16px;border:1px solid #555;border-radius:12px}
h1{font-size:22px}h2,button,output{font:14px Arial,sans-serif}button{padding:10px}
.host{height:auto;--lyrics-font-size:28px;--lyrics-original-font-weight:700;--lyrics-original-letter-spacing:0px;--lyrics-color-active:white;--lyrics-color-inactive:#aaa}
.host .lyrics-lyricsContainer-LyricsLine{margin:0;padding:0;line-height:1.38}
.host p{margin:0}
/* Measure the settled typography in each state, without a transition leaving
   the previous state's spacing in place during a synchronous assertion. */
.host p,.host .lyrics-karaoke-line{transition:none!important}
#result{display:block;white-space:pre-wrap;margin:20px 0}
</style><script src="/react.js"></script><script src="/react-dom.js"></script><script>
const react=React;const {useState,useRef,useEffect,useMemo,useCallback}=React;
const CONFIG={visual:{'karaoke-bounce':false,'karaoke-text-effects':true,'furigana-enabled':false}};
window.CONFIG=CONFIG;
const Utils={getDetectedLanguage:()=>window.previewLocale||'ja',applyFuriganaIfEnabled:text=>text};window.Utils=Utils;
const getCopyableText=value=>Array.isArray(value)?value.join(''):String(value??'');
const toFiniteTime=value=>Number.isFinite(Number(value))?Number(value):null;
const getTrackPositionFPS=()=>60;
const KARAOKE_RELEASE_WINDOW_MS=820,KARAOKE_COMPLETION_POSITION_OFFSET_MS=900;
window.FuriganaConverter={isAvailable:()=>false};
</script><script src="/LyricsWordSegmenter.js"></script><script src="/renderer.js"></script></head><body><main>
<h1>CJK 공백 우선 줄바꿈 · 실제 렌더러 검증</h1>
<button id="run">전체 검증</button> <button id="focus">포커스 전환</button>
<output id="result">Ready</output><div class="cases" id="cases"></div></main><script>
const texts=[['ko','안녕하세요 반갑습니다 만나서반갑습니다정말반갑습니다'],
 ['ja','こんにちは お会いできて 嬉しいですまた明日も一緒に歩きましょう'],
 ['zh','你好世界 很高兴见到你 希望我们能够一直一起走下去明天再见']];
const specs=texts.flatMap(([locale,text])=>[
 [locale,text,'spaces'],[locale,text.replace(/ /g,'　'),'wide-spaces'],
 [locale,text.replace(/ /g,''),'unspaced'],
 [locale,text+' cafe\u0301','shaped'],
]);
const cases=[],rootElement=document.getElementById('cases');
for(const [locale,text,variant] of specs)for(const mode of ['line','character','word'])for(const width of [240,360]){
 const section=document.createElement('section');section.innerHTML='<h2>'+locale+' / '+variant+' / '+mode+' / '+width+'px</h2>';
 const host=document.createElement('div');host.className='host lyrics-lyricsContainer-SyncedLyrics';host.style.width=width+'px';
 section.append(host);rootElement.append(section);
 const line={text,startTime:1000,endTime:9000,karaokeGranularity:'word',syllables:Array.from(text,(text,i)=>({text,startTime:1000+i*150,endTime:1150+i*150}))};
 cases.push({locale,text,variant,mode,width,line,host,root:ReactDOM.createRoot(host)});
}
let focused=false;
const clock={getPosition:()=>1400};
function paint(active=false,complete=false){
 for(const c of cases){window.previewLocale=c.locale;
  ReactDOM.flushSync(()=>c.root.render(react.createElement('div',{
   className:'lyrics-lyricsContainer-LyricsLine'+(active?' lyrics-lyricsContainer-LyricsLine-active':'')},
   react.createElement('p',null,c.mode==='line'?c.text:react.createElement(window.ProductionLine,{
    line:c.line,position:complete?99999:active?1400:0,isActive:active,isEffectFocused:active,
    renderGranularity:c.mode,...(active?{liveClock:clock}:{})})))));
 }
}
function geometry(c){
 const nodes=[];
 const texts=c.mode==='line'?[c.host.querySelector('p').firstChild]:[...c.host.querySelectorAll('.lyrics-karaoke-glyph-fill,.lyrics-karaoke-text-run-space')].map(n=>n.firstChild);
 for(const text of texts){
  for(let i=0;i<text.length;i++){const range=document.createRange();range.setStart(text,i);range.setEnd(text,i+1);nodes.push(range);}
 }
 // The production active paragraph rises by 2px. Compare glyph positions
 // within that paragraph, so intended row motion is not mistaken for reflow.
 const base=c.host.querySelector('p').getBoundingClientRect();
 return nodes.map(n=>{const r=n.getBoundingClientRect();return {char:n.textContent??n.toString(),x:Math.round((r.left-base.left)*100)/100,y:Math.round((r.top-base.top)*100)/100,width:r.width};});
}
function run(){
 const failures=[],results=[],differences=[];paint(false);
 const before=cases.map(geometry);
 for(let i=0;i<cases.length;i++){
  const c=cases[i],g=before[i];let index=0;
  for(const token of c.text.split(/(\s+)/u)){
   const chars=g.slice(index,index+token.length);index+=token.length;
   if(!token.trim())continue;
   const width=chars.reduce((sum,ch)=>sum+ch.width,0),rows=new Set(chars.map(ch=>ch.y));
   if(width<=c.width-.5&&rows.size>1)failures.push(c.locale+'/'+c.variant+'/'+c.mode+'/'+c.width+': split fitting token '+token);
  }
  if(Math.max(...g.filter(ch=>ch.char.trim()).map(ch=>ch.x+ch.width))>c.width+.5)failures.push(c.locale+'/'+c.variant+'/'+c.mode+'/'+c.width+': horizontal overflow');
  const lines=new Set(g.filter(ch=>ch.char.trim()).map(ch=>ch.y)).size;
  if(lines<2)failures.push(c.locale+'/'+c.variant+'/'+c.mode+'/'+c.width+': long text did not wrap');
  results.push({locale:c.locale,variant:c.variant,mode:c.mode,width:c.width,lines});
 }
 for(const [active,complete] of [[true,false],[false,true],[false,false]]){
  paint(active,complete);
  cases.forEach((c,i)=>{const after=geometry(c);if(JSON.stringify(after)!==JSON.stringify(before[i])){
   failures.push(c.locale+'/'+c.variant+'/'+c.mode+'/'+c.width+': focus/completion changed layout');
   if(!differences.length){const j=after.findIndex((v,k)=>JSON.stringify(v)!==JSON.stringify(before[i][k]));differences.push({active,complete,before:before[i][j],after:after[j],spacing:getComputedStyle(c.host.querySelector('p')).letterSpacing});}
  }});
 }
 document.getElementById('result').textContent=JSON.stringify({passed:failures.length===0,cases:results.length,failures,differences},null,2);
 paint(true);focused=true;
}
document.getElementById('run').onclick=run;
document.getElementById('focus').onclick=()=>{focused=!focused;paint(focused);};
paint(false);
</script></body></html>`;
const files = new Map([
  ['/react.js', resolve(modules, 'react/umd/react.development.js')],
  ['/react-dom.js', resolve(modules, 'react-dom/umd/react-dom.development.js')],
  ['/style.css', resolve(root, 'style.css')],
  ['/LyricsWordSegmenter.js', resolve(root, 'LyricsWordSegmenter.js')],
]);
createServer((request,response)=>{
  const url=new URL(request.url,'http://127.0.0.1'),path=url.pathname;
  if(path==='/favicon.ico'){response.writeHead(204);response.end();return;}
  if(path!=='/'&&path!=='/renderer.js'&&!files.has(path)){response.writeHead(404);response.end();return;}
  let body=path==='/'?html:path==='/renderer.js'?renderer():readFileSync(files.get(path));
  // Canary for the previous focus-dependent spacing rule.
  if(path==='/'&&url.searchParams.has('legacyFocus'))body=body.replace('</style>',
    '.lyrics-lyricsContainer-SyncedLyrics .lyrics-lyricsContainer-LyricsLine:not(.lyrics-lyricsContainer-LyricsLine-active){letter-spacing:-0.005em}</style>');
  if(path==='/style.css')body=body.toString().replace(/^@import\s+[^;]+;/gm,'');
  response.writeHead(200,{'Content-Type':path==='/'?'text/html; charset=utf-8':path.endsWith('.css')?'text/css':'application/javascript','Cache-Control':'no-store'});
  response.end(body);
}).listen(Number(process.argv[3]||0),'127.0.0.1',function(){console.log('http://127.0.0.1:'+this.address().port);});
