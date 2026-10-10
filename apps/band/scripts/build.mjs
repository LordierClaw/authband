import {mkdir,readFile,writeFile,readdir,rm,copyFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {PNG} from 'pngjs';
import {bundleRuntime} from './embed-runtime.mjs';
import {verifyRPK} from './verify-rpk.mjs';
import {capabilityFixture} from './capability-fixture.mjs';
import {bandNotices} from '../../../scripts/notices.mjs';
await bandNotices();
const root = new URL('../',import.meta.url);
const args = process.argv.slice(2), profile = args[args.indexOf('--profile')+1] || 'capability';
if(!['capability','release'].includes(profile)) throw new Error('Unknown profile');
if(profile==='release') {
  for(const path of ['sign/private.pem','sign/certificate.pem'])await access(new URL(path,root));
}
const png = new PNG({width:256,height:256});
for(let y=0;y<256;y++) for(let x=0;x<256;x++) {
  const i=(y*256+x)*4;
  const shackle = y>=54 && y<=128 && Math.abs(Math.hypot(x-128,y-98)-39)<10 && y<104;
  const lock = x>=77 && x<=179 && y>=102 && y<=198;
  const keyhole = Math.abs(x-128)<7 && y>=136 && y<=169;
  const on = (shackle || lock) && !keyhole;
  png.data.set(on?[130,232,190,255]:[0,0,0,255],i);
}
await mkdir(new URL('src/common/',root),{recursive:true});
await writeFile(new URL('src/common/icon.png',root),PNG.sync.write(png));
let template=await readFile(new URL('templates/index.ux',root),'utf8');
const runtime = 'const AUTHBAND_CAPABILITY = '+(profile==='capability')+';\n'+await bundleRuntime();
template=template.replace('/* AUTHBAND_RUNTIME */', () => runtime);
template=template.replace('/* AUTHBAND_FIXTURE */',()=> 'const synthetic = '+JSON.stringify(profile==='capability'?capabilityFixture():null)+';');
await mkdir(new URL('src/pages/index/',root),{recursive:true});
await writeFile(new URL('src/pages/index/index.ux',root),template);
const dist = new URL('dist/',root);
await mkdir(dist,{recursive:true});
for(const name of await readdir(dist)) if(name.endsWith('.rpk')) await rm(new URL(name,dist));
const result=spawnSync(process.execPath,[fileURLToPath(new URL('node_modules/aiot-toolkit/lib/bin.js',root)),profile==='release'?'release':'build'],{cwd:fileURLToPath(root),stdio:'inherit'});
if(result.error) throw result.error;
if(result.status!==0) process.exit(result.status||1);
const names=(await readdir(dist)).filter(n=>n.endsWith('.rpk'));
if(names.length!==1) throw new Error('Expected exactly one RPK');
const bytes=await readFile(new URL(names[0],dist));
const report=verifyRPK(bytes,profile);
await mkdir(new URL('../../../artifacts/',import.meta.url),{recursive:true});
const output=new URL('../../../artifacts/AuthBand-'+profile+'.rpk',import.meta.url);
await copyFile(new URL(names[0],dist),output);
await writeFile(new URL(output.href+'.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
