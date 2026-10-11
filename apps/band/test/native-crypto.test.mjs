import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {configureCrypto,hmac,digest} from '../src/logic/primitives.js';

const hashDigest=({data,algo})=>createHash(algo.toLowerCase()).update(data).digest('hex');
test('native hash adapter preserves binary HMAC, long keys, and wipes temporary buffers',()=>{
  const seen=[];
  configureCrypto({hashDigest(args){seen.push(args.data);return hashDigest(args);}});
  try {
    for(const algorithm of ['sha1','sha256','sha512'])for(const length of [1,20,64,128]) {
      const key=Uint8Array.from({length},(_,i)=>(i*131)&255),message=new Uint8Array([0,128,255,1,0,0,0,1]);
      assert.deepEqual(Buffer.from(hmac(algorithm,key,message)),createHmac(algorithm,key).update(message).digest());
      assert.equal(key[length-1],((length-1)*131)&255,'caller retains ownership of its key');
    }
    const bytes=new Uint8Array(65536).fill(191);
    assert.deepEqual(Buffer.from(digest(bytes)),createHash('sha256').update(bytes).digest());
    assert.ok(seen.length>20,'exercise the native backend, not only the fallback');
    assert.ok(seen.every(bytes=>bytes.every(b=>b===0)),'native input buffers are wiped after use');
  } finally {configureCrypto(null);}
});

test('missing, text-only, malformed or failing native hash falls back without wrong OTP output',()=>{
  const key=new Uint8Array(20).fill(128),message=new Uint8Array([0,255,0,1]);
  for(const api of [null,{}, {hashDigest:()=> '0'.repeat(128)},
    {hashDigest:({data,algo})=>hashDigest({data:String(data),algo})},
    {hashDigest(args){if(args.data.length===4)return hashDigest(args);throw Error('unsupported');}}]) {
    configureCrypto(api);
    for(const algorithm of ['sha1','sha256','sha512'])assert.deepEqual(Buffer.from(hmac(algorithm,key,message)),createHmac(algorithm,key).update(message).digest());
    assert.deepEqual(Buffer.from(digest(message)),createHash('sha256').update(message).digest());
  }
  configureCrypto(null);
});
