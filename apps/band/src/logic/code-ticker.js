import {totp} from './totp.js';
import {unbase64} from './encoding.js';
import {TimeState} from './time-state.js';
// One account, one timer aligned to the next corrected second. The OTP is
// computed once per counter window; decoded key bytes are wiped immediately.
export class CodeTicker {
  constructor(options) {
    this.options=options;this.account=options.account;this.time=new TimeState(options.time);
    this.timer=null;this.generation=0;this.otp=null;this.running=false;
  }
  start() {if(this.running||!this.account)return;this.running=true;this.generation++;this.render();this.schedule();}
  stop() {
    this.running=false;this.generation++;this.otp=null;
    if(this.timer!==null)this.options.scheduler.clear(this.timer);
    this.timer=null;
  }
  destroy() {this.stop();this.account=null;this.time=null;}
  updateTime(saved) {this.time=new TimeState(saved);this.otp=null;if(this.running)this.render();}
  schedule() {
    if(!this.running||this.timer!==null)return;
    const generation=this.generation,now=this.options.clock()+(this.time.trusted?this.time.offset:0);
    const delay=Number.isFinite(now)?1000-((now%1000+1000)%1000):1000;
    const id=this.options.scheduler.set(()=>{
      if(generation!==this.generation||this.timer!==id)return;
      this.timer=null;this.render();this.schedule();
    },delay);
    this.timer=id;
  }
  render() {
    const account=this.account;if(!account||!this.time)return;
    const p=account.parameters,observed=this.time.observe(this.options.clock()),second=observed.unixSeconds;
    let code=p.digits===8?'---- ----':'--- ---',remaining=0;
    if(observed.trusted) {
      if(!this.otp||second<this.otp.validFrom||second>=this.otp.validUntil) {
        const key=unbase64(account.secret);
        try {this.otp=totp(key,p,second);} finally {key.fill(0);}
      }
      const half=p.digits/2;code=this.otp.value.slice(0,half)+' '+this.otp.value.slice(half);remaining=this.otp.validUntil-second;
    } else this.otp=null;
    this.options.publish({code,remaining,period:p.period,trusted:observed.trusted});
  }
}
