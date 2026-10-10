import test from 'node:test';
import assert from 'node:assert/strict';
import {VaultStore} from '../src/logic/vault-store.js';
import {SyncReceiver} from '../src/logic/sync-receiver.js';
import {sample} from './fixtures.mjs';
test('status cannot confirm a deletion until obsolete snapshot cleanup succeeds',async()=>{
  const files={};let failing=false;
  const io={read:async k=>files[k]??null,write:async(k,v)=>{files[k]=v},remove:async k=>{if(failing)throw Error('full');delete files[k]}};
  const store=new VaultStore(io);await store.commit(sample());
  const empty=sample();empty.revision='2';empty.accounts=[];failing=true;
  await assert.rejects(store.commit(empty));
  const restarted=new VaultStore(io),receiver=new SyncReceiver(restarted,false);
  await assert.rejects(receiver.handle('vault.status',{request:'1'}));
  failing=false;assert.equal((await receiver.handle('vault.status',{request:'2'})).body.revision,'2');
  assert.equal(Object.keys(files).filter(k=>/^vault.[01]$/.test(k)).length,1);
});
