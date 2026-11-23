import whatsapp from 'whatsapp-web.js';
const {Client}=whatsapp;

// Current logged-out WhatsApp Web exposes its QR before the legacy Socket model.
// Read the same official data-ref rendered in the page; never synthesize ready/auth events.
export async function bridgeLoginQr({page,emitQr,signal,intervalMs=1000}){
  let previous=null,busy=false;
  const publish=async()=>{
    if(busy || signal.aborted)return;
    busy=true;
    try{
      const state=await page.evaluate(()=>({socket:!!window.require?.('WAWebSocketModel')?.Socket,qr:document.querySelector('[data-ref]')?.getAttribute('data-ref') || null}));
      if(!signal.aborted && !state.socket && state.qr && state.qr!==previous){previous=state.qr;emitQr(state.qr);}
    }finally{busy=false;}
  };
  const timer=setInterval(()=>void publish().catch(()=>{}),intervalMs);
  try{
    await publish().catch(()=>{});
    await page.waitForFunction(()=>!!window.require?.('WAWebSocketModel')?.Socket,{timeout:0,polling:500,signal});
  }finally{clearInterval(timer);}
}

export class CompatibleClient extends Client {
  async inject(){
    this.loginBridgeAbort?.abort();
    const abort=new AbortController();this.loginBridgeAbort=abort;
    try{await bridgeLoginQr({page:this.pupPage,emitQr:qr=>this.emit('qr',qr),signal:abort.signal});}
    catch(error){if(abort.signal.aborted)return;throw error;}
    if(!abort.signal.aborted)return super.inject();
  }
  async destroy(){this.loginBridgeAbort?.abort();return super.destroy();}
}
