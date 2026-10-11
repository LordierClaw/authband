import SHA1 from 'jssha/sha1';
import JS256 from 'jssha/sha256';
import { HKDF } from '@stablelib/hkdf';
import { HMAC } from '@stablelib/hmac';
import { SHA256, hash } from '@stablelib/sha256';
import { SHA512 } from '@stablelib/sha512';
import { AES } from '@stablelib/aes';
import { GCM } from '@stablelib/gcm';

export function hmac(algorithm, key, message) {
  if (algorithm === 'sha512') {
    const mac = new HMAC(SHA512,key);
    try {return mac.update(message).digest();} finally {mac.clean();}
  }
  const name = {sha1:'SHA-1', sha256:'SHA-256'}[algorithm];
  if (!name) throw new Error('Unsupported algorithm');
  const Hash = algorithm === 'sha1' ? SHA1 : JS256;
  const mac = new Hash(name, 'UINT8ARRAY', {hmacKey:{value:key,format:'UINT8ARRAY'}});
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
