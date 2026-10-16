const {setup}=require('./cloud-api.cjs');
const fs=require('node:fs');
const path=require('node:path');
const project='rodrigues-amr',number='263843276361',region='us-central1';
const stateFile=path.join(__dirname,'runtime.json');
async function main(){
 if(!process.argv.includes('--apply')){console.log('Use --apply after approving resources documented in deployment/README.md.');return;}
 const {account,call}=await setup();
 const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)):{};
 async function ensure(origin,url,create){try{return await call(origin,'GET',url);}catch(e){if(!/404|not found|NOT_FOUND/i.test(e.message))throw e;return create();}}
 async function policy(origin,url,member,roles){
  const p=await call(origin,'POST',url+':getIamPolicy',{});p.bindings ||= [];
  for(const role of roles){let b=p.bindings.find(b=>b.role===role && !b.condition);if(!b){b={role,members:[]};p.bindings.push(b);}if(!b.members.includes(member))b.members.push(member);}
  await call(origin,'POST',url+':setIamPolicy',{policy:p});
 }
 console.log('Enabling required APIs');
 const activation=await call('https://serviceusage.googleapis.com','POST',`/v1/projects/${number}/services:batchEnable`,{serviceIds:['run.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','cloudfunctions.googleapis.com','cloudscheduler.googleapis.com','iam.googleapis.com','storage.googleapis.com','firestore.googleapis.com']});
 if(activation.name)for(let i=0;i<60;i++){
  const r=await call('https://serviceusage.googleapis.com','GET','/v1/'+activation.name);
  if(r.done){if(r.error)throw Error(JSON.stringify(r.error));break;}
  if(i===59)throw Error('API activation pending; rerun');
  await new Promise(r=>setTimeout(r,1000));
 }
 for(const name of ['ra-whatsapp-runtime','ra-whatsapp-scheduler','ra-whatsapp-build']){
  const email=`${name}@${project}.iam.gserviceaccount.com`;
  await ensure('https://iam.googleapis.com',`/v1/projects/${project}/serviceAccounts/${email}`,()=>call('https://iam.googleapis.com','POST',`/v1/projects/${project}/serviceAccounts`,{accountId:name,serviceAccount:{displayName:name}}));
 }
 console.log('Service identities ready');
 await policy('https://cloudresourcemanager.googleapis.com',`/v1/projects/${project}`,`serviceAccount:ra-whatsapp-runtime@${project}.iam.gserviceaccount.com`,['roles/datastore.user','roles/firebaseauth.viewer']);
 await policy('https://cloudresourcemanager.googleapis.com',`/v1/projects/${project}`,`serviceAccount:ra-whatsapp-build@${project}.iam.gserviceaccount.com`,['roles/logging.logWriter','roles/artifactregistry.writer']);
 state.sessionBucket=`${project}-whatsapp-session-private`;state.sourceBucket=`${project}-whatsapp-build-source`;
 for(const name of [state.sessionBucket,state.sourceBucket]){
  await ensure('https://storage.googleapis.com',`/storage/v1/b/${name}`,()=>call('https://storage.googleapis.com','POST',`/storage/v1/b?project=${project}`,{name,location:'US-CENTRAL1',iamConfiguration:{uniformBucketLevelAccess:{enabled:true},publicAccessPrevention:'enforced'},versioning:{enabled:false},lifecycle:{rule:name===state.sourceBucket?[{action:{type:'Delete'},condition:{age:7}}]:[]}}));
 }
 async function bucketRoles(name,member,roles){
  const url=`/storage/v1/b/${name}/iam`;const p=await call('https://storage.googleapis.com','GET',url);p.bindings ||= [];
  for(const role of roles){let b=p.bindings.find(b=>b.role===role);if(!b){b={role,members:[]};p.bindings.push(b);}if(!b.members.includes(member))b.members.push(member);}
  await call('https://storage.googleapis.com','PUT',url,p);
 }
 await bucketRoles(state.sessionBucket,`serviceAccount:ra-whatsapp-runtime@${project}.iam.gserviceaccount.com`,['roles/storage.objectAdmin']);
 await bucketRoles(state.sourceBucket,`serviceAccount:ra-whatsapp-build@${project}.iam.gserviceaccount.com`,['roles/storage.objectViewer']);
 console.log('Private buckets ready');
 await ensure('https://firestore.googleapis.com',`/v1/projects/${project}/databases/whatsapp-automation`,()=>call('https://firestore.googleapis.com','POST',`/v1/projects/${project}/databases?databaseId=whatsapp-automation`,{locationId:'nam5',type:'FIRESTORE_NATIVE',concurrencyMode:'PESSIMISTIC',appEngineIntegrationMode:'DISABLED'}));
 await ensure('https://artifactregistry.googleapis.com',`/v1/projects/${project}/locations/${region}/repositories/whatsapp`,()=>call('https://artifactregistry.googleapis.com','POST',`/v1/projects/${project}/locations/${region}/repositories?repositoryId=whatsapp`,{format:'DOCKER',description:'Rodrigues Amorim WhatsApp service'}));
 const users=await call('https://identitytoolkit.googleapis.com','POST',`/v1/projects/${project}/accounts:lookup`,{email:[account.user.email,'gustavoamorimadv2@gmail.com']});
 state.allowedUids=(users.users || []).filter(u=>!u.disabled).map(u=>u.localId);
 if(!state.allowedUids.length)throw Error('No authorized CRM administrators found');
 state.project=project;state.region=region;state.schedulerEmail=`ra-whatsapp-scheduler@${project}.iam.gserviceaccount.com`;
 fs.writeFileSync(stateFile,JSON.stringify(state,null,2));
 console.log('Provisioning complete:',JSON.stringify({project,region,authorizedUsers:state.allowedUids.length}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
