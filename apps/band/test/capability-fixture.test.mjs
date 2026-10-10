import test from 'node:test';
import assert from 'node:assert/strict';
import {capabilityFixture} from '../scripts/capability-fixture.mjs';

test('physical capability fixture covers every supported algorithm and digit size with identifiable public accounts',()=>{
  const fixture=capabilityFixture();
  assert.equal(fixture.groups.length,8);
  assert.equal(fixture.accounts.length,50);
  assert.deepEqual(capabilityFixture(),fixture);
  const combinations=new Set(fixture.accounts.map(account=>account.parameters.algorithm+':'+account.parameters.digits));
  assert.deepEqual([...combinations].sort(),['sha1:6','sha1:8','sha256:6','sha256:8','sha512:6','sha512:8']);
  for(const account of fixture.accounts) {
    assert.equal(account.secret,'MTIzNDU2Nzg5MDEyMzQ1Njc4OTA=');
    assert.equal(account.parameters.period,30);
    assert.ok(account.issuer.includes(account.parameters.algorithm.toUpperCase()));
  }
});
