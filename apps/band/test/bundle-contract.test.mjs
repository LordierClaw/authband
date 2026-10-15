import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const bundler = await import('../scripts/embed-runtime.mjs').catch(() => ({}));
test('real bundled runtime generates SHA512 HMAC without browser, Node or BigInt APIs', async () => {
  assert.equal(typeof bundler.bundleRuntime, 'function', 'Band runtime bundler is available');
  const code = await bundler.bundleRuntime('code');
  assert.doesNotMatch(code, /\b(require\s*\(|BigInt\s*\(|\d+n\b|system\.crypto|node:)/);
  const context = vm.createContext({BigInt: undefined, Buffer: undefined, crypto: undefined, TextEncoder: undefined, TextDecoder: undefined});
  vm.runInContext(code, context);
  const result = vm.runInContext('AuthBand.hmac("sha512", new Uint8Array(20).fill(11), new Uint8Array([72,105,32,84,104,101,114,101]))', context);
  assert.equal(Buffer.from(result).toString('hex'), '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cde' + 'daa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854');
});
