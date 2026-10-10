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
