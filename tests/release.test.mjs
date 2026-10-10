import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../scripts/release-policy.mjs').catch(()=>({}));
test('release policy rejects public fixtures, private signing material and signed IPA payloads',()=>{
  assert.equal(typeof api.verifyEntries,'function');
  assert.throws(()=>api.verifyEntries({'private.pem':new TextEncoder().encode('-----BEGIN PRIVATE KEY-----')},'release'));
  assert.throws(()=>api.verifyEntries({'pages/index/index.js':new TextEncoder().encode('MTIzNDU2Nzg5MDEyMzQ1Njc4OTA=')},'release'));
  assert.throws(()=>api.verifyEntries({'Payload/AuthBand.app/embedded.mobileprovision':new Uint8Array()},'release'));
  assert.throws(()=>api.verifyEntries({'Payload/AuthBand.app/_CodeSignature/CodeResources':new Uint8Array()},'release'));
  assert.doesNotThrow(()=>api.verifyEntries({'pages/index/index.js':new TextEncoder().encode('synthetic = null;')},'release'));
});
test('artifact metadata keeps app and toolchain versions separate',()=>{
  assert.equal(typeof api.iosMetadata,'function');
  const report=api.iosMetadata('release',{CFBundleShortVersionString:'0.1.0',CFBundleVersion:'1'},{version:'Xcode 27.0\nBuild version 27A266a',sdk:'27.0'},Buffer.from('ipa'),{version:'0.1.0',build:1});
  assert.equal(report.version,'0.1.0');assert.match(report.xcode,/Xcode 27/);assert.equal(report.size,3);assert.equal(report.sha256.length,64);
});
test('IPA metadata rejects the XcodeGen default version instead of the configured product version',()=>{
  const info={CFBundleShortVersionString:'1.0',CFBundleVersion:'1'};
  assert.throws(()=>api.iosMetadata('release',info,{version:'Xcode 27.0',sdk:'27.0'},Buffer.from('ipa'),{version:'0.1.0',build:1}),/version/);
  assert.throws(()=>api.iosMetadata('release',{...info,CFBundleShortVersionString:'0.1.0',CFBundleVersion:'2'},{version:'Xcode 27.0',sdk:'27.0'},Buffer.from('ipa'),{version:'0.1.0',build:1}),/build/);
});
