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
const mounted=h=>h.page.groups.map(g=>g.mounted?1:0).join('');
const touch=(h,id,[x1,y1],[x2,y2])=>{h.page.rowStart({touches:[{clientX:x1,clientY:y1}]});h.page.rowEnd(id,{changedTouches:[{clientX:x2,clientY:y2}]});};
const ui='internal://files/authband-ui';

test('cold start reads once; the first frame mounts the active tab and its neighbours',async()=>{
  const h=await pageHarness({deferReads:true});h.page.onInit();
  assert.equal(h.pendingReads.length,6,'journal, both slots, clock, erase marker and preferences in one round');
  assert.equal(h.page.mode,'boot');
  h.page.onReady();h.pendingReads.splice(0).forEach(fn=>fn());await h.flush();
  assert.equal(h.page.mode,'list');assert.equal(h.page.groups.length,8);assert.equal(h.page.startIndex,0);
  assert.equal(mounted(h),'11000000');assert.equal(h.connections,0);
  await h.settle();
  assert.equal(mounted(h),'11100000','at most two tabs either side keep a list');assert.equal(h.connections,1);assert.equal(h.workTimers.size,0);
  assert.ok(h.page.groups.every(g=>g.rows.every(r=>Object.keys(r).join()==='id,title,sub')),'pages never carry secrets');
  h.page.onDestroy();
});

test('the saved tab opens with its neighbours mounted and the swiper index set once',async()=>{
  const h=await pageHarness();h.disk[ui]=JSON.stringify({activeID:'00000000-0000-4000-8000-000000000006'});
  h.page.onInit();h.page.onReady();await h.flush();
  assert.equal(h.page.startIndex,4);assert.equal(mounted(h),'00011100');
  const index=h.assignments.startIndex;await h.settle();
  h.page.tabChange({index:5});h.page.tabChange({index:3});
  assert.equal(h.assignments.startIndex,index,'tab changes never echo into the native swiper index');
  h.page.onDestroy();
});

test('a tab change touches no reactive data and writes no file until things are quiet',async()=>{
  const h=await boot(),before={...h.assignments},writes=()=>Object.keys(h.disk).length;
  for(let i=0;i<30;i++)h.page.tabChange({index:(i%7)+1});
  assert.deepEqual(h.assignments,before,'30 rapid swipes: no reactive assignment');
  assert.equal(h.disk[ui],undefined,'no write during swipes');
  h.page.tabChange({index:5});h.at(31000);touch(h,'',[100,300],[100,150]);
  const save=[...h.workTimers].find(([,d])=>d===2500)?.[0];h.timers.delete(save);save();
  assert.equal(h.disk[ui],undefined,'a recent touch postpones the write');
  h.at(34000);await h.settle();
  assert.equal(JSON.parse(h.disk[ui]).activeID,h.page.groups[5].id);assert.equal(h.workTimers.size,0);
  h.page.onDestroy();
});

test('lists follow the active tab within two tabs, only while the finger is up',async()=>{
  const h=await boot();assert.equal(mounted(h),'11100000');
  h.page.tabChange({index:1});h.page.tabChange({index:2});h.page.tabChange({index:3});
  assert.equal(mounted(h),'11100000','nothing changes during a run of swipes');
  h.page.rowStart({touches:[{clientX:180,clientY:300}]});
  const soon=[...h.workTimers].find(([,d])=>d===300)?.[0];h.timers.delete(soon);h.at(30400);soon();
  assert.equal(mounted(h),'11100000','no mount under a pressed finger');
  h.page.rowEnd('',{changedTouches:[{clientX:30,clientY:300}]});
  assert.equal(mounted(h),'01111100');
  h.page.tabChange({index:7});h.at(31000);await h.settle();assert.equal(mounted(h),'00000111');
  assert.ok(h.page.groups.filter(g=>g.mounted).length<=5);h.page.onDestroy();
});

test('a tap opens the code page once; swipes and drags do not',async()=>{
  const h=await boot(),id=h.page.groups[0].rows[0].id;
  touch(h,id,[180,200],[30,202]);touch(h,id,[100,400],[102,150]);touch(h,'',[100,300],[100,300]);
  assert.deepEqual(h.app.pushes,[]);
  touch(h,id,[100,200],[103,205]);touch(h,id,[100,200],[100,200]);
  assert.deepEqual(h.app.pushes,['pages/code'],'a second tap before the push lands is ignored');
  assert.equal(h.shared.selected,id);
  h.page.onHide();h.page.onShow();touch(h,id,[100,200],[100,200]);assert.equal(h.app.pushes.length,2);
  h.page.onDestroy();
});

test('first tab: right swipe exits; the system back wins and other tabs go back a tab',async()=>{
  const h=await boot(),id=h.page.groups[0].rows[0].id;
  touch(h,id,[30,260],[190,262]);
  assert.equal(h.page.onBackPress(),false,'let the system exit with its own transition');
  await h.settle();assert.equal(h.exits,0,'no second, app-driven exit');
  assert.equal(h.workTimers.size,0);assert.equal(h.connection.onmessage,null);
  const g=await boot();g.page.tabChange({index:2});
  assert.equal(g.page.onBackPress(),true);assert.deepEqual(g.app.swipes,[1]);assert.equal(g.page._active,1);
  touch(g,g.page.groups[1].rows[0].id,[30,260],[190,262]);assert.equal([...g.workTimers.values()].includes(200),false,'a right swipe on a later tab is the swiper\'s');
  g.page.tabChange({index:0});touch(g,g.page.groups[0].rows[0].id,[30,260],[190,262]);
  const fallback=[...g.workTimers].find(([,delay])=>delay===200)?.[0];assert.ok(fallback);
  fallback();assert.equal(g.app.backs,1,'a mid-screen swipe leaves through the router like the system back');
  assert.equal(g.exits,0,'no immediate process exit');assert.equal(g.connection.onmessage,null);
});

test('exit renders nothing, detaches native callbacks and waits briefly for file callbacks',async()=>{
  const h=await boot(),before={...h.assignments};
  h.page.exit();h.page.exit();
  assert.equal(h.exits,1);assert.deepEqual(h.assignments,before);assert.equal(h.timers.size,0);
  assert.equal(h.connection.onmessage,null);
  const slow=await pageHarness({deferReads:true});slow.page.onInit();slow.page.onReady();
  slow.page.exit();assert.equal(slow.exits,0);
  slow.pendingReads.splice(0).forEach(fn=>fn());await slow.flush();
  assert.equal(slow.exits,1);assert.equal(slow.page.groups.length,0,'a late load cannot publish after exit');
});

test('hide saves the tab once; wake keeps the native tabs and reads no files',async()=>{
  const h=await boot(),reads=h.reads.length,groups=h.assignments.groups;
  h.page.tabChange({index:3});h.page.onHide();assert.equal(JSON.parse(h.disk[ui]).activeID,h.page.groups[3].id);
  for(let i=0;i<20;i++){h.page.onShow();await h.settle();h.page.onHide();assert.equal(h.workTimers.size,0);}
  assert.equal(h.reads.length,reads);assert.equal(h.assignments.groups,groups);assert.equal(h.connections,1);
  h.page.onDestroy();
});

test('five-minute idle exit is shared with the code page and not extended by waking',async()=>{
  const h=await boot();
  assert.equal(h.shared.idleDeadline,330000);
  h.at(200000);touch(h,'',[100,300],[100,150]);assert.equal(h.shared.idleDeadline,500000);
  h.page.onHide();h.at(499999);h.page.onShow();assert.equal(h.exits,0);
  h.page.onHide();h.at(500000);h.page.onShow();assert.equal(h.exits,1);assert.equal(h.timers.size,0);
});

test('an erase marker fails closed and shares no snapshot',async()=>{
  const h=await pageHarness();h.disk['internal://files/authband-erasing']='1';
  h.page.onInit();h.page.onReady();await h.flush();await h.settle();
  assert.equal(h.page.mode,'error');assert.equal(h.page.groups.length,0);
  assert.equal(h.shared.snapshot,null);assert.equal(h.connections,0);h.page.onDestroy();
});

test('a committed snapshot replaces the tabs once; the same revision does not rebuild them',async()=>{
  const h=await boot(),next=JSON.parse(JSON.stringify(h.shared.snapshot));
  h.page.tabChange({index:2});
  next.revision='2';next.groups[2].name='Changed';next.groups=next.groups.slice(0,3);
  next.accounts=next.accounts.filter(a=>next.groups.some(g=>g.id===a.groupID));
  h.page._receiver.options.committed(next);await h.settle();
  assert.equal(h.page.groups.length,3);assert.equal(h.page.groups[2].name,'Changed');assert.equal(h.page.startIndex,2,'stays on the same group');
  assert.equal(h.shared.snapshot,next);
  const count=h.assignments.groups;h.page._receiver.options.committed(next);await h.settle();
  assert.equal(h.assignments.groups,count);h.page.onDestroy();
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

test('leaving from the first tab is remembered, by exit or by system back',async()=>{
  const h=await pageHarness();h.disk[ui]=JSON.stringify({activeID:'00000000-0000-4000-8000-000000000005'});
  h.page.onInit();h.page.onReady();await h.flush();await h.settle();
  h.page.tabChange({index:2});h.page.tabChange({index:1});h.page.tabChange({index:0});
  h.page.exit();assert.equal(JSON.parse(h.disk[ui]).activeID,h.page.groups[0].id);assert.equal(h.exits,1);
  const g=await boot();g.page.tabChange({index:0});g.disk[ui]=JSON.stringify({activeID:'x'});g.page._savedID='x';
  assert.equal(g.page.onBackPress(),false);assert.equal(JSON.parse(g.disk[ui]).activeID,g.page.groups[0].id);
});
