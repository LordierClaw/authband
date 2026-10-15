import {unzipSync} from 'fflate';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyEntries} from '../../../scripts/release-policy.mjs';
import {rpkCertificate} from './rpk-certificate.mjs';
export function verifyRPK(bytes, profile) {
  const files=unzipSync(bytes), decode=(name)=>Buffer.from(files[name]||[]).toString('utf8');
  verifyEntries(files,profile);
  for(const name of ['META-INF/CERT','manifest.json','app.js','pages/index/index.js','pages/code/code.js','common/icon.png']) assert.ok(files[name],`Missing ${name}`);
  const manifest=JSON.parse(decode('manifest.json'));
  assert.equal(manifest.package,'dev.lordierclaw.authband.band');
  assert.equal(manifest.versionName,JSON.parse(readFileSync(new URL('../../../package.json',import.meta.url),'utf8')).version);
  assert.equal(manifest.versionCode,JSON.parse(readFileSync(new URL('../src/manifest.json',import.meta.url),'utf8')).versionCode);
  const build=JSON.parse(decode('common/build.json'));
  assert.equal(build.profile,profile);assert.equal(build.realSecretsEnabled,false);
  assert.match(build.sourceCommit,/^[0-9a-f]{40}$/);
  assert.equal(manifest.config.designWidth,212);
  assert.equal(manifest.minPlatformVersion,1000);
  assert.deepEqual(Object.keys(manifest.router.pages),['pages/index','pages/code']);
  const png=Buffer.from(files['common/icon.png']);
  assert.equal(png.readUInt32BE(16),256); assert.equal(png.readUInt32BE(20),256); assert.equal(png[25],6);
  const code=decode('pages/index/index.js');
  assert.match(code,/system.interconnect/);
  const otp=decode('pages/code/code.js');
  // Interconnect stays in the list page; TOTP-only hashing stays out of the startup page.
  assert.doesNotMatch(otp,/system.interconnect/);assert.doesNotMatch(code,/jsSHA|SHA-1/);
  for(const page of [code,otp])assert.doesNotMatch(page,/BigInt\s*\(|node:|require\(["']\.\./);
  if(profile==='release')for(const page of [code,otp])assert.doesNotMatch(page,/GEZDGNBVGY3TQOJQ|12345678901234567890/);
  const certificate=rpkCertificate(bytes);
  assert.ok(certificate.equals(rpkCertificate(files['META-INF/CERT'])),'Different package and manifest signers');
  return {...build,package:manifest.package,version:manifest.versionName,build:manifest.versionCode,certificateSHA256:createHash('sha256').update(certificate).digest('hex'),size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
