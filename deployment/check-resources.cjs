const {setup}=require('./cloud-api.cjs');
(async()=>{
 const {call}=await setup();
 const releases=await call('https://firebaserules.googleapis.com','GET','/v1/projects/rodrigues-amr/releases');
 console.log('Firestore rule releases:',JSON.stringify((releases.releases || []).filter(r=>r.name.includes('firestore')).map(r=>({name:r.name,ruleset:r.rulesetName}))));
 const state=require('./runtime.json');
 const build=await call('https://cloudbuild.googleapis.com','GET',`/v1/projects/${state.project}/locations/${state.region}/builds/${state.buildId}`);
 console.log('Build:',build.status,build.logUrl);
 if(build.status==='FAILURE'){
  const logs=await call('https://logging.googleapis.com','POST','/v2/entries:list',{resourceNames:['projects/'+state.project],filter:`resource.type="build" AND resource.labels.build_id="${state.buildId}"`,orderBy:'timestamp desc',pageSize:20});
  console.log((logs.entries || []).map(e=>e.textPayload || e.jsonPayload?.message).join('\n'));
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
