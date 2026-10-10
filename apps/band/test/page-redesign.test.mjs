import test from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness} from './page-harness.mjs';

async function boot(options) {
  const h=await pageHarness(options);h.page.onInit();h.page.onReady();await h.flush();return h;
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
  assert.equal(h.page.active,2);assert.equal(h.page.swiperIndex,0);
  assert.equal(h.assignments.swiperIndex,count);
  h.page.detail(h.page.groups[2].rows[0].id);h.page.closeDetail();
  assert.equal(h.page.swiperIndex,2,'a recreated swiper starts on the selected tab');h.page.onDestroy();
});

test('returning to an already mounted tab does not issue scrollTo during a swipe',async()=>{
  const h=await boot(),id=h.page.groups[0].id;
  h.page.scroll(id,{scrollY:180,scrollState:1});
  const before=h.scrolled.length;
  h.page.changeTab({index:1});h.page.changeTab({index:0});
  assert.equal(h.scrolled.length,before,'leave native scroll position untouched for surviving lists');
  h.page.detail(h.page.groups[0].rows[0].id);h.page.closeDetail();
  assert.equal(h.scrolled.filter(x=>x.id==='list-'+id).at(-1)?.index,2);
  h.page.onDestroy();
});

test('list restoration tracking releases unmounted row objects',async()=>{
  const h=await boot();
  for(let index=0;index<8;index++)h.page.changeTab({index});
  assert.ok(Object.keys(h.page._restoredLists).length<=3);
  h.page.onDestroy();
});

test('neighbor work waits for native swipe end and row taps during dragging are ignored',async()=>{
  const h=await boot({deferTicks:true});
  for(let i=0;i<4;i++){h.nextTicks.splice(0).forEach(f=>f());await h.flush();}
  assert.equal(typeof h.page.swipeStart,'function');
  h.page.swipeStart();h.page.changeTab({index:1});
  h.nextTicks.splice(0).forEach(f=>f());await h.flush();
  assert.equal(h.page.groups[2].mounted,false,'do not prewarm the next list during a native animation');
  h.page.detail(h.page.groups[1].rows[0].id);assert.equal(h.page.mode,'list');
  h.page.swipeEnd({index:1});
  for(let i=0;i<3;i++){h.nextTicks.splice(0).forEach(f=>f());await h.flush();}
  assert.equal(h.page.groups[2].mounted,true);assert.equal(h.timers.size,0);
  h.page.detail(h.page.groups[1].rows[0].id);assert.equal(h.page.mode,'detail');h.page.onDestroy();
});

test('a native swipe callback arriving after hide cannot change or remount the page',async()=>{
  const h=await boot();assert.equal(typeof h.page.swipeStart,'function');
  h.page.swipeStart();h.page.onHide();h.page.swipeEnd({index:2});
  assert.equal(h.page.groups.length,0);assert.equal(h.timers.size,0);
  h.page.onShow();await h.flush();h.page.detail(h.page.groups[h.page.active].rows[0].id);
  assert.equal(h.page.mode,'detail');h.page.onDestroy();
});

test('identity marquee work is stopped on back and stale callbacks cannot start after hide',async()=>{
  const h=await boot({deferTicks:true});
  for(let i=0;i<4;i++){h.nextTicks.splice(0).forEach(f=>f());await h.flush();}
  h.page.detail(h.page.groups[0].rows[0].id);h.nextTicks.splice(0).forEach(f=>f());
  assert.equal(h.marquees.filter(x=>x.action==='start').length,2);
  h.page.closeDetail();assert.equal(h.marquees.filter(x=>x.action==='stop').length,2);
  h.page.detail(h.page.groups[0].rows[0].id);h.page.onHide();
  h.nextTicks.splice(0).forEach(f=>f());await h.flush();
  assert.equal(h.marquees.filter(x=>x.action==='start').length,2);
  assert.equal(h.page.codeLeft,'');assert.equal(h.page.codeRight,'');assert.equal(h.timers.size,0);h.page.onDestroy();
});

test('native marquee failures cannot block code viewing or immediate exit',async()=>{
  const h=await boot({deferTicks:true}),element=h.page.$element;
  h.page.$element=id=>id.startsWith('detail-')?{start(){throw Error('Native start unavailable');},stop(){throw Error('Native stop unavailable');}}:element(id);
  for(let i=0;i<4;i++){h.nextTicks.splice(0).forEach(f=>f());await h.flush();}
  h.page.detail(h.page.groups[0].rows[0].id);
  assert.doesNotThrow(()=>h.nextTicks.splice(0).forEach(f=>f()));
  assert.equal(h.page.codeLeft,'287');assert.equal(h.timers.size,1);
  assert.doesNotThrow(()=>h.page.exit());assert.equal(h.exits,1);assert.equal(h.timers.size,0);h.page.onDestroy();
});
