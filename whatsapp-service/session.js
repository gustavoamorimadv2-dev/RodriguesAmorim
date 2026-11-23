// Owns browser lifecycle independently of HTTP requests and ignores obsolete events.
export class WhatsAppSession {
  constructor({createClient,hasBackup,encodeQr,canRun,log=()=>{},timeoutMs=90_000,stopTimeoutMs=5_000,onStopFailure=()=>{}}) {
    Object.assign(this,{createClient,hasBackup,encodeQr,canRun,log,timeoutMs,stopTimeoutMs,onStopFailure});
    this.state='disconnected';this.client=null;this.qr=null;this.persisted=false;this.error=null;this.generation=0;this.qrSequence=0;this.closing=Promise.resolve();
  }
  current(generation) {return generation===this.generation && this.canRun();}
  clearDeadline(){clearTimeout(this.deadline);}
  armDeadline(generation){this.clearDeadline();this.deadline=setTimeout(()=>this.fail(generation,new Error('Session initialization timed out'),'timeout'),this.timeoutMs);this.deadline.unref?.();}
  dispose(client){
    if(!client)return this.closing;
    const operation=this.closing.then(()=>this.stopClient(client));this.closing=operation.catch(()=>{});return operation;
  }
  async stopClient(client){
    let timer;
    try{await Promise.race([Promise.resolve().then(()=>client.destroy()),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Browser shutdown timed out')),this.stopTimeoutMs);timer.unref?.();})]);}
    catch(error){this.onStopFailure(error);throw error;}
    finally{clearTimeout(timer);}
  }
  fail(generation,error,code='initialization_failed'){
    if(!this.current(generation))return;
    this.clearDeadline();this.generation++;this.qrSequence++;this.state='error';this.qr=null;this.error=code;
    const client=this.client;this.client=null;
    this.log('error',error);
    void this.dispose(client).catch(()=>{});
  }
  connect({fresh=false}={}){
    if(!this.canRun() || (!fresh && ['connecting','qr','connected'].includes(this.state)))return;
    const generation=++this.generation;
    const previous=this.client;this.client=null;this.state='connecting';this.qr=null;this.error=null;this.persisted=false;this.qrSequence++;
    this.armDeadline(generation);
    void this.initialize(generation,previous,fresh).catch(error=>this.fail(generation,error));
  }
  async initialize(generation,previous,fresh){
    await this.dispose(previous);
    if(!this.current(generation))return;
    const saved=fresh?false:await this.hasBackup();
    if(!this.current(generation))return;
    this.persisted=saved;
    const client=this.createClient({fresh,onSaved:()=>{if(this.current(generation)){this.persisted=true;this.log('saved');}}});this.client=client;
    client.on('qr',async value=>{
      if(!this.current(generation))return;
      this.clearDeadline();const sequence=++this.qrSequence;
      try{const image=await this.encodeQr(value);if(this.current(generation) && sequence===this.qrSequence){this.qr=image;this.state='qr';this.persisted=false;this.error=null;this.log('qr');}}
      catch(error){this.fail(generation,error,'qr_failed');}
    });
    client.on('authenticated',()=>{if(this.current(generation)){this.qrSequence++;this.qr=null;this.state='connecting';this.armDeadline(generation);}});
    client.on('ready',()=>{if(this.current(generation)){this.clearDeadline();this.qrSequence++;this.qr=null;this.state='connected';this.error=null;this.log('ready');}});
    client.on('remote_session_saved',()=>{if(this.current(generation)){this.persisted=true;this.log('saved');}});
    client.on('auth_failure',()=>this.fail(generation,new Error('Saved session rejected'),'auth_failure'));
    client.on('disconnected',()=>{if(this.current(generation)){this.clearDeadline();this.generation++;this.qrSequence++;this.qr=null;this.state='disconnected';this.persisted=false;this.error='disconnected';this.client=null;void this.dispose(client).catch(()=>{});}});
    await client.initialize();
  }
  async stop(){this.clearDeadline();this.generation++;this.qrSequence++;this.qr=null;this.state='disconnected';const client=this.client;this.client=null;await this.dispose(client);}
}

// Keep browser identity aligned instead of the library's fixed Chrome 101 default.
export function chromiumUserAgent(version){
  const value=String(version).match(/\b\d+\.\d+\.\d+\.\d+\b/)?.[0];
  if(!value)throw new Error('Could not detect installed Chromium version');
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${value} Safari/537.36`;
}
