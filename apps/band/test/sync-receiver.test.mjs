import test from 'node:test';
import assert from 'node:assert/strict';
import {sample} from './fixtures.mjs';
import {encodeSnapshot} from '../src/logic/snapshot.js';
import {digest} from '../src/logic/primitives.js';
import {hex,base64} from '../src/logic/encoding.js';
const api=await import('../src/logic/sync-receiver.js').catch(()=>({}));
test('receiver commits only complete validated digest and rejects premature commits',async()=>{
  assert.equal(typeof api.SyncReceiver,'function');
  let committed=null;const store={load:async()=>committed,commit:async x=>{committed=x;return {vaultID:x.vaultID,revision:x.revision,digest:hex(digest(encodeSnapshot(x)))};}};
  const receiver=new api.SyncReceiver(store,true),x=sample(),bytes=encodeSnapshot(x);
  await receiver.handle('vault.begin',{request:'a',vaultID:x.vaultID,revision:x.revision,digest:hex(digest(bytes)),byteCount:bytes.length});
  await assert.rejects(()=>receiver.handle('vault.commit',{request:'b'}));assert.equal(committed,null);
  for(let i=0;i<bytes.length;i+=96)await receiver.handle('vault.chunk',{request:'c'+i,offset:i,data:base64(bytes.slice(i,i+96))});
  const receipt=await receiver.handle('vault.commit',{request:'d'});assert.equal(receipt.topic,'vault.committed');assert.equal(receipt.body.revision,'1');assert.equal(receipt.body.request,'d');assert.ok(committed);
});
test('receiver rejects real secrets in capability mode',async()=>{
  assert.equal(typeof api.SyncReceiver,'function');
  const store={load:async()=>null,commit:async()=>{throw new Error('disk failed')}};
  const receiver=new api.SyncReceiver(store,false),x=sample();x.accounts[0].secret='AQID';const bytes=encodeSnapshot(x);
  await receiver.handle('vault.begin',{request:'a',vaultID:x.vaultID,revision:x.revision,digest:hex(digest(bytes)),byteCount:bytes.length});
  for(let i=0;i<bytes.length;i+=96)await receiver.handle('vault.chunk',{request:'c',offset:i,data:base64(bytes.slice(i,i+96))});
  await assert.rejects(()=>receiver.handle('vault.commit',{request:'d'}));
});
test('receiver never confirms when durable storage throws',async()=>{
  let attempted=0,published=0;
  const receiver=new api.SyncReceiver({commit:async()=>{attempted++;throw new Error('disk failed')}},true,{committed:()=>published++});
  const x=sample(),bytes=encodeSnapshot(x);
  await receiver.handle('vault.begin',{request:'a',vaultID:x.vaultID,revision:x.revision,digest:hex(digest(bytes)),byteCount:bytes.length});
  for(let i=0;i<bytes.length;i+=96)await receiver.handle('vault.chunk',{request:'c',offset:i,data:base64(bytes.slice(i,i+96))});
  await assert.rejects(()=>receiver.handle('vault.commit',{request:'d'}),/disk failed/);
  assert.equal(attempted,1);assert.equal(published,0);receiver.abort();
});
