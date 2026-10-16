// Builds tiny probe RPKs for physical comparison on the band: a static native
// swiper, the same swiper with a <list> per page, and a page with no back
// handling plus a pushed second page. Each has its own package name, so it can
// be installed beside AuthBand. Usage: node scripts/build-probes.mjs <label>
import {mkdir,rm,writeFile,copyFile,readdir,readFile,symlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {unzipSync} from 'fflate';

const label=process.argv[2]||'b11';
const band=new URL('../apps/band/',import.meta.url);
const work=new URL('../apps/.probes/',import.meta.url);
const out=new URL('../artifacts/probes/',import.meta.url);
const style=`.page {width:212px;height:520px;background-color:#000000;}
.group {width:212px;height:520px;background-color:#000000;}
.title {position:absolute;left:30px;top:24px;width:152px;height:40px;line-height:36px;font-size:25px;color:#ffffff;text-align:center;}
.rows {position:absolute;left:0px;top:72px;width:212px;height:400px;flex-direction:column;}
.row {width:212px;height:66px;padding-left:18px;padding-top:6px;flex-direction:column;}
.row-title {width:178px;height:31px;line-height:30px;font-size:24px;color:#ffffff;}
.row-sub {width:178px;height:24px;line-height:22px;font-size:18px;color:#8e9196;}
.label {position:absolute;left:26px;top:494px;width:160px;height:16px;line-height:14px;font-size:12px;color:#55585d;text-align:center;}
.message {position:absolute;left:18px;top:150px;width:176px;height:200px;font-size:22px;line-height:30px;color:#ffffff;text-align:center;}
.tap {position:absolute;left:31px;top:360px;width:150px;height:60px;border-radius:30px;background-color:#1d3b30;justify-content:center;align-items:center;}
.tap-text {font-size:20px;color:#82e8be;}
.tabs {width:212px;height:520px;indicator-color:#3a3c40;indicator-selected-color:#82e8be;indicator-size:7px;indicator-bottom:34px;}
.snap {width:212px;height:520px;flex-direction:row;scroll-snap-type:x mandatory;}
.snap-page {width:212px;height:520px;flex-shrink:0;scroll-snap-align:start;scroll-snap-stop:always;}`;
const rows=(page,tag)=>Array.from({length:6},(_,i)=>tag==='list'
  ?`<list-item class="row" type="row"><text class="row-title">Account ${page*6+i+1}</text><text class="row-sub">label-${page*6+i+1}</text></list-item>`
  :`<div class="row"><text class="row-title">Account ${page*6+i+1}</text><text class="row-sub">label-${page*6+i+1}</text></div>`).join('\n          ');
const pages=tag=>Array.from({length:5},(_,p)=>`      <div class="group">
        <text class="title">Nhóm ${p+1}</text>
        <${tag==='list'?'list':'div'} class="rows">
          ${rows(p,tag)}
        </${tag==='list'?'list':'div'}>
      </div>`).join('\n');
const swiperPage=(name,tag)=>`<template>
  <div class="page">
    <swiper class="tabs" loop="false" indicator="true">
${pages(tag)}
    </swiper>
    <text class="label">${name} ${label}</text>
  </div>
</template>
<script>
export default {}
</script>
<style>
${style}
</style>
`;
// Native horizontal paging without a swiper: a scroll container with snapping.
const snapPage=`<template>
  <div class="page">
    <scroll class="snap" scroll-x="true" bounces="true">
${pages('div').replace(/class="group"/g,'class="group snap-page"')}
    </scroll>
    <text class="label">probe-scroll-snap ${label}</text>
  </div>
</template>
<script>
export default {}
</script>
<style>
${style}
</style>
`;
const probes={
  swiper:{title:'Probe Swiper',pages:{index:swiperPage('probe-swiper','div')}},
  'swiper-list':{title:'Probe List',pages:{index:swiperPage('probe-swiper-list','list')}},
  'scroll-snap':{title:'Probe Snap',pages:{index:snapPage}},
  exit:{title:'Probe Exit',features:[{name:'system.router'}],pages:{
    index:`<template>
  <div class="page">
    <text class="message">Vuốt phải từ mép trái để thoát. Không có xử lý back riêng.</text>
    <div class="tap" @click="next"><text class="tap-text">Trang 2</text></div>
    <text class="label">probe-exit ${label}</text>
  </div>
</template>
<script>
import router from '@system.router'
export default {next(){router.push({uri:'pages/two'})}}
</script>
<style>
${style}
</style>
`,
    two:`<template>
  <div class="page">
    <text class="message">Trang 2. Vuốt phải để quay lại trang 1.</text>
    <text class="label">probe-exit ${label}</text>
  </div>
</template>
<script>
export default {}
</script>
<style>
${style}
</style>
`}}
};

await rm(work,{recursive:true,force:true});await mkdir(out,{recursive:true});
const results=[];
for(const [name,probe] of Object.entries(probes)) {
  const dir=new URL(name+'/',work),src=new URL('src/',dir);
  await mkdir(new URL('common/',src),{recursive:true});await mkdir(new URL('sign/',dir),{recursive:true});
  await copyFile(new URL('src/common/icon.png',band),new URL('common/icon.png',src));
  for(const pem of ['private.pem','certificate.pem'])await copyFile(new URL('sign/'+pem,band),new URL('sign/'+pem,dir));
  await copyFile(new URL('package.json',band),new URL('package.json',dir));
  await symlink(fileURLToPath(new URL('node_modules',band)),fileURLToPath(new URL('node_modules',dir)),'junction');
  await writeFile(new URL('app.ux',src),'<script>\nexport default {}\n</script>\n');
  await writeFile(new URL('config-watch.json',src),'{}');
  const router={entry:'pages/index',pages:{}};
  for(const [page,ux] of Object.entries(probe.pages)) {
    router.pages['pages/'+page]={component:page};
    await mkdir(new URL('pages/'+page+'/',src),{recursive:true});
    await writeFile(new URL('pages/'+page+'/'+page+'.ux',src),ux);
  }
  await writeFile(new URL('manifest.json',src),JSON.stringify({package:'dev.lordierclaw.authband.probe.'+name.replace(/-/g,''),name:probe.title,versionName:'0.1.0',versionCode:1,minPlatformVersion:1000,icon:'/common/icon.png',deviceTypeList:['watch'],features:probe.features||[],config:{logLevel:'off',designWidth:212},display:{backgroundColor:'#000000'},router},null,2));
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('node_modules/aiot-toolkit/lib/bin.js',band)),'release','--drop-console','true'],{cwd:fileURLToPath(dir),stdio:'ignore'});
  if(result.status!==0)throw new Error('Probe build failed: '+name);
  const dist=new URL('dist/',dir),file=(await readdir(dist)).find(n=>n.endsWith('.rpk'));
  const bytes=await readFile(new URL(file,dist)),entries=Object.keys(unzipSync(bytes));
  for(const page of Object.keys(probe.pages))if(!entries.includes('pages/'+page+'/'+page+'.js'))throw new Error('Missing page '+page+' in '+name);
  const target='AuthBand-probe-'+name+'.rpk';await writeFile(new URL(target,out),bytes);
  results.push({file:target,package:'dev.lordierclaw.authband.probe.'+name.replace(/-/g,''),size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await rm(work,{recursive:true,force:true});
await writeFile(new URL('probes.json',out),JSON.stringify({label,probes:results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
