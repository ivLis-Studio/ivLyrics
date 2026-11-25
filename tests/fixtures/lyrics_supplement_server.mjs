import { readPcStylesheet } from "../../.github/scripts/pc_stylesheet.mjs";
// Loopback-only fixture: production pages, presentation mapping, CSS and React.
// node tests/fixtures/lyrics_supplement_server.mjs /path/to/react18/node_modules [port]
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { bundleFixtureImports, readInstrumentedKaraokeFixture, readTranslationRuntimeFixture, readVinylActiveLyricRendererFixture, readWordSegmenterFixture } from './legacy-page-source.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const modules = process.argv[2];
if (!modules) throw new Error('Pass the React 18 node_modules directory');
const section = (source, from, to) => {
  const start = source.indexOf(from), end = source.indexOf(to, start + from.length);
  if (start < 0 || end <= start) throw new Error('Missing production section: ' + from);
  return source.slice(start, end);
};
const html = baseline => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Live supplement generation</title>
<link rel="stylesheet" href="/style.css"><style>
html,body{margin:0;background:#101214;color:white;font-family:Arial,sans-serif}
header{padding:12px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;font:14px Arial}
button,select{padding:8px;background:#282b30;color:#fff;border:1px solid #555}
#host{height:75vh;position:relative;overflow:hidden}
.lyrics-lyricsContainer-LyricsContainer{height:100%;font-size:32px}
.lyrics-lyricsContainer-SyncedLyricsPage,.lyrics-lyricsContainer-UnsyncedLyricsPage{height:100%;overflow:auto}
</style><script src="/react.js"></script><script src="/react-dom.js"></script><script>
const react=React,reactDom=ReactDOM;
const {useState,useRef,useEffect,useMemo,useCallback}=React;
let position=1400,playing=false,epoch=performance.now(),style='expressive',expanded=false,track='fixture';
let locale='en',revision=0,reveal=true,wordTarget='en';
const wordRequests=[];
const progress=()=>position+(playing?performance.now()-epoch:0);
const CONFIG={visual:{delay:0,'karaoke-bounce':true,'karaoke-text-effects':true,'karaoke-motion-style':'expressive',
 'karaoke-line-transition':true,'translate:display-mode':'both','synced-compact':true,
 'lines-before':3,'lines-after':3,'fade-blur':false,'highlight-mode':false,'blur-size':0,
 'synced-lines-background':false,'lyrics-align':'center','reduce-motion':false,'auto-instrumental-break':false}};
window.CONFIG=CONFIG;
const Utils={getDetectedLanguage:()=>locale,getSafePlayerProgress:progress,
 getPlayerPlaybackSnapshot:()=>({position:progress(),sampledAt:performance.now(),isPlaying:playing}),
 getTrackSyncOffset:async()=>0,getGlobalSyncOffset:()=>0,getPseudoKaraokeRenderAdvance:()=>0,
 rubyTextToHTML:text=>String(text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
 applyFuriganaIfEnabled:text=>text,isSectionHeader:()=>false,
 formatLyricLineToCopy:text=>String(text||''),createHTMLProps:text=>({dangerouslySetInnerHTML:{__html:text}})};
window.Utils=Utils;
const Spicetify={Player:{getProgress:progress,getDuration:()=>240000,data:{get item(){return {uri:'spotify:track:'+track,duration:{milliseconds:240000}}}},
 addEventListener(){},removeEventListener(){},seek(){}},React:React,SVGIcons:{search:''},
 Mousetrap:()=>({bind(){},unbind(){}}),Platform:{History:{location:{pathname:'/ivLyrics'}}}};window.Spicetify=Spicetify;
const I18n={t:key=>key,getCurrentLanguage:()=> 'en'};
const StorageManager={get:(_key,fallback)=>fallback,getItem:()=>null};
const Toast={success(){},error(){}};
const ivLyricsDebug=()=>{};
window.FuriganaConverter={isAvailable:()=>false};
window.ivLyricsTextComparison={normalize:text=>String(text||'').trim(),areEquivalent:(a,b)=>a===b};
window.__supplementPreparations=0;
</script><script src="/LyricsWordSegmenter.js"></script><script src="/Pages.js${baseline ? '?baseline=1' : ''}"></script>
<script src="/presentation.js"></script></head><body>
<header><strong>Production lyric pages</strong><select id="style"><option>expressive</option><option>classic</option></select>
<button id="phonetic">Add pronunciation</button><button id="translation">Add translation</button>
<button id="culture">Add explanation</button><button id="reset">Reset</button></header>
<div id="host"><div class="lyrics-lyricsContainer-LyricsContainer" id="root" style="--font-family:Arial;--lyrics-font-size:32px;--lyrics-color-active:#fff;--lyrics-color-inactive:#888;--lyrics-line-height:1.6;--lyrics-original-font-size:32px;--lyrics-phonetic-font-size:16px;--lyrics-translation-font-size:16px"></div></div>
<script>
const sourceLine=(text,startTime)=>({text,originalText:text,startTime,endTime:startTime+4000,
 syllables:Array.from(text,(char,index)=>({text:char,startTime:startTime+index*150,endTime:startTime+(index+1)*150}))});
const originalBase=Array.from({length:36},(_,index)=>sourceLine(index===0?'Hello world voice':index===1?'blah-blah-blah again':'Another lyric '+index,1000+index*5000));
let base=originalBase;
const wordApi={
 getSourceLanguage:()=>locale,resolveSourceLanguage:()=>locale,isSuitableSourceLanguage:lang=>lang==='ja',
 resolveReadingMode:()=> 'gemini_romaji',isGlossModeActive:()=>true,
 getGlossTargetLanguage:()=>wordTarget,getPronunciationNotation:()=> 'latin',isAiCoolingDown:()=>true,
 getLineKey:line=>String(line.startTime),
 getWordUnits(chars){const units=new Map();chars.forEach((char,index)=>{
  if(!String(char.char).trim())return;const key=char.karaokeWordIndex??'c'+index;
  if(!units.has(key))units.set(key,{wordKey:key,surface:''});units.get(key).surface+=char.char;
 });return [...units.values()];},
 getWordReadings:(units,lang,mode,text,options)=>new Promise(resolve=>wordRequests.push({kind:'reading',units,text,options,resolve})),
 getWordGlosses:(units,text,lang,options)=>new Promise(resolve=>wordRequests.push({kind:'gloss',units,text,options,resolve}))
};
let phonetic=null,translation=null,culture=false,lyrics=base;
const app=new ProductionPresentation();app.state={uri:'fixture',currentLyrics:base};
app.isCulturalAnnotationsEnabled=()=>culture;app.fixtureAnnotationResults=new Map();
const root=ReactDOM.createRoot(document.getElementById('root'));
function render(){
 CONFIG.visual['karaoke-motion-style']=style;
 ReactDOM.flushSync(()=>root.render(React.createElement(expanded?ProductionSupplement.Expanded:ProductionSupplement.Compact,
 {lyrics,isKara:true,trackUri:'spotify:track:'+track,trackRevealKey:reveal?track:null,reRenderLyricsPage:revision})));
}
function paint(){const {painter,paint}=ProductionSupplement;
 if(painter.frameId!==null){cancelAnimationFrame(painter.frameId);painter.frameId=null;}
 for(const entry of painter.entries)paint(entry,performance.now());}
function publish(){lyrics=app.optimizeTranslations(base,phonetic,translation,'gemini_romaji','gemini_ko');
 app.state.currentLyrics=lyrics;render();paint();}
window.supplementFixture={
 reset(options={}){position=1400;playing=false;epoch=performance.now();phonetic=null;translation=null;culture=false;
  app.fixtureAnnotationResults.clear();style=options.style||'expressive';expanded=!!options.expanded;
  reveal=options.reveal!==false;revision=0;locale=options.words?'ja':'en';wordTarget='en';
  wordRequests.length=0;
  const supplements=options.words?wordApi:null;
  if(typeof setFixtureWordSupplementService==='function')setFixtureWordSupplementService(supplements);
  else window.ivLyricsWordSupplements=supplements;
  base=options.words?Array.from({length:36},(_,index)=>({...sourceLine('漢字 歌 '+index,1000+index*5000),karaokeGranularity:'word'})):originalBase;
  lyrics=base;app.state.currentLyrics=base;render();paint();},
 add(kind,count=36){if(kind==='phonetic')phonetic=base.map((_,i)=>i<count?'reading '+i:null);
  if(kind==='translation')translation=base.map((_,i)=>i<count?'meaning '+i:null);
  if(kind==='culture'){culture=true;app.fixtureAnnotationResults.set('fixture',{notesByIndex:new Map([[0,[{marker:1,expression:'Hello',note:'Cultural explanation'}]]])});}
  publish();},
 step(delta=1000/120){position=progress()+delta;playing=false;epoch=performance.now();
  ReactDOM.flushSync(()=>{for(const callback of AnimationManager.callbacks)callback()});paint();},
 play(){position=progress();epoch=performance.now();playing=true;},
 pause(){position=progress();playing=false;paint();},
 track(next){track=next;render();paint();},
 replaceLyrics(next,nextTrack){if(nextTrack)track=nextTrack;base=next;lyrics=next;app.state.currentLyrics=next;render();paint();},
 get position(){return progress()},
 refreshWords(){ReactDOM.flushSync(()=>window.dispatchEvent(new CustomEvent('ivLyrics:word-supplements-invalidated')));},
 targetWords(next){wordTarget=next;revision++;render();paint();},
 resolveWords(kind,prefix='reading',lineIndex=null){
  const text=lineIndex===null?null:base[lineIndex].text;
  const matching=wordRequests.filter(request=>request.kind===kind&&(text===null||request.text===text));
  for(const request of matching){wordRequests.splice(wordRequests.indexOf(request),1);request.resolve(request.units.map(()=>prefix));}
  return matching.length;
 },
 get wordRequests(){return wordRequests},
 get entries(){return [...ProductionSupplement.painter.entries]},get lyrics(){return lyrics}
};
for(const kind of ['phonetic','translation','culture'])document.getElementById(kind).onclick=()=>supplementFixture.add(kind);
document.getElementById('reset').onclick=()=>supplementFixture.reset();
document.getElementById('style').onchange=event=>supplementFixture.reset({style:event.target.value});
render();
</script></body></html>`;
createServer((request,response)=>{
  try {
    const url=new URL(request.url,'http://127.0.0.1');let body,type='application/javascript';
    if(url.pathname==='/favicon.ico'){response.writeHead(204);response.end();return;}
    if(url.pathname==='/'){body=html(url.searchParams.has('baseline'));type='text/html';}
    else if(url.pathname==='/Pages.js'){
      body=url.searchParams.has('baseline')?execFileSync('git',['show','7cf6ee0^:Pages.js'],{cwd:root,encoding:'utf8'}):readInstrumentedKaraokeFixture();
      body=body.replace('const compensatedTimedChars = applyKaraokeWhitespaceCompensation(buildKaraokeTimedChars(line));',
        'window.__supplementPreparations++; const compensatedTimedChars = applyKaraokeWhitespaceCompensation(buildKaraokeTimedChars(line));');
      body+='\nwindow.ProductionSupplement={Compact:SyncedLyricsPage,Expanded:SyncedExpandedLyricsPage,painter:KaraokeLivePainter,paint:paintKaraokeLiveEntry};';
    } else if(url.pathname==='/presentation.js'){
      const source=readFileSync(resolve(root,'src/spicetify/index.js'),'utf8');
      body=[
        bundleFixtureImports('import { createPageTranslationMemoryCache } from "#ivlyrics/lyrics/pageMemoryCache.mjs";\nconst CacheManager = createPageTranslationMemoryCache();', 'fixtureTranslationCache'),
        readTranslationRuntimeFixture(),
        bundleFixtureImports('import { applyCulturalAnnotationsToLyrics } from "#ivlyrics/lyrics/lyricCulturalAnnotations.mjs";', 'fixtureCulturalAnnotations'),
        `class ProductionPresentation {
          applyCulturalAnnotations(lyrics, uri = this.state.uri) {
            const result = this.isCulturalAnnotationsEnabled() ? this.fixtureAnnotationResults.get(uri) : null;
            return applyCulturalAnnotationsToLyrics(lyrics, result?.notesByIndex);
          }
          ${section(source,'  optimizeTranslations(','  getGeminiTranslation(')}
        }`,
      ].join('\n');
    } else if(url.pathname==='/react.js'||url.pathname==='/react-dom.js'){
      const name=url.pathname==='/react.js'?'react':'react-dom';body=readFileSync(resolve(modules,name,'umd',name+'.development.js'));
    } else if(url.pathname==='/LyricsWordSegmenter.js')body=readWordSegmenterFixture();
    else if(url.pathname==='/VinylActiveLyricRenderer.js')body=readVinylActiveLyricRendererFixture();
    else if(url.pathname==='/style.css'||url.pathname==='/karaoke-before.css'){
      body=(url.pathname==='/karaoke-before.css'
        ?execFileSync('git',['show','44c062547c2448b015610882090503aa98b5f7cb:style.css'],{cwd:root,encoding:'utf8'})
        :readPcStylesheet()).replace(/^@import\s+[^;]+;/gm,'');
      type='text/css';
    }
    else{response.writeHead(404);response.end();return;}
    response.writeHead(200,{'Content-Type':type+';charset=utf-8','Cache-Control':'no-store'});response.end(body);
  }catch(error){response.writeHead(500);response.end(String(error.stack));}
}).listen(Number(process.argv[3]||0),'127.0.0.1',function(){console.log('Supplement fixture http://127.0.0.1:'+this.address().port)});
