import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
import { getStorage, ref, getBlob, uploadBytes } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-storage.js';

const $ = id => document.getElementById(id);
let auth, db, storage, currentReview, urls = [], subscriptions = [], generation = 0, reviewGeneration = 0;
const state = { users: [], credits: [] };
const statusText = value => ({ pendente:'Aguardando aprovação',aprovado:'Aprovado',rejeitado:'Rejeitado',rascunho:'Rascunho',em_auditoria:'Em auditoria',publicado:'Publicado' }[value] || value);
const money = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);
const feedback = text => { $('feedback').textContent = text; };
function node(tag, text, className) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; }
function cleanup() {
  generation++; subscriptions.forEach(fn => fn()); subscriptions = []; state.users=[]; state.credits=[];
  closeReview(); $('credit-owner').replaceChildren(); $('credit-form').reset(); $('admin-email').textContent=''; $('count-users').textContent='—'; $('count-credits').textContent='—'; $('users-list').replaceChildren(); $('credits-list').replaceChildren(); $('workspace').hidden = true; $('logout').hidden = true;
}
function closeReview() { reviewGeneration++; urls.forEach(url => URL.revokeObjectURL(url)); urls=[]; currentReview=null; $('review-reason').value=''; $('review-error').textContent=''; $('review-content').replaceChildren(); $('review-dialog').close(); }
function details(data) {
  const list = node('dl'); Object.entries(data).forEach(([label,value])=> { list.append(node('dt',label),node('dd',String(value ?? ''))); }); return list;
}
function empty(target,text) { target.replaceChildren(node('p',text,'empty')); }
function renderUsers() {
  const filtered = state.users.filter(u=>$('user-filter').value==='todos'||u.status===$('user-filter').value);
  const ownerSelect=$('credit-owner'),selected=ownerSelect.value;ownerSelect.replaceChildren();
  const placeholder=node('option','Selecione uma conta aprovada');placeholder.value='';ownerSelect.append(placeholder);
  state.users.filter(u=>u.status==='aprovado'&&['credor','broker'].includes(u.perfil)).forEach(u=>{const option=node('option',`${u.nome} • ${u.email}`);option.value=u.id;ownerSelect.append(option);});
  if(state.users.some(u=>u.id===selected))ownerSelect.value=selected;
  const target=$('users-list'); target.replaceChildren();
  if (!filtered.length) return empty(target,'Nenhum usuário neste status.');
  filtered.forEach(user=> {
    const row=node('article',undefined,'card record'), content=node('div');
    content.append(node('h3',user.nome),node('p',user.email),node('p',user.perfil),node('span',statusText(user.status),'badge'));
    const button=node('button','Revisar cadastro');button.onclick=()=>reviewUser(user); row.append(content,button);target.append(row);
  });
}
function renderCredits() {
  const filtered=state.credits.filter(c=>$('credit-filter').value==='todos'||c.status===$('credit-filter').value);
  const target=$('credits-list');target.replaceChildren();
  if (!filtered.length) return empty(target,'Nenhum precatório neste status.');
  filtered.forEach(credit=> {
    const row=node('article',undefined,'card record'),content=node('div');
    content.append(node('h3',`${credit.tribunal} • ${credit.processo}`),node('p',`${money(credit.valor)} • Deságio ${credit.desagio}%`),node('p',`Titular: ${credit.titular}`),node('span',statusText(credit.status),'badge'));
    const button=node('button','Revisar crédito');button.onclick=()=>reviewCredit(credit);row.append(content,button);target.append(row);
  });
}
function openReview(type, record, title) {
  closeReview();currentReview={type,record,documentsReady:false};$('review-title').textContent=title;$('review-reason').value=record.motivo||'';$('review-error').textContent='';
  $('approve').textContent=type==='user'?'Aprovar usuário':'Aprovar e publicar'; $('approve').disabled=true;$('reject').disabled=false;
  $('review-dialog').showModal();return reviewGeneration;
}
async function privateDocument(path, label, pdf, parent, ticket) {
  if(!path) throw new Error('Documento não enviado. Não aprove um cadastro incompleto.');
  const blob = await getBlob(ref(storage,path),pdf?20*1024*1024:10*1024*1024);
  if(ticket!==reviewGeneration || !currentReview) return false;
  const url=URL.createObjectURL(blob);urls.push(url);
  const box=node('div');box.append(node('h3',label));
  if(pdf){const frame=node('iframe');frame.src=url;frame.title=label;box.append(frame);}
  else {const image=node('img');image.src=url;image.alt=label;box.append(image);}
  const link=node('a','Abrir documento');link.href=url;link.target='_blank';link.rel='noopener';box.append(link);parent.append(box);return true;
}
async function reviewUser(user) {
  const ticket=openReview('user',user,'Revisão de identidade');
  $('review-content').append(details({Nome:user.nome,'E-mail':user.email,CPF:user.cpf,Telefone:user.telefone,Perfil:user.perfil,Status:statusText(user.status)}));
  const documents=node('div',undefined,'documents');$('review-content').append(documents);
  try {
    const results = await Promise.all([privateDocument(user.frentePath,'Frente do RG',false,documents,ticket),privateDocument(user.versoPath,'Verso do RG',false,documents,ticket)]);
    if(ticket!==reviewGeneration)return;
    currentReview.documentsReady=results.every(Boolean);$('approve').disabled=!currentReview.documentsReady || user.status!=='pendente';
    if(user.status!=='pendente')$('review-error').textContent='Somente cadastros pendentes podem ser aprovados.';
  } catch(error){if(ticket===reviewGeneration)$('review-error').textContent=`Falha ao abrir documentos: ${error.message}`;}
}
async function reviewCredit(credit) {
  const ticket=openReview('credit',credit,'Auditoria do precatório');
  $('review-content').append(details({Processo:credit.processo,Tribunal:credit.tribunal,Titular:credit.titular,'Valor de face':money(credit.valor),'Deságio':`${credit.desagio}%`,ICMS:credit.icms?'Indicado':'Não indicado','Dívida fiscal':credit.fiscal?'Indicada':'Não indicada',Responsável:state.users.find(u=>u.id===credit.ownerID)?.nome||'Conta não encontrada'}));
  const documents=node('div',undefined,'documents');$('review-content').append(documents);
  try {const loaded=await privateDocument(credit.documentPath,'Documentação do crédito',true,documents,ticket);if(ticket!==reviewGeneration)return;currentReview.documentsReady=loaded;$('approve').disabled=!loaded || credit.status!=='em_auditoria';}
  catch(error){if(ticket===reviewGeneration)$('review-error').textContent=`Falha ao abrir documentação: ${error.message}`;}
}
async function decide(approved) {
  if(!currentReview)return;
  const {type,record,documentsReady}=currentReview, reason=$('review-reason').value.trim();
  if(!approved&&!reason){$('review-error').textContent='Informe o motivo da rejeição.';return;}
  if(approved&&!documentsReady){$('review-error').textContent='Abra e confira todos os documentos antes de aprovar.';return;}
  const ticket=reviewGeneration;$('approve').disabled=true;$('reject').disabled=true;
  try {
    if(type==='credit'&&approved){const owner=await getDoc(doc(db,'users',record.ownerID));if(!owner.exists()||owner.data().status!=='aprovado')throw new Error('O proprietário precisa estar aprovado.');}
    await updateDoc(doc(db,type==='user'?'users':'precatorios',record.id),{status:approved?(type==='user'?'aprovado':'publicado'):'rejeitado',motivo:reason,updatedAt:serverTimestamp(),...(type==='credit'?{auditedAt:serverTimestamp(),auditedBy:auth.currentUser.uid}:{reviewedAt:serverTimestamp(),reviewedBy:auth.currentUser.uid})});
    if(ticket===reviewGeneration)closeReview();feedback(approved?'Aprovação registrada.':'Rejeição registrada com o motivo.');
  } catch(error){if(ticket===reviewGeneration){$('review-error').textContent=error.message;$('approve').disabled=!documentsReady;$('reject').disabled=false;}}
}
$('review-form').onsubmit=event=>{event.preventDefault();decide(true);};$('reject').onclick=()=>decide(false);
$('close-dialog').onclick=closeReview;$('review-dialog').addEventListener('cancel',event=>{event.preventDefault();closeReview();});
$('user-filter').onchange=renderUsers;$('credit-filter').onchange=renderCredits;
document.querySelectorAll('[data-tab]').forEach(button=>button.onclick=()=>{document.querySelectorAll('.panel').forEach(panel=>panel.hidden=panel.id!==button.dataset.tab);document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b===button));});
$('login-form').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;feedback('');try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);$('password').value='';}catch{feedback('Não foi possível entrar. Confira suas credenciais e tente novamente.');}finally{button.disabled=false;}};
$('logout').onclick=()=>signOut(auth);
$('reset').onclick=async()=>{if(!$('email').value){feedback('Informe seu e-mail para recuperar o acesso.');return;}try{await sendPasswordResetEmail(auth,$('email').value.trim());feedback('Se houver uma conta para este e-mail, você receberá as instruções de recuperação.');}catch{feedback('Não foi possível solicitar a recuperação. Confira o e-mail e tente novamente.');}};
$('credit-form').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,button=event.submitter,fields=new FormData(form);button.disabled=true;feedback('');
  try {
    const ownerID=String(fields.get('ownerID')).trim(), owner=await getDoc(doc(db,'users',ownerID));
    if(!owner.exists()||owner.data().status!=='aprovado'||!['credor','broker'].includes(owner.data().perfil))throw new Error('Selecione um credor ou broker aprovado.');
    const file=fields.get('pdf');if(!(file instanceof File)||file.size<=0||file.size>20_000_000)throw new Error('Selecione um PDF de até 20 MB.');
    if(new TextDecoder().decode(await file.slice(0,5).arrayBuffer())!=='%PDF-')throw new Error('O arquivo deve ser um PDF válido.');
    const value=Number(fields.get('valor')),discount=Number(fields.get('desagio'));if(!Number.isFinite(value)||value<=0||!Number.isFinite(discount)||discount<0||discount>=100)throw new Error('Confira os valores.');
    const creditRef=doc(collection(db,'precatorios')),path=`precatorios/${ownerID}/${creditRef.id}/documentacao.pdf`;
    await setDoc(creditRef,{ownerID,titular:String(fields.get('titular')).trim(),tribunal:String(fields.get('tribunal')).trim(),processo:String(fields.get('processo')).trim(),valor:value,desagio:discount,icms:fields.has('icms'),fiscal:fields.has('fiscal'),status:'rascunho',createdAt:serverTimestamp()});
    await uploadBytes(ref(storage,path),file,{contentType:'application/pdf'});
    await updateDoc(creditRef,{documentPath:path,status:'em_auditoria',updatedAt:serverTimestamp()});form.reset();feedback('Precatório salvo e enviado para auditoria.');
  }catch(error){feedback(`Não foi possível concluir: ${error.message}`);}finally{button.disabled=false;}
};
async function start(){
  try{
    const response=await fetch('./firebase-config.json');if(!response.ok)throw new Error('Configuração Firebase indisponível.');
    const config=await response.json();const app=initializeApp(config);auth=getAuth(app);db=getFirestore(app);storage=getStorage(app);await setPersistence(auth,browserSessionPersistence);
    onAuthStateChanged(auth,async user=>{
      cleanup();const ticket=generation;$('login').hidden=!!user;feedback('');if(!user)return;
      try{
        const token=await user.getIdTokenResult(true);if(ticket!==generation)return;
        if(token.claims.admin!==true){await signOut(auth);feedback('Esta conta não tem permissão de administrador.');return;}
        $('workspace').hidden=false;$('logout').hidden=false;$('admin-email').textContent=user.email;
        subscriptions.push(onSnapshot(collection(db,'users'),snapshot=>{if(ticket!==generation)return;state.users=snapshot.docs.map(d=>({...d.data(),id:d.id}));$('count-users').textContent=state.users.filter(u=>u.status==='pendente').length;renderUsers();},error=>feedback(`Erro ao carregar usuários: ${error.message}`)));
        subscriptions.push(onSnapshot(collection(db,'precatorios'),snapshot=>{if(ticket!==generation)return;state.credits=snapshot.docs.map(d=>({...d.data(),id:d.id}));$('count-credits').textContent=state.credits.filter(c=>c.status==='em_auditoria').length;renderCredits();},error=>feedback(`Erro ao carregar créditos: ${error.message}`)));
      }catch(error){feedback(error.message);$('logout').hidden=false;}
    });
  }catch(error){feedback(error.message);$('login-form').querySelector('button').disabled=true;}
}
start();
