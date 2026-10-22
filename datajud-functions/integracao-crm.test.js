import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validarClienteProcesso, prepararAtualizacaoCrm} from './integracao-crm.js';
import {extrairUltimaMovimentacao} from './datajud.js';
const termo='Conclusão - decisão';
test('valida o processo antes de atualizar o cliente do CRM',()=>{
 validarClienteProcesso({processo:'0000832-35.2018.4.01.3202'},'00008323520184013202');
 assert.throws(()=>validarClienteProcesso({processo:'0000832-35.2018.4.01.3202'},'00000000000000000000'),{code:'invalid-argument'});
 assert.throws(()=>validarClienteProcesso(null,'00008323520184013202'),{code:'not-found'});
});
test('salva a consulta direta sem mudar status, fila e histórico de envio',()=>{
 const r={numero:'00008323520184013202',tribunal:'trf1',movimentacao:{dataHora:'2024-07-03T09:05:34Z',termoTribunal:termo},consultadoEm:'2026-10-22T00:00:00Z'};
 const p=prepararAtualizacaoCrm(r,'uid-teste');
 assert.equal(p.datajudUltimoAndamentoTexto,termo);assert.equal(p.datajudNumeroProcesso,r.numero);
 assert.equal(p.datajudAtualizadoPor,'uid-teste');
 for(const k of ['status','dataUltimoAndamento','ultimoAndamentoTexto','filaOrdem','filaUltimaPassagem','iaTituloAmigavel']) assert.equal(Object.hasOwn(p,k),false);
});
test('inclui complementos na movimentação disponível no CRM',()=>{
 const p={hits:{hits:[{_source:{numeroProcesso:'n',movimentos:[{nome:'Conclusão',dataHora:'2026-01-01T00:00:00Z',complementosTabelados:[{nome:'decisão'}]}]}}]}};
 assert.equal(extrairUltimaMovimentacao(p,'n').termoTribunal,termo);
});
