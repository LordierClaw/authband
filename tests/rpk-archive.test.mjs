import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash,X509Certificate} from 'node:crypto';
import {unzipSync,zipSync,strToU8} from 'fflate';
import {verifyRPK} from '../apps/band/scripts/verify-rpk.mjs';
import {rpkCertificate} from '../apps/band/scripts/rpk-certificate.mjs';
test('RPK certificate fingerprint identifies the DER signer, not the changing content manifest',()=>{
  const paths=['apps/band/sign/debug/certificate.pem','apps/band/sign/certificate.pem','apps/band/node_modules/@aiot-toolkit/aiotpack/lib/compiler/javascript/vela/utils/signature/pem/certificate.pem'];
  const certificate=new X509Certificate(readFileSync(paths.find(existsSync)));
  const expected=createHash('sha256').update(certificate.raw).digest('hex');
  assert.equal(verifyRPK(readFileSync('artifacts/AuthBand-capability.rpk'),'capability').certificateSHA256,expected);
});
test('certificate extraction rejects malformed signing block lengths and unsigned ZIPs',()=>{
  const original=readFileSync('artifacts/AuthBand-capability.rpk');
  const eocd=original.lastIndexOf(Buffer.from('504b0506','hex')),central=original.readUInt32LE(eocd+16);
  for(const offset of [central-1,central-24,central-20,eocd+16]) {
    const bytes=Buffer.from(original);bytes[offset]^=0xff;
    assert.throws(()=>rpkCertificate(bytes));
  }
  assert.throws(()=>rpkCertificate(original.subarray(0,original.length-1)));
  assert.throws(()=>rpkCertificate(zipSync({'test.txt':strToU8('unsigned')})));
});
test('RPK identity, profile and version are verified and report the build source',()=>{
  const bytes=readFileSync('artifacts/AuthBand-capability.rpk'),report=verifyRPK(bytes,'capability');
  const expected=JSON.parse(readFileSync('apps/band/src/manifest.json','utf8'));
  assert.match(report.sourceCommit,/^[0-9a-f]{40}$/);assert.equal(report.build,expected.versionCode);assert.equal(report.realSecretsEnabled,false);
  for(const change of ['identity','version','build','icon','profile']) {
    const files=unzipSync(bytes),manifest=JSON.parse(new TextDecoder().decode(files['manifest.json']));
    if(change==='identity')manifest.package='wrong.package';
    if(change==='version')manifest.versionName='999.0.0';
    if(change==='build')manifest.versionCode=999;
    if(change==='icon')delete files['common/icon.png'];
    if(change==='profile')files['common/build.json']=strToU8(JSON.stringify({profile:'release'}));
    files['manifest.json']=strToU8(JSON.stringify(manifest));
    assert.throws(()=>verifyRPK(zipSync(files),'capability'),change);
  }
  assert.throws(()=>verifyRPK(bytes,'release'));
});
