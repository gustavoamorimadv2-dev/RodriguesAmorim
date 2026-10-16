const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const output=path.join(root,'.hosting-public');
fs.mkdirSync(output,{recursive:true});
for(const name of fs.readdirSync(root))if(name.endsWith('.html'))fs.copyFileSync(path.join(root,name),path.join(output,name));
fs.cpSync(path.join(root,'assets'),path.join(output,'assets'),{recursive:true});
console.log('Frontend HTTPS preparado (somente HTML e assets).');
