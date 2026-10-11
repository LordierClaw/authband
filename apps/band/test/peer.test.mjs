import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHello,ProtectedChannel} from '../src/logic/protected-channel.js';
import {utf8,base64} from '../src/logic/encoding.js';
const api=await import('../src/logic/peer.js').catch(()=>({}));
function io(){const files={};return {files,read:async k=>files[k]??null,write:async(k,v)=>{files[k]=v},remove:async k=>{delete files[k]}}}
const options={key:new Uint8Array(16).fill(7),salt:new Uint8Array(32).fill(9),epoch:'1',pairID:'00000000-0000-4000-8000-000000000001'};
const envelope=(topic,body)=>({v:1,id:'i-1',src:'ios',type:'message',topic,body});

test('phone-only capability enrollment is idempotent and never replaces an owner or vault',async()=>{
  const disk=io(),receiver={abort(){}},body={key:base64(options.key),pairID:options.pairID};
  await assert.rejects(new api.Peer(disk,receiver).receive(envelope('auth.enroll',body)));
  const peer=new api.Peer(disk,receiver,{allowEnrollment:true});
  const result=await peer.receive(envelope('auth.enroll',body));assert.equal(result.topic,'auth.enrolled');
  const state=disk.files.pairing;
  await peer.receive(envelope('auth.enroll',body));assert.equal(disk.files.pairing,state);
  await assert.rejects(peer.receive(envelope('auth.enroll',{...body,key:base64(new Uint8Array(16))})));
  await assert.rejects(peer.receive(envelope('auth.enroll',{...body,pairID:'00000000-0000-4000-8000-000000000002'})));
  assert.equal(disk.files.pairing,state);
  const orphan=io();orphan.files['vault.1']='orphan';
  await assert.rejects(new api.Peer(orphan,receiver,{allowEnrollment:true}).receive(envelope('auth.enroll',body)));
  assert.equal(orphan.files.pairing,undefined);
});
test('peer persists epoch before ready, rejects restart replay and replays exact response without reapplying',async()=>{
  assert.equal(typeof api.Peer,'function');const disk=io();let calls=0;
  const receiver={abort(){},handle:async()=>{calls++;return {topic:'vault.status.ok',body:{request:'1',empty:true}}}};
  const peer=new api.Peer(disk,receiver);await peer.enroll(options.key);
  await peer.receive(envelope('auth.hello',makeHello(options)));
  assert.equal(JSON.parse(disk.files.pairing).epoch,'1');
  const phone=new ProtectedChannel(options,'phone');
  const frame=envelope('auth.frame',phone.seal('vault.status',utf8(JSON.stringify({request:'1'}))));
  const a=await peer.receive(frame),b=await peer.receive(frame);assert.deepEqual(a,b);assert.equal(calls,1);
  const restarted=new api.Peer(disk,receiver);await assert.rejects(restarted.receive(envelope('auth.hello',makeHello(options))));
  peer.close();await assert.rejects(peer.receive(frame));
});
test('peer never acknowledges an epoch when its readback is lost; pairing entry is exact and cancellable',async()=>{
  assert.equal(typeof api.PairingInput,'function');const input=new api.PairingInput();for(let i=0;i<32;i++)input.add('A');assert.equal(input.complete,true);assert.equal(input.mask.length,32);input.back();assert.equal(input.complete,false);input.cancel();assert.equal(input.length,0);
  const disk=io(),peer=new api.Peer(disk,{abort(){}});await peer.enroll(options.key);disk.write=async(k,v)=>{disk.files[k]=v.slice(0,5)};
  await assert.rejects(peer.receive(envelope('auth.hello',makeHello(options))));assert.equal(peer.channel,null);
});
