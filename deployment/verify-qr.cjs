// Generates and discards a fresh, unpaired QR in an isolated build container.
// Never logs QR contents, pairs a phone, or sends a message.
const {setup}=require('./cloud-api.cjs');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const {call}=await setup();const state=require('./runtime.json');
 const script=`const {Client,NoAuth}=require('whatsapp-web.js');let done=false;const c=new Client({authStrategy:new NoAuth(),puppeteer:{headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']}});const t=setTimeout(()=>{console.error('QR generation timed out');process.exit(1)},120000);c.once('qr',async()=>{done=true;clearTimeout(t);console.log('WhatsApp QR generation verified; contents discarded');await c.destroy().catch(()=>{});process.exit(0)});c.initialize().catch(e=>{if(!done){console.error(e.message);process.exit(1)}});`;
 const op=await call('https://cloudbuild.googleapis.com','POST',`/v1/projects/${state.project}/locations/${state.region}/builds`,{
  steps:[{name:'gcr.io/cloud-builders/docker',args:['run','--rm','--entrypoint','node',state.image,'-e',script]}],
  timeout:'240s',serviceAccount:`projects/${state.project}/serviceAccounts/ra-whatsapp-build@${state.project}.iam.gserviceaccount.com`,options:{logging:'CLOUD_LOGGING_ONLY'}
 });
 const id=op.metadata?.build?.id;if(!id)throw Error('QR verification build ID missing');
 state.qrBuildId=id;fs.writeFileSync(path.join(__dirname,'runtime.json'),JSON.stringify(state,null,2));
 console.log('QR verification build:',id);
 let last;
 for(let i=0;i<100;i++){
  const b=await call('https://cloudbuild.googleapis.com','GET',`/v1/projects/${state.project}/locations/${state.region}/builds/${id}`);
  if(b.status!==last){console.log('QR verification:',b.status);last=b.status;}
  if(b.status==='SUCCESS')return;
  if(['FAILURE','INTERNAL_ERROR','TIMEOUT','CANCELLED','EXPIRED'].includes(b.status)){
   const logs=await call('https://logging.googleapis.com','POST','/v2/entries:list',{resourceNames:['projects/'+state.project],filter:`resource.type="build" AND resource.labels.build_id="${id}"`,orderBy:'timestamp desc',pageSize:12});
   console.log((logs.entries||[]).map(e=>e.textPayload||'').join('\n'));throw Error('QR verification failed');
  }
  await new Promise(r=>setTimeout(r,3000));
 }
 throw Error('QR verification pending; inspect Cloud Build '+id);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
