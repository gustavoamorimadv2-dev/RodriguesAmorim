const {setup}=require('./cloud-api.cjs');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const stateFile=path.join(__dirname,'runtime.json');
async function main(){
 if(!process.argv.includes('--apply')){console.log('Use --apply after provisioning and resource approval.');return;}
 const state=JSON.parse(fs.readFileSync(stateFile));
 const {project,region}=state;
 const {call,upload}=await setup();
 const save=()=>fs.writeFileSync(stateFile,JSON.stringify(state,null,2));
 const serviceName=`projects/${project}/locations/${region}/services/ra-whatsapp`;
 if(!state.buildId || process.argv.includes('--rebuild')){
  const archive=path.join(os.tmpdir(),'ra-whatsapp-source.tgz');
  execFileSync('tar',['-czf',archive,'Dockerfile','package.json','package-lock.json','server.js','billing.js','lease.js','cloud-store.js','smoke.cjs'],{cwd:path.join(__dirname,'../whatsapp-service')});
  const object=`source/${Date.now()}.tgz`;
  await upload(`https://storage.googleapis.com/upload/storage/v1/b/${state.sourceBucket}/o?uploadType=media&name=${encodeURIComponent(object)}`,fs.readFileSync(archive));
  state.image=`${region}-docker.pkg.dev/${project}/whatsapp/bridge:${Date.now()}`;
  const op=await call('https://cloudbuild.googleapis.com','POST',`/v1/projects/${project}/locations/${region}/builds`,{
   source:{storageSource:{bucket:state.sourceBucket,object}},
   steps:[{name:'gcr.io/cloud-builders/docker',args:['build','-t',state.image,'.']},{name:'gcr.io/cloud-builders/docker',args:['run','--rm','--entrypoint','node',state.image,'smoke.cjs']}],
   images:[state.image],timeout:'1200s',serviceAccount:`projects/${project}/serviceAccounts/ra-whatsapp-build@${project}.iam.gserviceaccount.com`,options:{logging:'CLOUD_LOGGING_ONLY'}
  });
  state.buildId=op.metadata?.build?.id;
  if(!state.buildId)throw Error('Cloud Build ID missing: '+JSON.stringify(op));save();
 }
 let last;
 for(let i=0;i<360;i++){
  const build=await call('https://cloudbuild.googleapis.com','GET',`/v1/projects/${project}/locations/${region}/builds/${state.buildId}`);
  if(build.status!==last){console.log('Image build:',build.status);last=build.status;}
  if(build.status==='SUCCESS')break;
  if(['FAILURE','INTERNAL_ERROR','TIMEOUT','CANCELLED','EXPIRED'].includes(build.status))throw Error(`Build ${build.status}: ${build.logUrl}`);
  if(i===359)throw Error('Build still running. Rerun to continue.');
  await new Promise(r=>setTimeout(r,3000));
 }
 function serviceBody(serviceUrl){return {
  name:serviceName,ingress:'INGRESS_TRAFFIC_ALL',
  template:{serviceAccount:`ra-whatsapp-runtime@${project}.iam.gserviceaccount.com`,
   scaling:{minInstanceCount:1,maxInstanceCount:1},executionEnvironment:'EXECUTION_ENVIRONMENT_GEN2',timeout:'540s',maxInstanceRequestConcurrency:40,
   containers:[{image:state.image,ports:[{containerPort:8080}],resources:{limits:{cpu:'1',memory:'2Gi'},cpuIdle:false,startupCpuBoost:true},env:Object.entries({
    GOOGLE_CLOUD_PROJECT:project,AUTOMATION_DATABASE:'whatsapp-automation',SESSION_BUCKET:state.sessionBucket,
    WHATSAPP_ALLOWED_UIDS:state.allowedUids.join(','),CRM_ORIGINS:'https://www.gruporodriguesamorim.com,https://gruporodriguesamorim.com,https://rodrigues-amr.web.app,https://rodrigues-amr.firebaseapp.com',
    SCHEDULER_EMAIL:state.schedulerEmail,SERVICE_URL:serviceUrl || 'https://pending.invalid',CHROME_PATH:'/usr/bin/chromium'
   }).map(([name,value])=>({name,value}))}]
  }
 };}
 async function wait(op){
  if(!op.name)return;
  for(let i=0;i<120;i++){
   const r=await call('https://run.googleapis.com','GET','/v2/'+op.name);
   if(r.done){if(r.error)throw Error(JSON.stringify(r.error));return;}
   await new Promise(r=>setTimeout(r,2000));
  }
  throw Error('Cloud Run deployment pending; rerun');
 }
 let exists=true;
 try{const old=await call('https://run.googleapis.com','GET','/v2/'+serviceName);state.serviceUrl=old.uri;}
 catch(e){if(!/404|not found|NOT_FOUND/i.test(e.message))throw e;exists=false;}
 const body=serviceBody(state.serviceUrl);
 if(!exists) delete body.name;
 console.log('Deploying Cloud Run');
 await wait(await call('https://run.googleapis.com',exists?'PATCH':'POST',exists?`/v2/${serviceName}?updateMask=template,ingress`:`/v2/projects/${project}/locations/${region}/services?serviceId=ra-whatsapp`,body));
 const service=await call('https://run.googleapis.com','GET','/v2/'+serviceName);
 if(!service.uri)throw Error('Cloud Run URL missing');
 if(state.serviceUrl!==service.uri){
  state.serviceUrl=service.uri;
  await wait(await call('https://run.googleapis.com','PATCH',`/v2/${serviceName}?updateMask=template`,serviceBody(service.uri)));
 }
 const policy=await call('https://run.googleapis.com','GET',`/v2/${serviceName}:getIamPolicy`);policy.bindings ||= [];
 let binding=policy.bindings.find(b=>b.role==='roles/run.invoker' && !b.condition);
 if(!binding){binding={role:'roles/run.invoker',members:[]};policy.bindings.push(binding);}
 if(!binding.members.includes('allUsers'))binding.members.push('allUsers');
 await call('https://run.googleapis.com','POST',`/v2/${serviceName}:setIamPolicy`,{policy});
 save();
 fs.writeFileSync(path.join(__dirname,'../assets/whatsapp-config.js'),`// Serviço protegido por autenticação Firebase.\nexport const WHATSAPP_API_URL = ${JSON.stringify(state.serviceUrl)};\n`);
 fs.writeFileSync(path.join(__dirname,`../functions/.env.${project}`),`WHATSAPP_SERVICE_URL=${state.serviceUrl}\nWHATSAPP_SCHEDULER_EMAIL=${state.schedulerEmail}\n`);
 console.log('Cloud Run ready:',state.serviceUrl);
 console.log('Next: firebase deploy --only functions:whatsapp-billing --project '+project);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
