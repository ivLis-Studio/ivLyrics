import { readClassicLanguageFixture } from "./language-source.mjs";
import { readSyncCreatorFixture } from "./legacy-page-source.mjs";
// Offline production-source selection, partial-style controls and character renderer.
// node tests/fixtures/sync_creator_style_selection_server.mjs /path/to/react18/node_modules [port]
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { sourceUrl } from './source-paths.mjs';
import { readPcStylesheet } from '../../.github/scripts/pc_stylesheet.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const modules = process.argv[2];
if (!modules) throw new Error('Pass a React 18 node_modules directory');
const section = (source, start, end) => {
  const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
  if (from < 0 || to <= from) throw new Error(`Missing production section: ${start}`);
  return source.slice(from, to);
};
function fixture() {
  const source = readSyncCreatorFixture();
  const part = (start, end) => section(source, start, end);
  return `${source.slice(0, source.indexOf('const SyncDataCreator ='))}
const react=React;const {useState,useRef,useEffect,useMemo,useCallback}=React;
const language=new URLSearchParams(location.search).get('language')||'en';
const dictionary=language==='ko'?window.LANG_KO:window.LANG_EN;
const I18n={t:key=>key.split('.').reduce((value,part)=>value?.[part],dictionary)||key};
const Toast={success(){},error:message=>{throw new Error(message)}};
const noop=()=>{};
function SelectionFixture(){
  const [mode,setMode]=useState('idle'),[activeParallelTargetId,setTarget]=useState('full');
  const [syncData,setSyncData]=useState({version:5,lines:[{start:10,end:15,chars:[1,2,3,4,5,6],speaker:'NORMAL',kind:'vocal'}]});
  const [lineStyleDrafts,setLineStyleDrafts]=useState({});
  const [bulkCustomSpeakerColor,setBulkCustomSpeakerColor]=useState(''),[bulkCustomSpeakerFallback,setBulkCustomSpeakerFallback]=useState('MALE 1');
  const customSpeakerMetaMemoryRef=useRef(new Map()),wholeTargetWrites=useRef([]),trackId='fixture';
  const currentLineStart=10,currentLineIndex=0,currentFullLineChars=useMemo(()=>Array.from('ABCDEF'),[]),lyricsLines=['ABCDEF'];
  const currentLineCharRefs=useMemo(()=>(activeParallelTargetId==='full'?[0,1,2,3,4,5]:[2,3,5]).map(index=>({absoluteIndex:10+index,localIndex:index,char:currentFullLineChars[index]})),[activeParallelTargetId]);
  const currentLineChars=useMemo(()=>currentLineCharRefs.map(ref=>ref.char),[currentLineCharRefs]),currentLineText=currentLineChars.join('');
  const activeParallelPart=activeParallelTargetId==='full'?null:{id:'part',role:'background',speaker:'NORMAL',kind:'vocal'};
  const currentLineMeta={speaker:'NORMAL',kind:'vocal',...syncData.lines[0]};
  const currentLineStyleRanges=lineStyleDrafts[currentLineStart]||syncData.lines[0].styleRanges||[];
  const charElementsRef=useRef([]),scorePendingEffectsRef=useRef(new Map());
  const pointerGestureRef=useRef(null),suppressNextLockContextMenuRef=useRef(false);
  const clearPointerRecording=()=>{pointerGestureRef.current=null;};
  const isCurrentSyncTargetMetaComplete=true,syncGranularity='character',currentSpeakerTextColor='#f2f4f7',currentSpeakerMutedColor='#999';
  const getGranularityRangeForIndex=useCallback(index=>({start:index,end:index}),[]);
  const getCharIndexFromPoint=useCallback(x=>{
    const distances=charElementsRef.current.slice(0,currentLineChars.length).map((element,index)=>({index,distance:Math.abs(x-(element.getBoundingClientRect().left+element.getBoundingClientRect().width/2))}));
    return distances.sort((a,b)=>a.distance-b.distance)[0]?.index??-1;
  },[currentLineChars.length]);
  const showMissingMetaToast=noop,clearRecordingLock=noop,getCurrentSyncTargetSavedChars=()=>syncData.lines[0].chars,getActiveRecordingLockRange=()=>null,setRecordingLockRangeValue=noop,setRecordingLockIndexValue=noop,buildLockedCharTimes=()=>[],setRecordingProgressIndex=noop,handleDragStart=noop,applyRecordingLockRange=noop,claimSessionForLocalEditing=noop;
  ${part('\tconst [offsetSelectionRange, setOffsetSelectionRange]', '\tconst applyRecordingLockRange =')}
  const pointerTarget=useMemo(()=>({mode,activeParallelTargetId,currentLineText}),[mode,activeParallelTargetId,currentLineText]);
  const handleContainerMouseDown=useSyncCreatorPointerSelection({
    react,document,target:pointerTarget,gestureRef:pointerGestureRef,suppressContextMenuRef:suppressNextLockContextMenuRef,
    context:{mode,hasLine:true,isEditorOpen:()=>true,isCurrentSyncTargetMetaComplete,showMissingMetaToast,getCharIndexFromPoint,
      handleDragStart,handleDragMove:noop,handleDragEnd:noop,handleDragCancel:noop,applyRecordingLockRange,applyOffsetSelectionRange},
  });
  const lifetime={canStartOperation:()=>true};
  const { updateCurrentLineStyleRanges, updateCurrentVocalMeta: commitVocalMeta }=useSyncCreatorVocalEditor({
    react, styles:syncCreatorVocalStyles, toast:Toast, i18n:I18n, syncDataVersion:SYNC_CREATOR_SYNC_DATA_VERSION,
    canStartOperation:lifetime.canStartOperation,
    target:{mode,multiVocalMode:Boolean(activeParallelPart),currentLineIndex,currentLineStart,currentLineText,currentFullLineChars,
      activeParallelPart,activeParallelTargetId,currentLineCharRefs,currentLineStyleRanges},
    song:{trackId,lyricsLines,lineCharOffsets:[currentLineStart],syncData},bulkSpeaker:{},layout:{},
    refs:{offsetSelectionRangeRef,offsetSelectionTargetRef,scorePendingEffectsRef,customSpeakerMetaMemoryRef},
    edit:{claimSessionForLocalEditing,setLineStyleDrafts,setSyncData,setLineMetaDrafts:noop,setParallelPartMetaDrafts:noop},
  });
  useSyncCreatorSelectionReset({react,target:pointerTarget,clearLyricTextSelection,clearOffsetSelection});
  const usePrimaryCharacterPronunciation=false,hasCurrentLineFurigana=false,hasCurrentLineCharacterPronunciation=false,currentLineRenderedPronunciationUnits=[];
  ${part("\tconst {\n\t\t'furigana-font-size': furiganaFontSize,", "\tconst currentLineData =")}
  const textEffectsDisabled=true;
  const requestSongVocalSpeaker=noop;
  const updateCurrentVocalMeta=patch=>{
    for(const [field,value] of Object.entries(patch))wholeTargetWrites.current.push(activeParallelPart?['part',activeParallelPart.id,field,value]:['line',field,value]);
    return commitVocalMeta(patch);
  };
  ${part('\tconst updateCurrentTextEffect =', '\tconst syncGranularityRecordingHint =')}
  const currentRecordingCharIndex=-1,isRecordingLockArmed=false,recordingLockRange=null,recordingLockIndex=-1,currentLockedPlaybackIndex=null,currentLinePreviewIndex=-1,currentLinePlayedMarks=null,useFixedPrimaryCharacterCells=false;
  const currentLineFuriganaMap=new Map(),currentLineCharacterPronunciationMap=new Map();
  const isCharSynced=()=>true,getCharSyncTime=(_,index)=>syncData.lines[0].chars[currentLineCharRefs[index].localIndex],formatSeconds=value=>value.toFixed(1)+'s';
  const currentLineDirection='ltr',useCurrentLineTextRun=false,rtlTextRunStyle={},rtlTextRunRef=useRef(null);
  const currentGranularityRanges=[],currentWordBoundaryStartIndexes=new Set();
  const currentLineRenderedPronunciationUnitByStart=new Map(),currentLineRenderedPronunciationCoveredIndexes=new Set();
  const charHitBoxesRef=useRef([]),charScrollMetricsRef=useRef([]),lastPaintedPlaybackIndexRef=useRef(-1);
  const characterRefs=useSyncCreatorGlyphLayout({
    react, line:{index:currentLineIndex,partId:activeParallelTargetId,text:currentLineText,charCount:currentLineChars.length},
    refs:{charElementsRef,charHitBoxesRef,charScrollMetricsRef,lastPaintedPlaybackIndexRef},
    invalidateRecordingPaint:noop,
  });
  ${part('\tconst renderCurrentLineCharacters =', '\tconst renderParallelPartLine =')}
  const lyricsText=lyricsLines[0],isCurrentLineSynced=true,currentParallelParts=[],hasCurrentParallelParts=false,currentTextEffectKind=currentLineMeta.kind;
  const isLoading=false,error=null,multiVocalMode=Boolean(activeParallelPart),showLivePreview=false,syncGranularityRecordingHint='';
  const previousNavigableLineIndex=-1,nextNavigableLineIndex=-1,goToPrevLine=noop,goToNextLine=noop,lyricsScrollRef=useRef(null);
  const getSyncCreatorFuriganaReact=text=>text,renderManualSplitEditor=noop,renderLivePreviewOverlay=noop,renderParallelPartLine=noop;
  ${part('\tconst renderStagePanel =', '\tconst { getCurrentLastCharEndInfo, setCurrentLastCharEnd }')}
  window.selectionFixtureState={mode,target:activeParallelTargetId,range:offsetSelectionRange,syncData,lineStyleDrafts,wholeTargetWrites:wholeTargetWrites.current};
  return react.createElement('main',null,
    react.createElement('p',null,'Offline production-source fixture — no Spotify session or API calls'),
    react.createElement('nav',null,...['full','part'].map(value=>react.createElement('button',{key:value,'data-fixture-target':value,onClick:()=>setTarget(value)},value)),react.createElement('button',{'data-fixture-mode':true,onClick:()=>setMode(value=>value==='record'?'idle':'record')},mode)),
    react.createElement('div',{id:'lyric-row'},renderStagePanel()),
    react.createElement('div',{id:'inspector'},renderLineInspector()));
}
ReactDOM.createRoot(document.getElementById('root')).render(react.createElement(SelectionFixture));`;
}
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Partial style selection fixture</title>
<link rel="stylesheet" href="/style.css"><style>:root{--spice-text:#f2f4f7;--spice-subtext:#aeb5bf;--spice-rgb-accent:30,215,96;--spice-rgb-text:242,244,247;--font-family:system-ui}body{margin:0;background:#0f1215;color:var(--spice-text);font-family:system-ui}main{box-sizing:border-box;max-width:1000px;margin:24px auto;padding:20px}main>p{font-size:12px;color:var(--spice-subtext)}nav{display:flex;gap:8px;margin:20px 0}nav button{padding:8px 14px;background:#20252b;color:var(--spice-text);border:1px solid #444;border-radius:6px}</style>
<script src="/react.js"></script><script src="/react-dom.js"></script><script src="/langs/LangEn.js"></script><script src="/langs/LangKo.js"></script><div id="root"></div><script src="/fixture.js"></script>`;
const files = new Map([
  ['/react.js',resolve(modules,'react/umd/react.development.js')],['/react-dom.js',resolve(modules,'react-dom/umd/react-dom.development.js')],
  ...['langs/LangEn.js','langs/LangKo.js'].map(path=>['/'+path,sourceUrl(path)]),
]);
const server=createServer((request,response)=>{
  const path=new URL(request.url,'http://127.0.0.1').pathname;
  try{
    if(path==='/favicon.ico'){response.writeHead(204);response.end();return;}
    if(path!=='/'&&path!=='/fixture.js'&&path!=='/style.css'&&!files.has(path)){response.writeHead(404);response.end();return;}
    let body=path==='/'?html:path==='/fixture.js'?fixture():path==='/style.css'?readPcStylesheet():readFileSync(files.get(path));
    if(path.startsWith('/langs/'))body=readClassicLanguageFixture(path.slice('/langs/'.length));
    if(path==='/style.css')body=body.toString().replace(/@import\s+url\(["']?https?:\/\/[^)]+\)\s*;/g,'');
    response.writeHead(200,{'Content-Type':path==='/'?'text/html; charset=utf-8':path.endsWith('.css')?'text/css':'application/javascript; charset=utf-8','Cache-Control':'no-store'});response.end(body);
  }catch(error){response.writeHead(500);response.end(error.stack);}
});
server.listen(Number(process.argv[3]||0),'127.0.0.1',()=>console.log('Selection fixture: http://127.0.0.1:'+server.address().port));
