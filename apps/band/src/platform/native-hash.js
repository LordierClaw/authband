// Adapt Vela's one-shot binary digest to StableLib's Hash interface.
// Probe each algorithm lazily: some firmware exposes only part of system.crypto.
const vectors={
  sha1:'469444b80f6145000acea6dafd077a9adb0c7fa4',
  sha256:'cfe2a57fb25cf3772b5ac499ea03caba2f066a396b1e52d3743f8a205de41f19',
  sha512:'245f0fe05fbcfcca404b3f1c5afdaf0db54982a2731751fed346223119e6e612aaa75c076f2470c9f98d34d9a5e177446a95ad8bd861133741b578b73d1469d7'
};

export function nativeHashes(api) {
  const types=Object.create(null);
  return {
    disable(algorithm){types[algorithm]=null;},
    get(algorithm) {
      if(!api||typeof api.hashDigest!=='function'||!vectors[algorithm])return null;
      if(algorithm in types)return types[algorithm];
      const probe=new Uint8Array([0,128,255,1]);
      try {
        if(api.hashDigest({algo:algorithm.toUpperCase(),data:probe})!==vectors[algorithm])throw Error('Binary digest unavailable');
      } catch {types[algorithm]=null;return null;} finally {probe.fill(0);}
      class NativeHash {
        constructor(){this.blockSize=algorithm==='sha512'?128:64;this.digestLength=vectors[algorithm].length/2;this.chunks=[];this.result=null;}
        update(data){if(this.result)throw Error('Hash finalized');this.chunks.push(new Uint8Array(data));return this;}
        finish(out) {
          if(!this.result) {
            const bytes=new Uint8Array(this.chunks.reduce((n,c)=>n+c.length,0));let offset=0;
            for(const chunk of this.chunks){bytes.set(chunk,offset);offset+=chunk.length;chunk.fill(0);}this.chunks=[];
            try {
              const value=api.hashDigest({algo:algorithm.toUpperCase(),data:bytes});
              if(typeof value!=='string'||value.length!==this.digestLength*2||!/^[0-9a-f]+$/i.test(value))throw Error('Invalid native digest');
              this.result=new Uint8Array(this.digestLength);
              for(let i=0;i<this.result.length;i++)this.result[i]=parseInt(value.slice(i*2,i*2+2),16);
            } finally {bytes.fill(0);}
          }
          out.set(this.result);return this;
        }
        digest(){const out=new Uint8Array(this.digestLength);this.finish(out);return out;}
        clean(){for(const chunk of this.chunks)chunk.fill(0);this.chunks=[];if(this.result)this.result.fill(0);this.result=null;return this;}
      }
      types[algorithm]=NativeHash;return NativeHash;
    }
  };
}
