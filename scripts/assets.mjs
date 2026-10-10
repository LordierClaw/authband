import {mkdir,writeFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
export async function appIcon() {
  const png=new PNG({width:1024,height:1024});
  for(let y=0;y<1024;y++)for(let x=0;x<1024;x++) {
    const dx=x/4,dy=y/4;
    const shackle=dy>=54&&dy<=128&&Math.abs(Math.hypot(dx-128,dy-98)-39)<10&&dy<104;
    const lock=dx>=77&&dx<=179&&dy>=102&&dy<=198;
    const keyhole=Math.abs(dx-128)<7&&dy>=136&&dy<=169;
    png.data.set((shackle||lock)&&!keyhole?[130,232,190,255]:[0,0,0,255],(y*1024+x)*4);
  }
  const directory='apps/ios/Resources/Assets.xcassets/AppIcon.appiconset';
  await mkdir(directory,{recursive:true});await writeFile(directory+'/AppIcon.png',PNG.sync.write(png));
}
