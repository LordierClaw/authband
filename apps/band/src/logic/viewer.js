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
  constructor(options) {
    this.options=options;this.generation=0;this.tickGeneration=0;this.timer=null;
    this.visible=false;this.dead=false;this.snapshot=null;this.time=null;
    this.activeID=null;this.positions={};this.second=null;this.trusted=null;
    this.groups=[];this.accountsByGroup=Object.create(null);this.cache=Object.create(null);
    this.screen='list';this.detail=null;this.selectedAccount=null;this.loading=false;
  }
  async show() {
    if(this.dead)return;this.hide();this.visible=true;this.loading=true;const token=this.generation;
    const loaded=await this.options.load();
    if(!this.visible||token!==this.generation||this.dead)return;
    this.cache=Object.create(null);
    if(!this.snapshot && loaded.preferences && typeof loaded.preferences==='object') {
      this.activeID=loaded.preferences.activeID;
      const saved=loaded.preferences.positions;
      if(saved && typeof saved==='object')for(const group of loaded.snapshot.groups)if(Number.isInteger(saved[group.id]) && saved[group.id]>=0 && saved[group.id]<20)this.positions[group.id]=saved[group.id];
    }
    this.snapshot=loaded.snapshot;if(!this.time)this.time=new TimeState(loaded.time);
    this.groups=this.snapshot.groups.slice().sort((a,b)=>a.order-b.order).map(g=>({id:g.id,name:g.name,start:0,mounted:false,rows:[]}));
    this.accountsByGroup=Object.create(null);
    for(const group of this.groups)this.accountsByGroup[group.id.toLowerCase()]=[];
    for(const account of this.snapshot.accounts)this.accountsByGroup[account.groupID.toLowerCase()].push(account);
    const positions={};
    for(const group of this.groups) {
      const accounts=this.accountsByGroup[group.id.toLowerCase()];accounts.sort((a,b)=>a.order-b.order);
      positions[group.id]=Math.min(this.positions[group.id]||0,Math.max(0,accounts.length-1));
      group.start=positions[group.id];
    }
    this.positions=positions;
    if(!this.groups.some(g=>g.id===this.activeID))this.activeID=this.groups[0].id;
    this.loading=false;this.mountWindow(0);this.render(true);
  }
  stopTimer() {
    this.tickGeneration++;
    if(this.timer!==null)this.options.scheduler.clear(this.timer);
    this.timer=null;
  }
  schedule() {
    if(this.timer!==null||!this.visible||this.dead||this.loading||!this.selectedAccount||this.screen!=='detail')return;
    const generation=this.generation,tick=this.tickGeneration;
    const now=this.options.clock()+(this.time?this.time.offset:0);
    const delay=Number.isFinite(now)?1000-((now%1000+1000)%1000):1000;
    const id=this.options.scheduler.set(()=>{
      if(generation!==this.generation||tick!==this.tickGeneration||this.timer!==id)return;
      this.options.scheduler.clear(id);this.timer=null;
      this.render(false);this.schedule();
    },delay);
    this.timer=id;
  }
  hide(){this.generation++;this.visible=false;this.loading=false;this.stopTimer();this.cache=Object.create(null);this.screen='list';this.detail=null;this.selectedAccount=null;}
  destroy(){this.hide();this.dead=true;this.snapshot=null;this.time=null;this.groups=[];this.accountsByGroup=Object.create(null);}
  mountWindow(radius,keepNeighbors=false) {
    const active=this.groups.findIndex(g=>g.id===this.activeID);let changed=false;
    for(let i=0;i<this.groups.length;i++) {
      const group=this.groups[i],distance=Math.abs(i-active);
      const mounted=distance<=radius||(keepNeighbors&&distance<=1&&group.mounted);
      if(group.mounted===mounted)continue;
      group.rows=mounted?this.accountsByGroup[group.id.toLowerCase()].map(a=>({id:a.id,issuer:a.issuer,label:a.label})):[];
      group.mounted=mounted;changed=true;
    }
    return changed;
  }
  prepareNeighbors() {
    if(!this.visible||this.dead||this.loading||!this.snapshot||this.screen!=='list')return;
    if(this.mountWindow(1))this.render(true);
  }
  select(index) {
    if(!this.visible||this.loading||this.screen!=='list'||!Number.isInteger(index)||!this.groups[index]||this.groups[index].id===this.activeID)return;
    this.activeID=this.groups[index].id;this.mountWindow(0,true);this.render(true);
  }
  scroll(index) {
    if(!this.visible||this.loading||this.screen!=='list'||!this.snapshot||!Number.isFinite(index)||!this.activeID)return;
    const next=Math.min(Math.max(0,Math.floor(index)),Math.max(0,this.accountsByGroup[this.activeID.toLowerCase()].length-1));
    if(next===this.positions[this.activeID])return;
    this.positions[this.activeID]=next;
    this.groups.find(g=>g.id===this.activeID).start=next;
  }
  setScreen(screen,detailID=null) {
    if(screen==='detail') {
      if(!this.visible||this.dead||this.loading||!this.snapshot)return false;
      const account=this.accountsByGroup[this.activeID.toLowerCase()].find(a=>a.id===detailID);
      if(!account)return false;
      this.selectedAccount=account;
      this.detail={id:account.id,issuer:account.issuer,label:account.label,code:'',remaining:0};
    } else {this.selectedAccount=null;this.detail=null;}
    this.stopTimer();this.screen=screen;
    this.render(true);this.schedule();return true;
  }
  updateTime(saved){this.stopTimer();this.time=new TimeState(saved);this.render(true);this.schedule();}
  preferences(){return {activeID:this.activeID,positions:{...this.positions}};}
  render(force) {
    if(!this.visible||this.loading||!this.snapshot||(this.screen!=='list'&&this.screen!=='detail'))return;
    if(this.screen==='list') {
      if(force)this.options.publish({trusted:this.time.trusted,index:this.groups.findIndex(g=>g.id===this.activeID),groups:this.groups,detail:null});
      return;
    }
    const time=this.time.observe(this.options.clock()),second=time.unixSeconds;
    if(!force&&second===this.second&&time.trusted===this.trusted)return;
    if(!time.trusted&&this.trusted!==false)this.cache=Object.create(null);
    this.second=second;this.trusted=time.trusted;
    const index=this.groups.findIndex(g=>g.id===this.activeID);
    const account=this.selectedAccount,row=this.detail;
    if(row&&account) {
      let code=account.parameters.digits===8?'---- ----':'--- ---',remaining=0;
      if(time.trusted) {
        let otp=this.cache[account.id];
        // Cache only the result, never decoded key bytes, for this counter window.
        if(!otp||second<otp.validFrom||second>=otp.validUntil) {
          const key=unbase64(account.secret);
          try {otp=totp(key,account.parameters,second);this.cache[account.id]=otp;}finally{key.fill(0);}
        }
        const half=account.parameters.digits/2;
        code=otp.value.slice(0,half)+' '+otp.value.slice(half);remaining=otp.validUntil-second;
      }
      if(row.code!==code)row.code=code;
      if(row.remaining!==remaining)row.remaining=remaining;
    }
    this.options.publish({trusted:time.trusted,index,groups:this.groups,detail:this.detail});
  }
}
