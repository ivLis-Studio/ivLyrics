import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const codec = require('../SyncDataCodec.js');
const { create } = require('../SyncCreatorScoreTracker.js');
const store = require('../SyncCreatorDraftStore.js');
const copy = value => JSON.parse(JSON.stringify(value));
const snapshot = (count = 100) => codec.encode({ version: 5, lines: Array.from({length:count}, (_,i) => ({start:i*10,end:i*10+9,granularity:'line',timing:i})) });
function server() {
  let data, hash, sequence = 0, last, fail = false;
  const sent = [];
  return { sent, data: () => data, loseAck: () => { fail = true; }, request: async body => {
    sent.push(copy(body));
    assert.equal(body.formatVersion, 6);
    if (body.eventId === last?.eventId) { assert.deepEqual(body,last); return {success:true,sessionId:'session',sequence,contentHash:hash}; }
    if (body.action === 'start') { data = codec.encode(body.syncData); sequence=0; }
    else {
      assert.equal(body.sequence,sequence+1); assert.equal(body.baseHash,hash);
      if (body.action === 'heartbeat') { assert.equal(body.syncData,undefined); assert.equal(body.patch,undefined); }
      else data = codec.applyPatch(data,body.patch);
      sequence++;
    }
    hash = await codec.hash(data); assert.equal(body.resultHash,hash); last=copy(body);
    if (fail) { fail=false; throw new Error('lost acknowledgement'); }
    return {success:true,sessionId:'session',sequence,contentHash:hash};
  } };
}
function trackerFixture(receiver, initial, saved) {
  let durable=saved, clock=0;
  const tracker=create({ codec, accountId:'a',isrc:'USAAA2600001',initialSyncData:initial,setInterval:false,now:()=>clock,isActive:()=>true,
    storage:{getScoreWork:async()=>copy(durable || null),saveScoreWork:async(_,value)=>{durable=copy(value);}},request:receiver.request });
  return {tracker,saved:()=>durable,tick:ms=>{clock+=ms;}};
}
test('v6 writer patches one row and sends reference-only heartbeat with exact crash retries', async()=>{
  const receiver=server(), initial=snapshot(); const first=trackerFixture(receiver,initial);
  await first.tracker.flush(); first.tracker.interact(); first.tick(20000); first.tracker.heartbeat(); await first.tracker.flush();
  assert.equal(receiver.sent.at(-1).action,'heartbeat');
  const changed=copy(initial); changed.lines[35].timing.startMs+=10;
  receiver.loseAck(); first.tracker.enqueue('record',changed,{start:350,end:359,inputCount:1});
  await assert.rejects(first.tracker.flush(),/lost acknowledgement/);
  const event=copy(receiver.sent.at(-1)), durable=copy(first.saved());
  assert.equal(event.patch.put.length,1); assert.equal(event.syncData,undefined);
  assert.equal(durable.version,2); assert.equal(durable.queue[0].syncData,undefined); assert.equal(durable.queue[0].snapshotPatch.put.length,1);
  const restored=trackerFixture(receiver,changed,durable); await restored.tracker.flush();
  assert.deepEqual(receiver.sent.at(-1),event); assert.deepEqual(receiver.data(),changed);
  await restored.tracker.submission(changed); assert.equal(receiver.sent.at(-1).patch.put.length,0);
  restored.tracker.stop(); first.tracker.stop();
});
test('v1 work queues upgrade without changing event provenance or cumulative active time',async()=>{
  const receiver=server(),initial=snapshot(2); await receiver.request({formatVersion:6,eventId:'initial',action:'start',sequence:0,syncData:initial,resultHash:await codec.hash(initial)});
  const changed=copy(initial);changed.lines[1].timing.startMs+=10;
  const value=trackerFixture(receiver,changed,{version:1,scope:'a:USAAA2600001:lrclib',sessionId:'session',sequence:0,lastSnapshot:codec.decode(initial),queue:[{eventId:'old-pending',action:'record',syncData:codec.decode(changed),activeSeconds:20,target:{start:10,end:19,inputCount:1}}]});
  await value.tracker.flush(); const event=receiver.sent.at(-1);
  assert.equal(event.eventId,'old-pending');assert.equal(event.activeSeconds,20);assert.equal(event.action,'record');assert.equal(event.patch.put.length,1);value.tracker.stop();
});
test('history uses checkpoints and patches, restores arbitrary cursors and recovers after a damaged patch',()=>{
  const initial=snapshot(); const history=[];
  for(let i=0;i<30;i++){ const data=copy(initial);data.lines[20].timing.startMs+=i;history.push({id:'h'+i,snapshot:{syncData:data,editor:{lineIndex:i,mode:'idle'}},createdAt:100+i,kind:'manual'}); }
  const raw={recordVersion:1,history,draft:history[29].snapshot,historyCursorId:'h13'};
  const packed=store.__test.packStoredRecord(raw); assert.equal(packed.storageEncoding,6);
  assert.equal(packed.history[1].snapshot,undefined);assert.equal(packed.history[10].patch,undefined);
  assert.deepEqual(store.__test.unpackStoredRecord(copy(packed)),raw);
  assert.ok(JSON.stringify(packed).length<JSON.stringify(raw).length/3);
  const damaged=copy(packed);damaged.history[4].patch.sync.put[0].length=-1;
  const recovered=store.__test.unpackStoredRecord(damaged);
  assert.deepEqual(recovered.history.map(e=>e.id),[...Array.from({length:4},(_,i)=>'h'+i),...Array.from({length:20},(_,i)=>'h'+(i+10))]);
  assert.deepEqual(recovered.draft,raw.draft);
});
test('mixed precision survives JSON drafts, object spreads and held-end edits; exact parallel parent marks are omitted',()=>{
  const mixed=codec.encode({version:5,lines:[{start:0,end:3,granularity:'word',chars:[1,1,2,2.1]}]}, {chars:[...'A BC'],wordRanges:()=>[{end:1},{end:3}]});
  const view=copy(codec.decode(mixed));view.lines[0]={...view.lines[0],lastCharEnd:3};view.lines[0].chars[3]=2.2;
  const encoded=codec.encode(view);assert.equal(encoded.lines[0].timing.unit,'mixed');assert.equal(encoded.lines[0].timing.runs[0].timing.unit,'word');assert.equal(encoded.lines[0].timing.endMs,3000);
  const old={version:5,lines:[{start:0,end:3,granularity:'character',chars:[1,1,2,2],parallel:{layout:'stack',parts:[{id:'a',role:'lead',ranges:[{start:0,end:1}],join:[],granularity:'line',timing:1},{id:'b',role:'background',ranges:[{start:2,end:3}],join:[],granularity:'word',timing:[[1,2]]}]}}]};
  const compact=codec.encode(old);assert.equal(compact.lines[0].timing,undefined);assert.deepEqual(compact.lines[0].derivedTiming,{unit:'character'});assert.deepEqual(codec.decode(compact),old);
  const overlap=copy(old);overlap.lines[0].parallel.parts[1].ranges=[{start:0,end:1}]; assert.ok(codec.encode(overlap).lines[0].timing);
});

test('recording a word in character mode preserves untouched word units, including split targets',()=>{
  const before={granularity:'word',chars:[1,1,2,2,3,3]};
  const after={...before,granularity:'character',chars:[1,1,2.1,2.2,3,3]};
  const merged=codec.recordedUnits(before,after,[2,3],'character',[{end:1},{end:3},{end:5}]);
  const timing=codec.encodeTiming(merged,6);
  assert.deepEqual(codec.unitRuns(timing,6),[{unit:'word',length:2},{unit:'character',length:2},{unit:'word',length:2}]);
  const projected=codec.projectUnits(merged,{granularity:'character',chars:[2.2,3,3]},[3,4,5]);
  assert.deepEqual(codec.unitRuns(codec.encodeTiming(projected,3),3),[{unit:'character',length:1},{unit:'word',length:2}]);
  assert.throws(()=>codec.applyPatch(snapshot(1),{document:{version:5,lines:[]}}),/document version/);
});
