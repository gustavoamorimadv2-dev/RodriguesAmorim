const fs=require('node:fs');
const path=require('node:path');
const roots=[process.env.FIREBASE_TOOLS_ROOT,'/usr/local/lib/node_modules/firebase-tools','/opt/homebrew/lib/node_modules/firebase-tools'].filter(Boolean);
const root=roots.find(p=>fs.existsSync(path.join(p,'lib/apiv2.js')));
if(!root)throw Error('Install firebase-tools and run firebase login, or set FIREBASE_TOOLS_ROOT.');
const auth=require(path.join(root,'lib/auth.js'));
const {requireAuth}=require(path.join(root,'lib/requireAuth.js'));
const {Client,getAccessToken}=require(path.join(root,'lib/apiv2.js'));
async function setup(){
 const account=auth.getGlobalDefaultAccount();
 if(!account)throw Error('Run firebase login first.');
 await requireAuth({project:'rodrigues-amr',user:account.user,tokens:account.tokens,nonInteractive:true});
 return {account,call:async(origin,method,url,body)=>{
  const client=new Client({urlPrefix:origin,apiVersion:'',auth:true});
  return (await client.request({method,path:url,body})).body;
 },upload:async(url,body)=>{
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${await getAccessToken()}`,'Content-Type':'application/gzip'},body});
  if(!response.ok)throw Error(`Source upload failed: ${response.status}`);
  return response.json();
 }};
}
module.exports={setup};
