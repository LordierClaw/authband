import test from 'node:test';
import assert from 'node:assert/strict';
import {sample} from './fixtures.mjs';
const api=await import('../src/logic/viewer.js').catch(()=>({}));
test('viewer cancels all ticks and a late load cannot republish after hide',async()=>{
  assert.equal(typeof api.Viewer,'function');
  let resolve;const pending=new Promise(r=>resolve=r),timers=new Set(),published=[];
  const v=new api.Viewer({load:()=>pending,clock:()=>59000,scheduler:{set:f=>{timers.add(f);return f},clear:f=>timers.delete(f)},publish:x=>published.push(x)});
  const showing=v.show();v.hide();resolve({snapshot:sample(),time:{trusted:true,offset:0,wallMs:59000,uncertainty:0}});await showing;
  assert.equal(timers.size,0);assert.equal(published.length,0);
});
test('viewer recalculates on wake, preserves active group and masks unknown time',async()=>{
  assert.equal(typeof api.Viewer,'function');let now=59000,last;const timers=new Set();
  const v=new api.Viewer({load:async()=>({snapshot:sample(),time:{offset:0,wallMs:59000,uncertainty:0}}),clock:()=>now,scheduler:{set:f=>{timers.add(f);return f},clear:f=>timers.delete(f)},publish:x=>last=x});
  await v.show();assert.equal(last.groups[0].rows[0].code,'287 082');v.hide();now=121000;await v.show();
  assert.notEqual(last.groups[0].rows[0].code,'287 082');assert.equal(timers.size,1);
  now=1000;[...timers][0]();assert.equal(last.groups[0].rows[0].code,'--- ---');v.destroy();assert.equal(timers.size,0);
});
