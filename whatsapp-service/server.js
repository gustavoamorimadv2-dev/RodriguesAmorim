import express from 'express';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import QRCode from 'qrcode';
import whatsapp from 'whatsapp-web.js';
import { runBilling } from './billing.js';
const {Client,LocalAuth} = whatsapp;
initializeApp({credential:applicationDefault(),projectId:process.env.GOOGLE_CLOUD_PROJECT || 'rodrigues-amr'});
const db=getFirestore();
const allowed=new Set((process.env.WHATSAPP_ALLOWED_UIDS || '').split(',').map(s=>s.trim()).filter(Boolean));
const origins=new Set((process.env.CRM_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean));
if (!allowed.size || !origins.size) throw new Error('Configure WHATSAPP_ALLOWED_UIDS e CRM_ORIGINS.');
const config=db.collection('whatsapp_config').doc('office');
const session={state:'disconnected',qr:null,client:null};
let enabled=false, busy=false, starting=null;
const app=express();
app.use((req,res,next)=>{
  const origin=req.headers.origin;
  if(origin && !origins.has(origin)) return res.sendStatus(403);
  if(origin) {res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({limit:'2kb'}));
app.use('/api',async(req,res,next)=>{
  try {
    const token=await getAuth().verifyIdToken((req.headers.authorization || '').replace(/^Bearer /,''),true);
    if(!allowed.has(token.uid)) return res.status(403).json({error:'Usuário sem acesso à conexão do escritório.'});
    next();
  } catch {res.status(401).json({error:'Entre novamente no CRM.'});}
});
function startSession() {
  if(starting || ['connected','connecting','qr'].includes(session.state)) return starting;
  starting=(async()=>{
    if(session.client) await session.client.destroy().catch(()=>{});
    session.state='connecting';session.qr=null;
    const client=new Client({authStrategy:new LocalAuth({clientId:'office',dataPath:process.env.SESSION_PATH || './data/auth'}),puppeteer:{headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})}});
    session.client=client;
    client.on('qr',async qr=>{
      try {const image=await QRCode.toDataURL(qr);if(session.client===client){session.qr=image;session.state='qr';}}
      catch {session.state='error';}
    });
    client.on('authenticated',()=>{session.qr=null;session.state='connecting';});
    client.on('ready',()=>{session.qr=null;session.state='connected';});
    client.on('auth_failure',()=>{session.qr=null;session.state='error';});
    client.on('disconnected',()=>{session.qr=null;session.state='disconnected';});
    await client.initialize();
  })().catch(()=>{session.state='error';session.qr=null;}).finally(()=>{starting=null;});
  return starting;
}
app.get('/api/whatsapp',(_req,res)=>res.json({state:session.state,qr:session.qr,enabled}));
app.post('/api/whatsapp/connect',async(_req,res)=>{
  await config.set({connectedOnce:true},{merge:true});
  void startSession();res.status(202).json({ok:true});
});
app.post('/api/whatsapp/automation',async(req,res)=>{
  if(typeof req.body.enabled!=='boolean') return res.sendStatus(400);
  await config.set({enabled:req.body.enabled},{merge:true});enabled=req.body.enabled;
  res.json({enabled});
});
app.use((error,req,res,next)=>{console.error('Falha na API de WhatsApp:',error.code || error.name);res.status(500).json({error:'Não foi possível concluir. Tente novamente.'});});
const saved=(await config.get()).data();enabled=saved?.enabled===true;
if(saved?.connectedOnce) void startSession();
async function tick(){
  // Business hours in São Paulo. Starting later the same day also catches pending reminders.
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
  if(busy || !enabled || hour<9 || hour>=18) return;
  busy=true;
  try {await runBilling({db,session,isEnabled:()=>enabled});}catch(error){console.error('Falha na rotina de cobrança:',error.code || error.name);}finally{busy=false;}
}
setInterval(tick,60_000);void tick();
app.listen(Number(process.env.PORT || 3000),()=>console.log('Serviço de WhatsApp iniciado.'));
async function shutdown(){enabled=false;await session.client?.destroy().catch(()=>{});process.exit(0);}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
