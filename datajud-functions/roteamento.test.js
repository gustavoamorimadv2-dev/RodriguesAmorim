import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TRIBUNAIS, localizarTribunal, carregarRotaTribunal} from './roteamento.js';
import {identificarTribunal, consultarDatajud, extrairUltimaMovimentacao} from './datajud.js';
function numero(j, tr) { const base=`00000012026${j}${String(tr).padStart(2,'0')}0001`;const dv=String(98n-BigInt(base+'00')%97n).padStart(2,'0');return base.slice(0,7)+dv+base.slice(7); }
test('catálogo cobre 91 rotas oficiais distintas, incluindo os 27 estados/DF',()=>{
 assert.equal(TRIBUNAIS.length,91);assert.equal(new Set(TRIBUNAIS.map(r=>r.id)).size,91);
 assert.equal(new Set(TRIBUNAIS.map(r=>r.endpoint)).size,91);
 assert.equal(TRIBUNAIS.filter(r=>r.segmento===8).length,27);
 assert.equal(TRIBUNAIS.filter(r=>r.segmento===6&&r.codigoTribunal>0).length,27);
 for(const r of TRIBUNAIS){const url=new URL(r.endpoint);assert.equal(url.origin,'https://api-publica.datajud.cnj.jus.br');assert.equal(url.pathname,`/api_publica_${r.sigla}/_search`);assert.equal(identificarTribunal(numero(r.segmento,r.codigoTribunal)).endpoint,r.endpoint);}
});
test('seleciona estados e regiões pelos campos J e TR, sem depender da posição alfabética dos nomes',()=>{
 for(const [j,c,sigla] of [[8,3,'tjap'],[8,4,'tjam'],[8,11,'tjmt'],[8,12,'tjms'],[8,16,'tjpr'],[8,19,'tjrj'],[8,24,'tjsc'],[8,26,'tjsp'],[6,7,'tre-dft'],[4,6,'trf6'],[5,15,'trt15']]) assert.equal(localizarTribunal(j,c).sigla,sigla);
 const r=identificarTribunal(numero(8,11));assert.equal(r.chaveTribunal,'8-11');assert.equal(r.uf,'MT');assert.equal(r.endpoint,'https://api-publica.datajud.cnj.jus.br/api_publica_tjmt/_search');
 assert.equal(localizarTribunal(1,0),null);
});
function dbCom(rota, exists=true) {return {collection:n=>{assert.equal(n,'datajudTribunais');return {doc:id=>{assert.equal(id,'8-11');return {get:async()=>({exists,data:()=>rota})};}};}};}
test('lê a rota do tribunal no banco do CRM e valida a URL oficial',async()=>{
 const id=identificarTribunal(numero(8,11));const esperado=localizarTribunal(8,11);
 const r=await carregarRotaTribunal(dbCom(esperado),id);assert.equal(r.fonte,'firestore');assert.equal(r.sigla,'tjmt');
 for(const rota of [{...esperado,endpoint:'https://example.test/_search'}, {...esperado,endpoint:localizarTribunal(8,19).endpoint}]){
  const fallbacks=[];const f=await carregarRotaTribunal(dbCom(rota),id,d=>fallbacks.push(d));assert.equal(f.fonte,'catalogo-local');assert.equal(f.endpoint,esperado.endpoint);assert.equal(fallbacks[0].motivo,'rota-incompativel');
 }
});
test('mantém a mesma rota oficial se o catálogo do banco estiver ausente ou indisponível',async()=>{
 const id=identificarTribunal(numero(8,11));
 for(const db of [dbCom(null,false),{collection:()=>{throw Error('indisponível');}}]){const r=await carregarRotaTribunal(db,id);assert.equal(r.sigla,'tjmt');assert.equal(r.fonte,'catalogo-local');}
});
test('não transforma uma resposta com número mascarado em falso processo ausente',()=>{
 const p={hits:{total:{value:1,relation:'eq'},hits:[{_source:{numeroProcesso:'0000832-35.2018.4.01.3202',movimentos:[{nome:'Movimento',dataHora:'2026-01-01T00:00:00Z'}]}}]}};
 assert.equal(extrairUltimaMovimentacao(p,'00008323520184013202').nome,'Movimento');
 assert.throws(()=>extrairUltimaMovimentacao(p,'00000000000000000000'),{code:'data-loss',motivo:'numero-incompativel'});
});
test('diagnóstico distingue URL escolhida e resposta realmente vazia sem registrar o número do processo',async()=>{
 const respostas=[];await assert.rejects(()=>consultarDatajud(numero(8,11),'teste',async(url,opts)=>{
  assert.equal(url,'https://api-publica.datajud.cnj.jus.br/api_publica_tjmt/_search');assert.deepEqual(JSON.parse(opts.body),{query:{match:{numeroProcesso:numero(8,11)}}});
  return {ok:true,status:200,json:async()=>({hits:{total:{value:0,relation:'eq'},hits:[]}})};
 },{registrarResposta:r=>respostas.push(r)}),e=>{assert.equal(e.code,'not-found');assert.equal(e.detalhes.tribunal,'tjmt');assert.equal(e.detalhes.registrosRetornados,0);assert.match(e.message,/TJMT/);return true;});
 assert.equal(respostas[0].totalRegistros,0);assert.equal(respostas[0].chaveTribunal,'8-11');assert.equal(Object.hasOwn(respostas[0],'numero'),false);
});
test('usa o endpoint validado da tabela do banco e preserva a origem no resultado',async()=>{
 const rota={...localizarTribunal(8,11),fonte:'firestore'};const n=numero(8,11);
 const r=await consultarDatajud(n,'teste',async(url)=>{
  assert.equal(url,rota.endpoint);return {ok:true,status:200,json:async()=>({hits:{total:{value:1,relation:'eq'},hits:[{_source:{numeroProcesso:n,movimentos:[{nome:'Movimento',dataHora:'2026-01-01T00:00:00Z'}]}}]}})};
 },{rota});
 assert.equal(r.fonteRoteamento,'firestore');assert.equal(r.endpoint,rota.endpoint);assert.equal(r.movimentacao.nome,'Movimento');
});
