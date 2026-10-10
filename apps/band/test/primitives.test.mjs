import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../src/logic/primitives.js').catch(() => ({}));
const bytes = (hex) => new Uint8Array(Buffer.from(hex, 'hex'));
test('HMAC SHA256 matches RFC4231 case 1', () => {
  assert.equal(typeof api.hmac, 'function', 'HMAC primitive is available');
  assert.equal(Buffer.from(api.hmac('sha256', new Uint8Array(20).fill(11), new TextEncoder().encode('Hi There'))).toString('hex'), 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
});
test('AES256 GCM matches NIST empty plaintext vector and rejects tampering', () => {
  assert.equal(typeof api.sealGCM, 'function', 'Authenticated encryption is available');
  const key = new Uint8Array(32), nonce = new Uint8Array(12), aad = new Uint8Array(0);
  const ciphertext = api.sealGCM(key, nonce, aad, aad);
  assert.equal(Buffer.from(ciphertext).toString('hex'), '530f8afbc74536b9a963b4f1c4cb738b');
  assert.deepEqual(api.openGCM(key, nonce, ciphertext, aad), aad);
  ciphertext[0] ^= 1;
  assert.throws(() => api.openGCM(key, nonce, ciphertext, aad));
});
test('HKDF matches RFC5869 case 1', () => {
  assert.equal(typeof api.hkdf, 'function', 'HKDF is available');
  assert.equal(Buffer.from(api.hkdf(new Uint8Array(22).fill(11), bytes('000102030405060708090a0b0c'), bytes('f0f1f2f3f4f5f6f7f8f9'), 42)).toString('hex'), '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865');
});
