import test from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness} from './page-harness.mjs';

async function boot(options) {
  const h=await pageHarness(options);h.page.onInit();h.page.onReady();await h.flush();await h.mount();return h;
}

test('cold list is prepared in one IO round starting at onInit, before onReady',async()=>{
  const h=await pageHarness({deferReads:true,deferTicks:true});h.page.onInit();
  assert.ok(h.pendingReads.length>=6,'start all independent vault and metadata reads together');
  h.pendingReads.splice(0).forEach(fn=>fn());await h.flush();
  assert.equal(h.page.groups.length,8);assert.equal(h.connections,0);
  assert.equal(h.page.groups.filter(g=>g.mounted).length,1,'first frame carries only the active list');
  h.page.onReady();await h.mount();
  assert.equal(h.page.groups.filter(g=>g.mounted).length,8);assert.equal(h.connections,1);
  assert.equal(h.nextTicks.length,0,'no $nextTick: it crashed this native runtime');h.page.onDestroy();
  h.pendingReads.splice(0).forEach(fn=>fn());await h.flush();
});

test('only an outward gesture on the first group exits; native tab changes have no index feedback',async()=>{
  const h=await boot(),writes=h.assignments.swiperIndex;
  assert.equal(h.page.swiperIndex,1);
  h.page.swipeTab({index:2});assert.equal(h.page.active,1);
  assert.equal(h.assignments.swiperIndex,writes);
  h.page.swipeTab({index:1});
  assert.equal(h.page.active,0);assert.equal(h.exits,0);
  h.page.swipeTab({index:0});assert.equal(h.exits,1);assert.equal(h.timers.size,0);
});

test('five-minute idle deadline is reset by touch, not code ticks or data refresh',async()=>{
  const h=await boot();assert.equal(h.timers.size,1);
  const deadline=()=>[...h.timers].find(([,delay])=>delay===300000)?.[0];
  const first=deadline();assert.ok(first);
  h.at(329999);h.page.touchStart({touches:[{clientX:100,clientY:200}]});
  first();assert.equal(h.exits,0,'stale idle callback cannot close an active app');
  const second=deadline();assert.ok(second);assert.notEqual(second,first);
  h.page.detail(h.page.groups[0].rows[0].id);
  const last=deadline();h.at(330000);h.page._viewer.updateTime({offset:0,uncertainty:0,wallMs:330000});
  assert.equal(deadline(),last,'background time repair is not user activity');
  h.at(629999);last();assert.equal(h.exits,1);assert.equal(h.timers.size,0);
  h.page.onDestroy();
});

test('waking the screen does not grant another five minutes without user input',async()=>{
  const h=await boot();h.at(40000);h.page.onHide();assert.equal(h.timers.size,0);
  h.at(320000);h.page.onShow();await h.flush();
  assert.equal(h.timers.get(h.page._idleTimer),10000);
  h.page.onHide();h.at(330001);h.page.onShow();
  assert.equal(h.exits,1);assert.equal(h.timers.size,0);h.page.onDestroy();
});

test('detail right swipe returns once; vertical drags and taps do not navigate',async()=>{
  const h=await boot();h.page.detail(h.page.groups[0].rows[0].id);
  const gesture=(x,y)=>{h.page.touchStart({touches:[{clientX:30,clientY:220}]});h.page.touchEnd({changedTouches:[{clientX:x,clientY:y}]});};
  gesture(32,222);assert.equal(h.page.mode,'detail');
  gesture(45,340);assert.equal(h.page.mode,'detail');
  gesture(180,230);assert.equal(h.page.mode,'list');assert.equal(h.exits,0);
  h.page.onBackPress();assert.equal(h.exits,0,'same physical back cannot also exit the list');
  h.at(31000);h.page.onBackPress();assert.equal(h.exits,1);
});

test('gesture and exit do not call lifecycle hooks through the native page proxy',async()=>{
  const h=await boot();h.page.onBackPress=undefined;h.page.onHide=undefined;
  h.page.detail(h.page.groups[0].rows[0].id);
  h.page.touchStart({touches:[{clientX:30,clientY:260}]});
  h.page.touchEnd({changedTouches:[{clientX:180,clientY:260}]});
  assert.equal(h.page.mode,'list');h.page.exit();assert.equal(h.exits,1);assert.equal(h.timers.size,0);
});

test('committed manager snapshot refreshes without reading files or resetting idle deadline',async()=>{
  const h=await boot(),before=h.reads.length;
  const next=JSON.parse(JSON.stringify(h.page._viewer.snapshot));
  next.revision=String(Number(next.revision)+1);next.groups=next.groups.slice(0,1);next.groups[0].name='Changed';next.accounts=[];
  const timer=[...h.timers.keys()][0];
  h.page._receiver.options.committed(next);await h.flush();
  assert.equal(h.page.groups.length,1);assert.equal(h.page.groups[0].name,'Changed');
  assert.equal(h.page.groups[0].rows.length,0);assert.equal(h.reads.length,before);
  assert.equal([...h.timers.keys()][0],timer);
  const assignments=h.assignments.groups;h.page._receiver.options.committed(next);await h.flush();
  assert.equal(h.assignments.groups,assignments,'unchanged committed revision does not recreate the lists');
  h.page.onDestroy();
});

test('the blank edge page exits even while a load is pending, so it is never a resting screen',async()=>{
  const h=await pageHarness({deferReads:true});h.page.onInit();h.page.onReady();
  assert.equal(h.page._viewer.loading,true);
  h.page.swipeTab({index:0});h.pendingReads.splice(0).forEach(fn=>fn());await h.flush();
  [...h.workTimers.keys()].forEach(fn=>fn());
  assert.equal(h.exits,1);h.page.onDestroy();
});

test('exit assigns no reactive state: nothing is re-rendered while the VM tears down',async()=>{
  const h=await boot();h.page.detail(h.page.groups[0].rows[0].id);h.page.closeDetail();
  const before={...h.assignments};
  h.page.swipeTab({index:0});
  assert.equal(h.exits,1);assert.deepEqual(h.assignments,before);assert.equal(h.timers.size,0);
  assert.equal(h.connection.onmessage,null,'native callbacks are detached before exit');
});

test('waking after a hide during the first load reads the vault again instead of showing nothing',async()=>{
  const h=await pageHarness({deferReads:true});h.page.onInit();h.page.onReady();
  h.page.onHide();h.pendingReads.splice(0).forEach(fn=>fn());await h.flush();
  assert.equal(h.page.groups.length,0);assert.equal(h.page.mode,'boot');
  h.page.onShow();h.pendingReads.splice(0).forEach(fn=>fn());await h.flush();await h.mount();
  assert.equal(h.page.mode,'list');assert.equal(h.page.groups.length,8);assert.equal(h.page.swiperIndex,1);
  h.page.onDestroy();
});

test('hide and wake keep the swiper, the active tab and every mounted list',async()=>{
  const h=await boot();h.page.changeTab({index:3});
  const groups=h.assignments.groups,index=h.assignments.swiperIndex;
  for(let i=0;i<20;i++){h.page.onHide();h.page.onShow();await h.flush();await h.mount();}
  assert.equal(h.assignments.groups,groups);assert.equal(h.assignments.swiperIndex,index);
  assert.equal(h.page.active,3);assert.equal(h.page.mode,'list');assert.equal(h.connections,1);
  assert.equal(h.page.groups.filter(g=>g.mounted).length,8);assert.equal(h.workTimers.size,0);h.page.onDestroy();
});
