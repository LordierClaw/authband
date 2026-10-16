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
  // Build 9 geometry: one swiper page per group (title y24-64, 66px rows from
  // y72, native page indicator); the code view is a separate router page.
  const titleRect=[22,26,168,36],rowsRect=[18,80,176,380],codeRect=[16,226,180,68];
  const isDetail=f=>pixelsIn(f,codeRect,light)>400&&pixelsIn(f,[38,328,88,8],green)>0;
  const isList=f=>pixelsIn(f,titleRect,light)>80&&pixelsIn(f,rowsRect,light)>800&&!isDetail(f);
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
  // Horizontal offset of page content relative to a reference frame (ink matching).
  const shiftX=(base,f)=>{
    const ink=(p,x,y)=>x>=0&&x<212&&light(...p.pixels.data.subarray((y*212+x)*4,(y*212+x)*4+3));
    let best=-1,shift=0;
    for(let s=0;s<=200;s++){let m=0;for(let y=84;y<460;y+=3)for(let x=0;x<212;x+=2)if(ink(f,x,y)&&ink(base,x+s,y))m++;if(m>best){best=m;shift=s;}}
    return shift;
  };
  // The emulator image delivers no system back gesture; the app's own fallback
  // is what these checks exercise (code page 350ms, first tab 200ms).
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
        // Only nonsecret UI preferences in this dedicated synthetic-data VVD.
        adb('shell','rm','-f','/data/files/'+pkg+'/authband-ui');
        const boot=performance.now();adb('shell','am','start',pkg);
        const ready=await waitFor(isList,30000);save('01-first-frame',ready.frame);
        report.debugLaunchToListMs=Math.round(performance.now()-boot);
        // The remaining tabs are mounted after 2.5s without touches.
        await sleep(3000);const first=await frame();save('01-list',first);const firstTitle=digest(first,titleRect);
        const detail=await step('02-six-digits',()=>click(106,105),isDetail);assert.equal(digitCount(detail),6);
        const identity=digest(detail,[18,112,176,92]);
        await sleep(1200);const ticked=await frame();assert.equal(digest(ticked,[18,112,176,92]),identity,'countdown must not erase identity');
        await step('03-back-fallback',back,f=>isList(f)&&digest(f,titleRect)===firstTitle);
        // Held horizontal drag: the page must follow the finger before release.
        await rpc('sendMouse',{x:190,y:300,buttons:1});report.dragTracking=[];
        for(let i=1;i<=6;i++){await rpc('sendMouse',{x:190-20*i,y:300,buttons:1});await sleep(40);report.dragTracking.push({finger:20*i,content:shiftX(first,await frame())});}
        await rpc('sendMouse',{x:70,y:300,buttons:0});await sleep(700);
        assert.ok(report.dragTracking.every((s,i)=>Math.abs(s.finger-s.content)<=(i===0?20:6)),'tab page must track the held finger');
        const titles=[firstTitle];let f1=await frame();titles.push(digest(f1,titleRect));save('04-group-1',f1);
        assert.notEqual(titles[1],titles[0],'the held drag must change tab');
        const long=await step('04-long-identity',()=>click(106,105),isDetail);assert.equal(digitCount(long),8);
        await step('04-long-back',back,f=>isList(f)&&digest(f,titleRect)===titles[1]);
        for(let i=2;i<8;i++){
          await step('04-group-'+i,()=>swipe(180,i%2?44:245,25,i%2?44:245),f=>isList(f)&&!titles.includes(digest(f,titleRect)));
          await sleep(250);const settled=await frame();save('04-group-'+i,settled);titles.push(digest(settled,titleRect));
          assert.ok(pixelsIn(settled,rowsRect,light)>800,'each group needs visible account text');
        }
        const beforeScroll=digest(await frame(),rowsRect);
        await swipe(106,420,106,150,350);await sleep(500);
        const scrolled=await frame();save('05-scroll',scrolled);const scrollHash=digest(scrolled,rowsRect);
        assert.notEqual(scrollHash,beforeScroll,'vertical input must scroll the list');
        await step('06-scrolled-detail',()=>click(106,145),isDetail);
        await step('07-retained-scroll',back,f=>isList(f)&&digest(f,rowsRect)===scrollHash);
        // Short sideways drag: never a tap (the native swiper may still turn the
        // page on this image); the next tap still works.
        await swipe(110,300,130,300,300);await sleep(700);
        const dragged=await frame();assert.ok(running()&&isList(dragged),'a short sideways drag must not open a code');
        const draggedTitle=digest(dragged,titleRect),at=titles.indexOf(draggedTitle);assert.ok(at>=0);
        await step('08-cancelled-drag-tap',()=>click(106,145),isDetail);
        await step('09-back',back,isList);
        for(let i=at-1;i>=0;i--){
          await step('10-return-group-'+i,()=>swipe(25,245,180,245),f=>isList(f)&&digest(f,titleRect)===titles[i]);await sleep(250);
        }
        // A right swipe on the first tab exits; no blank page is ever shown.
        const exitStart=performance.now();await swipe(25,300,180,300);
        const afterSwipe=await frame();save('11-exit-swipe',afterSwipe);
        assert.ok(digest(afterSwipe,titleRect)===titles[0]||!running(),'the first tab stays on screen until the app is gone');
        await waitExit();report.firstTabExitObservedMs=Math.round(performance.now()-exitStart);
        // Re-entry: every launch from a stopped process must reach the list.
        report.reentry=[];
        for(let round=0;round<6;round++){
          await sleep(500);const start=performance.now();adb('shell','am','start',pkg);
          const list=await waitFor(isList,30000);save('12-reentry-'+round,list.frame);
          await sleep(600);
          const entry={round,debugLaunchToListMs:Math.round(performance.now()-start)};
          if(round%2===1){await click(106,105);await waitFor(isDetail);await back();await waitFor(isList);await sleep(300);}
          const title=digest(await frame(),titleRect);
          // Reopening may restore a saved tab; go back to the first one, then exit.
          for(let k=0;k<8&&digest(await frame(),titleRect)!==titles[0];k++){await swipe(25,245,180,245);await sleep(700);}
          await swipe(25,300,180,300);entry.exitObservedMs=await waitExit();entry.reopenedOnFirstTab=title===titles[0];
          // Every previous run left from the first tab, so it must reopen there.
          assert.ok(entry.reopenedOnFirstTab,'reopen must restore the tab the app was left on');
          report.reentry.push(entry);console.log('reentry',JSON.stringify(entry));
        }
        report.passed=true;
      } finally {writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
      console.log(JSON.stringify(report,null,2));
    } else if(command==='memory') {
      // Leak check: system heap while the process stays alive across 30 code
      // open/back cycles and 30 rapid tab swipes, then across 10 launch/exit cycles.
      // Each phase is written to disk as soon as it ends.
      assert.ok(!running(),'Exit AuthBand first');
      const used=()=>+adb('shell','free').split(/\n/)[1].trim().split(/\s+/)[1];
      const report={environment:'Vela emulator 212x520, not Mi Band firmware',build:verifyRPK(readFileSync(resolve(args[0]||'artifacts/AuthBand-capability.rpk')),'capability'),codeCycles:[],tabSwipes:[],launchCycles:[]};
      const write=()=>writeFileSync(resolve(out,'memory-report.json'),JSON.stringify(report,null,2)+'\n');
      adb('shell','rm','-f','/data/files/'+pkg+'/authband-ui');
      adb('shell','am','start',pkg);await waitFor(isList,30000);await sleep(3500);
      report.codeCycles.push({cycle:0,used:used()});
      for(let i=1;i<=30;i++){
        await click(106,105);await waitFor(isDetail);await back();await waitFor(isList);await sleep(400);
        if(i===1||i%10===0){await sleep(800);report.codeCycles.push({cycle:i,used:used()});write();}
      }
      report.tabSwipes.push({swipe:0,used:used()});
      for(let i=1;i<=30;i++){
        if(i%2)await swipe(180,245,25,245,160);else await swipe(25,245,180,245,160);
        await sleep(450);
        if(i%10===0){await sleep(800);report.tabSwipes.push({swipe:i,used:used()});write();}
      }
      await swipe(25,300,180,300);await waitExit();await sleep(800);
      report.launchCycles.push({run:0,used:used()});
      for(let i=1;i<=10;i++){
        adb('shell','am','start',pkg);await waitFor(isList,30000);await sleep(1000);
        await click(106,105);await waitFor(isDetail);await back();await waitFor(isList);await sleep(400);
        await swipe(25,300,180,300);await waitExit();await sleep(800);report.launchCycles.push({run:i,used:used()});write();
      }
      write();console.log(JSON.stringify(report));
    } else if(command==='idle') {
      assert.ok(!running(),'Exit AuthBand first');
      const build=verifyRPK(readFileSync(resolve(args[0]||'artifacts/AuthBand-capability.rpk')),'capability');
      const smoke=JSON.parse(readFileSync(resolve(out,'report.json'),'utf8'));
      assert.ok(smoke.passed&&smoke.build.sha256===build.sha256,'Run smoke on this exact RPK before the idle check');
      adb('shell','am','start',pkg);await waitFor(isList,30000);await sleep(3500);
      await click(106,105);await waitFor(isDetail);
      // A real five-minute wait is local only, never part of CI.
      const start=performance.now();save('idle-start',await frame());
      await sleep(290000);assert.ok(running(),'Must not expire before five minutes');
      save('idle-before-deadline',await frame());
      while(running()){assert.ok(performance.now()-start<307000,'Idle app did not exit');await sleep(1000);}
      const report={environment:'Vela emulator 212x520, not Mi Band firmware',build,idleExitObservedMs:Math.round(performance.now()-start),passed:true};
      writeFileSync(resolve(out,'idle-report.json'),JSON.stringify(report,null,2)+'\n');console.log(report);
    } else throw Error('Use start, smoke <capability.rpk>, memory, idle, shot <name>, click x y, swipe x1 y1 x2 y2, or adb ...');
  } finally {client.close();}
}
