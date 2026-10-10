import assert from 'node:assert/strict';
import {X509Certificate} from 'node:crypto';

// Toolkit RPK signing blocks use bounded little-endian length prefixes.
function reader(bytes) {
  const data=Buffer.from(bytes);let position=0;
  const take=n=>{assert.ok(Number.isSafeInteger(n)&&n>=0&&n<=data.length-position,'Truncated signing block');const value=data.subarray(position,position+n);position+=n;return value;};
  const u32=()=>take(4).readUInt32LE(0);
  const u64=()=>{const low=u32();assert.equal(u32(),0,'Oversize signing block');return low;};
  return {take,u32,u64,field:()=>take(u32()),remaining:()=>data.length-position};
}

export function rpkCertificate(bytes) {
  const data=Buffer.from(bytes);
  let eocd=-1;
  for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--) {
    if(data.readUInt32LE(i)===0x06054b50&&i+22+data.readUInt16LE(i+20)===data.length){eocd=i;break;}
  }
  assert.ok(eocd>=0,'Missing ZIP footer');
  const central=data.readUInt32LE(eocd+16);
  assert.ok(central>=32&&central<=eocd,'Invalid central directory');
  assert.ok(data.subarray(central-16,central).equals(Buffer.from('RPK Sig Block 42')),'Missing RPK signing block');
  const size=reader(data.subarray(central-24,central-16)).u64();
  assert.ok(size>=24&&size<=central-8,'Invalid signing block size');
  const block=reader(data.subarray(central-size-8,central-24));
  assert.equal(block.u64(),size,'Mismatched signing block sizes');
  let certificate=null;
  while(block.remaining()) {
    const entry=reader(block.take(block.u64())),id=entry.u32();
    if(id!==0x01000101)continue;
    assert.equal(certificate,null,'Multiple signer entries');
    const signers=reader(entry.field());assert.equal(entry.remaining(),0);
    const signer=reader(signers.field());assert.equal(signers.remaining(),0,'Multiple signers');
    const signed=reader(signer.field());
    signed.field(); // Content digests are not the certificate identity.
    const certificates=reader(signed.field());
    certificate=new X509Certificate(certificates.field());
    assert.equal(certificates.remaining(),0,'Multiple certificates');
    signed.field();assert.equal(signed.remaining(),0);
    signer.field();signer.field();assert.equal(signer.remaining(),0);
  }
  assert.ok(certificate,'Missing signing certificate');
  return certificate.raw;
}
