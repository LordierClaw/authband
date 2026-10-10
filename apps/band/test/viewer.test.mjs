import test from 'node:test';
import assert from 'node:assert/strict';
import {sample} from './snapshot.test.mjs';
const api=await import('../src/logic/viewer.js').catch(()=>({}));
test('viewer shows offline code and masks immediately when clock becomes untrusted',()=>{
  assert.equal(typeof api.rows,'function');
  const snapshot=sample();
  assert.equal(api.rows(snapshot,snapshot.groups[0].id,{trusted:true,unixSeconds:59})[0].code,'287 082');
  assert.equal(api.rows(snapshot,snapshot.groups[0].id,{trusted:false,unixSeconds:59})[0].code,'--- ---');
  assert.notEqual(api.rows(snapshot,snapshot.groups[0].id,{trusted:true,unixSeconds:60})[0].code,'287 082');
});
test('8 digit codes keep fixed groups; account labels remain separate',()=>{
  assert.equal(typeof api.rows,'function');const x=sample();x.accounts[0].parameters.digits=8;
  const row=api.rows(x,x.groups[0].id,{trusted:true,unixSeconds:59})[0];
  assert.equal(row.code,'9428 7082');assert.equal(row.label,'fixture');assert.equal(row.issuer,'RFC');assert.equal(row.small,true);
});
