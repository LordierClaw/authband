import SHA1 from 'jssha/sha1';
import { HMAC } from '@stablelib/hmac';
import { SHA512 } from '@stablelib/sha512';
import {nativeHash,disableNative,hmac256} from './hash.js';
export {configureCrypto,hmac256,hkdf,digest,sealGCM,openGCM} from './hash.js';

export function hmac(algorithm, key, message) {
  if (algorithm === 'sha256') return hmac256(key, message);
  const NativeHash=nativeHash(algorithm);
  if(NativeHash) {
    let mac;
    try {mac=new HMAC(NativeHash,key);return mac.update(message).digest();}
    catch {disableNative(algorithm);} finally {if(mac)mac.clean();}
  }
  if (algorithm === 'sha512') {
    const mac = new HMAC(SHA512,key);
    try {return mac.update(message).digest();} finally {mac.clean();}
  }
  if (algorithm !== 'sha1') throw new Error('Unsupported algorithm');
  const mac = new SHA1('SHA-1', 'UINT8ARRAY', {hmacKey:{value:key,format:'UINT8ARRAY'}});
  mac.update(message);
  return mac.getHash('UINT8ARRAY');
}
