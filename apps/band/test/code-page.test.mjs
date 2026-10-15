import test from 'node:test';
import assert from 'node:assert/strict';
import {pageHarness} from './page-harness.mjs';
import {capabilityFixture} from '../scripts/capability-fixture.mjs';

const fixture=capabilityFixture();
function shared(index=0,time={offset:0,uncertainty:0,wallMs:30000}) {
  return {snapshot:fixture,time,selected:fixture.accounts[index].id,idleDeadline:330000};
}
async function open(index,time) {
  const h=await pageHarness({page:'code',shared:shared(index,time)});h.page.onInit();return h;
}
const swipe=(h,dx)=>{h.page.touchStart({touches:[{clientX:30,clientY:260}]});h.page.touchEnd({changedTouches:[{clientX:30+dx,clientY:262}]});};

test('shows identity and a six-digit code with a countdown aligned to the second',async()=>{
  const h=await open(0);
  assert.equal(h.page.issuer,'SHA1 1');assert.equal(h.page.label,'public-fixture-1');
  assert.equal(h.page.code,'287 082');assert.equal(h.page.left,'287');assert.equal(h.page.right,'082');
  assert.equal(h.page.time,'0:30');assert.equal(h.page.progress,100);assert.equal(h.workTimers.size,1);
  h.at(59000);h.tick();assert.equal(h.page.time,'0:01');assert.equal(h.page.progress,3);
  h.at(60000);h.tick();assert.equal(h.page.time,'0:30');assert.notEqual(h.page.code,'287 082');
  h.page.onDestroy();assert.equal(h.timers.size,0);
});

test('eight digits use the small fixed groups; unknown time masks both and warns',async()=>{
  const h=await open(1);
  assert.equal(h.page.left,'9428');assert.equal(h.page.right,'7082');assert.equal(h.page.small,true);
  assert.match(h.page.label,/tiếng Việt/);h.page.onDestroy();
  const u=await open(1,null);
  assert.equal(u.page.left,'----');assert.equal(u.page.right,'----');assert.equal(u.page.time,'');
  assert.equal(u.page.status,'Cần đồng bộ giờ');u.page.onDestroy();
});

test('hide masks the code and stops work; wake recomputes immediately',async()=>{
  const h=await open(0);h.page.onHide();
  assert.equal(h.page.code,'--- ---');assert.equal(h.timers.size,0);
  h.at(31000);h.page.onShow();assert.equal(h.page.code,'287 082');assert.equal(h.page.time,'0:29');
  h.page.onDestroy();
});

test('system back pops the page itself; the swipe fallback never pops twice',async()=>{
  const h=await open(0);swipe(h,150);
  assert.equal(h.page.onBackPress(),false);
  const pending=[...h.timers].find(([,d])=>d===350)?.[0];if(pending)pending();
  assert.equal(h.app.backs,0,'the firmware pops the page with its own transition');
  const g=await open(0);swipe(g,40);swipe(g,150);swipe(g,150);
  [...g.timers].filter(([,d])=>d===350).forEach(([fn])=>{g.timers.delete(fn);fn();});
  assert.equal(g.app.backs,1);assert.equal(g.timers.get(g.page._ticker&&g.page._ticker.timer),undefined);
  g.page.onDestroy();assert.equal(g.timers.size,0);
});

test('a missing account returns to the list instead of showing an empty page',async()=>{
  const h=await pageHarness({page:'code',shared:{...shared(0),selected:'gone'}});h.page.onInit();
  assert.equal(h.app.backs,1);assert.equal(h.timers.size,0);h.page.onDestroy();
});

test('idle expiry uses the deadline shared with the list page',async()=>{
  const h=await open(0);h.at(329999);
  [...h.timers].find(([fn])=>fn===h.page._idleTimer)[0]();assert.equal(h.app.exits,0);
  h.at(330000);[...h.timers].find(([fn])=>fn===h.page._idleTimer)[0]();assert.equal(h.app.exits,1);
  h.page.onDestroy();
});

test('repeated open and close leaves no timers behind',async()=>{
  const app={exits:0,pushes:[],backs:0,$def:{authband:shared(0)}};
  for(let i=0;i<30;i++){
    const h=await pageHarness({page:'code',app});h.page.onInit();h.at(30000+i*700);h.tick();
    swipe(h,150);[...h.timers].filter(([,d])=>d===350).forEach(([fn])=>{h.timers.delete(fn);fn();});
    h.page.onHide();h.page.onDestroy();assert.equal(h.timers.size,0);assert.equal(h.page._ticker,null);
  }
  assert.equal(app.backs,30);
});
