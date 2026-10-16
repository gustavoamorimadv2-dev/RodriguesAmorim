import { WHATSAPP_API_URL } from './whatsapp-config.js';
export function setupWhatsApp(auth) {
  const button=document.getElementById('connectWhatsApp');
  const dialog=document.getElementById('whatsappDialog');
  const status=document.getElementById('whatsappStatus');
  const qr=document.getElementById('whatsappQr');
  const connect=document.getElementById('whatsappStart');
  const toggle=document.getElementById('whatsappAutomation');
  let timer, pending=false, previousFocus;
  const labels={disconnected:'WhatsApp desconectado. Clique em Conectar para gerar o QR code.',connecting:'Preparando a conexão. Aguarde…',qr:'No celular, abra WhatsApp → Aparelhos conectados → Conectar um aparelho.',connected:'WhatsApp conectado. A sessão será mantida no servidor.',error:'A conexão falhou. Clique em Conectar para tentar novamente.'};
  async function api(path='',body) {
    if(!WHATSAPP_API_URL) throw new Error('O serviço de WhatsApp ainda não foi configurado. Solicite a configuração ao administrador.');
    if(!auth.currentUser) throw new Error('Entre no CRM para conectar o WhatsApp.');
    const token=await auth.currentUser.getIdToken();
    const response=await fetch(`${WHATSAPP_API_URL.replace(/\/$/,'')}/api/whatsapp${path}`,{
      method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)
    });
    const result=await response.json();
    if(!response.ok) throw new Error(result.error || 'Não foi possível acessar o serviço.');
    return result;
  }
  async function refresh(){
    if(pending || !dialog.open) return;
    pending=true;
    try {
      const data=await api();
      if(!dialog.open) return;
      status.textContent=data.state==='connected' && !data.persisted?'WhatsApp conectado. Salvando a sessão com segurança; aguarde cerca de um minuto…':labels[data.state] || 'Verificando conexão…';
      qr.hidden=!data.qr;if(data.qr) qr.src=data.qr;else qr.removeAttribute('src');
      connect.disabled=['connected','connecting','qr'].includes(data.state);
      toggle.disabled=!data.enabled && (data.state!=='connected' || !data.persisted);toggle.checked=data.enabled;
      button.textContent=data.state==='connected'?'WhatsApp conectado':'Conectar WhatsApp';
    } catch(error){status.textContent=error.message;qr.hidden=true;qr.removeAttribute('src');toggle.disabled=true;connect.disabled=!WHATSAPP_API_URL;}
    finally{pending=false;}
  }
  button.addEventListener('click',()=>{
    previousFocus=document.activeElement;dialog.showModal();
    toggle.disabled=true;status.textContent='Verificando conexão…';
    void refresh();timer=setInterval(refresh,3000);
  });
  document.getElementById('whatsappClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{clearInterval(timer);qr.removeAttribute('src');qr.hidden=true;previousFocus?.focus();});
  connect.addEventListener('click',async()=>{
    connect.disabled=true;
    try{await api('/connect',{});status.textContent='Gerando QR code…';await refresh();}
    catch(error){status.textContent=error.message;connect.disabled=false;}
  });
  toggle.addEventListener('change',async()=>{
    const desired=toggle.checked;toggle.disabled=true;
    try{await api('/automation',{enabled:desired});}
    catch(error){toggle.checked=!desired;status.textContent=error.message;}
    finally{toggle.disabled=false;}
  });
}
