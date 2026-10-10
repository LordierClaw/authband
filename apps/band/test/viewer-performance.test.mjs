import test from 'node:test';
import assert from 'node:assert/strict';
import {Viewer} from '../src/logic/viewer.js';
import {capabilityFixture} from '../scripts/capability-fixture.mjs';
import {totp} from '../src/logic/totp.js';
import {unbase64} from '../src/logic/encoding.js';
import {validateSnapshot} from '../src/logic/snapshot.js';
import {sample} from './fixtures.mjs';

function harness(snapshot=capabilityFixture(), initial=30000) {
  let now=initial,calculations=0,last,publishes=0;
  const timers=new Map();
  for(const account of snapshot.accounts) {
    const secret=account.secret;
    Object.defineProperty(account,'secret',{configurable:true,get(){calculations++;return secret;}});
  }
  const viewer=new Viewer({load:async()=>({snapshot,time:{offset:0,wallMs:initial,uncertainty:0}}),clock:()=>now,
    scheduler:{set:(fn,delay)=>{timers.set(fn,delay);return fn;},clear:fn=>timers.delete(fn)},
    publish:state=>{last=state;publishes++;}});
  return {viewer,timers,get last(){return last;},get calculations(){return calculations;},get publishes(){return publishes;},
    at(ms){now=ms;viewer.render(false);},reset(){calculations=0;publishes=0;}};
}

test('one OTP period computes each visible token once and preserves list/row identities',async()=>{
  const h=harness();await h.viewer.show();
  const groups=h.last.groups,rows=groups[0].rows,first=rows[0];
  assert.equal(h.calculations,4);
  for(let second=31;second<60;second++)h.at(second*1000);
  assert.equal(h.calculations,4,'countdown must not recompute HMAC');
  assert.equal(h.last.groups,groups,'do not rebuild swiper data every second');
  assert.equal(h.last.groups[0].rows,rows);
  assert.equal(h.last.groups[0].rows[0],first);
  assert.equal(first.remaining,1);
  h.at(60000);assert.equal(h.calculations,8);assert.equal(first.remaining,30);
  assert.equal(first.code,'359 152');h.viewer.destroy();
});

test('scrolling within a row is a no-op; crossing a row computes only newly exposed token',async()=>{
  const h=harness();await h.viewer.show();h.reset();
  for(let i=0;i<100;i++)h.viewer.scroll(0);
  assert.equal(h.calculations,0);assert.equal(h.publishes,0);
  h.viewer.scroll(1);assert.equal(h.calculations,1);
  assert.match(h.last.groups[0].rows[4].code,/^\d{3} \d{3}$/);
  h.viewer.scroll(0);assert.equal(h.calculations,1,'same-period reverse scrolling reuses computed code');
  const before=h.viewer.preferences();
  for(const value of [NaN,Infinity,-Infinity])h.viewer.scroll(value);
  assert.deepEqual(h.viewer.preferences(),before);
  h.viewer.destroy();
});

test('inactive tabs contain no account rows; switching back uses a bounded cache',async()=>{
  const h=harness();await h.viewer.show();
  assert.equal(h.last.groups.slice(1).reduce((n,g)=>n+g.rows.length,0),0);
  const groups=h.last.groups;h.viewer.select(1);
  assert.equal(h.last.groups,groups);assert.equal(h.last.groups[0].rows.length,0);
  assert.equal(h.last.groups[1].rows.length,7);
  const count=h.calculations;h.viewer.select(0);assert.equal(h.calculations,count);
  h.viewer.destroy();
});

test('mixed periods and all algorithms/digit lengths match uncached OTP through rollovers',async()=>{
  const snapshot=capabilityFixture();
  snapshot.accounts=snapshot.accounts.slice(0,6);
  for(let i=0;i<6;i++){snapshot.accounts[i].groupID=snapshot.groups[0].id;snapshot.accounts[i].parameters.period=[15,30,45,60,90,120][i];}
  const expected=structuredClone(snapshot),h=harness(snapshot,44000);await h.viewer.show();
  for(const second of [44,45,59,60,89,90,119,120]) {
    h.at(second*1000);
    for(let start=0;start<3;start++) {
      h.viewer.scroll(start);
      for(let i=start;i<Math.min(start+4,6);i++) {
        const a=expected.accounts[i],value=totp(unbase64(a.secret),a.parameters,second).value;
        assert.equal(h.last.groups[0].rows[i].code.replace(' ',''),value);
      }
    }
  }
  h.viewer.destroy();
});

test('cache is discarded on hide/reload and codes are masked when clock becomes untrusted',async()=>{
  const h=harness();await h.viewer.show();h.viewer.hide();h.reset();await h.viewer.show();
  assert.equal(h.calculations,4);h.at(20000);
  assert.equal(h.last.trusted,false);assert.equal(h.last.groups[0].rows[0].code,'--- ---');
  h.reset();h.viewer.updateTime({offset:10000,wallMs:20000,uncertainty:0});
  assert.equal(h.calculations,4,'trust recovery cannot reuse pre-distrust results');
  h.viewer.destroy();
});

test('settings stops scheduling and detail computes only the selected account',async()=>{
  const h=harness();await h.viewer.show();
  assert.equal(typeof h.viewer.setScreen,'function');
  const queued=[...h.timers.keys()][0];h.viewer.setScreen('settings');h.reset();
  assert.equal(h.timers.size,0);queued();h.at(60000);
  assert.equal(h.calculations,0);assert.equal(h.publishes,0);assert.equal(h.timers.size,0);
  const id=h.last.groups[0].rows[1].id;h.viewer.setScreen('detail',id);
  assert.equal(h.calculations,1);assert.equal(h.timers.size,1);
  h.viewer.setScreen('codes');assert.equal(h.calculations,4);assert.equal(h.timers.size,1);
  h.viewer.destroy();queued();assert.equal(h.timers.size,0);
});

test('ticker aligns to seconds and a callback queued before hide cannot restart after wake',async()=>{
  const h=harness(capabilityFixture(),30250);await h.viewer.show();
  const old=[...h.timers.keys()][0];assert.equal([...h.timers.values()][0],750);
  h.viewer.hide();await h.viewer.show();h.reset();old();
  assert.equal(h.publishes,0);assert.equal(h.timers.size,1);
  h.viewer.destroy();
});

test('a synchronized time offset realigns the next tick instead of delaying rollover',async()=>{
  const h=harness();await h.viewer.show();const old=[...h.timers.keys()][0];
  h.viewer.updateTime({offset:500,wallMs:30000,uncertainty:0});
  assert.equal([...h.timers.values()][0],500);assert.equal(h.timers.size,1);
  h.reset();old();assert.equal(h.publishes,0);assert.equal(h.timers.size,1);h.viewer.destroy();
});

test('validator-accepted case-insensitive group references render and scroll normally',async()=>{
  const snapshot=capabilityFixture(),original=snapshot.groups[0].id;
  snapshot.groups[0].id='aaaaaaaa-0000-4000-8000-000000000002';
  for(const account of snapshot.accounts)if(account.groupID===original)account.groupID=snapshot.groups[0].id.toUpperCase();
  validateSnapshot(snapshot);const h=harness(snapshot);await h.viewer.show();
  assert.equal(h.last.groups[0].rows.length,7);assert.equal(h.last.groups[0].rows[0].code,'287 082');
  h.viewer.scroll(1);assert.match(h.last.groups[0].rows[4].code,/^\d{3} \d{3}$/);
  h.viewer.select(1);h.viewer.select(0);assert.equal(h.last.groups[0].start,1);h.viewer.destroy();
});

test('a tap during deferred reload cannot cache a code from the superseded secret',async()=>{
  let resolve,loaded=0,last;
  const next=sample();next.accounts[0].secret='YWJjZGVmZ2hpamtsbW5vcHFyc3Q=';
  const viewer=new Viewer({load:()=>loaded++===0?Promise.resolve({snapshot:sample(),time:{offset:0,wallMs:30000,uncertainty:0}}):new Promise(r=>resolve=r),
    clock:()=>30000,scheduler:{set:()=>1,clear:()=>{}},publish:state=>last=state});
  await viewer.show();assert.equal(last.groups[0].rows[0].code,'287 082');
  const reloading=viewer.show();viewer.setScreen('detail',next.accounts[0].id);
  resolve({snapshot:next,time:{offset:0,wallMs:30000,uncertainty:0}});await reloading;
  assert.equal(last.groups[0].rows[0].code,'241 063');viewer.destroy();
});
