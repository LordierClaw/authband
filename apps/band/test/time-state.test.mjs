import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/logic/time-state.js').catch(()=>({}));
test('clock discontinuities invalidate codes until a bounded time sample succeeds',()=>{
  assert.equal(typeof api.TimeState,'function');
  const state=new api.TimeState();
  assert.equal(state.observe(100000,0).trusted,false);
  state.applySample({phoneMs:100000,wallMs:100000,rttMs:100});
  assert.equal(state.observe(101000,1000).trusted,true);
  assert.equal(state.observe(90000,2000).trusted,false);
  assert.throws(()=>state.applySample({phoneMs:100000,wallMs:100000,rttMs:1001}));
  state.applySample({phoneMs:100000,wallMs:100000,rttMs:100});
  state.observe(100000,3000);
  assert.equal(state.observe(120000,4000).trusted,false);
});
