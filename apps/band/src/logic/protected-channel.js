import {hmac,hkdf,sealGCM,openGCM} from './primitives.js';
import {utf8,base64,unbase64,decimal} from './encoding.js';
function validOptions(o) {
  if(!o||o.key.length!==16||o.salt.length!==32||!/^([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12})$/.test(o.pairID)||decimal(o.epoch)<1)throw new Error('Invalid session');
}
function equal(a,b){let diff=a.length^b.length;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;}
export function makeHello(o) {
  validOptions(o);const n=base64(o.salt);
  return {v:1,p:o.pairID,e:o.epoch,n,m:base64(hmac('sha256',o.key,utf8('AuthBand/hello/1\n'+o.pairID+'\n'+o.epoch+'\n'+n)))};
}
export function verifyHello(key,hello,highWater) {
  if(!hello||hello.v!==1||typeof hello.n!=='string'||hello.n.length!==44||typeof hello.m!=='string'||hello.m.length!==44||decimal(hello.e)<=decimal(highWater))throw new Error('Rejected hello');
  const options={key,pairID:hello.p,epoch:hello.e,salt:unbase64(hello.n)};
  validOptions(options);const expected=makeHello(options);
  if(expected.n!==hello.n||!equal(unbase64(expected.m),unbase64(hello.m)))throw new Error('Hello authentication');
  return options;
}
export class ProtectedChannel {
  constructor(o,direction) {
    validOptions(o);if(direction!=='phone'&&direction!=='band')throw new Error('Invalid direction');
    this.pairID=o.pairID;this.epoch=o.epoch;this.salt=base64(o.salt);this.direction=direction;this.other=direction==='phone'?'band':'phone';this.sent=0;this.received=0;this.last=null;
    this.tx=hkdf(o.key,o.salt,utf8('AuthBand/key/1\n'+o.pairID+'\n'+o.epoch+'\n'+direction),32);
    this.rx=hkdf(o.key,o.salt,utf8('AuthBand/key/1\n'+o.pairID+'\n'+o.epoch+'\n'+this.other),32);
  }
  nonce(direction,sequence) {const out=new Uint8Array(12);out[3]=direction==='phone'?1:2;for(let i=11;i>=4;i--){out[i]=sequence%256;sequence=Math.floor(sequence/256);}return out;}
  aad(direction,s,t) {return utf8('AuthBand/frame/1\n'+this.pairID+'\n'+this.epoch+'\n'+this.salt+'\n'+direction+'\n'+s+'\n'+t);}
  seal(topic,payload) {
    if(!this.tx||!(/^[a-z][a-z0-9.]{0,31}$/).test(topic)||payload.length>256||this.sent>=4294967295)throw new Error('Invalid frame');
    const sequence=this.sent+1,s=String(sequence),c=base64(sealGCM(this.tx,this.nonce(this.direction,sequence),payload,this.aad(this.direction,s,topic)));
    this.sent=sequence;return {v:1,e:this.epoch,s,t:topic,c};
  }
  open(frame) {
    if(!this.rx||!frame||frame.v!==1||frame.e!==this.epoch||typeof frame.t!=='string'||!(/^[a-z][a-z0-9.]{0,31}$/).test(frame.t)||typeof frame.c!=='string'||frame.c.length>364)throw new Error('Invalid frame');
    const seq=decimal(frame.s),fingerprint=JSON.stringify([frame.v,frame.e,frame.s,frame.t,frame.c]);
    if(this.last&&seq===this.received&&fingerprint===this.last.fingerprint)return {topic:this.last.topic,payload:this.last.payload,sequence:seq,duplicate:true};
    if(seq!==this.received+1||seq>4294967295)throw new Error('Unexpected sequence');
    const cipher=unbase64(frame.c);if(base64(cipher)!==frame.c)throw new Error('Noncanonical base64');
    const payload=openGCM(this.rx,this.nonce(this.other,seq),cipher,this.aad(this.other,frame.s,frame.t));
    this.received=seq;this.last={fingerprint,topic:frame.t,payload};return {topic:frame.t,payload,sequence:seq,duplicate:false};
  }
  close(){if(this.tx)this.tx.fill(0);if(this.rx)this.rx.fill(0);if(this.last)this.last.payload.fill(0);this.tx=null;this.rx=null;this.last=null;}
}
