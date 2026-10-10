export class TimeState {
  constructor(saved) {
    this.trusted=!!saved&&Number.isFinite(saved.offset)&&Number.isFinite(saved.wallMs)&&saved.wallMs>=0&&Number.isFinite(saved.uncertainty)&&saved.uncertainty>=0&&saved.uncertainty<=500;
    this.offset=this.trusted?saved.offset:0;this.lastWall=this.trusted?saved.wallMs:null;this.lastMono=null;this.uncertainty=this.trusted?saved.uncertainty:0;
  }
  observe(wallMs,monotonicMs) {
    if(!Number.isFinite(wallMs)||wallMs<0) this.trusted=false;
    if(this.lastWall!==null && wallMs<this.lastWall-1000) this.trusted=false;
    if(this.lastMono!==null && Number.isFinite(monotonicMs) && Math.abs((wallMs-this.lastWall)-(monotonicMs-this.lastMono))>2000) this.trusted=false;
    this.lastWall=wallMs;this.lastMono=Number.isFinite(monotonicMs)?monotonicMs:null;
    return {trusted:this.trusted,unixSeconds:Math.floor((wallMs+this.offset)/1000)};
  }
  applySample(sample) {
    if(!sample || !Number.isFinite(sample.phoneMs)||!Number.isFinite(sample.wallMs)||sample.phoneMs<0||sample.wallMs<0||!Number.isFinite(sample.rttMs)||sample.rttMs<0||sample.rttMs>1000)throw new Error('Invalid time sample');
    this.offset=sample.phoneMs+sample.rttMs/2-sample.wallMs;this.uncertainty=sample.rttMs/2;this.trusted=true;this.lastWall=sample.wallMs;this.lastMono=null;
    return {offset:this.offset,uncertainty:this.uncertainty,wallMs:sample.wallMs};
  }
}
