import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {unzipSync} from 'fflate';
import {bundleRuntime} from '../scripts/embed-runtime.mjs';
import {capabilityFixture} from '../scripts/capability-fixture.mjs';

const bundledRuntime=await bundleRuntime();

export async function pageHarness({rpk=null,deferReads=false,scrollFeedback=false}={}) {
  let now=30000,exits=0;
  const timers=new Map(),disk={},reads=[],pendingReads=[],scrolled=[],assignments={};
  const connection={getReadyState:({success})=>success({status:0})};
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
    if(name==='@app-module/system.interconnect')return {instance:()=>connection};
    if(name==='@app-module/system.file')return file;
    throw Error('Unexpected platform module: '+name);
  };
  const native={setTimeout:set,clearTimeout:clear,setInterval:set,clearInterval:clear,$app_require$:platform};
  const aiot={
    __ce__:(type,options,children)=>({type,options:options.__opts__,children}),
    __ci__:(options,children)=>options.__opts__.shown()?children():[],
    __cf__:(options,children)=>{const value=options.__opts__.exp();return (value.__list__||value).map((item,index)=>children(index,item));}
  };
  const context=vm.createContext({...native,aiot,console,interconnect:{instance:()=>connection},file,
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
      .replace('/* AUTHBAND_RUNTIME */',()=> 'const AUTHBAND_CAPABILITY=true;\n'+bundledRuntime)
      .replace('/* AUTHBAND_FIXTURE */',()=> 'const synthetic='+JSON.stringify(capabilityFixture())+';')
      .replace('export default','globalThis.definition=');
    vm.runInContext(script,context);definition=context.definition;
  }
  const page={...definition,...definition.private,$app:{exit(){exits++;}},$nextTick:fn=>fn(),
    $element:id=>({scrollTo:options=>{
      scrolled.push({id,...options});
      if(scrollFeedback&&id.startsWith('list-'))page.scroll(id.slice(5),{scrollY:options.index*136,scrollState:0});
    }})};
  for(const key of Object.keys(definition.private)) {
    let value=page[key];assignments[key]=0;
    Object.defineProperty(page,key,{get:()=>value,set:next=>{assignments[key]++;value=next;}});
  }
  return {page,timers,reads,pendingReads,scrolled,assignments,connection,get exits(){return exits;},
    at(ms){now=ms;},tick(){const fn=[...timers.keys()][0];if(fn)fn();},
    async flush(){for(let i=0;i<100;i++)await Promise.resolve();},
    render(){return definition.template(page);}};
}
