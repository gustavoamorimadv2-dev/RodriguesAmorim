import {test} from 'node:test';
import assert from 'node:assert/strict';
import {identificarTribunal, extrairUltimaMovimentacao, consultarDatajud} from './datajud.js';
function numero(j, tr) { const base = `00000012026${j}${tr}0001`; const dd = String(98n - BigInt(base+'00') % 97n).padStart(2,'0'); return base.slice(0,7)+dd+base.slice(7); }
test('identifica os tribunais pelo segmento e código CNJ', () => {
 for (const [j,tr,alias] of [[8,'19','tjrj'],[8,'26','tjsp'],[8,'07','tjdft'],[4,'06','trf6'],[5,'02','trt2'],[6,'07','tre-dft'],[9,'13','tjmmg'],[3,'00','stj']]) assert.equal(identificarTribunal(numero(j,tr)).tribunal,alias);
});
test('rejeita dígito incorreto, números incompletos e tribunais sem endpoint', () => {
 for(const n of ['123','00000000020268190001',numero(1,'00'),numero(8,'99'),'abc'+numero(8,'19')]) assert.throws(()=>identificarTribunal(n));
 const n=numero(8,'19'); assert.equal(identificarTribunal(`${n.slice(0,7)}-${n.slice(7,9)}.${n.slice(9,13)}.${n[13]}.${n.slice(14,16)}.${n.slice(16)}`).numero,n);
});
const n=numero(8,'19');
const payload = {hits:{total:{value:2,relation:'eq'},hits:[{_source:{numeroProcesso:n,grau:'G1',movimentos:[{nome:'Antigo',dataHora:'2025-01-01T10:00:00Z'},{nome:'Sem data',dataHora:'erro'}]}},{_source:{numeroProcesso:n,grau:'G2',movimentos:[{nome:'Recente',dataHora:'2026-10-20T12:00:00Z'}]}}]}};
test('seleciona a data mais recente entre registros e graus, sem depender da ordem',()=>assert.equal(extrairUltimaMovimentacao(payload,n).nome,'Recente'));
test('não confunde ausência de dados com ausência de nova movimentação',()=> {
 assert.throws(()=>extrairUltimaMovimentacao({hits:{hits:[]}},n),{code:'not-found'});
 assert.throws(()=>extrairUltimaMovimentacao({...payload,timed_out:true},n),{code:'unavailable'});
 assert.throws(()=>extrairUltimaMovimentacao({hits:{total:200,hits:payload.hits.hits}},n),{code:'unavailable'});
});
test('consulta somente endpoint do CNJ, enviando chave no servidor',async()=> {
 const result=await consultarDatajud(n,'teste',async(url,options)=>{
 assert.equal(url,'https://api-publica.datajud.cnj.jus.br/api_publica_tjrj/_search');
 assert.equal(options.headers.Authorization,'APIKey teste'); assert.equal(JSON.parse(options.body).query.match.numeroProcesso,n);
 return {ok:true,json:async()=>payload}; });
 assert.equal(result.movimentacao.nome,'Recente');
 await assert.rejects(()=>consultarDatajud(n,'teste',async()=>({ok:false})),{code:'unavailable'});
});
test('repete falha temporária e retorna a consulta completa na segunda tentativa', async()=>{
 let tentativas=0; const diagnosticos=[];
 const r=await consultarDatajud(n,' teste ',async(_url, options)=>{
  assert.equal(options.headers.Authorization,'APIKey teste');
  assert.ok(options.signal);
  tentativas++;
  if(tentativas===1) return {ok:true,json:async()=>({...payload,timed_out:true})};
  return {ok:true,json:async()=>payload};
 },{aguardar:async()=>{},registrarFalha:d=>diagnosticos.push(d)});
 assert.equal(tentativas,2); assert.equal(r.movimentacao.nome,'Recente');
 assert.deepEqual(diagnosticos,[{tribunal:'tjrj',tentativa:1,motivo:'consulta-incompleta',codigo:'unavailable'}]);
});
test('limita tentativas quando a conexão não responde',async()=>{
 let count=0;
 await assert.rejects(()=>consultarDatajud(n,'teste',async()=>{count++;throw Error('timeout');},{aguardar:async()=>{}}),{code:'unavailable'});
 assert.equal(count,3);
});
test('distingue credencial inválida de indisponibilidade e não repete',async()=>{
 let count=0;
 await assert.rejects(()=>consultarDatajud(n,'teste',async()=>{count++;return {ok:false,status:401};},{aguardar:async()=>{}}),{code:'failed-precondition',motivo:'http-401'});
 assert.equal(count,1);
});
test('aceita a resposta real do processo publicado como exemplo oficial pelo CNJ', async()=>{
 const fs=await import('node:fs');
 // Fixture pública: protege contra diferenças entre os dados reais e os mocks.
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/exemplo-cnj.json',import.meta.url),'utf8'));
 const mov=extrairUltimaMovimentacao(fixture,'00008323520184013202');
 assert.ok(mov.nome); assert.ok(Number.isFinite(Date.parse(mov.dataHora)));
});
