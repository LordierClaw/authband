import {totp} from './totp.js';
import {unbase64} from './encoding.js';
import {TimeState} from './time-state.js';
export function rows(snapshot,groupID,time,start=0,count=20) {
  return snapshot.accounts.filter(a=>a.groupID===groupID).sort((a,b)=>a.order-b.order).map((a,index)=>{
    let value=a.parameters.digits===8?'---- ----':'--- ---',remaining=0;
    if(time.trusted && index>=start && index<start+count) {
      const key=unbase64(a.secret);
      try {const otp=totp(key,a.parameters,time.unixSeconds);const half=a.parameters.digits/2;value=otp.value.slice(0,half)+' '+otp.value.slice(half);remaining=otp.validUntil-time.unixSeconds;} finally {key.fill(0);}
    }
    return {id:a.id,issuer:a.issuer,label:a.label,code:value,remaining,small:a.parameters.digits===8,progress:Math.round(remaining/a.parameters.period*100)};
  });
}
export class Viewer {
  constructor(options) {this.options=options;this.generation=0;this.timer=null;this.visible=false;this.dead=false;this.snapshot=null;this.time=null;this.activeID=null;this.positions={};this.second=null;}
  async show() {
    if(this.dead)return;this.hide();this.visible=true;const token=this.generation;
    const loaded=await this.options.load();
    if(!this.visible||token!==this.generation||this.dead)return;
    if(!this.snapshot && loaded.preferences && typeof loaded.preferences==='object') {
      this.activeID=loaded.preferences.activeID;
      const saved=loaded.preferences.positions;
      if(saved && typeof saved==='object')for(const group of loaded.snapshot.groups)if(Number.isInteger(saved[group.id]) && saved[group.id]>=0 && saved[group.id]<20)this.positions[group.id]=saved[group.id];
    }
    this.snapshot=loaded.snapshot;if(!this.time)this.time=new TimeState(loaded.time);
    this.render(true);this.timer=this.options.scheduler.set(()=>this.render(false));
  }
  hide(){this.generation++;this.visible=false;if(this.timer!==null)this.options.scheduler.clear(this.timer);this.timer=null;}
  destroy(){this.hide();this.dead=true;this.snapshot=null;this.time=null;}
  select(index){if(!this.snapshot)return;const groups=this.snapshot.groups.slice().sort((a,b)=>a.order-b.order);if(groups[index]){this.activeID=groups[index].id;this.render(true);}}
  scroll(index){if(this.activeID){this.positions[this.activeID]=Math.max(0,Math.floor(index));this.render(true);}}
  updateTime(saved){this.time=new TimeState(saved);this.render(true);}
  preferences(){return {activeID:this.activeID,positions:{...this.positions}};}
  render(force) {
    if(!this.visible||!this.snapshot)return;
    const time=this.time.observe(this.options.clock()),second=time.unixSeconds;
    if(!force&&second===this.second)return;this.second=second;
    const groups=this.snapshot.groups.slice().sort((a,b)=>a.order-b.order);
    if(!groups.some(g=>g.id===this.activeID))this.activeID=groups[0].id;
    const positions={};
    for(const group of groups)positions[group.id]=Math.min(this.positions[group.id]||0,Math.max(0,this.snapshot.accounts.filter(a=>a.groupID===group.id).length-1));
    this.positions=positions;
    this.options.publish({trusted:time.trusted,index:groups.findIndex(g=>g.id===this.activeID),groups:groups.map(g=>({id:g.id,name:g.name,start:positions[g.id],rows:rows(this.snapshot,g.id,time,positions[g.id],g.id===this.activeID?4:0)}))});
  }
}
