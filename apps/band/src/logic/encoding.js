export {encode as utf8, decode as text} from '@stablelib/utf8';
export {encode as base64, decode as unbase64} from '@stablelib/base64';
export function hex(bytes) { let out=''; for(let i=0;i<bytes.length;i++) out+=('0'+bytes[i].toString(16)).slice(-2); return out; }
export function decimal(value) {
  if(typeof value!=='string' || !/^(0|[1-9][0-9]{0,15})$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid decimal');
  return Number(value);
}
