import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,hkdfSync,createDecipheriv} from 'node:crypto';
const api=await import('../src/logic/protected-channel.js').catch(()=>({}));
const options={key:new Uint8Array(16).fill(7),pairID:'00000000-0000-4000-8000-000000000001',epoch:'1',salt:new Uint8Array(32).fill(9)};
test('channel matches independent Node AESGCM and authenticates all routing fields',()=>{
  assert.equal(typeof api.ProtectedChannel,'function');
  const phone=new api.ProtectedChannel(options,'phone'),band=new api.ProtectedChannel(options,'band');
  const frame=phone.seal('vault.status',new Uint8Array([123,125]));
  const salt=Buffer.from(options.salt).toString('base64');
  const key=hkdfSync('sha256',options.key,options.salt,`AuthBand/key/1\n${options.pairID}\n1\nphone`,32);
  const nonce=Buffer.from('000000010000000000000001','hex');
  const cipher=Buffer.from(frame.c,'base64'),decrypt=createDecipheriv('aes-256-gcm',key,nonce);
  decrypt.setAAD(Buffer.from(`AuthBand/frame/1\n${options.pairID}\n1\n${salt}\nphone\n1\nvault.status`));decrypt.setAuthTag(cipher.subarray(-16));
  assert.equal(Buffer.concat([decrypt.update(cipher.subarray(0,-16)),decrypt.final()]).toString(),'{}');
  assert.throws(()=>band.open({...frame,t:'vault.commit'}));
  assert.equal(Buffer.from(band.open(frame).payload).toString(),'{}');
  assert.equal(band.open(frame).duplicate,true);
  assert.throws(()=>band.open({...frame,c:frame.c.slice(0,-4)+'AAAA'}));
});
test('hello MAC is independently reproducible and an epoch cannot be replayed after restart',()=>{
  assert.equal(typeof api.makeHello,'function');
  const hello=api.makeHello(options);
  const expected=createHmac('sha256',options.key).update(`AuthBand/hello/1\n${options.pairID}\n1\n${hello.n}`).digest('base64');
  assert.equal(hello.m,expected);assert.equal(api.verifyHello(options.key,hello,'0').epoch,'1');
  assert.throws(()=>api.verifyHello(options.key,hello,'1'));
  assert.throws(()=>api.verifyHello(options.key,{...hello,e:'2'},'0'));
});
