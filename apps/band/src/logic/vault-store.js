import {encodeSnapshot,decodeSnapshot} from './snapshot.js';
import {utf8,text,hex} from './encoding.js';
import {digest} from './hash.js';
export class VaultStore {
  constructor(io) {this.io=io;this.busy=false;}
  async readHead() {
    const raw=await this.io.read('vault.head');
    if(raw===null) {
      if(await this.io.read('vault.0')!==null || await this.io.read('vault.1')!==null)throw new Error('Ambiguous vault');
      return null;
    }
    if(raw.length>512)throw new Error('Invalid journal');
    const head=JSON.parse(raw);
    if(!head || [0,1].indexOf(head.slot)<0 || !/^[a-f0-9]{64}$/.test(head.digest))throw new Error('Invalid journal');
    return head;
  }
  async load() {
    // Read the small, bounded journal/slots together on the first-frame path.
    // Only the journal-selected slot is eligible; never recover an obsolete slot.
    const [marker,zero,one]=await Promise.all(['vault.head','vault.0','vault.1'].map(key=>this.io.read(key)));
    if(marker===null) {
      if(zero!==null||one!==null)throw new Error('Ambiguous vault');
      return null;
    }
    if(marker.length>512)throw new Error('Invalid journal');
    const head=JSON.parse(marker);
    if(!head||[0,1].indexOf(head.slot)<0||!/^[a-f0-9]{64}$/.test(head.digest))throw new Error('Invalid journal');
    const raw=head.slot===0?zero:one;
    if(typeof raw!=='string'||raw.length>65536||hex(digest(utf8(raw)))!==head.digest)throw new Error('Vault integrity');
    return decodeSnapshot(utf8(raw));
  }
  async confirmed() {
    if(this.busy)throw new Error('Vault busy');this.busy=true;
    try {
      const head=await this.readHead();if(!head)return null;
      const value=await this.load();
      await this.io.remove('vault.'+(1-head.slot));
      if(await this.io.read('vault.'+(1-head.slot))!==null)throw new Error('Deletion failed');
      return value;
    } finally {this.busy=false;}
  }
  async commit(value) {
    if(this.busy)throw new Error('Vault busy');this.busy=true;
    try {
      const bytes=encodeSnapshot(value), head=await this.readHead();
      if(head) {
        const old=await this.load();
        if(old.vaultID!==value.vaultID || Number(value.revision)<Number(old.revision))throw new Error('Stale vault');
        if(old.revision===value.revision && head.digest!==hex(digest(bytes)))throw new Error('Conflicting revision');
      }
      const slot=head?1-head.slot:0, raw=text(bytes), hash=hex(digest(bytes));
      await this.io.write('vault.'+slot,raw);
      if(await this.io.read('vault.'+slot)!==raw)throw new Error('Readback failed');
      const marker=JSON.stringify({slot,digest:hash});
      await this.io.write('vault.head',marker);
      if(await this.io.read('vault.head')!==marker)throw new Error('Journal readback failed');
      await this.io.remove('vault.'+(1-slot));
      if(await this.io.read('vault.'+(1-slot))!==null)throw new Error('Deletion failed');
      return {vaultID:value.vaultID,revision:value.revision,digest:hash};
    } finally {this.busy=false;}
  }
}
