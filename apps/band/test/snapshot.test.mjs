import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/logic/snapshot.js').catch(()=>({}));
export const sample = () => ({schema:1,vaultID:'00000000-0000-4000-8000-000000000001',revision:'1',groups:[{id:'00000000-0000-4000-8000-000000000002',name:'Cá nhân',order:0,isDefault:true}],accounts:[{id:'00000000-0000-4000-8000-000000000003',groupID:'00000000-0000-4000-8000-000000000002',issuer:'RFC',label:'fixture',secret:'MTIzNDU2Nzg5MDEyMzQ1Njc4OTA=',parameters:{algorithm:'sha1',digits:6,period:30},order:0,onBand:true}]});
test('snapshot roundtrip preserves Unicode and rejects orphan/duplicate accounts',()=>{
  assert.equal(typeof api.decodeSnapshot,'function');
  const value=sample(); assert.deepEqual(api.decodeSnapshot(api.encodeSnapshot(value)),value);
  value.accounts.push(value.accounts[0]); assert.throws(()=>api.encodeSnapshot(value));
  value.accounts.pop(); value.accounts[0].groupID='00000000-0000-4000-8000-000000000004'; assert.throws(()=>api.encodeSnapshot(value));
});
test('snapshot bounds and decimal revisions are strict',()=>{
  assert.equal(typeof api.encodeSnapshot,'function');
  for(const revision of ['01','-1','9007199254740992',1]) {const x=sample();x.revision=revision;assert.throws(()=>api.encodeSnapshot(x));}
  const x=sample();x.groups[0].name='ấ'.repeat(22);assert.throws(()=>api.encodeSnapshot(x));
  x.groups[0].name='ok';x.accounts[0].secret='';assert.throws(()=>api.encodeSnapshot(x));
});
