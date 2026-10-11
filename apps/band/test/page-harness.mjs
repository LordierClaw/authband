import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {unzipSync} from 'fflate';
import {bundleRuntime} from '../scripts/embed-runtime.mjs';
import {capabilityFixture} from '../scripts/capability-fixture.mjs';

const bundledRuntime=await bundleRuntime();

export async function pageHarness({rpk=null,deferReads=false,deferTicks=false,scrollFeedback=false,wrapGroups=false}={}) {
  let now=30000,exits=0,connections=0;
  const timers=new Map(),disk={},reads=[],pendingReads=[],nextTicks=[],scrolled=[],marquees=[],assignments={};
  const connection={getReadyState:({success})=>success({status:0})};
  const instance=()=>{connections++;return connection;};
  const file={
    readText:({uri,success,fail})=>{
      reads.push(uri);const finish=()=>uri in disk?success({text:disk[uri]}):fail({},301);
      if(deferReads)pendingReads.push(finish);else finish();
    },
    writeText:({uri,text,success})=>{disk[uri]=text;success();},
    delete:({uri,success})=>{delete disk[uri];success();}
  };
  const set=(fn,delay)=>{timers.set(fn,delay);return fn;},clear=fn=>timers.delete(fn);
  const platform=name=>{
    if(name==='@app-module/system.interconnect')return {instance};
    if(name==='@app-module/system.file')return file;
    throw Error('Unexpected platform module: '+name);
  };
  const native={setTimeout:set,clearTimeout:clear,setInterval:set,clearInterval:clear,$app_require$:platform};
  const aiot={
    __ce__:(type,options,children)=>({type,options:options.__opts__,children}),
    __ci__:(options,children)=>options.__opts__.shown()?children():[],
    __cf__:(options,children)=>{const value=options.__opts__.exp();return (value.__list__||value).map((item,index)=>children(index,item));}
  };
  const context=vm.createContext({...native,aiot,console,interconnect:{instance},file,
    Date:class extends Date{static now(){return now;}},TextEncoder:undefined,TextDecoder:undefined,crypto:undefined,BigInt:undefined});
  let definition;
  if(rpk) {
    const files=unzipSync(readFileSync(rpk)),code=Buffer.from(files['pages/index/index.js']).toString('utf8');
    const entry=vm.runInContext('('+code.replace(/^export default /,'')+')',context),exports={};
    entry(native,native,native,exports,()=>{});const module={};exports.entry(module);definition=module.default;
  } else {
    const template=readFileSync(new URL('../templates/index.ux',import.meta.url),'utf8');
    let script=template.match(/<script>([\s\S]*?)<\/script>/)[1];
    script=script.replace(/^import .* from '@system\.[^']+'\r?\n/gm,'')
      .replace('/* AUTHBAND_RUNTIME */',()=>bundledRuntime)
      .replace('/* AUTHBAND_FIXTURE */',()=> 'const synthetic='+JSON.stringify(capabilityFixture())+';')
      .replace('export default','globalThis.definition=');
    vm.runInContext(script,context);definition=context.definition;
  }
  const page={...definition,...definition.private,$app:{exit(){exits++;}},$nextTick:fn=>deferTicks?nextTicks.push(fn):fn(),
    $element:id=>{
      if(id==='detail-issuer'||id==='detail-label')return page.mode==='detail'?{
        start:()=>marquees.push({id,action:'start'}),stop:()=>marquees.push({id,action:'stop'})
      }:null;
      const group=id.startsWith('list-')?page.groups.find(g=>g.id===id.slice(5)&&g.mounted):null;
      if(id.startsWith('list-')&&!group)return null;
      return {scrollTo:options=>{
        // Approximate fixed row/viewport extents, not native layout or event ordering.
        const scrollY=group?Math.min(options.index*76,Math.max(0,group.rows.length*76-286)):0;
        scrolled.push({id,...options,scrollY});
        if(scrollFeedback&&group)page.scroll(group.id,{scrollY,scrollState:0});
      }};
    }};
  for(const key of Object.keys(definition.private)) {
    let value=page[key];assignments[key]=0;
    Object.defineProperty(page,key,{get:()=>wrapGroups&&key==='groups'?new Proxy(value,{}):value,set:next=>{assignments[key]++;value=next;}});
  }
  return {page,timers,disk,reads,pendingReads,nextTicks,scrolled,marquees,assignments,connection,get exits(){return exits;},get connections(){return connections;},
    at(ms){now=ms;},tick(){const fn=[...timers.keys()][0];if(fn)fn();},
    async flush(){for(let i=0;i<100;i++)await Promise.resolve();},
    render(){return definition.template(page);}};
}
