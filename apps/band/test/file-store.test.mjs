import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/platform/file-store.js').catch(()=>({}));
test('native file wrapper distinguishes missing data from IO failures',async()=>{
  assert.equal(typeof api.FileStore,'function');
  const missing=new api.FileStore({readText:o=>o.fail({},301)});
  assert.equal(await missing.read('vault.head'),null);
  const broken=new api.FileStore({readText:o=>o.fail({},300)});
  await assert.rejects(()=>broken.read('vault.head'));
});
test('a lost native callback poisons further writes until restart',async()=>{
  assert.equal(typeof api.FileStore,'function');
  const store=new api.FileStore({writeText:()=>{}},5);
  await assert.rejects(()=>store.write('vault.head','x'));
  await assert.rejects(()=>store.write('vault.head','y'));
});
