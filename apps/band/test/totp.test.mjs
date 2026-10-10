import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../src/logic/totp.js').catch(() => ({}));
const times = [59,1111111109,1111111111,1234567890,2000000000,20000000000];
const vectors = {
  sha1:['94287082','07081804','14050471','89005924','69279037','65353130'],
  sha256:['46119246','68084774','67062674','91819424','90698825','77737706'],
  sha512:['90693936','25091201','99943326','93441116','38618901','47863826']
};
for (const [algorithm, expected] of Object.entries(vectors)) test('RFC6238 '+algorithm, () => {
  assert.equal(typeof api.totp, 'function', 'Offline TOTP is available');
  const length = {sha1:20,sha256:32,sha512:64}[algorithm];
  const secret = new Uint8Array(Buffer.from('1234567890'.repeat(7).slice(0,length)));
  times.forEach((t,i)=>assert.equal(api.totp(secret,{algorithm,digits:8,period:30},t).value,expected[i]));
});
test('six digits, rollover and invalid parameters fail closed', () => {
  assert.equal(typeof api.totp, 'function');
  const secret = new Uint8Array(Buffer.from('12345678901234567890'));
  assert.deepEqual(api.totp(secret,{algorithm:'sha1',digits:6,period:30},59),{value:'287082',validFrom:30,validUntil:60});
  for (const period of [14,121,30.5]) assert.throws(()=>api.totp(secret,{algorithm:'sha1',digits:6,period},59));
  for (const time of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER]) assert.throws(()=>api.totp(secret,{algorithm:'sha1',digits:6,period:30},time));
});
test('Base32 is strict about alphabet, padding, trailing bits and bounds',()=>{
  assert.equal(typeof api.decodeBase32, 'function');
  assert.equal(Buffer.from(api.decodeBase32('m y======')).toString(),'f');
  assert.equal(Buffer.from(api.decodeBase32('MZXW6YTBOI')).toString(),'foobar');
  for(const value of ['', 'MZ', 'M', 'MY=', 'MY======A', '00', 'A'.repeat(208)]) assert.throws(()=>api.decodeBase32(value),value);
});
