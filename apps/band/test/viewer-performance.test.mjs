import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Viewer} from '../src/logic/viewer.js';
import {capabilityFixture} from '../scripts/capability-fixture.mjs';
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
    at(ms){now=ms;viewer.render(false);},reset(){calculations=0;publishes=0;},
    open(index=0){return viewer.setScreen('detail',last.groups[last.index].rows[index].id);}};
}

test('opening and idling on the account list calculates no OTP and starts no ticker',async()=>{
  const h=harness();await h.viewer.show();const groups=h.last.groups,first=groups[0].rows[0];
  assert.equal(h.calculations,0);assert.equal(h.timers.size,0);
  assert.equal('code' in first,false,'list metadata must not carry reactive code/countdown fields');
  h.reset();for(let second=31;second<120;second++)h.at(second*1000);
  assert.equal(h.calculations,0);assert.equal(h.publishes,0);assert.equal(h.last.groups,groups);
  assert.equal(groups[0].rows[0],first);h.viewer.destroy();
});

test('scroll only records position and never calculates or republishes the list',async()=>{
  const h=harness();await h.viewer.show();h.reset();
  for(let i=0;i<100;i++)h.viewer.scroll(i%7);
  assert.equal(h.calculations,0);assert.equal(h.publishes,0);assert.equal(h.timers.size,0);
  h.viewer.scroll(4);const before=h.viewer.preferences();
  for(const value of [NaN,Infinity,-Infinity])h.viewer.scroll(value);
  assert.deepEqual(h.viewer.preferences(),before);assert.equal(h.last.groups[0].start,4);h.viewer.destroy();
});

test('all bounded metadata lists are ready and tab selection never replaces rows',async()=>{
  const h=harness();await h.viewer.show();
  assert.equal(h.last.groups.reduce((n,g)=>n+g.rows.length,0),50);
  const next=h.last.groups[1].rows,groups=h.last.groups,rows=groups.map(g=>g.rows);
  assert.equal(next.length,7);h.viewer.select(1);assert.equal(h.last.groups[1].rows,next);
  for(const index of [2,3,7,6,5,0]) {
    h.viewer.select(index);
    assert.equal(h.last.groups,groups);
    assert.ok(h.last.groups.every((g,i)=>g.mounted&&g.rows===rows[i]));
  }
  assert.equal(h.calculations,0);assert.equal(h.timers.size,0);h.viewer.destroy();
});

test('detail calculates one selected token and countdowns reuse it until rollover',async()=>{
  const h=harness();await h.viewer.show();h.open();
  assert.equal(h.calculations,1);assert.ok(h.last.detail);assert.equal(h.last.detail.code,'287 082');
  const groups=h.last.groups,detail=h.last.detail,first=groups[0].rows[0];
  for(let second=31;second<60;second++)h.at(second*1000);
  assert.equal(h.calculations,1);assert.equal(h.last.detail,detail);assert.equal(detail.remaining,1);
  assert.equal(h.last.groups,groups);assert.equal(groups[0].rows[0],first);
  h.at(60000);assert.equal(h.calculations,2);assert.equal(detail.code,'359 152');assert.equal(detail.remaining,30);
  h.viewer.setScreen('list');assert.equal(h.last.detail,null);assert.equal(h.timers.size,0);h.viewer.destroy();
});

test('all public accounts and mixed periods match independent Node HMAC in detail',async()=>{
  const snapshot=capabilityFixture();snapshot.accounts.forEach((a,i)=>a.parameters.period=[15,30,45,60,90,120][i%6]);
  const expected=structuredClone(snapshot),h=harness(snapshot,44000);await h.viewer.show();
  for(const second of [44,45,59,60,89,90,119,120]) {
    h.at(second*1000);
    for(let group=0;group<8;group++) {
      h.viewer.setScreen('list');h.viewer.select(group);
      for(const row of h.last.groups[group].rows) {
        const a=expected.accounts.find(a=>a.id===row.id),counter=Buffer.alloc(8);
        counter.writeBigUInt64BE(BigInt(Math.floor(second/a.parameters.period)));
        const hash=createHmac(a.parameters.algorithm,Buffer.from(a.secret,'base64')).update(counter).digest();
        const value=String((hash.readUInt32BE(hash.at(-1)&15)&0x7fffffff)%10**a.parameters.digits).padStart(a.parameters.digits,'0');
        h.viewer.setScreen('detail',row.id);assert.ok(h.last.detail);
        assert.equal(h.last.detail.code.replace(' ',''),value);
      }
    }
  }
  h.viewer.destroy();
});

test('hide/reload discard detail cache and clock distrust masks a selected code',async()=>{
  const h=harness();await h.viewer.show();h.open();h.viewer.hide();h.reset();await h.viewer.show();
  assert.equal(h.calculations,0);assert.equal(h.last.detail,null);h.open();assert.equal(h.calculations,1);
  h.at(20000);assert.equal(h.last.trusted,false);assert.equal(h.last.detail.code,'--- ---');
  h.reset();h.viewer.updateTime({offset:10000,wallMs:20000,uncertainty:0});
  assert.equal(h.calculations,1);assert.equal(h.last.detail.code,'287 082');h.viewer.destroy();
});

test('list and settings stop queued detail ticks and reopening is aligned to corrected seconds',async()=>{
  const h=harness(capabilityFixture(),30250);await h.viewer.show();h.open();
  const old=[...h.timers.keys()][0];assert.equal([...h.timers.values()][0],750);
  h.viewer.setScreen('list');h.reset();old();h.at(60000);
  assert.equal(h.calculations,0);assert.equal(h.timers.size,0);assert.equal(h.publishes,0);
  h.open();h.viewer.updateTime({offset:500,wallMs:60000,uncertainty:0});
  assert.equal([...h.timers.values()][0],500);
  const queued=[...h.timers.keys()][0];h.viewer.setScreen('settings');h.reset();queued();
  assert.equal(h.calculations,0);assert.equal(h.publishes,0);assert.equal(h.timers.size,0);h.viewer.destroy();
});

test('a callback from the previous lifecycle cannot restart a detail ticker after wake',async()=>{
  const h=harness();await h.viewer.show();h.open();const old=[...h.timers.keys()][0];
  h.viewer.hide();await h.viewer.show();h.open();h.reset();old();
  assert.equal(h.publishes,0);assert.equal(h.timers.size,1);h.viewer.destroy();old();assert.equal(h.timers.size,0);
});

test('case-insensitive group references render, open details and retain scroll position',async()=>{
  const snapshot=capabilityFixture(),original=snapshot.groups[0].id;
  snapshot.groups[0].id='aaaaaaaa-0000-4000-8000-000000000002';
  for(const a of snapshot.accounts)if(a.groupID===original)a.groupID=snapshot.groups[0].id.toUpperCase();
  validateSnapshot(snapshot);const h=harness(snapshot);await h.viewer.show();
  assert.equal(h.last.groups[0].rows.length,7);h.open();assert.equal(h.last.detail?.code,'287 082');
  h.viewer.setScreen('list');h.viewer.scroll(4);h.viewer.select(1);h.viewer.select(0);
  assert.equal(h.last.groups[0].start,4);h.viewer.destroy();
});

test('reload blocks old account taps and a replacement secret cannot reuse a cached OTP',async()=>{
  let resolve,loaded=0,last;
  const next=sample();next.accounts[0].secret='YWJjZGVmZ2hpamtsbW5vcHFyc3Q=';
  const viewer=new Viewer({load:()=>loaded++===0?Promise.resolve({snapshot:sample(),time:{offset:0,wallMs:30000,uncertainty:0}}):new Promise(r=>resolve=r),
    clock:()=>30000,scheduler:{set:()=>1,clear:()=>{}},publish:state=>last=state});
  await viewer.show();viewer.setScreen('detail',next.accounts[0].id);assert.equal(last.detail?.code,'287 082');
  const reloading=viewer.show();assert.equal(viewer.setScreen('detail',next.accounts[0].id),false);
  resolve({snapshot:next,time:{offset:0,wallMs:30000,uncertainty:0}});await reloading;
  viewer.setScreen('detail',next.accounts[0].id);assert.equal(last.detail.code,'241 063');viewer.destroy();
});

test('a detail click from another tab or after hide does not start code work',async()=>{
  const h=harness();await h.viewer.show();const id=h.last.groups[0].rows[0].id;
  h.viewer.select(1);assert.equal(h.viewer.setScreen('detail',id),false);
  h.viewer.hide();assert.equal(h.viewer.setScreen('detail',h.last.groups[1].rows[0].id),false);
  assert.equal(h.calculations,0);assert.equal(h.timers.size,0);h.viewer.destroy();
});
