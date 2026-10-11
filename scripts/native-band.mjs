// Local native-renderer smoke checks. Not a substitute for Mi Band firmware acceptance.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,createWriteStream} from 'node:fs';
import {resolve} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {PNG} from 'pngjs';
import {verifyRPK} from '../apps/band/scripts/verify-rpk.mjs';

const require=createRequire(resolve('apps/band/package.json'));
const vela=require('@aiot-toolkit/emulator');
const {createGrpcClient}=require('@aiot-toolkit/emulator/lib/vvd/grpc');
const {getAdbFullPath}=require('@miwt/adb');
const name=process.env.AUTHBAND_VVD||'Vela_AuthBand_212x520';
const sdkHome=resolve(process.env.VELA_SDK_HOME||'.tools/vela-sdk');
const emulatorHome=resolve(process.env.VELA_EMULATOR_HOME||'.tools/vela-emulator');
const out=resolve(process.env.AUTHBAND_NATIVE_OUTPUT||'artifacts/native-smoke');
const pkg='dev.lordierclaw.authband.band';
const [command,...args]=process.argv.slice(2);
mkdirSync(out,{recursive:true});

if(command==='start') {
  const manager=new vela.VvdManager({sdkHome});
  assert.ok(manager.getVvdList().some(v=>v.name===name),'Create the dedicated 212x520 VVD first; see docs/testing/band-native-build5.md');
  const cmd=await manager.getVvdStartCmd({vvdName:name,qtHideWindow:true,grpcPort:8554,debugPort:10055,verbose:true});
  // The SDK command names a nested binary path on Windows; use its installed root.
  const params=cmd.match(/"[^"]*"|\S+/g).slice(1).map(s=>s.replace(/^"|"$/g,''));
  const env={...process.env};
  for(const key of ['TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA'])if(env[key])env[key]=env[key].replaceAll('\\','/');
  mkdirSync(resolve(sdkHome,'android'),{recursive:true});
  env.ANDROID_EMULATOR_HOME=resolve(sdkHome,'android').replaceAll('\\','/');
  const log=createWriteStream(resolve(out,'emulator.log'));
  const child=spawn(resolve(emulatorHome,process.platform==='win32'?'emulator.exe':'emulator'),params,{cwd:sdkHome,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(log);child.stderr.pipe(log);
  child.on('error',e=>{console.error(e);process.exitCode=1;});
  child.on('exit',code=>{process.exitCode=code||0;});
  console.log('Emulator wrapper PID:',child.pid);
} else {
  const config=vela.getRunningAvdConfigByName(name);
  assert.ok(config,'Dedicated emulator is not running');
  const adb=(...params)=>{
    const result=spawnSync(getAdbFullPath(),['-s','emulator-'+config['port.serial'],...params],{encoding:'utf8',timeout:10000,windowsHide:true});
    if(result.error||result.status!==0)throw Error(result.error?.message||result.stderr);
    return result.stdout;
  };
  const running=()=>adb('shell','ps').includes('vappxms '+pkg);
  const client=createGrpcClient(config);await client.waitForReady();
  const rpc=(method,data)=>new Promise((res,rej)=>client.client[method](data,client.authMate,{deadline:Date.now()+5000},(error,result)=>error?rej(error):res(result)));
  const frame=async()=>{
    const {image}=await rpc('getScreenshot',{format:'PNG',width:212,height:520});
    const pixels=PNG.sync.read(image);assert.equal(pixels.width,212);assert.equal(pixels.height,520);
    return {bytes:image,pixels};
  };
  const click=async(x,y)=>{await rpc('sendMouse',{x,y,buttons:1});await sleep(70);await rpc('sendMouse',{x,y,buttons:0});};
  const swipe=async(x1,y1,x2,y2,duration=240)=>{
    await rpc('sendMouse',{x:x1,y:y1,buttons:1});
    for(let i=1;i<=12;i++){
      await sleep(duration/12);
      await rpc('sendMouse',{x:Math.round(x1+(x2-x1)*i/12),y:Math.round(y1+(y2-y1)*i/12),buttons:1});
    }
    await rpc('sendMouse',{x:x2,y:y2,buttons:0});
  };
  const save=(name,f)=>writeFileSync(resolve(out,name+'.png'),f.bytes);
  const pixelsIn=(f,rect,predicate)=>{
    let count=0;const [x,y,w,h]=rect;
    for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){
      const i=(yy*212+xx)*4;if(predicate(...f.pixels.data.subarray(i,i+3)))count++;
    }
    return count;
  };
  const light=(r,g,b)=>r>110&&g>110&&b>110;
  const green=(r,g,b)=>g>100&&g>r*1.2&&b>r;
  const digest=(f,rect)=>{
    const h=createHash('sha256'),[x,y,w,height]=rect;
    // Native swiper rasterization may settle by one pixel. Compare ink shape,
    // not absolute antialiased RGB coordinates, when checking retained content.
    const ink=(xx,yy)=>light(...f.pixels.data.subarray((yy*212+xx)*4,(yy*212+xx)*4+3));
    let left=x+w,right=x,top=y+height,bottom=y;
    for(let yy=y;yy<y+height;yy++)for(let xx=x;xx<x+w;xx++)if(ink(xx,yy)){
      left=Math.min(left,xx);right=Math.max(right,xx);top=Math.min(top,yy);bottom=Math.max(bottom,yy);
    }
    h.update(String(right-left+1)+':'+String(bottom-top+1));
    for(let yy=top;yy<=bottom;yy++){
      const row=[];for(let xx=left;xx<=right;xx++)row.push(ink(xx,yy)?1:0);h.update(Buffer.from(row));
    }
    return h.digest('hex');
  };
  const titleRect=[22,54,168,42],rowsRect=[20,118,172,260];
  const isList=f=>pixelsIn(f,[58,436,96,30],light)>35&&pixelsIn(f,titleRect,light)>80&&pixelsIn(f,rowsRect,light)>800;
  const isDetail=f=>pixelsIn(f,[16,246,180,42],light)>400&&pixelsIn(f,[38,338,88,8],green)>0;
  const isSettings=f=>pixelsIn(f,[26,204,160,48],(r,g,b)=>r>20&&r<50&&g>20&&g<50&&b>20&&b<50)>3000&&pixelsIn(f,[108,380,75,34],green)===0;
  const digitCount=f=>{
    let count=0,ink=false;
    for(let x=16;x<196;x++){
      const next=pixelsIn(f,[x,246,1,42],light)>0;
      if(next&&!ink)count++;ink=next;
    }
    return count;
  };
  const waitFor=async(predicate,timeout=1500)=>{
    const start=performance.now();
    do {const f=await frame();if(predicate(f))return {frame:f,ms:Math.round(performance.now()-start)};await sleep(25);}while(performance.now()-start<timeout);
    const last=await frame();
    if(predicate(last))return {frame:last,ms:Math.round(performance.now()-start)};
    save('failure',last);throw Error('Native pixels did not reach the expected screen within '+timeout+'ms');
  };
  const waitExit=async()=>{
    const start=performance.now();
    while(running()){if(performance.now()-start>5000)throw Error('Native app failed to exit');await sleep(100);}
    return Math.round(performance.now()-start);
  };
  try {
    if(command==='shot'){save(args[0]||'screen',await frame());}
    else if(command==='click')await click(...args.map(Number));
    else if(command==='swipe')await swipe(...args.map(Number));
    else if(command==='adb')console.log(adb(...args));
    else if(command==='smoke') {
      assert.ok(!running(),'Exit AuthBand before smoke. Never reinstall while its native VM is shutting down.');
      const bytes=readFileSync(resolve(args[0]||'artifacts/AuthBand-capability.rpk'));
      const build=verifyRPK(bytes,'capability');assert.equal(build.realSecretsEnabled,false);
      const report={environment:'Vela emulator 212x520, not Mi Band firmware',build,steps:[],passed:false};
      const step=async(label,action,predicate)=>{
        await action();const result=await waitFor(predicate);save(label,result.frame);
        report.steps.push({label,releaseToObservedFrameMs:result.ms});console.log(label,result.ms+'ms');return result.frame;
      };
      try {
        console.log(adb('push',resolve(args[0]||'artifacts/AuthBand-capability.rpk'),'/data/local/tmp/authband.rpk'));
        console.log(adb('shell','pm','install','/data/local/tmp/authband.rpk'));
        // Only nonsecret UI preferences in this dedicated synthetic-data VVD.
        adb('shell','rm','-f','/data/files/'+pkg+'/authband-ui');
        const boot=performance.now();adb('shell','am','start',pkg);
        const ready=await waitFor(isList,30000);save('01-list',ready.frame);
        report.debugLaunchToListMs=Math.round(performance.now()-boot);
        const firstTitle=digest(ready.frame,titleRect);
        const detail=await step('02-six-digits',()=>click(106,140),isDetail);assert.equal(digitCount(detail),6);
        const identity=digest(detail,[20,125,172,92]);
        await sleep(1200);const ticked=await frame();assert.equal(digest(ticked,[20,125,172,92]),identity,'countdown must not erase identity');
        await step('03-back',()=>click(44,76),f=>isList(f)&&digest(f,titleRect)===firstTitle);
        const titles=[firstTitle];
        for(let i=1;i<8;i++){
          const f=await step('04-group-'+i,()=>swipe(180,i%2?80:245,25,i%2?80:245),f=>isList(f)&&!titles.includes(digest(f,titleRect)));
          // Wait for the native animation to settle before the next action.
          await sleep(250);const settled=await frame();save('04-group-'+i,settled);titles.push(digest(settled,titleRect));
          assert.ok(pixelsIn(settled,rowsRect,light)>800,'each group needs visible account text');
          if(i===1){
            const long=await step('04-long-identity',()=>click(106,140),isDetail);assert.equal(digitCount(long),8);
            await step('04-long-back',()=>click(44,76),f=>isList(f)&&digest(f,titleRect)===titles[1]);
          }
        }
        const eight=await step('05-eight-digits',()=>click(106,140),isDetail);assert.equal(digitCount(eight),8);
        await step('06-retained-tab',()=>click(44,76),f=>isList(f)&&digest(f,titleRect)===titles[7]);
        const beforeScroll=digest(await frame(),rowsRect);
        await swipe(106,358,106,134,350);await sleep(400);
        const scrollHash=digest(await frame(),rowsRect);save('07-scroll',await frame());
        assert.notEqual(scrollHash,beforeScroll,'vertical input must actually scroll the list');
        await step('08-scrolled-detail',()=>click(106,145),isDetail);
        await step('09-retained-scroll',()=>click(44,76),f=>isList(f)&&digest(f,rowsRect)===scrollHash);
        await step('10-settings',()=>click(72,450),isSettings);
        await step('11-pair',()=>click(106,228),f=>pixelsIn(f,[108,380,75,34],green)>500);
        await click(41,202);await step('12-cancel-pair',()=>click(84,398),isSettings);
        await step('13-settings-back',()=>click(106,450),f=>isList(f)&&digest(f,titleRect)===titles[7]);
        // Incomplete horizontal drag must not disable the next row tap.
        await swipe(150,245,128,245,120);await sleep(250);
        await step('14-cancelled-drag-tap',()=>click(106,145),isDetail);
        await step('15-back',()=>click(44,76),isList);
        await click(140,450);report.exitObservedMs=await waitExit();
        await sleep(500);adb('shell','am','start',pkg);
        const resumed=await waitFor(f=>isList(f)&&digest(f,titleRect)===titles[7],30000);save('16-relaunch',resumed.frame);
        await step('17-relaunch-settings',()=>click(72,450),isSettings);
        await click(106,356);report.settingsExitObservedMs=await waitExit();
        report.passed=true;
      } finally {writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
      console.log(JSON.stringify(report,null,2));
    } else throw Error('Use start, smoke <capability.rpk>, shot <name>, click x y, swipe x1 y1 x2 y2, or adb ...');
  } finally {client.close();}
}
