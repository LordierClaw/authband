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
  // Build 8 geometry: one vertical list (title row 66px, 40px group headers,
  // 66px rows); the code view is a separate router page.
  const rowsRect=[18,100,176,380],codeRect=[16,226,180,68];
  const isDetail=f=>pixelsIn(f,codeRect,light)>400&&pixelsIn(f,[38,328,88,8],green)>0;
  const isList=f=>pixelsIn(f,rowsRect,light)>800&&!isDetail(f);
  const digitCount=f=>{
    let count=0,ink=false;
    for(let x=16;x<196;x++){
      const next=pixelsIn(f,[x,226,1,68],light)>0;
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
    while(running()){if(performance.now()-start>5000)throw Error('Native app failed to exit');await sleep(300);}
    return Math.round(performance.now()-start);
  };
  // Vertical offset of list content relative to a reference frame (ink matching).
  const offset=(base,f)=>{
    const ink=(p,x,y)=>y>=0&&y<520&&light(...p.pixels.data.subarray((y*212+x)*4,(y*212+x)*4+3));
    let best=-1,shift=0;
    for(let s=0;s<=300;s++){let m=0;for(let y=120;y<460;y+=2)for(let x=18;x<150;x+=3)if(ink(f,x,y)&&ink(base,x,y+s))m++;if(m>best){best=m;shift=s;}}
    return shift;
  };
  // The emulator image delivers no system back gesture; the app's own fallback
  // (350ms after a right swipe) is what these checks exercise.
  const back=()=>swipe(28,260,183,260);
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
        const boot=performance.now();adb('shell','am','start',pkg);
        const ready=await waitFor(isList,30000);await sleep(600);const first=await frame();save('01-list',first);
        report.debugLaunchToListMs=Math.round(performance.now()-boot);
        const top=digest(first,rowsRect);
        const detail=await step('02-six-digits',()=>click(106,140),isDetail);assert.equal(digitCount(detail),6);
        const identity=digest(detail,[18,112,176,92]);
        await sleep(1200);const ticked=await frame();assert.equal(digest(ticked,[18,112,176,92]),identity,'countdown must not erase identity');
        await step('03-back-fallback',back,f=>isList(f)&&digest(f,rowsRect)===top);
        // Held vertical drag: content must follow the finger in every frame.
        await rpc('sendMouse',{x:106,y:440,buttons:1});report.dragTracking=[];
        for(let i=1;i<=8;i++){await rpc('sendMouse',{x:106,y:440-20*i,buttons:1});await sleep(40);report.dragTracking.push({finger:20*i,content:offset(first,await frame())});}
        await rpc('sendMouse',{x:106,y:280,buttons:0});await sleep(500);
        assert.ok(report.dragTracking.every(s=>Math.abs(s.finger-s.content)<=4),'list must track the held finger');
        await swipe(106,440,106,280,300);await sleep(600);
        const scrolled=await frame();save('04-scrolled',scrolled);const scrollHash=digest(scrolled,rowsRect);
        assert.notEqual(scrollHash,top,'vertical input must scroll the list');
        const eight=await step('05-eight-digits',()=>click(106,330),isDetail);assert.equal(digitCount(eight),8);
        await step('06-retained-scroll',back,f=>isList(f)&&digest(f,rowsRect)===scrollHash);
        // Short horizontal drag: neither a tap nor an exit; the next tap still works.
        await swipe(110,300,150,300,120);await sleep(700);
        assert.ok(running()&&isList(await frame()),'a short sideways drag must not open a code or exit');
        await step('07-cancelled-drag-tap',()=>click(106,330),isDetail);
        await step('08-back',back,isList);
        await swipe(25,300,180,300);report.swipeExitObservedMs=await waitExit();
        // Re-entry: every launch from a stopped process must reach the list.
        report.reentry=[];
        for(let round=0;round<6;round++){
          await sleep(500);const start=performance.now();adb('shell','am','start',pkg);
          const list=await waitFor(isList,30000);save('09-reentry-'+round,list.frame);
          // This image ignores input for a few hundred ms after the first frame.
          await sleep(600);
          const entry={round,debugLaunchToListMs:Math.round(performance.now()-start)};
          if(round%2===1){await click(106,140);await waitFor(isDetail);await back();await waitFor(isList);}
          await swipe(25,300,180,300);entry.exitObservedMs=await waitExit();
          report.reentry.push(entry);console.log('reentry',JSON.stringify(entry));
        }
        report.passed=true;
      } finally {writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
      console.log(JSON.stringify(report,null,2));
    } else if(command==='memory') {
      // Leak check: system heap while the process stays alive across 30 code
      // open/back cycles, then across 10 launch/exit cycles.
      assert.ok(!running(),'Exit AuthBand first');
      const used=()=>+adb('shell','free').split(/\n/)[1].trim().split(/\s+/)[1];
      const report={environment:'Vela emulator 212x520, not Mi Band firmware',build:verifyRPK(readFileSync(resolve(args[0]||'artifacts/AuthBand-capability.rpk')),'capability'),codeCycles:[],launchCycles:[]};
      adb('shell','am','start',pkg);await waitFor(isList,30000);await sleep(1500);
      report.codeCycles.push({cycle:0,used:used()});
      for(let i=1;i<=30;i++){
        await click(106,140);await waitFor(isDetail);await back();await waitFor(isList);
        if(i===1||i%10===0){await sleep(800);report.codeCycles.push({cycle:i,used:used()});}
      }
      await swipe(25,300,180,300);await waitExit();await sleep(800);
      report.launchCycles.push({run:0,used:used()});
      for(let i=1;i<=10;i++){
        adb('shell','am','start',pkg);await waitFor(isList,30000);await sleep(400);
        await click(106,140);await waitFor(isDetail);await back();await waitFor(isList);
        await swipe(25,300,180,300);await waitExit();await sleep(800);report.launchCycles.push({run:i,used:used()});
      }
      writeFileSync(resolve(out,'memory-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
    } else if(command==='idle') {
      assert.ok(!running(),'Exit AuthBand first');
      const build=verifyRPK(readFileSync(resolve(args[0]||'artifacts/AuthBand-capability.rpk')),'capability');
      const smoke=JSON.parse(readFileSync(resolve(out,'report.json'),'utf8'));
      assert.ok(smoke.passed&&smoke.build.sha256===build.sha256,'Run smoke on this exact RPK before the idle check');
      adb('shell','am','start',pkg);await waitFor(isList,30000);
      await click(106,140);await waitFor(isDetail);
      // A real five-minute wait is local only, never part of CI.
      const start=performance.now();save('idle-start',await frame());
      await sleep(290000);assert.ok(running(),'Must not expire before five minutes');
      save('idle-before-deadline',await frame());
      while(running()){assert.ok(performance.now()-start<307000,'Idle app did not exit');await sleep(200);}
      const report={environment:'Vela emulator 212x520, not Mi Band firmware',build,idleExitObservedMs:Math.round(performance.now()-start),passed:true};
      writeFileSync(resolve(out,'idle-report.json'),JSON.stringify(report,null,2)+'\n');console.log(report);
    } else throw Error('Use start, smoke <capability.rpk>, memory, idle, shot <name>, click x y, swipe x1 y1 x2 y2, or adb ...');
  } finally {client.close();}
}
