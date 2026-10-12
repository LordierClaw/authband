export class FileStore {
  constructor(file,timeoutMs) {this.file=file;this.timeoutMs=timeoutMs||5000;this.poisoned=false;this.pending=0;this.waiters=[];}
  // Exit waits briefly for native callbacks so none land in a VM being torn down.
  idle(callback) {if(this.pending===0)callback();else this.waiters.push(callback);}
  settle() {this.pending--;if(this.pending===0)this.waiters.splice(0).forEach(fn=>fn());}
  call(method,key,value) {
    if(this.poisoned)return Promise.reject(new Error('Storage requires restart'));
    if(!/^[a-z0-9.-]{1,40}$/.test(key))return Promise.reject(new Error('Invalid file key'));
    const self=this;self.pending++;
    return new Promise((resolve,reject)=>{
      let done=false;
      const timer=setTimeout(()=>{if(done)return;done=true;self.poisoned=true;self.settle();reject(new Error('Storage timeout'));},self.timeoutMs);
      const options={uri:'internal://files/authband-'+key,success:result=>{if(done)return;done=true;clearTimeout(timer);self.settle();resolve(method==='readText'?result.text:null);},fail:(data,code)=>{if(done)return;done=true;clearTimeout(timer);self.settle();if(code===301&&method==='readText')resolve(null);else reject(new Error('Storage IO'));}};
      if(method==='writeText') {options.text=value;options.append=false;options.encoding='utf-8';}
      try {self.file[method](options);} catch(e) {done=true;clearTimeout(timer);self.settle();reject(new Error('Storage unavailable'));}
    });
  }
  read(key) {return this.call('readText',key);}
  write(key,value) {return this.call('writeText',key,value);}
  async remove(key) {if(await this.read(key)!==null)await this.call('delete',key);}
}
