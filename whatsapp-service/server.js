import express from 'express';
import {randomUUID} from 'node:crypto';
import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {OAuth2Client} from 'google-auth-library';
import QRCode from 'qrcode';
import whatsapp from 'whatsapp-web.js';
import {runBilling} from './billing.js';
import {CloudSessionStore} from './cloud-store.js';
import {SessionLease} from './lease.js';
import {WhatsAppSession} from './session.js';
const {Client,RemoteAuth}=whatsapp;
initializeApp({credential:applicationDefault(),projectId:process.env.GOOGLE_CLOUD_PROJECT || 'rodrigues-amr'});
const db=getFirestore();
// Separate database: client SDKs have no access to session coordination or logs.
const privateDb=getFirestore(process.env.AUTOMATION_DATABASE || 'whatsapp-automation');
const allowed=new Set((process.env.WHATSAPP_ALLOWED_UIDS || '').split(',').map(s=>s.trim()).filter(Boolean));
const origins=new Set((process.env.CRM_ORIGINS || '').split(',').map(s=>s.trim()).filter(Boolean));
if(!allowed.size || !origins.size || !process.env.SESSION_BUCKET || !process.env.SCHEDULER_EMAIL || !process.env.SERVICE_URL) throw new Error('Configure UIDs, origins, bucket, scheduler email and service URL.');
const config=privateDb.collection('whatsapp_config').doc('office');
const lease=new SessionLease(privateDb.collection('whatsapp_locks').doc('office'),randomUUID());
const dataPath=process.env.SESSION_PATH || '/tmp/whatsapp-auth';
const bucket=getStorage().bucket(process.env.SESSION_BUCKET);
let busy=false,stopping=false,leader=false;
const session=new WhatsAppSession({
  hasBackup:()=>new CloudSessionStore(bucket,dataPath).sessionExists({session:'RemoteAuth-office'}),
  canRun:()=>!stopping && leader && lease.valid(),
  encodeQr:value=>QRCode.toDataURL(value),
  createClient:({fresh,onSaved})=>new Client({
    authStrategy:new RemoteAuth({clientId:'office',dataPath,store:new CloudSessionStore(bucket,dataPath,{fresh,onSaved}),backupSyncIntervalMs:60_000}),
    authTimeoutMs:60_000,
    webVersionCache:{type:'none'},
    puppeteer:{headless:true,executablePath:process.env.CHROME_PATH || '/usr/bin/chromium',timeout:60_000,args:process.env.K_SERVICE?['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']:[]}
  }),
  log:(event,error)=>(event==='error'?console.error:console.log)('WhatsApp session:',event,error?String(error.stack || error.message || error.name).replace(/https?:\/\/[^\s]+/g,'[URL]').slice(0,1600):''),
  onStopFailure:()=>void shutdown()
});
const app=express();
app.disable('x-powered-by');
app.use((req,res,next)=>{
  const origin=req.headers.origin;
  if(origin && !origins.has(origin)) return res.sendStatus(403);
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Cache-Control','no-store');
  if(req.method==='OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({limit:'2kb'}));
app.get('/health',(_req,res)=>res.json({ok:true}));
const verifier=new OAuth2Client();
app.post('/internal/billing',async(req,res)=>{
  try {
    const ticket=await verifier.verifyIdToken({idToken:(req.headers.authorization || '').replace(/^Bearer /,''),audience:process.env.SERVICE_URL});
    const payload=ticket.getPayload();
    if(payload?.email!==process.env.SCHEDULER_EMAIL || !payload.email_verified) return res.sendStatus(403);
  }catch{return res.sendStatus(401);}
  if(!leader || !lease.valid()) return res.status(503).json({error:'Session owner not ready'});
  if(busy) return res.status(409).json({error:'Billing already running'});
  const enabled=(await config.get()).data()?.enabled===true;
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
  if(!enabled || hour<9 || hour>=18) return res.json({skipped:true});
  if(session.state!=='connected' || !session.persisted) return res.status(503).json({error:'WhatsApp not ready'});
  busy=true;
  try {
    let active=enabled;
    // Changes in the panel stop a running batch as well as future scheduled calls.
    const unsubscribe=config.onSnapshot(doc=>{active=doc.data()?.enabled===true;},()=>{active=false;});
    try {await runBilling({db,logDb:privateDb,session,isEnabled:()=>active && !stopping && lease.valid()});}
    finally{unsubscribe();}
    res.json({ok:true});
  }finally{busy=false;}
});
app.use('/api',async(req,res,next)=>{
  try {
    const token=await getAuth().verifyIdToken((req.headers.authorization || '').replace(/^Bearer /,''),true);
    if(!allowed.has(token.uid)) return res.status(403).json({error:'Usuário sem acesso à conexão do escritório.'});
  }catch{return res.status(401).json({error:'Entre novamente no CRM.'});}
  if(!leader || !lease.valid()) return res.status(503).json({error:'Serviço em atualização. Aguarde um momento.'});
  next();
});
app.get('/api/whatsapp',async(_req,res)=>res.json({state:session.state,qr:session.qr,persisted:session.persisted,error:session.error,enabled:(await config.get()).data()?.enabled===true}));
app.post('/api/whatsapp/connect',async(req,res)=>{
  if(req.body.fresh!==undefined && typeof req.body.fresh!=='boolean') return res.sendStatus(400);
  await config.set({connectedOnce:true},{merge:true});session.connect({fresh:req.body.fresh===true});res.status(202).json({ok:true});
});
app.post('/api/whatsapp/automation',async(req,res)=>{
  if(typeof req.body.enabled!=='boolean') return res.sendStatus(400);
  if(req.body.enabled && (session.state!=='connected' || !session.persisted)) return res.status(409).json({error:'Aguarde o WhatsApp conectar e concluir o salvamento da sessão.'});
  await config.set({enabled:req.body.enabled},{merge:true});res.json({enabled:req.body.enabled});
});
app.use((error,req,res,next)=>{console.error('WhatsApp API:',error.code || error.name);res.status(500).json({error:'Não foi possível concluir. Tente novamente.'});});
// Lock TTL outlives Chrome shutdown; simultaneous revisions cannot open the same session.
let coordinating=false;
async function coordinate(){
  if(stopping || coordinating) return;
  coordinating=true;
  try{
    const wasLeader=leader;leader=await lease.acquire();
    if(!leader && wasLeader) return void shutdown();
    if(leader && !wasLeader && (await config.get()).data()?.connectedOnce) session.connect();
  }catch(error){console.error('Session coordination:',error.code || error.name);if(leader) void shutdown();}
  finally{coordinating=false;}
}
const server=app.listen(Number(process.env.PORT || 8080),()=>console.log('WhatsApp service started'));
const heartbeat=setInterval(coordinate,10_000);void coordinate();
async function shutdown(){
  if(stopping) return;stopping=true;leader=false;clearInterval(heartbeat);session.qr=null;
  const deadline=setTimeout(()=>process.exit(1),8000);deadline.unref();
  try{await session.stop();await lease.release();}catch{ /* Let TTL expire if Chrome cannot be stopped. */ }
  server.close(()=>process.exit(0));
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
process.on('unhandledRejection',error=>{console.error('Unhandled service error:',error?.name || 'Error');void shutdown();});
