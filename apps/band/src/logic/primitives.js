import jsSHA from 'jssha';
import { HKDF } from '@stablelib/hkdf';
import { SHA256, hash } from '@stablelib/sha256';
import { AES } from '@stablelib/aes';
import { GCM } from '@stablelib/gcm';

export function hmac(algorithm, key, message) {
  const name = {sha1:'SHA-1', sha256:'SHA-256', sha512:'SHA-512'}[algorithm];
  if (!name) throw new Error('Unsupported algorithm');
  const mac = new jsSHA(name, 'UINT8ARRAY', {hmacKey:{value:key,format:'UINT8ARRAY'}});
  mac.update(message);
  return mac.getHash('UINT8ARRAY');
}
export function hkdf(key, salt, info, length) {
  const kdf = new HKDF(SHA256, key, salt, info);
  try { return kdf.expand(length); } finally { kdf.clean(); }
}
export function digest(bytes) { return hash(bytes); }
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
