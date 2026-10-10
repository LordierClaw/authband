import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unzipSync,zipSync,strToU8} from 'fflate';
import {verifyRPK} from '../apps/band/scripts/verify-rpk.mjs';
test('RPK identity, profile and version are verified and report the build source',()=>{
  const bytes=readFileSync('artifacts/AuthBand-capability.rpk'),report=verifyRPK(bytes,'capability');
  assert.match(report.sourceCommit,/^[0-9a-f]{40}$/);assert.equal(report.build,1);assert.equal(report.realSecretsEnabled,false);
  for(const change of ['identity','version','icon','profile']) {
    const files=unzipSync(bytes),manifest=JSON.parse(new TextDecoder().decode(files['manifest.json']));
    if(change==='identity')manifest.package='wrong.package';
    if(change==='version')manifest.versionName='999.0.0';
    if(change==='icon')delete files['common/icon.png'];
    if(change==='profile')files['common/build.json']=strToU8(JSON.stringify({profile:'release'}));
    files['manifest.json']=strToU8(JSON.stringify(manifest));
    assert.throws(()=>verifyRPK(zipSync(files),'capability'),change);
  }
  assert.throws(()=>verifyRPK(bytes,'release'));
});
