import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export function iosMetadata(profile,info,toolchain,bytes) {
  return {profile,package:info.CFBundleIdentifier,version:info.CFBundleShortVersionString,build:info.CFBundleVersion,minimumOS:info.MinimumOSVersion,xcode:toolchain.version,sdk:toolchain.sdk,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export function verifyEntries(entries,profile) {
  assert.ok(['capability','release'].includes(profile));
  for(const [name,bytes] of Object.entries(entries)) {
    assert.ok(!name.split(/[\\/]/).includes('..')&&!/^[\\/]/.test(name),'Unsafe archive path');
    assert.doesNotMatch(name,/(?:^|\/)(?:fixtures|_CodeSignature)(?:\/|$)|embedded\.mobileprovision|\.(?:pem|p12|key)$/i,'Private/build-only archive entry');
    const value=Buffer.from(bytes).toString('latin1');
    assert.doesNotMatch(value,/-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/);
    if(profile==='release')assert.doesNotMatch(value,/GEZDGNBVGY3TQOJQ|12345678901234567890|MTIzNDU2Nzg5MDEyMzQ1Njc4OTA=|public-fixture-/,'Public fixture in release');
  }
}
