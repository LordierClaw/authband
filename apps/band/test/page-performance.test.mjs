import test from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness} from './page-harness.mjs';

async function boot(options) {
  const h=await pageHarness(options);h.page.onInit();h.page.onReady();h.page.onShow();await h.flush();return h;
}

test('native cold ready/show sequence loads the vault once',async()=>{
  const h=await boot();
  assert.equal(h.reads.filter(uri=>uri.endsWith('vault.head')).length,1);
  assert.equal(h.timers.size,1);h.page.onDestroy();
});

test('countdown ticks do not reassign the native swiper data or scroll the list',async()=>{
  const h=await boot(),groups=h.page.groups,assignments=h.assignments.groups,restores=h.scrolled.length;
  for(let second=31;second<60;second++){h.at(second*1000);h.tick();}
  assert.equal(h.assignments.groups,assignments,'only changed row leaves should notify the renderer');
  assert.equal(h.page.groups,groups);assert.equal(h.scrolled.length,restores);
  assert.equal(h.page.groups[0].rows[0].remaining,1);h.page.onDestroy();
});

test('settings/pairing have no OTP ticker and do not lose their status to a code tick',async()=>{
  const h=await boot();h.page.settings();const status=h.page.status;
  assert.equal(h.timers.size,0);h.at(60000);h.tick();assert.equal(h.page.status,status);
  h.page.pairAction();assert.equal(h.page.mode,'pair');assert.equal(h.timers.size,0);
  h.page.cancelPair();h.page.back();assert.equal(h.timers.size,1);
  assert.equal(h.page.groups[0].rows[0].code,'359 152');h.page.onDestroy();
});

test('late scroll from an inactive tab is ignored and restoration does not loop',async()=>{
  const h=await boot({scrollFeedback:true}),oldID=h.page.groups[0].id;
  h.page.changeTab({index:1});const id=h.page.groups[1].id;
  h.page.scroll(id,{scrollY:544,scrollState:1});
  assert.equal(h.page._viewer.preferences().positions[id],4);
  h.page.scroll(oldID,{scrollY:0,scrollState:0});
  assert.equal(h.page._viewer.preferences().positions[id],4);
  const restores=h.scrolled.length;h.page.changeTab({index:1});assert.equal(h.scrolled.length,restores);
  h.page.settings();h.page.back();assert.equal(h.scrolled.at(-1).index,4);
  h.page.onDestroy();
});

test('root back stops timers immediately and exits without waiting for hide/destroy',async()=>{
  const h=await boot(),queued=[...h.timers.keys()][0];
  assert.equal(h.page.onBackPress(),true);assert.equal(h.exits,1);assert.equal(h.timers.size,0);
  queued();await h.flush();assert.equal(h.timers.size,0);assert.equal(h.page.groups.length,0);
  h.page.onHide();h.page.onDestroy();assert.equal(h.exits,1);
});

test('header/footer swipe exits without consuming horizontal group changes or vertical gestures',async()=>{
  const h=await boot();assert.equal(typeof h.page.exitSwipe,'function');
  h.page.changeTab({index:1});assert.equal(h.exits,0);
  h.page.exitSwipe({direction:'up'});assert.equal(h.exits,0);
  h.page.exitSwipe({direction:'left'});assert.equal(h.exits,1);assert.equal(h.timers.size,0);
  h.page.onDestroy();
});

test('exit while native reads are pending prevents late work and repeated exit',async()=>{
  const h=await pageHarness({deferReads:true});h.page.onInit();h.page.onReady();h.page.onShow();
  h.page.onBackPress();assert.equal(h.exits,1);
  for(let i=0;i<20;i++){h.pendingReads.splice(0).forEach(fn=>fn());await h.flush();}
  assert.equal(h.timers.size,0);assert.equal(h.page.groups.length,0);
  h.page.onBackPress();assert.equal(h.exits,1);h.page.onDestroy();
});

test('a newly mounted list cannot overwrite a restored position with its initial zero offset',async()=>{
  const h=await boot(),id=h.page.groups[0].id;
  h.page.scroll(id,{scrollY:544,scrollState:1});
  h.page.changeTab({index:1});h.page.changeTab({index:0});
  h.page.scroll(id,{scrollY:0,scrollState:0});
  assert.equal(h.page._viewer.preferences().positions[id],4);
  h.page.scroll(id,{scrollY:400,scrollState:1});
  h.page.scroll(id,{scrollY:270,scrollState:2});
  h.page.scroll(id,{scrollY:130,scrollState:0});
  assert.equal(h.page._viewer.preferences().positions[id],0,'actual gesture end still records its final row');
  h.page.onDestroy();
});

test('a delayed account click from a removed tab cannot enter a blank detail screen',async()=>{
  const h=await boot(),id=h.page.groups[0].rows[0].id;
  h.page.changeTab({index:1});h.page.detail(id);
  assert.equal(h.page.mode,'codes');assert.equal(h.timers.size,1);h.page.onDestroy();
});

test('repeated group/detail/settings/wake cycles retain only one ticker and the current group rows',async()=>{
  const h=await boot();
  for(let i=0;i<100;i++) {
    h.at(30000+i*31000);h.tick();h.page.changeTab({index:i%8});
    const group=h.page.groups[h.page.active];
    h.page.scroll(group.id,{scrollY:136,scrollState:1});
    h.page.detail(group.rows[1].id);assert.equal(h.page.mode,'detail');assert.equal(h.timers.size,1);
    h.page.onBackPress();assert.equal(h.page.mode,'codes');
    h.page.settings();assert.equal(h.timers.size,0);h.page.back();assert.equal(h.timers.size,1);
    h.page.onHide();assert.equal(h.timers.size,0);h.page.onShow();await h.flush();
    assert.equal(h.timers.size,1);assert.equal(h.page.groups.filter(g=>g.rows.length).length,1);
    assert.ok(h.page.groups.reduce((n,g)=>n+g.rows.length,0)<=7);
  }
  h.page.onBackPress();assert.equal(h.exits,1);assert.equal(h.timers.size,0);h.page.onDestroy();
});
