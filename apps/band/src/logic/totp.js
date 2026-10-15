import {hmac} from './primitives.js';
import {parameters} from './otp-params.js';
export {parameters};
export function decodeBase32(text) {
  if (typeof text !== 'string' || text.length > 512) throw new Error('Invalid Base32');
  const input = text.replace(/[ \t\r\n]/g,'').toUpperCase();
  if (!/^[A-Z2-7]+={0,6}$/.test(input)) throw new Error('Invalid Base32');
  const raw = input.replace(/=+$/,'');
  const rem = raw.length % 8;
  if ([0,2,4,5,7].indexOf(rem) < 0 || (raw !== input && input.length % 8 !== 0)) throw new Error('Invalid padding');
  const result = [], alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let value = 0, bits = 0;
  for (let i = 0; i < raw.length; i++) {
    value = (value << 5) | alphabet.indexOf(raw[i]); bits += 5;
    if (bits >= 8) { bits -= 8; result.push((value >>> bits) & 255); value &= (1 << bits)-1; }
  }
  if (value !== 0 || result.length < 1 || result.length > 128) throw new Error('Invalid secret');
  return new Uint8Array(result);
}
export function totp(secret, p, unixSeconds) {
  parameters(p);
  if (!(secret instanceof Uint8Array) || secret.length < 1 || secret.length > 128 || !Number.isSafeInteger(unixSeconds) || unixSeconds < 0 || unixSeconds > Number.MAX_SAFE_INTEGER - p.period) throw new Error('Invalid OTP input');
  let counter = Math.floor(unixSeconds / p.period);
  const validFrom = counter * p.period, message = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) { message[i] = counter % 256; counter = Math.floor(counter / 256); }
  const mac = hmac(p.algorithm, secret, message), offset = mac[mac.length-1] & 15;
  const binary = ((mac[offset] & 127) * 16777216) + (mac[offset+1] << 16) + (mac[offset+2] << 8) + mac[offset+3];
  const value = ('00000000' + (binary % Math.pow(10, p.digits))).slice(-p.digits);
  mac.fill(0);
  return {value, validFrom, validUntil:validFrom+p.period};
}
