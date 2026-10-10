import {totp} from './totp.js';
import {unbase64} from './encoding.js';
export function rows(snapshot,groupID,time) {
  return snapshot.accounts.filter(a=>a.groupID===groupID).sort((a,b)=>a.order-b.order).map(a=>{
    let value=a.parameters.digits===8?'---- ----':'--- ---',remaining=0;
    if(time.trusted) {
      const key=unbase64(a.secret);
      try {const otp=totp(key,a.parameters,time.unixSeconds);const half=a.parameters.digits/2;value=otp.value.slice(0,half)+' '+otp.value.slice(half);remaining=otp.validUntil-time.unixSeconds;} finally {key.fill(0);}
    }
    return {id:a.id,issuer:a.issuer,label:a.label,code:value,remaining,small:a.parameters.digits===8,progress:Math.round(remaining/a.parameters.period*100)};
  });
}
