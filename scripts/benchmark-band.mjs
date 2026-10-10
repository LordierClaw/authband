import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Viewer} from '../apps/band/src/logic/viewer.js';
import {capabilityFixture} from '../apps/band/scripts/capability-fixture.mjs';

const baseline=process.argv[2]||'b7c8457';
const source=execFileSync('git',['show',baseline+':apps/band/src/logic/viewer.js'],{encoding:'utf8'});
const bundled=await build({stdin:{contents:source,resolveDir:fileURLToPath(new URL('../apps/band/src/logic/',import.meta.url))},bundle:true,write:false,platform:'node',format:'esm'});
const {Viewer:Baseline}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));

async function measure(Type,action) {
  let now=30000,calculations=0,publishes=0,maximumRows=0;
  const snapshot=capabilityFixture(),arrays=new Set(),timers=new Set();
  for(const account of snapshot.accounts) {
    const secret=account.secret;
    Object.defineProperty(account,'secret',{get(){calculations++;return secret;}});
  }
  const viewer=new Type({load:async()=>({snapshot,time:{offset:0,wallMs:30000,uncertainty:0}}),clock:()=>now,
    scheduler:{set:fn=>{timers.add(fn);return fn;},clear:fn=>timers.delete(fn)},publish:state=>{
      publishes++;arrays.add(state.groups);
      maximumRows=Math.max(maximumRows,state.groups.reduce((n,g)=>n+g.rows.length,0));
    }});
  let begin=performance.now();await viewer.show();
  if(viewer.prepareNeighbors)viewer.prepareNeighbors();
  if(action==='idle30s')for(let second=31;second<60;second++){now=second*1000;viewer.render(false);}
  if(action==='sameRowScroll100') {
    calculations=0;publishes=0;maximumRows=0;arrays.clear();
    begin=performance.now();
    for(let i=0;i<100;i++)viewer.scroll(0);
  }
  if(action==='scrollDownAndBack') {
    calculations=0;publishes=0;maximumRows=0;arrays.clear();
    begin=performance.now();
    for(const index of [1,2,3,2,1,0])viewer.scroll(index);
  }
  if(action==='visitEveryGroup')for(const index of [1,2,3,4,5,6,7,6,5,4,3,2,1,0]){viewer.select(index);if(viewer.prepareNeighbors)viewer.prepareNeighbors();}
  if(action==='openOneCode30s') {
    viewer.setScreen('detail',snapshot.accounts[0].id);
    for(let second=31;second<60;second++){now=second*1000;viewer.render(false);}
  }
  const hostMilliseconds=performance.now()-begin,activeTickers=timers.size;viewer.destroy();
  return {otpCalculations:calculations,publishes,groupArrays:arrays.size,maximumPublishedRows:maximumRows,activeTickers,hostMilliseconds};
}

const report={baseline,host:process.version,engineFlags:process.execArgv,
  limitation:'Operation counts and host CPU only. Not native renderer, band FPS, memory, exit latency or hardware acceptance.',cases:{}};
for(const action of ['idle30s','sameRowScroll100','scrollDownAndBack','visitEveryGroup','openOneCode30s']) {
  report.cases[action]={};
  for(const [name,Type] of [['before',Baseline],['after',Viewer]]) {
    const samples=[];let last;
    for(let i=0;i<11;i++){last=await measure(Type,action);if(i)samples.push(last.hostMilliseconds);}
    samples.sort((a,b)=>a-b);delete last.hostMilliseconds;
    report.cases[action][name]={...last,medianHostMilliseconds:Number(samples[Math.floor(samples.length/2)].toFixed(3))};
  }
}
const json=JSON.stringify(report,null,2)+'\n';
if(process.argv[3]){const output=resolve(process.argv[3]);mkdirSync(dirname(output),{recursive:true});writeFileSync(output,json);}
console.log(json);
