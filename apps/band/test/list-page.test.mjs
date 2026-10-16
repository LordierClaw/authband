import test from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness} from './page-harness.mjs';
import {sample} from './fixtures.mjs';
import {VaultStore} from '../src/logic/vault-store.js';
import {Peer} from '../src/logic/peer.js';
import {makeHello,ProtectedChannel} from '../src/logic/protected-channel.js';
import {utf8} from '../src/logic/encoding.js';

async function boot(options) {
  const h=await pageHarness(options);h.page.onInit();h.page.onReady();await h.flush();await h.settle();return h;
}
const rows=h=>h.page.items.filter(item=>item.kind==='row');
const touch=(h,id,[x1,y1],[x2,y2])=>{h.page.rowStart({touches:[{clientX:x1,clientY:y1}]});h.page.rowEnd(id,{changedTouches:[{clientX:x2,clientY:y2}]});};

test('cold start reads once, maps one screenful, then appends the rest before interconnect',async()=>{
  const h=await pageHarness({deferReads:true});h.page.onInit();
  assert.equal(h.pendingReads.length,5,'journal, both slots, clock and erase marker in one round');
  assert.equal(h.page.mode,'boot');
  h.page.onReady();h.pendingReads.splice(0).forEach(fn=>fn());await h.flush();
  assert.equal(h.page.mode,'list');assert.equal(h.page.items.length,10);assert.equal(h.connections,0);
  await h.settle();
  assert.equal(h.page.items.length,58);assert.equal(h.page.items.filter(i=>i.kind==='head').length,8);
  assert.equal(h.connections,1);assert.equal(h.workTimers.size,0);
  assert.ok(h.page.items.every(item=>!('secret' in item)),'list items never carry secrets');
  h.page.onDestroy();
});

test('a tap opens the code page once; swipes, drags and headers do not',async()=>{
  const h=await boot(),id=rows(h)[0].id,head=h.page.items.find(i=>i.kind==='head').id;
  touch(h,id,[100,200],[180,202]);touch(h,id,[100,400],[102,150]);touch(h,head,[100,120],[100,120]);
  assert.deepEqual(h.app.pushes,[]);
  touch(h,id,[100,200],[103,205]);touch(h,id,[100,200],[100,200]);
  assert.deepEqual(h.app.pushes,['pages/code'],'a second tap before the push lands is ignored');
  assert.equal(h.shared.selected,id);
  h.page.onHide();h.page.onShow();touch(h,id,[100,200],[100,200]);assert.equal(h.app.pushes.length,2);
  h.page.onDestroy();
});

test('the system back exits with the firmware transition; the swipe fallback waits for it',async()=>{
  const h=await boot(),id=rows(h)[0].id;
  touch(h,id,[30,260],[190,262]);
  assert.equal(h.page.onBackPress(),false,'let the system run its own exit');
  await h.settle();assert.equal(h.exits,0,'no second, app-driven exit');
  assert.equal(h.workTimers.size,0);assert.equal(h.connection.onmessage,null);
  const g=await boot(),row=rows(g)[0].id;
  touch(g,row,[30,260],[190,262]);assert.equal(g.exits,0);
  const fallback=[...g.workTimers].find(([,delay])=>delay===350)?.[0];assert.ok(fallback);
  fallback();assert.equal(g.exits,1,'without a system gesture the swipe still exits');
});

test('exit renders nothing, detaches native callbacks and waits briefly for file callbacks',async()=>{
  const h=await boot(),before={...h.assignments};
  h.page.exit();h.page.exit();
  assert.equal(h.exits,1);assert.deepEqual(h.assignments,before);assert.equal(h.timers.size,0);
  assert.equal(h.connection.onmessage,null);
  const slow=await pageHarness({deferReads:true});slow.page.onInit();slow.page.onReady();
  slow.page.exit();assert.equal(slow.exits,0);
  slow.pendingReads.splice(0).forEach(fn=>fn());await slow.flush();
  assert.equal(slow.exits,1);assert.equal(slow.page.items.length,0,'a late load cannot publish after exit');
});

test('hide and wake keep the native list and read no files',async()=>{
  const h=await boot(),reads=h.reads.length,items=h.assignments.items;
  for(let i=0;i<20;i++){h.page.onHide();assert.equal(h.workTimers.size,0);h.page.onShow();await h.settle();}
  assert.equal(h.reads.length,reads);assert.equal(h.assignments.items,items);assert.equal(h.connections,1);
  h.page.onDestroy();
});

test('five-minute idle exit is shared with the code page and not extended by waking',async()=>{
  const h=await boot();
  assert.equal(h.shared.idleDeadline,330000);
  h.at(200000);touch(h,rows(h)[1].id,[100,300],[100,150]);assert.equal(h.shared.idleDeadline,500000);
  h.page.onHide();h.at(499999);h.page.onShow();assert.equal(h.exits,0);
  h.page.onHide();h.at(500000);h.page.onShow();assert.equal(h.exits,1);assert.equal(h.timers.size,0);
});

test('an erase marker fails closed and shares no snapshot',async()=>{
  const h=await pageHarness();h.disk['internal://files/authband-erasing']='1';
  h.page.onInit();h.page.onReady();await h.flush();await h.settle();
  assert.equal(h.page.mode,'error');assert.equal(h.page.items.length,0);
  assert.equal(h.shared.snapshot,null);assert.equal(h.connections,0);h.page.onDestroy();
});

test('a committed snapshot replaces the list once; the same revision does not rebuild it',async()=>{
  const h=await boot(),next=JSON.parse(JSON.stringify(h.shared.snapshot));
  next.revision='2';next.groups[0].name='Changed';next.accounts=next.accounts.filter(a=>a.groupID===next.groups[0].id);
  h.page._receiver.options.committed(next);await h.settle();
  assert.equal(h.page.items.length,8);assert.equal(h.page.items[0].title,'Changed');assert.equal(h.shared.snapshot,next);
  const count=h.assignments.items;h.page._receiver.options.committed(next);await h.settle();
  assert.equal(h.assignments.items,count);h.page.onDestroy();
  assert.equal(h.shared.snapshot,null,'destroy drops the decoded vault');
});

test('malformed clock masks codes until an authenticated time sample arrives',async()=>{
  const h=await pageHarness(),prefix='internal://files/authband-';
  const io={read:async k=>h.disk[prefix+k]??null,write:async(k,v)=>{h.disk[prefix+k]=v;},remove:async k=>{delete h.disk[prefix+k];}};
  const options={key:new Uint8Array(16).fill(7),salt:new Uint8Array(32).fill(9),epoch:'1',pairID:'00000000-0000-4000-8000-000000000001'};
  await new Peer(io,{abort(){}}).enroll(options.key);
  await new VaultStore(io).commit(sample());h.disk[prefix+'clock']='{';
  h.page.onInit();h.page.onReady();await h.flush();await h.settle();
  assert.equal(h.page.mode,'list');assert.equal(h.connections,1);assert.equal(h.shared.time,null);
  const sent=[];h.connection.send=({data})=>sent.push(data);
  const envelope=(topic,body)=>({v:1,id:'repair',src:'ios',type:'message',topic,body});
  await h.connection.onmessage({data:envelope('auth.hello',makeHello(options))});await h.flush();
  const phone=new ProtectedChannel(options,'phone');
  await h.connection.onmessage({data:envelope('auth.frame',phone.seal('time.sample',utf8(JSON.stringify({request:'1',phoneMs:30000,wallMs:30000,rttMs:0}))))});await h.flush();
  assert.equal(JSON.stringify(h.shared.time),'{"offset":0,"uncertainty":0,"wallMs":30000}');assert.ok(sent.some(x=>x.topic==='auth.frame'));
  h.shared.selected=sample().accounts[0].id;
  const code=await pageHarness({page:'code',app:h.app});code.page.onInit();
  assert.equal(code.page.code,'287 082');code.page.onDestroy();h.page.onDestroy();
});

test('appending rows waits while a finger is down and for the first paint',async()=>{
  const h=await pageHarness();h.page.onInit();h.page.onReady();await h.flush();
  assert.equal(h.page.items.length,10);assert.ok([...h.workTimers.values()].includes(600),'first append waits for paint');
  h.page.rowStart({touches:[{clientX:100,clientY:200}]});
  h.tick();assert.equal(h.page.items.length,10,'no list mutation under a pressed finger');
  h.page.rowEnd(h.page.items[3].id,{changedTouches:[{clientX:100,clientY:200}]});
  await h.settle();assert.equal(h.page.items.length,58);
  const g=await pageHarness();g.page.onInit();g.page.onReady();await g.flush();
  g.page.rowStart({touches:[{clientX:100,clientY:200}]});g.at(31600);
  await g.settle();assert.equal(g.page.items.length,58,'a lost touchend cannot stall the list forever');
  h.page.onDestroy();g.page.onDestroy();
});
