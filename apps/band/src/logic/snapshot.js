import {utf8,text,unbase64,decimal} from './encoding.js';
import {parameters} from './totp.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function name(value,max,empty) { if(typeof value!=='string' || (!empty && !value.trim()) || utf8(value).length>max) throw new Error('Invalid name'); }
function ids(items) {
  const seen={};
  for(let i=0;i<items.length;i++) {const x=items[i];if(!x || !uuid.test(x.id) || seen[x.id.toLowerCase()] || !Number.isSafeInteger(x.order) || x.order<0) throw new Error('Invalid identity');seen[x.id.toLowerCase()]=true;}
  return seen;
}
export function validateSnapshot(x) {
  if(!x || x.schema!==1 || !uuid.test(x.vaultID) || !Array.isArray(x.groups) || !Array.isArray(x.accounts) || x.groups.length<1 || x.groups.length>8 || x.accounts.length>50) throw new Error('Invalid snapshot');
  decimal(x.revision); const groups=ids(x.groups);ids(x.accounts);let defaults=0;const count={};
  for(let i=0;i<x.groups.length;i++) {const g=x.groups[i];name(g.name,64,false);if(typeof g.isDefault!=='boolean')throw new Error('Invalid group');if(g.isDefault)defaults++;}
  if(defaults!==1)throw new Error('Invalid default group');
  for(let i=0;i<x.accounts.length;i++) {
    const a=x.accounts[i];name(a.issuer,256,true);name(a.label,256,false);parameters(a.parameters);
    if(typeof a.groupID!=='string'||!groups[a.groupID.toLowerCase()]||a.onBand!==true||typeof a.secret!=='string'||a.secret.length>172)throw new Error('Invalid account');
    const key=unbase64(a.secret);if(key.length<1||key.length>128)throw new Error('Invalid secret');key.fill(0);
    const id=a.groupID.toLowerCase();count[id]=(count[id]||0)+1;if(count[id]>20)throw new Error('Group capacity');
  }
  return x;
}
export function encodeSnapshot(value) {
  validateSnapshot(value);const bytes=utf8(JSON.stringify(value));if(bytes.length>65536)throw new Error('Snapshot too large');return bytes;
}
export function decodeSnapshot(bytes) {
  if(bytes.length>65536)throw new Error('Snapshot too large');return validateSnapshot(JSON.parse(text(bytes)));
}
