import {existsSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const directory=resolve('apps/band/sign');
const key=resolve(directory,'private.pem'),certificate=resolve(directory,'certificate.pem');
if(existsSync(key)||existsSync(certificate)) {
  if(!existsSync(key)||!existsSync(certificate))throw new Error('Incomplete signing identity; restore its missing file.');
  console.log('Existing local signing identity preserved.');
} else {
  mkdirSync(directory,{recursive:true});
  const openssl=process.platform==='win32'?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl';
  const result=spawnSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',certificate,'-days','3650','-subj','/CN=AuthBand Local/O=AuthBand'],{stdio:['ignore','pipe','pipe']});
  if(result.error||result.status!==0)throw new Error('Local signing identity generation failed.');
  console.log('Created local RPK signing identity in ignored apps/band/sign. Keep these files for future updates; never commit them.');
}
