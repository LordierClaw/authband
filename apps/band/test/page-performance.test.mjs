import test from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness} from './page-harness.mjs';
import {sample} from './fixtures.mjs';
import {VaultStore} from '../src/logic/vault-store.js';
import {Peer} from '../src/logic/peer.js';
import {makeHello,ProtectedChannel} from '../src/logic/protected-channel.js';
import {utf8} from '../src/logic/encoding.js';

async function boot(options) {
  const h=await pageHarness(options);h.page.onInit();h.page.onReady();h.page.onShow();await h.flush();await h.mount();return h;
}

test('native cold ready/show sequence loads the vault once',async()=>{
  const h=await boot();
  assert.equal(h.reads.filter(uri=>uri.endsWith('vault.head')).length,1);
  assert.equal(h.workTimers.size,0);assert.equal(h.page.mode,'list');h.page.onDestroy();
});

test('list idle has no ticker and a detail countdown does not reassign or scroll lists',async()=>{
  const h=await boot(),groups=h.page.groups,assignments=h.assignments.groups,restores=h.scrolled.filter(s=>s.id.startsWith('list-')).length;
  assert.equal(h.workTimers.size,0);h.page.detail(groups[0].rows[0].id);
  for(let second=31;second<60;second++){h.at(second*1000);h.tick();}
  assert.equal(h.assignments.groups,assignments,'only changed row leaves should notify the renderer');
  assert.equal(h.page.groups,groups);assert.equal(h.scrolled.filter(s=>s.id.startsWith('list-')).length,restores);
  assert.equal(h.page.detailSeconds,1);assert.equal(h.page.detailCode,'287 082');h.page.onDestroy();
});

test('reactive array wrappers cannot trigger list reconstruction on tab changes or detail ticks',async()=>{
  const h=await boot({wrapGroups:true}),count=h.assignments.groups;
  h.page.changeTab({index:1});h.page.detail(h.page.groups[1].rows[0].id);
  for(let second=31;second<60;second++){h.at(second*1000);h.tick();}
  assert.equal(h.assignments.groups,count);
  h.page.onDestroy();
});

test('bottom-of-list row index survives late inactive scroll and restoration feedback',async()=>{
  const h=await boot({scrollFeedback:true}),oldID=h.page.groups[0].id;
  h.page.changeTab({index:1});const id=h.page.groups[1].id;
  const bottom=h.page.groups[1].rows.length*76-304;
  h.page.scroll(id,{scrollY:bottom,scrollState:1});
  assert.equal(h.page._viewer.preferences().positions[id],3);
  h.page.scroll(oldID,{scrollY:0,scrollState:0});
  assert.equal(h.page._viewer.preferences().positions[id],3);
  const restores=h.scrolled.length;h.page.changeTab({index:1});assert.equal(h.scrolled.length,restores);
  h.page.detail(h.page.groups[1].rows[3].id);h.page.closeDetail();assert.equal(h.scrolled.length,restores,'retained lists do not need scroll restoration');
  assert.equal(h.page._viewer.preferences().positions[id],3);
  h.page.onDestroy();
});

test('root back stops timers immediately and exits without waiting for hide/destroy',async()=>{
  const h=await boot();h.page.detail(h.page.groups[0].rows[0].id);const queued=[...h.workTimers.keys()][0];h.page.onBackPress();h.at(31000);
  assert.equal(h.page.onBackPress(),true);assert.equal(h.exits,1);assert.equal(h.workTimers.size,0);
  queued();await h.flush();assert.equal(h.workTimers.size,0);
  assert.equal(h.page.groups.length,8,'exit renders nothing: no list teardown before the VM goes away');
  h.page.onHide();h.page.onDestroy();assert.equal(h.exits,1);
});

test('group navigation does not exit and lifecycle exit remains idempotent',async()=>{
  const h=await boot();
  h.page.changeTab({index:1});assert.equal(h.exits,0);
  h.page.exit();h.page.exit();assert.equal(h.exits,1);assert.equal(h.timers.size,0);
  h.page.onDestroy();
});

test('nonsecret navigation preferences are saved while the page is still alive',async()=>{
  const h=await boot();h.page.changeTab({index:7});await h.flush();
  const key='internal://files/authband-ui',id=h.page.groups[7].id;
  assert.equal(JSON.parse(h.disk[key]).activeID,id);
  h.page.scroll(id,{scrollY:190,scrollState:1});h.page.scroll(id,{scrollY:190,scrollState:0});await h.flush();
  assert.equal(JSON.parse(h.disk[key]).positions[id],2);
  assert.equal(h.workTimers.size,0);h.page.onDestroy();
});

test('exit while native reads are pending prevents late work and repeated exit',async()=>{
  const h=await pageHarness({deferReads:true});h.page.onInit();h.page.onReady();h.page.onShow();
  h.page.onBackPress();assert.equal(h.exits,0,'native callbacks still in flight hold exit briefly');
  for(let i=0;i<20;i++){h.pendingReads.splice(0).forEach(fn=>fn());await h.flush();}
  assert.equal(h.exits,1);assert.equal(h.page.groups.length,0,'a late load cannot publish');
  const fallback=[...h.workTimers.keys()];assert.equal(fallback.length,1);fallback[0]();assert.equal(h.exits,1);
  h.page.onBackPress();assert.equal(h.exits,1);h.page.onDestroy();
});

test('exit with a stuck native file callback still reaches the platform',async()=>{
  const h=await pageHarness({deferReads:true});h.page.onInit();h.page.onReady();
  h.page.exit();assert.equal(h.exits,0);
  const fallback=[...h.workTimers].find(([,delay])=>delay===400)?.[0];assert.ok(fallback);
  fallback();assert.equal(h.exits,1);h.pendingReads.splice(0).forEach(fn=>fn());await h.flush();
  assert.equal(h.exits,1);assert.equal(h.page.groups.length,0);h.page.onDestroy();
});

test('a newly mounted list cannot overwrite a restored position with its initial zero offset',async()=>{
  const h=await boot(),id=h.page.groups[0].id;
  h.page.scroll(id,{scrollY:140,scrollState:1});
  h.page.changeTab({index:1});h.page.changeTab({index:0});
  h.page.scroll(id,{scrollY:0,scrollState:0});
  assert.equal(h.page._viewer.preferences().positions[id],2);
  h.page.scroll(id,{scrollY:200,scrollState:1});
  h.page.scroll(id,{scrollY:150,scrollState:2});
  h.page.scroll(id,{scrollY:60,scrollState:0});
  assert.equal(h.page._viewer.preferences().positions[id],0,'actual gesture end still records its final row');
  h.page.onDestroy();
});

test('a delayed account click from a removed tab cannot enter a blank detail screen',async()=>{
  const h=await boot(),id=h.page.groups[0].rows[0].id;
  h.page.changeTab({index:1});h.page.detail(id);
  assert.equal(h.page.mode,'list');assert.equal(h.workTimers.size,0);h.page.onDestroy();
});

test('repeated group/detail/wake cycles retain bounded metadata and only a detail ticker',async()=>{
  const h=await boot();
  for(let i=0;i<100;i++) {
    h.at(30000+i*31000);h.tick();h.page.changeTab({index:i%8});
    const group=h.page.groups[h.page.active];
    h.page.scroll(group.id,{scrollY:76,scrollState:1});
    h.page.detail(group.rows[1].id);assert.equal(h.page.mode,'detail');assert.equal(h.workTimers.size,1);
    h.page.onBackPress();assert.equal(h.page.mode,'list');assert.equal(h.workTimers.size,0);
    h.page.onHide();assert.equal(h.workTimers.size,0);h.page.onShow();await h.flush();await h.mount();
    assert.equal(h.workTimers.size,0);assert.equal(h.page.groups.filter(g=>g.mounted).length,8);
    assert.equal(h.page.groups.reduce((n,g)=>n+g.rows.length,0),50);
  }
  h.page.exit();assert.equal(h.exits,1);assert.equal(h.timers.size,0);h.page.onDestroy();
});

test('first usable list loads in one native read round before interconnect startup',async()=>{
  const h=await pageHarness({deferReads:true,deferTicks:true});h.page.onInit();h.page.onReady();h.page.onShow();
  h.pendingReads.splice(0).forEach(fn=>fn());await h.flush();
  assert.equal(h.page.groups.length,8,'do not serialize clock/preferences behind the vault load');
  assert.equal(h.connections,0,'interconnect is not on the first-list path');
  assert.equal(h.reads.some(s=>s.endsWith('pairing')),false);
  assert.equal(h.page.groups.filter(g=>g.mounted).length,1);assert.equal(h.workTimers.size,1,'only the deferred mount chain is queued');
  assert.equal(h.page.mode,'list');
  await h.mount();
  assert.equal(h.connections,1);assert.equal(h.page.groups.filter(g=>g.mounted).length,8);
  h.page.onHide();h.page.onDestroy();
  for(let i=0;i<4;i++){h.pendingReads.splice(0).forEach(fn=>fn());await h.flush();}
  assert.equal(h.workTimers.size,0);
});

test('delayed first-frame work cannot open connections or remount lists after exit',async()=>{
  const h=await pageHarness({deferTicks:true});h.page.onInit();h.page.onReady();await h.flush();
  const queued=h.page._mountTimer;assert.ok(queued);
  h.page.exit();assert.equal(h.workTimers.size,0);queued();await h.flush();
  assert.equal(h.connections,0);assert.equal(h.workTimers.size,0);assert.equal(h.page.groups.filter(g=>g.mounted).length,1);h.page.onDestroy();
});

test('an erase marker fails closed before publishing any loaded accounts',async()=>{
  const h=await pageHarness();h.disk['internal://files/authband-erasing']='1';
  h.page.onInit();h.page.onReady();await h.flush();
  assert.equal(h.page.mode,'error');assert.equal(h.page.groups.length,0);
  assert.equal(h.connections,0);assert.equal(h.page._viewer.snapshot,null);h.page.onDestroy();
});

test('malformed clock masks codes but preserves the vault and authenticated time repair',async()=>{
  const h=await pageHarness(),prefix='internal://files/authband-';
  const io={read:async k=>h.disk[prefix+k]??null,write:async(k,v)=>{h.disk[prefix+k]=v;},remove:async k=>{delete h.disk[prefix+k];}};
  const options={key:new Uint8Array(16).fill(7),salt:new Uint8Array(32).fill(9),epoch:'1',pairID:'00000000-0000-4000-8000-000000000001'};
  await new Peer(io,{abort(){}}).enroll(options.key);
  await new VaultStore(io).commit(sample());h.disk[prefix+'clock']='{';
  const head=h.disk[prefix+'vault.head'],vault=h.disk[prefix+'vault.0'];
  h.page.onInit();h.page.onReady();await h.flush();await h.mount();
  assert.equal(h.page.mode,'list');assert.equal(h.connections,1);
  h.page.detail(h.page.groups[0].rows[0].id);assert.equal(h.page.detailCode,'--- ---');
  assert.equal(h.page.status,'Cần đồng bộ giờ');
  const sent=[];h.connection.send=({data})=>sent.push(data);
  const envelope=(topic,body)=>({v:1,id:'repair',src:'ios',type:'message',topic,body});
  await h.connection.onmessage({data:envelope('auth.hello',makeHello(options))});await h.flush();
  const phone=new ProtectedChannel(options,'phone');
  await h.connection.onmessage({data:envelope('auth.frame',phone.seal('time.sample',utf8(JSON.stringify({request:'1',phoneMs:30000,wallMs:30000,rttMs:0}))))});await h.flush();
  assert.equal(h.page.detailCode,'287 082');assert.ok(sent.some(x=>x.topic==='auth.frame'));
  assert.equal(h.disk[prefix+'vault.head'],head);assert.equal(h.disk[prefix+'vault.0'],vault);
  assert.equal(JSON.parse(h.disk[prefix+'pairing']).epoch,'1');h.page.onDestroy();
});

test('rapid tab events queue no list work and preserve all row arrays',async()=>{
  const h=await boot({deferTicks:true});
  for(let i=0;i<5;i++){h.nextTicks.splice(0).forEach(fn=>fn());await h.flush();}
  const rows=Array.from(h.page.groups,g=>g.rows);
  for(let i=1;i<=50;i++)h.page.changeTab({index:i%8});
  assert.equal(h.nextTicks.length,0);
  for(let i=0;i<5;i++){h.nextTicks.splice(0).forEach(fn=>fn());await h.flush();}
  assert.equal(h.page.active,2);assert.ok(h.page.groups.every((g,i)=>g.mounted&&g.rows===rows[i]));
  assert.equal(h.workTimers.size,0);h.page.onDestroy();
});
