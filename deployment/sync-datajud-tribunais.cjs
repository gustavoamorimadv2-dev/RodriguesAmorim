const fs = require('node:fs');
const path = require('node:path');
const {setup} = require('./cloud-api.cjs');
const catalogo = JSON.parse(fs.readFileSync(path.join(__dirname, '../datajud-functions/tribunais.json'), 'utf8'));
async function main() {
  const base = 'projects/rodrigues-amr/databases/(default)/documents/datajudTribunais';
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({colecao:'datajudTribunais',registros:catalogo.tribunais.length,aplicar:'node deployment/sync-datajud-tribunais.cjs --apply'}));
    return;
  }
  const {call} = await setup();
  const writes = catalogo.tribunais.map(rota => {
    const valores = {...rota, versaoCatalogo:catalogo.versao, fonte:catalogo.fonte, verificadoEm:catalogo.verificadoEm};
    const fields = Object.fromEntries(Object.entries(valores).map(([k,v]) => [k,
      v === null ? {nullValue:'NULL_VALUE'} : typeof v === 'number' ? {integerValue:String(v)} : {stringValue:v}]));
    return {update:{name:`${base}/${rota.id}`, fields}, updateMask:{fieldPaths:Object.keys(fields)}};
  });
  const r = await call('https://firestore.googleapis.com', 'POST', '/v1/projects/rodrigues-amr/databases/(default)/documents:commit', {writes});
  console.log(JSON.stringify({colecao:'datajudTribunais',gravados:r.writeResults?.length || 0}));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
