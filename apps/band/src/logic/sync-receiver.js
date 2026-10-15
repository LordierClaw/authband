import {decodeSnapshot,encodeSnapshot} from './snapshot.js';
import {digest} from './hash.js';
import {hex,unbase64,decimal} from './encoding.js';
const publicFingerprint='6ed645ef0e1abea1bf1e4e935ff04f9e18d39812387f63cda3415b46240f0405';
export class SyncReceiver {
  constructor(store,allowRealSecrets,options) {this.store=store;this.allowRealSecrets=allowRealSecrets;this.options=options||{};this.pending=null;this.busy=false;}
  abort() {if(this.pending)this.pending.bytes.fill(0);this.pending=null;}
  async handle(topic,body) {
    if(this.busy)throw new Error('Receiver busy');
    if(!body||typeof body.request!=='string'||!/^[a-zA-Z0-9-]{1,16}$/.test(body.request))throw new Error('Invalid request');
    this.busy=true;let reply={},replyTopic=topic+'.ok';
    try {
      if(topic==='vault.status') {
        const value=await this.store.confirmed();reply=value?{vaultID:value.vaultID,revision:value.revision,digest:hex(digest(encodeSnapshot(value)))}:{empty:true};
      } else if(topic==='vault.begin') {
        if(this.pending)throw new Error('Transfer active');
        if(!Number.isInteger(body.byteCount)||body.byteCount<1||body.byteCount>65536||!(/^[0-9a-f]{64}$/).test(body.digest)||typeof body.vaultID!=='string'||body.vaultID.length!==36)throw new Error('Invalid manifest');
        decimal(body.revision);
        this.pending={vaultID:body.vaultID,revision:body.revision,digest:body.digest,bytes:new Uint8Array(body.byteCount),offset:0};
      } else if(topic==='vault.chunk') {
        if(!this.pending||body.offset!==this.pending.offset||typeof body.data!=='string'||body.data.length>128)throw new Error('Unexpected chunk');
        const bytes=unbase64(body.data);if(bytes.length<1||bytes.length>96||bytes.length+body.offset>this.pending.bytes.length)throw new Error('Invalid chunk');
        this.pending.bytes.set(bytes,body.offset);this.pending.offset+=bytes.length;reply.offset=this.pending.offset;
      } else if(topic==='vault.commit') {
        const p=this.pending;if(!p||p.offset!==p.bytes.length)throw new Error('Incomplete transfer');
        if(hex(digest(p.bytes))!==p.digest){this.abort();throw new Error('Digest mismatch');}
        const value=decodeSnapshot(p.bytes);
        if(value.vaultID!==p.vaultID||value.revision!==p.revision)throw new Error('Manifest mismatch');
        if(!this.allowRealSecrets&&value.accounts.some(a=>hex(digest(unbase64(a.secret)))!==publicFingerprint))throw new Error('Hardware acceptance required');
        reply=await this.store.commit(value);replyTopic='vault.committed';this.abort();
        if(this.options.committed)this.options.committed(value);
      } else if(topic==='vault.abort') {this.abort();
      } else if(topic==='time.probe') {reply.wallMs=Date.now();
      } else if(topic==='time.sample') {
        if(!this.options.timeSample)throw new Error('Time unavailable');await this.options.timeSample(body);
      } else throw new Error('Unknown topic');
      reply.request=body.request;return {topic:replyTopic,body:reply};
    } finally {this.busy=false;}
  }
}
