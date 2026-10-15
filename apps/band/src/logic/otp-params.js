export function parameters(p) {
  if (!p || ['sha1','sha256','sha512'].indexOf(p.algorithm) < 0 || [6,8].indexOf(p.digits) < 0 || !Number.isInteger(p.period) || p.period < 15 || p.period > 120) throw new Error('Invalid OTP parameters');
  return p;
}
