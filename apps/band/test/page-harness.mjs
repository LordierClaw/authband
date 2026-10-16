import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {unzipSync} from 'fflate';
import {bundleRuntime} from '../scripts/embed-runtime.mjs';
import {capabilityFixture} from '../scripts/capability-fixture.mjs';

const runtimes={index:await bundleRuntime('list'),code:await bundleRuntime('code')};

// Host adapter for one page (index or code) with the app-level shared state.
// It runs the real page script and template, not a native renderer.
export async function pageHarness({page:name='index',rpk=null,deferReads=false,shared=null,app=null}={}) {
  let now=30000,connections=0;
  const appState=app||{exits:0,pushes:[],backs:0,$def:{authband:shared||{snapshot:null,time:null,selected:null,idleDeadline:0}}};
  const timers=new Map(),disk={},reads=[],pendingReads=[],assignments={};
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
  const router={push:({uri})=>appState.pushes.push(uri),back:()=>appState.backs++};
  const set=(fn,delay)=>{timers.set(fn,delay);return fn;},clear=fn=>timers.delete(fn);
  const platform=module=>{
    if(module==='@app-module/system.interconnect')return {instance};
    if(module==='@app-module/system.file')return file;
    if(module==='@app-module/system.crypto')return {};
    if(module==='@app-module/system.router')return router;
    throw Error('Unexpected platform module: '+module);
  };
  const native={setTimeout:set,clearTimeout:clear,setInterval:set,clearInterval:clear,$app_require$:platform};
  const aiot={
    __ce__:(type,options,children)=>({type,options:options.__opts__,children}),
    __ci__:(options,children)=>options.__opts__.shown()?children():[],
    __cf__:(options,children)=>{const value=options.__opts__.exp();return (value.__list__||value).map((item,index)=>children(index,item));}
  };
  const context=vm.createContext({...native,aiot,console,interconnect:{instance},file,router,
    Date:class extends Date{static now(){return now;}},TextEncoder:undefined,TextDecoder:undefined,crypto:{},BigInt:undefined});
  let definition;
  if(rpk) {
    const files=unzipSync(readFileSync(rpk)),code=Buffer.from(files['pages/'+name+'/'+name+'.js']).toString('utf8');
    const entry=vm.runInContext('('+code.replace(/^export default /,'')+')',context),exports={};
    entry(native,native,native,exports,()=>{});const module={};exports.entry(module);definition=module.default;
  } else {
    const template=readFileSync(new URL('../templates/'+name+'.ux',import.meta.url),'utf8');
    let script=template.match(/<script>([\s\S]*?)<\/script>/)[1];
    script=script.replace(/^import .* from '@system\.[^']+'\r?\n/gm,'')
      .replace('/* AUTHBAND_RUNTIME */',()=>runtimes[name])
      .replace('/* AUTHBAND_FIXTURE */',()=> 'const synthetic='+JSON.stringify(JSON.stringify(capabilityFixture()))+';')
      .replace('export default','globalThis.definition=');
    vm.runInContext(script,context);definition=context.definition;
  }
  const page={...definition,...definition.private,$app:{exit(){appState.exits++;},get $def(){return appState.$def;}}};
  // The tabs element: swipeTo animates natively, then the swiper reports change.
  page.$element=id=>id==='tabs'?{swipeTo:({index})=>{(appState.swipes=appState.swipes||[]).push(index);page.tabChange({index});}}:null;
  for(const key of Object.keys(definition.private)) {
    let value=page[key];assignments[key]=0;
    Object.defineProperty(page,key,{get:()=>value,set:next=>{assignments[key]++;value=next;}});
  }
  return {page,app:appState,shared:appState.$def.authband,timers,disk,reads,pendingReads,assignments,connection,
    get exits(){return appState.exits;},get connections(){return connections;},
    get workTimers(){return new Map([...timers].filter(([fn])=>fn!==page._idleTimer));},
    at(ms){now=ms;},
    // Runs the earliest pending non-idle timer, as a native timer turn would.
    tick(){const fn=[...timers].filter(([fn])=>fn!==page._idleTimer).sort((a,b)=>a[1]-b[1])[0]?.[0];if(fn){timers.delete(fn);fn();}return !!fn;},
    async settle(){for(let i=0;i<40&&this.tick();i++)await this.flush();},
    async flush(){for(let i=0;i<100;i++)await Promise.resolve();},
    render(){return definition.template(page);}};
}
