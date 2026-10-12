import SHA1 from 'jssha/sha1';
import { HKDF } from '@stablelib/hkdf';
import { HMAC } from '@stablelib/hmac';
import { SHA256, hash } from '@stablelib/sha256';
import { SHA512 } from '@stablelib/sha512';
import { AES } from '@stablelib/aes';
import { GCM } from '@stablelib/gcm';
import {nativeHashes} from '../platform/native-hash.js';

let native=nativeHashes(null);
export function configureCrypto(api){native=nativeHashes(api);}

export function hmac(algorithm, key, message) {
  const NativeHash=native.get(algorithm);
  if(NativeHash) {
    let mac;
    try {mac=new HMAC(NativeHash,key);return mac.update(message).digest();}
    catch {native.disable(algorithm);} finally {if(mac)mac.clean();}
  }
  if (algorithm === 'sha512') {
    const mac = new HMAC(SHA512,key);
    try {return mac.update(message).digest();} finally {mac.clean();}
  }
  if (algorithm === 'sha256') {
    const mac = new HMAC(SHA256,key);
    try {return mac.update(message).digest();} finally {mac.clean();}
  }
  if (algorithm !== 'sha1') throw new Error('Unsupported algorithm');
  const mac = new SHA1('SHA-1', 'UINT8ARRAY', {hmacKey:{value:key,format:'UINT8ARRAY'}});
  mac.update(message);
  return mac.getHash('UINT8ARRAY');
}
export function hkdf(key, salt, info, length) {
  const kdf = new HKDF(SHA256, key, salt, info);
  try { return kdf.expand(length); } finally { kdf.clean(); }
}
export function digest(bytes) {
  const NativeHash=native.get('sha256');
  if(NativeHash) {
    const value=new NativeHash();
    try {return value.update(bytes).digest();}catch {native.disable('sha256');}finally{value.clean();}
  }
  return hash(bytes);
}
export function sealGCM(key, nonce, plaintext, aad) {
  if (key.length !== 32 || nonce.length !== 12) throw new Error('Invalid key or nonce');
  const aes = new AES(key), cipher = new GCM(aes);
  try { return cipher.seal(nonce, plaintext, aad); } finally { cipher.clean(); aes.clean(); }
}
export function openGCM(key, nonce, ciphertext, aad) {
  if (key.length !== 32 || nonce.length !== 12) throw new Error('Invalid key or nonce');
  const aes = new AES(key), cipher = new GCM(aes);
  try {
    const result = cipher.open(nonce, ciphertext, aad);
    if (!result) throw new Error('Authentication failed');
    return result;
  } finally { cipher.clean(); aes.clean(); }
}
