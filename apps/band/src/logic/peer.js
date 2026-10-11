import {ProtectedChannel,verifyHello} from './protected-channel.js';
import {utf8,text,base64,unbase64,decimal} from './encoding.js';
export class PairingInput {
  constructor(){this.value='';}
  add(char){if(/^[0-9A-F]$/.test(char)&&this.value.length<32)this.value+=char;}
  back(){this.value=this.value.slice(0,-1);}
  cancel(){this.value='';}
  get complete(){return this.value.length===32;}
  get length(){return this.value.length;}
  get mask(){return '*'.repeat(this.length);}
  bytes(){if(!this.complete)throw new Error('Incomplete key');const b=new Uint8Array(16);for(let i=0;i<16;i++)b[i]=parseInt(this.value.slice(i*2,i*2+2),16);return b;}
}
export class Peer {
  constructor(io,receiver,options){this.io=io;this.receiver=receiver;this.allowEnrollment=!!(options&&options.allowEnrollment);this.channel=null;this.busy=false;this.lastHello=null;this.response=null;this.generation=0;}
  async state(){
    if(await this.io.read('erasing')!==null)throw new Error('Erase incomplete');
    const raw=await this.io.read('pairing');if(raw===null)return null;
    if(raw.length>512)throw new Error('Pairing corrupt');const state=JSON.parse(raw);
    if(state.v!==1||typeof state.key!=='string'||unbase64(state.key).length!==16||decimal(state.epoch)<0||(state.pairID!==null&&!/^[0-9A-F-]{36}$/.test(state.pairID)))throw new Error('Pairing corrupt');
    return state;
  }
  async persist(state){const raw=JSON.stringify(state);await this.io.write('pairing',raw);if(await this.io.read('pairing')!==raw)throw new Error('Pairing readback');}
  async enroll(key){
    if(this.busy||key.length!==16)throw new Error('Pairing unavailable');this.busy=true;
    try {if(await this.state()!==null||await this.io.read('vault.head')!==null||await this.io.read('vault.0')!==null||await this.io.read('vault.1')!==null)throw new Error('Local erase required');await this.persist({v:1,key:base64(key),pairID:null,epoch:'0'});}finally{this.busy=false;}
  }
  async erase(){
    if(this.busy)throw new Error('Operation active');this.busy=true;this.close();
    try {
      await this.io.write('erasing','1');if(await this.io.read('erasing')!=='1')throw new Error('Erase marker');
      for(const key of ['vault.0','vault.1','vault.head','pairing','clock']){await this.io.remove(key);if(await this.io.read(key)!==null)throw new Error('Erase failed');}
      await this.io.remove('erasing');if(await this.io.read('erasing')!==null)throw new Error('Erase failed');
    } finally {this.busy=false;}
  }
  async receive(envelope){
    if(this.busy)throw new Error('Operation active');
    if(!envelope||utf8(JSON.stringify(envelope)).length>512||envelope.v!==1||envelope.src!=='ios'||envelope.type!=='message'||typeof envelope.id!=='string'||!/^[\x20-\x7e]{1,32}$/.test(envelope.id))throw new Error('Invalid envelope');
    this.busy=true;const generation=this.generation;
    try {
      if(envelope.topic==='auth.enroll') {
        // Capability-only bootstrap over the phone's authenticated BlueBand link.
        // It cannot replace an owner, reset an epoch, or adopt an orphaned vault.
        const body=envelope.body;
        if(!this.allowEnrollment||!body||typeof body.key!=='string'||body.key.length!==24||unbase64(body.key).length!==16||!/^[0-9A-F-]{36}$/.test(body.pairID))throw new Error('Enrollment unavailable');
        const state=await this.state();
        if(state) {
          if(state.key!==body.key||(state.pairID!==null&&state.pairID!==body.pairID))throw new Error('Already enrolled');
        } else {
          const slots=await Promise.all(['vault.head','vault.0','vault.1'].map(key=>this.io.read(key)));
          if(slots.some(value=>value!==null)||generation!==this.generation)throw new Error('Local erase required');
          await this.persist({v:1,key:body.key,pairID:body.pairID,epoch:'0'});
        }
        if(generation!==this.generation)throw new Error('Closed');
        return {topic:'auth.enrolled',body:{pairID:body.pairID}};
      }
      if(envelope.topic==='auth.hello') {
        const raw=JSON.stringify(envelope.body);
        if(this.channel&&raw===this.lastHello)return this.helloResponse;
        this.close();const token=this.generation,state=await this.state();if(!state)throw new Error('Not enrolled');
        const key=unbase64(state.key);let options;
        try {options=verifyHello(key,envelope.body,state.epoch);if(state.pairID!==null&&options.pairID!==state.pairID)throw new Error('Wrong phone');
          await this.persist({v:1,key:state.key,pairID:options.pairID,epoch:options.epoch});
          if(token!==this.generation)throw new Error('Closed');
          this.channel=new ProtectedChannel(options,'band');
        } finally {key.fill(0);}
        this.lastHello=raw;this.helloResponse={topic:'auth.frame',body:this.channel.seal('session.ready',utf8('{}'))};return this.helloResponse;
      }
      if(envelope.topic!=='auth.frame'||!this.channel)throw new Error('No protected session');
      const opened=this.channel.open(envelope.body);
      if(opened.duplicate){if(!this.response)throw new Error('No response');return this.response;}
      let result;
      try {result=await this.receiver.handle(opened.topic,JSON.parse(text(opened.payload)));}
      catch {let request;try{request=JSON.parse(text(opened.payload)).request}catch{};if(typeof request!=='string'||request.length>16)throw new Error('Invalid request');result={topic:'request.failed',body:{request}};}
      if(generation!==this.generation||!this.channel)throw new Error('Closed');
      this.response={topic:'auth.frame',body:this.channel.seal(result.topic,utf8(JSON.stringify(result.body)))};return this.response;
    } finally {this.busy=false;}
  }
  close(){this.generation++;if(this.channel)this.channel.close();this.channel=null;this.lastHello=null;this.helloResponse=null;this.response=null;this.receiver.abort();}
}
