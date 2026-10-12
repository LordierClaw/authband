import test from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness} from './page-harness.mjs';

async function boot(options) {
  const h=await pageHarness(options);h.page.onInit();h.page.onReady();await h.flush();await h.mount();return h;
}

test('detail keeps the complete identity and a single-row code with a compact countdown',async()=>{
  const h=await boot();
  assert.equal(h.page.status,'','fixture branding must not occupy the normal UI');
  h.page.detail(h.page.groups[0].rows[0].id);
  assert.equal(h.page.detailLabel,'public-fixture-1');
  assert.equal(h.page.detailCode,'287 082');
  assert.equal(h.page.codeLeft,'287');assert.equal(h.page.codeRight,'082');
  assert.equal(h.page.detailTime,'0:30');assert.equal(h.page.detailProgress,100);
  h.at(59000);h.tick();assert.equal(h.page.detailTime,'0:01');assert.equal(h.page.detailProgress,3);
  h.at(60000);h.tick();assert.equal(h.page.detailTime,'0:30');assert.equal(h.page.detailProgress,100);
  h.page.onDestroy();
});

test('eight-digit and untrusted codes retain both complete fixed groups',async()=>{
  const h=await boot();h.page.changeTab({index:1});h.page.detail(h.page.groups[1].rows[0].id);
  assert.equal(h.page.codeLeft,'9428');assert.equal(h.page.codeRight,'7082');assert.equal(h.page.detailSmall,true);
  assert.match(h.page.detailLabel,/tiếng Việt/);
  h.page._viewer.updateTime(null);
  assert.equal(h.page.codeLeft,'----');assert.equal(h.page.codeRight,'----');
  assert.equal(h.page.detailProgress,0);assert.equal(h.page.detailTime,'');
  assert.equal(h.page.status,'Cần đồng bộ giờ');h.page.onDestroy();
});

test('countdown handles a two-minute account without overflowing seconds',async()=>{
  const h=await boot();h.page.detail(h.page.groups[0].rows[0].id);
  h.page.updateDetail({issuer:'RFC',label:'public',code:'123 456',remaining:120,period:120});
  assert.equal(h.page.detailTime,'2:00');assert.equal(h.page.detailProgress,100);
  h.page.updateDetail({issuer:'RFC',label:'public',code:'123 456',remaining:61,period:120});
  assert.equal(h.page.detailTime,'1:01');assert.equal(h.page.detailProgress,51);h.page.onDestroy();
});

test('native tab changes are not echoed into the controlled swiper index',async()=>{
  const h=await boot(),count=h.assignments.swiperIndex;
  h.page.changeTab({index:1});h.page.changeTab({index:2});
  assert.equal(h.page.active,2);assert.equal(h.page.swiperIndex,1);
  assert.equal(h.assignments.swiperIndex,count);
  h.page.detail(h.page.groups[2].rows[0].id);h.page.closeDetail();
  assert.equal(h.assignments.swiperIndex,count,'retained native swiper keeps its own index');h.page.onDestroy();
});

test('returning to an already mounted tab does not issue scrollTo during a swipe',async()=>{
  const h=await boot(),id=h.page.groups[0].id;
  h.page.scroll(id,{scrollY:180,scrollState:1});
  const before=h.scrolled.length;
  h.page.changeTab({index:1});h.page.changeTab({index:0});
  assert.equal(h.scrolled.length,before,'leave native scroll position untouched for surviving lists');
  h.page.detail(h.page.groups[0].rows[0].id);h.page.closeDetail();
  assert.equal(h.scrolled.length,before);
  const groups=h.assignments.groups,reads=h.reads.length;
  h.page.onHide();h.page.onShow();await h.flush();await h.mount();
  assert.equal(h.scrolled.length,before,'native lists survive hide; wake needs no scroll restoration');
  assert.equal(h.assignments.groups,groups,'wake keeps the native swiper and lists');assert.equal(h.reads.length,reads,'wake reads no files');
  h.page.onDestroy();
});

test('list restoration tracking is bounded and releases row objects on hide',async()=>{
  const h=await boot();
  for(let index=0;index<8;index++)h.page.changeTab({index});
  assert.equal(Object.keys(h.page._restoredLists).length,8);
  h.page.onHide();assert.equal(Object.keys(h.page._restoredLists).length,8);
  h.page.onShow();await h.flush();await h.mount();assert.equal(Object.keys(h.page._restoredLists).length,8);
  h.page.onDestroy();
});

test('a cancelled native swipe cannot lock row taps or neighbor preparation',async()=>{
  const h=await boot({deferTicks:true});
  for(let i=0;i<4;i++){h.nextTicks.splice(0).forEach(f=>f());await h.flush();}
  h.page.swipeStart?.();h.page.changeTab({index:1});
  h.nextTicks.splice(0).forEach(f=>f());await h.flush();
  assert.equal(h.page.groups[2].mounted,true,'preloading cannot depend on a missing animation-end event');
  // A native click is already gesture-qualified. A missing animation-end event
  // must not turn it into an indefinitely disabled control.
  h.page.detail(h.page.groups[1].rows[0].id);assert.equal(h.page.mode,'detail');
  h.page.closeDetail();
  for(let i=0;i<3;i++){h.nextTicks.splice(0).forEach(f=>f());await h.flush();}
  assert.equal(h.page.groups[2].mounted,true);assert.equal(h.workTimers.size,0);
  h.page.detail(h.page.groups[1].rows[0].id);assert.equal(h.page.mode,'detail');h.page.onDestroy();
});

test('exit reaches the platform even when lifecycle cleanup throws',async()=>{
  const h=await boot();h.page._peer.close=()=>{throw Error('Unavailable native connection');};
  h.page.exit();assert.equal(h.exits,1);assert.equal(h.workTimers.size,0);
});

test('a native swipe callback arriving after hide cannot change or remount the page',async()=>{
  const h=await boot();
  h.page.swipeStart?.();h.page.onHide();h.page.swipeEnd?.({index:2});h.page.changeTab({index:2});
  assert.equal(h.page.active,0);assert.equal(h.workTimers.size,0);
  h.page.onShow();await h.flush();await h.mount();h.page.detail(h.page.groups[h.page.active].rows[0].id);
  assert.equal(h.page.mode,'detail');h.page.onDestroy();
});

test('identity text is static and no animation callbacks survive hide',async()=>{
  const h=await boot({deferTicks:true});
  for(let i=0;i<4;i++){h.nextTicks.splice(0).forEach(f=>f());await h.flush();}
  h.page.detail(h.page.groups[0].rows[0].id);h.nextTicks.splice(0).forEach(f=>f());
  assert.equal(h.marquees.length,0);
  h.page.closeDetail();assert.equal(h.marquees.length,0);
  h.page.detail(h.page.groups[0].rows[0].id);h.page.onHide();
  h.nextTicks.splice(0).forEach(f=>f());await h.flush();
  assert.equal(h.marquees.length,0);
  assert.equal(h.page.codeLeft,'');assert.equal(h.page.codeRight,'');assert.equal(h.workTimers.size,0);h.page.onDestroy();
});

test('detail and exit do not access native elements after initial list restoration',async()=>{
  const h=await boot({deferTicks:true});
  for(let i=0;i<4;i++){h.nextTicks.splice(0).forEach(f=>f());await h.flush();}
  let calls=0;h.page.$element=()=>{calls++;throw Error('Native DOM unavailable');};
  h.page.detail(h.page.groups[0].rows[0].id);
  assert.doesNotThrow(()=>h.nextTicks.splice(0).forEach(f=>f()));
  assert.equal(h.page.codeLeft,'287');assert.equal(h.workTimers.size,1);
  assert.doesNotThrow(()=>h.page.exit());assert.equal(h.exits,1);assert.equal(h.workTimers.size,0);h.page.onDestroy();assert.equal(calls,0);
});
