import test from 'node:test';
import assert from 'node:assert/strict';
import {sample} from './snapshot.test.mjs';
const api=await import('../src/logic/vault-store.js').catch(()=>({}));
class Disk {
  data=new Map(); operations=0; failAt=Infinity;
  hit(){if(++this.operations===this.failAt) throw new Error('power loss');}
  async read(k){this.hit();return this.data.get(k) ?? null;}
  async write(k,v){this.hit();this.data.set(k,v);}
  async remove(k){this.hit();this.data.delete(k);}
}
test('acknowledged deletion never resurrects from an obsolete slot',async()=>{
  assert.equal(typeof api.VaultStore,'function');
  const disk=new Disk(), store=new api.VaultStore(disk);await store.commit(sample());
  const empty=sample();empty.revision='2';empty.accounts=[];
  await store.commit(empty);
  assert.equal((await new api.VaultStore(disk).load()).accounts.length,0);
  assert.equal([...disk.data.values()].filter(x=>x.includes('MTIzNDU2')).length,0);
});
test('power interruption at every IO boundary returns a valid old/new vault or fails closed',async()=>{
  assert.equal(typeof api.VaultStore,'function');
  for(let step=1;step<=16;step++) {
    const disk=new Disk();await new api.VaultStore(disk).commit(sample());
    disk.operations=0;disk.failAt=step;const next=sample();next.revision='2';next.accounts=[];
    let acknowledged=false;try{await new api.VaultStore(disk).commit(next);acknowledged=true;}catch{}
    disk.failAt=Infinity;const recovered=await new api.VaultStore(disk).load();
    assert.ok(['1','2'].includes(recovered.revision));
    if(acknowledged) assert.equal(recovered.accounts.length,0);
  }
});
test('corrupted journal never falls back to deleted accounts',async()=>{
  assert.equal(typeof api.VaultStore,'function');
  const disk=new Disk();await new api.VaultStore(disk).commit(sample());
  disk.data.set('vault.head','{broken');
  await assert.rejects(()=>new api.VaultStore(disk).load());
});
