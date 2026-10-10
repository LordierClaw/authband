import {unzipSync} from 'fflate';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
export function verifyRPK(bytes, profile) {
  const files=unzipSync(bytes), decode=(name)=>Buffer.from(files[name]||[]).toString('utf8');
  for(const name of ['META-INF/CERT','manifest.json','app.js','pages/index/index.js','common/icon.png']) assert.ok(files[name],`Missing ${name}`);
  const manifest=JSON.parse(decode('manifest.json'));
  assert.equal(manifest.package,'dev.lordierclaw.authband.band');
  assert.equal(manifest.config.designWidth,212);
  assert.equal(manifest.minPlatformVersion,1000);
  assert.equal(Object.keys(manifest.router.pages).length,1);
  const png=Buffer.from(files['common/icon.png']);
  assert.equal(png.readUInt32BE(16),256); assert.equal(png.readUInt32BE(20),256); assert.equal(png[25],6);
  const code=decode('pages/index/index.js');
  assert.match(code,/system.interconnect/);
  assert.doesNotMatch(code,/system.router|BigInt\s*\(|node:|require\(["']\.\./);
  if(profile==='release') assert.doesNotMatch(code,/GEZDGNBVGY3TQOJQ|12345678901234567890/);
  return {profile,package:manifest.package,version:manifest.versionName,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
