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
    this.screen='codes';this.detailID=null;
  }
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
    this.groups=this.snapshot.groups.slice().sort((a,b)=>a.order-b.order).map(g=>({id:g.id,name:g.name,start:0,rows:[]}));
    this.accountsByGroup=Object.create(null);
    for(const group of this.groups)this.accountsByGroup[group.id]=[];
    for(const account of this.snapshot.accounts)this.accountsByGroup[account.groupID].push(account);
    const positions={};
    for(const group of this.groups) {
      const accounts=this.accountsByGroup[group.id];accounts.sort((a,b)=>a.order-b.order);
      positions[group.id]=Math.min(this.positions[group.id]||0,Math.max(0,accounts.length-1));
      group.start=positions[group.id];
    }
    this.positions=positions;
    if(!this.groups.some(g=>g.id===this.activeID))this.activeID=this.groups[0].id;
    this.mountActive();this.render(true);this.schedule();
  }
  stopTimer() {
    this.tickGeneration++;
    if(this.timer!==null)this.options.scheduler.clear(this.timer);
    this.timer=null;
  }
  schedule() {
    if(this.timer!==null||!this.visible||this.dead||!this.snapshot||!this.showingCodes())return;
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
  showingCodes(){return this.screen==='codes'||this.screen==='detail';}
  hide(){this.generation++;this.visible=false;this.stopTimer();this.cache=Object.create(null);}
  destroy(){this.hide();this.dead=true;this.snapshot=null;this.time=null;this.groups=[];this.accountsByGroup=Object.create(null);}
  mountActive() {
    for(const group of this.groups) {
      group.rows=group.id===this.activeID?this.accountsByGroup[group.id].map(a=>({
        id:a.id,issuer:a.issuer,label:a.label,code:a.parameters.digits===8?'---- ----':'--- ---',
        remaining:0,small:a.parameters.digits===8,progress:0
      })):[];
    }
  }
  select(index) {
    if(!Number.isInteger(index)||!this.groups[index]||this.groups[index].id===this.activeID)return;
    this.activeID=this.groups[index].id;this.mountActive();this.render(true);
  }
  scroll(index) {
    if(!this.snapshot||!Number.isFinite(index)||!this.activeID)return;
    const next=Math.min(Math.max(0,Math.floor(index)),Math.max(0,this.accountsByGroup[this.activeID].length-1));
    if(next===this.positions[this.activeID])return;
    this.positions[this.activeID]=next;
    this.groups.find(g=>g.id===this.activeID).start=next;
    this.render(true);
  }
  setScreen(screen,detailID=null) {
    this.stopTimer();this.screen=screen;this.detailID=detailID;
    this.render(true);this.schedule();
  }
  updateTime(saved){this.stopTimer();this.time=new TimeState(saved);this.render(true);this.schedule();}
  preferences(){return {activeID:this.activeID,positions:{...this.positions}};}
  render(force) {
    if(!this.visible||!this.snapshot||!this.showingCodes())return;
    const time=this.time.observe(this.options.clock()),second=time.unixSeconds;
    if(!force&&second===this.second&&time.trusted===this.trusted)return;
    if(!time.trusted&&this.trusted!==false)this.cache=Object.create(null);
    this.second=second;this.trusted=time.trusted;
    const index=this.groups.findIndex(g=>g.id===this.activeID),group=this.groups[index];
    const accounts=this.accountsByGroup[group.id],start=this.positions[group.id];
    for(let i=0;i<group.rows.length;i++) {
      const row=group.rows[i],account=accounts[i];
      if(time.trusted && (this.screen==='detail'?row.id!==this.detailID:i<start||i>=start+4))continue;
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
      const progress=Math.round(remaining/account.parameters.period*100);
      if(row.code!==code)row.code=code;
      if(row.remaining!==remaining)row.remaining=remaining;
      if(row.progress!==progress)row.progress=progress;
    }
    this.options.publish({trusted:time.trusted,index,groups:this.groups});
  }
}
