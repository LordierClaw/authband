import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {CodeTicker} from '../src/logic/code-ticker.js';
import {listItems} from '../src/logic/list-model.js';
import {capabilityFixture} from '../scripts/capability-fixture.mjs';
import {validateSnapshot} from '../src/logic/snapshot.js';

function ticker(account,{now=30000,time={offset:0,uncertainty:0,wallMs:30000}}={}) {
  let calculations=0,last;const timers=new Map(),secret=account.secret;
  Object.defineProperty(account,'secret',{configurable:true,get(){calculations++;return secret;}});
  const t=new CodeTicker({account,time,clock:()=>now,scheduler:{set:(fn,d)=>{timers.set(fn,d);return fn;},clear:fn=>timers.delete(fn)},publish:v=>last=v});
  return {t,timers,get last(){return last;},get calculations(){return calculations;},at(ms){now=ms;},fire(){const fn=[...timers.keys()][0];timers.delete(fn);fn();}};
}

test('one HMAC per counter window, countdown every second',()=>{
  const h=ticker(capabilityFixture().accounts[0]);h.t.start();
  assert.equal(h.last.code,'287 082');assert.equal(h.calculations,1);assert.equal([...h.timers.values()][0],1000);
  for(let s=31;s<60;s++){h.at(s*1000);h.fire();}
  assert.equal(h.calculations,1);assert.equal(h.last.remaining,1);
  h.at(60000);h.fire();assert.equal(h.calculations,2);assert.equal(h.last.code,'359 152');
  h.t.destroy();assert.equal(h.timers.size,0);
});

test('ticks align to the corrected second and stale callbacks do nothing',()=>{
  const h=ticker(capabilityFixture().accounts[0],{now:30250});h.t.start();
  assert.equal([...h.timers.values()][0],750);
  const stale=[...h.timers.keys()][0];h.t.stop();h.t.start();const published=h.last;stale();
  assert.equal(h.last,published);assert.equal(h.timers.size,1);
  h.t.updateTime({offset:500,wallMs:30250,uncertainty:0});h.t.stop();h.t.start();
  assert.equal([...h.timers.values()][0],250);h.t.destroy();
});

test('clock distrust masks immediately and repair recomputes',()=>{
  const h=ticker(capabilityFixture().accounts[0]);h.t.start();
  h.at(20000);h.fire();assert.equal(h.last.code,'--- ---');assert.equal(h.last.trusted,false);
  h.t.updateTime({offset:10000,wallMs:20000,uncertainty:0});assert.equal(h.last.code,'287 082');h.t.destroy();
});

test('every public account and mixed periods match independent Node HMAC',()=>{
  const snapshot=capabilityFixture();snapshot.accounts.forEach((a,i)=>a.parameters.period=[15,30,45,60,90,120][i%6]);
  for(const a of snapshot.accounts)for(const second of [44,45,59,60,89,90,119,120]) {
    const t=new CodeTicker({account:a,time:{offset:0,uncertainty:0,wallMs:second*1000},clock:()=>second*1000,scheduler:{set:()=>1,clear:()=>{}},publish:v=>{
      const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(second/a.parameters.period)));
      const hash=createHmac(a.parameters.algorithm,Buffer.from(a.secret,'base64')).update(counter).digest();
      assert.equal(v.code.replace(' ',''),String((hash.readUInt32BE(hash.at(-1)&15)&0x7fffffff)%10**a.parameters.digits).padStart(a.parameters.digits,'0'));
    }});
    t.start();t.destroy();
  }
});

test('list model: ordered groups, ordered accounts, no empty groups, case-insensitive ids',()=>{
  const snapshot=capabilityFixture();
  snapshot.groups[2].id='aaaaaaaa-0000-4000-8000-000000000004';
  for(const a of snapshot.accounts)if(a.groupID==='00000000-0000-4000-8000-000000000004')a.groupID=snapshot.groups[2].id.toUpperCase();
  snapshot.accounts=snapshot.accounts.filter(a=>a.groupID!==snapshot.groups[7].id);validateSnapshot(snapshot);
  const items=listItems(snapshot),heads=items.filter(i=>i.kind==='head');
  assert.deepEqual(heads.map(h=>h.title),snapshot.groups.slice(0,7).map(g=>g.name));
  assert.equal(items.filter(i=>i.kind==='row').length,snapshot.accounts.length);
  assert.deepEqual(items.slice(1,4).map(i=>i.title),['SHA1 1','SHA256 9','SHA512 17']);
  assert.ok(items.every(i=>Object.keys(i).join()==='id,kind,title,sub'));
});
