const {setup}=require('./cloud-api.cjs');
(async()=>{
 const {call}=await setup();const s=require('./runtime.json');
 for(const [label,url,options,status] of [
  ['health',s.serviceUrl+'/health',{},200],
  ['anonymous API',s.serviceUrl+'/api/whatsapp',{},401],
  ['anonymous billing',s.serviceUrl+'/internal/billing',{method:'POST'},401],
  ['HTTP CRM blocked',s.serviceUrl+'/api/whatsapp',{headers:{Origin:'http://www.gruporodriguesamorim.com'}},403],
  ['HTTPS Firebase CORS',s.serviceUrl+'/api/whatsapp',{method:'OPTIONS',headers:{Origin:'https://rodrigues-amr.web.app','Access-Control-Request-Method':'GET'}},204],
  ['HTTPS client page','https://rodrigues-amr.web.app/clientes.html',{},200]
 ]){
  const r=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});console.log(label+': '+r.status);
  if(r.status!==status)throw Error(label+' unexpected status');
  if(label==='HTTPS client page' && !(await r.text()).includes('connectWhatsApp'))throw Error('WhatsApp button missing');
 }
 const fn=await call('https://cloudfunctions.googleapis.com','GET',`/v2/projects/${s.project}/locations/${s.region}/functions/lembrarParcelasWhatsApp`);
 if(fn.state!=='ACTIVE')throw Error('Function not active: '+fn.state);console.log('Cloud Function: ACTIVE');
 const jobs=await call('https://cloudscheduler.googleapis.com','GET',`/v1/projects/${s.project}/locations/${s.region}/jobs`);
 const job=jobs.jobs?.find(j=>j.name.includes('lembrarParcelasWhatsApp'));
 if(!job || job.state!=='ENABLED')throw Error('Scheduler job not enabled');console.log('Scheduler: ENABLED, '+job.schedule+', '+job.timeZone);
 if(process.argv.includes('--run-scheduler')){
  try{const c=await call('https://firestore.googleapis.com','GET',`/v1/projects/${s.project}/databases/whatsapp-automation/documents/whatsapp_config/office`);if(c.fields?.enabled?.booleanValue===true)throw Error('Automation active; skipping manual test to avoid messages');}
  catch(e){if(!/404|NOT_FOUND|not found/i.test(e.message))throw e;}
  const since=new Date().toISOString();
  await call('https://cloudscheduler.googleapis.com','POST','/v1/'+job.name+':run',{});
  console.log('Manual scheduler test requested with automation disabled');
  for(let i=0;i<20;i++){
   const logs=await call('https://logging.googleapis.com','POST','/v2/entries:list',{resourceNames:['projects/'+s.project],filter:`resource.type="cloud_run_revision" AND resource.labels.service_name="ra-whatsapp" AND httpRequest.requestUrl:"/internal/billing" AND httpRequest.status=200 AND timestamp>="${since}"`,orderBy:'timestamp desc',pageSize:1});
   if(logs.entries?.length){console.log('Scheduler → Cloud Function → WhatsApp service: HTTP 200 verified');return;}
   await new Promise(r=>setTimeout(r,2000));
  }
  throw Error('Scheduler test still pending in logs');
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
