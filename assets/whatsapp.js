import { WHATSAPP_API_URL } from './whatsapp-config.js';
export function setupWhatsApp(auth) {
  const button=document.getElementById('connectWhatsApp');
  const dialog=document.getElementById('whatsappDialog');
  const status=document.getElementById('whatsappStatus');
  const qr=document.getElementById('whatsappQr');
  const connect=document.getElementById('whatsappStart');
  const toggle=document.getElementById('whatsappAutomation');
  const fresh=document.getElementById('whatsappFresh');
  const billingStatus=document.getElementById('whatsappBillingStatus');
  let timer, pending=false, previousFocus;
  const labels={disconnected:'WhatsApp desconectado. Clique em Conectar para gerar o QR code.',connecting:'Preparando a conexão. Aguarde…',qr:'No celular, abra WhatsApp → Aparelhos conectados → Conectar um aparelho.',connected:'WhatsApp conectado. A sessão será mantida no servidor.',error:'A conexão falhou. Clique em Conectar para tentar novamente.'};
  async function api(path='',body) {
    if(!WHATSAPP_API_URL) throw new Error('O serviço de WhatsApp ainda não foi configurado. Solicite a configuração ao administrador.');
    if(!auth.currentUser && auth.authStateReady) await auth.authStateReady();
    if(!auth.currentUser) throw new Error('Entre no CRM para conectar o WhatsApp.');
    const token=await auth.currentUser.getIdToken();
    const response=await fetch(`${WHATSAPP_API_URL.replace(/\/$/,'')}/api/whatsapp${path}`,{
      method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)
    });
    const result=await response.json().catch(()=>({error:'O servidor não respondeu corretamente. Tente novamente.'}));
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
      if(data.error==='timeout') status.textContent='A conexão demorou além do esperado. Tente novamente ou gere um novo QR.';
      else if(data.state==='error') status.textContent='Não foi possível recuperar a conexão. Tente novamente ou gere um novo QR para conectar seu telefone.';
      if(fresh){fresh.hidden=!['error','disconnected'].includes(data.state);fresh.disabled=false;}
      if(billingStatus) billingStatus.textContent=data.enabled?(data.state==='connected' && data.persisted?'Lembretes ativados: parcelas em aberto serão verificadas automaticamente.':'Lembretes ativados, mas aguardando a conexão do WhatsApp.'):(data.state==='connected' && data.persisted?'Lembretes desativados. Ative a opção de lembretes para começar.':'Lembretes desativados. Primeiro conecte o WhatsApp e aguarde salvar a sessão.');
      qr.hidden=!data.qr;if(data.qr) qr.src=data.qr;else qr.removeAttribute('src');
      connect.disabled=['connected','connecting','qr'].includes(data.state);
      toggle.disabled=!data.enabled && (data.state!=='connected' || !data.persisted);toggle.checked=data.enabled;
      button.textContent=data.state==='connected'?'WhatsApp conectado':'Conectar WhatsApp';
    } catch(error){status.textContent=error.name==='TimeoutError'?'O servidor demorou para responder. Tente novamente.':error.message;if(fresh) fresh.hidden=true;qr.hidden=true;qr.removeAttribute('src');toggle.disabled=true;connect.disabled=!WHATSAPP_API_URL;}
    finally{pending=false;}
  }
  button.addEventListener('click',()=>{
    if(location.protocol!=='https:' && !['localhost','127.0.0.1'].includes(location.hostname)){
      location.assign('https://rodrigues-amr.web.app/login.html');return;
    }
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
  fresh?.addEventListener('click',async()=>{
    if(!confirm('Gerar um novo QR para reconectar o telefone? A sessão salva só será substituída depois de um novo pareamento bem-sucedido.'))return;
    fresh.disabled=true;connect.disabled=true;
    try{await api('/connect',{fresh:true});status.textContent='Gerando um novo QR…';await refresh();}
    catch(error){status.textContent=error.message;fresh.disabled=false;connect.disabled=false;}
  });
  toggle.addEventListener('change',async()=>{
    const desired=toggle.checked;toggle.disabled=true;
    try{await api('/automation',{enabled:desired});if(billingStatus) billingStatus.textContent=desired?'Lembretes ativados. O sistema verificará as parcelas automaticamente.':'Lembretes desativados.';}
    catch(error){toggle.checked=!desired;status.textContent=error.message;}
    finally{toggle.disabled=false;}
  });
}
