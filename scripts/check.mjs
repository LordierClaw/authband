import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,cpSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {unzipSync} from 'fflate';
import {verifyEntries,iosMetadata} from './release-policy.mjs';
import {appIcon} from './assets.mjs';
import {sourceState} from './source-state.mjs';
await appIcon();
function run(bin,args,capture=false) {
  const result=spawnSync(bin,args,{stdio:capture?'pipe':'inherit',encoding:'utf8'});
  if(result.error)throw new Error('Required tool unavailable: '+bin);
  if(result.status!==0)throw new Error(bin+' failed ('+result.status+')'+(capture?'\n'+result.stderr:''));
  return result.stdout;
}
const command=process.argv[2],args=process.argv.slice(3);
function applePreflight() {
  if(process.platform!=='darwin')throw new Error('iOS requires macOS with Xcode 27; use GitHub Actions.');
  const version=run('xcodebuild',['-version'],true);if(!/^Xcode 27\./m.test(version))throw new Error('Xcode 27 is required');
  const sdk=run('xcrun',['--sdk','iphoneos','--show-sdk-version'],true).trim();if(!sdk.startsWith('27.'))throw new Error('iOS 27 SDK required');
  console.log(version,'iOS SDK '+sdk);
  run('xcodegen',['generate','--spec','apps/ios/project.yml']);
  return {version,sdk};
}
function iosTest() {
  applePreflight();mkdirSync('artifacts',{recursive:true});
  const devices=JSON.parse(run('xcrun',['simctl','list','devices','available','--json'],true)).devices;
  const phones=Object.entries(devices).filter(([runtime])=>runtime.includes('.iOS-27-')).flatMap(([,list])=>list).filter(d=>d.isAvailable&&d.name.startsWith('iPhone'));
  const form=args.includes('--device')?args[args.indexOf('--device')+1]:'compact';
  if(!['compact','large'].includes(form))throw new Error('Invalid simulator form');
  const chosen=form==='large'?(phones.find(d=>d.name==='iPhone 17 Pro Max')||phones.find(d=>d.name.endsWith('Pro Max'))):(phones.find(d=>d.name==='iPhone 17')||phones.find(d=>!d.name.endsWith('Pro Max')));
  if(!chosen)throw new Error('No iOS 27 '+form+' iPhone simulator');
  console.log('Simulator: '+chosen.name+' ('+chosen.udid+')');
  const testArgs=['-project','apps/ios/AuthBand.xcodeproj','-scheme','AuthBand','-configuration','Debug','-destination','platform=iOS Simulator,id='+chosen.udid,'-parallel-testing-enabled','NO','-resultBundlePath','artifacts/AuthBand-tests.xcresult','CODE_SIGNING_ALLOWED=NO','test'];
  const suite=args[args.indexOf('--suite')+1];if(args.includes('--suite'))testArgs.push('-only-testing:'+(suite.includes('/')?suite:'AuthBandUITests/'+suite));
  run('xcodebuild',testArgs);
}
function iosBuild() {
  const sdk=applePreflight();mkdirSync('artifacts',{recursive:true});
  const profile=args.includes('--profile')?args[args.indexOf('--profile')+1]:'release';if(!['release','capability'].includes(profile))throw new Error('Invalid profile');
  run('xcodebuild',['-project','apps/ios/AuthBand.xcodeproj','-scheme','AuthBand','-configuration','Release','-sdk','iphoneos','-destination','generic/platform=iOS','-derivedDataPath','build/ios-'+profile,'AUTHBAND_FLAGS='+(profile==='capability'?'AUTHBAND_CAPABILITY':''),'CODE_SIGNING_ALLOWED=NO','CODE_SIGNING_REQUIRED=NO','build']);
  const app=resolve('build/ios-'+profile+'/Build/Products/Release-iphoneos/AuthBand.app');
  if(existsSync(app+'/_CodeSignature')||existsSync(app+'/embedded.mobileprovision'))throw new Error('IPA must be unsigned');
  const info=JSON.parse(run('plutil',['-convert','json','-o','-',app+'/Info.plist'],true));
  if(info.CFBundleIdentifier!=='dev.lordierclaw.authband'||!info.MinimumOSVersion.startsWith('27.'))throw new Error('Wrong app identity/OS');
  if(!run('lipo',['-archs',app+'/AuthBand'],true).includes('arm64'))throw new Error('Missing arm64');
  const packagePath='build/package-'+profile+'/Payload';
  mkdirSync(packagePath,{recursive:true});cpSync(app,packagePath+'/AuthBand.app',{recursive:true});
  const output='artifacts/AuthBand-'+profile+'-unsigned.ipa';
  run('ditto',['-c','-k','--keepParent',packagePath,output]);
  const bytes=readFileSync(output);verifyEntries(unzipSync(bytes),profile);
  writeFileSync(output+'.json',JSON.stringify({...sourceState(),...iosMetadata(profile,info,sdk,bytes),realSecretsEnabled:false},null,2));
}
function nativeCloseTest() {
  mkdirSync('build',{recursive:true});
  const output=resolve('build/close-state-test'+(process.platform==='win32'?'.exe':''));
  run('swiftc',['apps/ios/Adapters/CoreBluetooth/ConnectionCloseState.swift','tests/ConnectionCloseStateMain.swift','-o',output]);
  run(output,[]);
}
switch(command) {
case 'native':nativeCloseTest();break;
case 'swift':run('swift',['test','--package-path','packages/AuthBandCore',...args]);break;
case 'transport':run('swift',['test','--package-path','packages/BlueBandKit',...args]);break;
case 'ios-test':iosTest();break;
case 'ios-build':iosBuild();break;
case 'all':run(process.execPath,['scripts/test-band.mjs']);run(process.execPath,['--test','tests/release.test.mjs']);run(process.execPath,['apps/band/scripts/build.mjs','--profile','capability']);run(process.execPath,['--test','tests/rpk-page.test.mjs','tests/rpk-archive.test.mjs']);run(process.execPath,['apps/band/scripts/build.mjs','--profile','release']);nativeCloseTest();run('swift',['test','--package-path','packages/AuthBandCore']);run('swift',['test','--package-path','packages/BlueBandKit']);iosTest();iosBuild();break;
default:throw new Error('Unknown check');
}
