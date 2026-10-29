import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {centavosHonorarios, gerarParcelasCrm, totalHonorariosCrm} from '../assets/crm-honorarios.mjs';
const config = {id:'teste', hoje:'2026-10-29'};
test('valores brasileiros e entradas inválidas', () => {
    for (const s of ['1.500,25','1500,25','R$ 1.500,25']) assert.equal(centavosHonorarios(s),150025);
    assert.equal(centavosHonorarios('1500'),150000);
    for (const s of ['-10,00','NaN','1,234','1.2','2e3','', 'Infinity']) assert.throws(()=>centavosHonorarios(s));
    assert.equal(totalHonorariosCrm([{valor:'10,50'},{valor:1.25}]),1175);
});
test('à vista registra cobrança pendente, sem marcar como pago', () => {
    const r=gerarParcelasCrm({total:'1500', vencimento:'2026-11-10'},config);
    assert.deepEqual(r,[{id_parcela:'hon_teste_avista',parcela:'À Vista',valor:'1500,00',vencimento:'2026-11-10',status:'Pendente'}]);
});
test('entrada e parcelas somam exatamente o total, incluindo centavos indivisíveis', () => {
    const r=gerarParcelasCrm({total:'1000,00',entrada:'100,00',quantidade:'7',vencimento:'2026-11-10',forma:'parcelado'},config);
    assert.equal(r.length,8);assert.equal(totalHonorariosCrm(r),100000);
    assert.equal(r[0].parcela,'Entrada');assert.equal(r[0].vencimento,'2026-10-29');
    assert.equal(new Set(r.map(h=>h.id_parcela)).size,8);
    assert.ok(r.every(h=>h.status==='Pendente'));
});
test('vencimentos mantêm o dia de origem, com ajuste de fim de mês e ano bissexto', () => {
    const gerar = vencimento => gerarParcelasCrm({total:'100',quantidade:'3',vencimento,forma:'parcelado'},config).map(h=>h.vencimento);
    assert.deepEqual(gerar('2026-01-31'),['2026-01-31','2026-02-28','2026-03-31']);
    assert.deepEqual(gerar('2028-01-31'),['2028-01-31','2028-02-29','2028-03-31']);
    assert.deepEqual(gerar('2026-12-10'),['2026-12-10','2027-01-10','2027-02-10']);
});
test('validação impede total inválido, entrada excessiva, parcelas inválidas e data impossível', () => {
    const base={total:'100',entrada:'10',quantidade:'3',vencimento:'2026-11-10',forma:'parcelado'};
    for(const patch of [{total:'0'},{entrada:'100'},{entrada:'101'},{quantidade:'0'},{quantidade:'2.5'},{quantidade:'121'},{total:'0,02',entrada:'',quantidade:'3'},{vencimento:'2026-02-30'}]) assert.throws(()=>gerarParcelasCrm({...base,...patch},config));
});
const html=readFileSync(new URL('../crm.html',import.meta.url),'utf8');
const saveSource=html.slice(html.indexOf('    async function saveCliente('),html.indexOf('    /* ================= AGENTE ================= */'));
test('edição só escreve novas parcelas e mantém os demais campos do cadastro',async()=>{
    const pago={id_parcela:'antiga',valor:'10,00',status:'Pago'};
    const novas=gerarParcelasCrm({total:'20',vencimento:'2026-11-10'},config);
    const writes=[];
    const ctx=vm.createContext({currentUser:{uid:'funcionario'},todosClientesCache:[{id:'c',honorarios:[pago],campoExtra:'preservado'}],clientesGlobaisCache:[],db:{},doc:()=>({}),setDoc:async(...args)=>writes.push(args),arrayUnion:(...items)=>({atomicAppend:items})});
    vm.runInContext(saveSource,ctx);
    const cliente={id:'c',nome:'Teste'};
    await ctx.saveCliente(cliente,novas);
    assert.equal(writes[0][2].merge,true);
    assert.equal(writes[0][1].id,undefined);
    assert.deepEqual(writes[0][1].honorarios.atomicAppend,novas);
    assert.equal(cliente.honorarios.length,2);assert.equal(cliente.honorarios[0].status,'Pago');
    assert.equal(cliente.campoExtra,'preservado');
    await ctx.saveCliente({id:'c',nome:'Outro nome'});
    assert.equal(Object.hasOwn(writes[1][1],'honorarios'),false);
});
test('novo cadastro salva o mesmo formato consumido pela página Clientes',async()=>{
    let gravado;
    const ctx=vm.createContext({currentUser:{uid:'funcionario'},db:{},collection:()=>({}),addDoc:async(_,payload)=>{gravado=payload;return {id:'novo'};}});
    vm.runInContext(saveSource,ctx);
    const novas=gerarParcelasCrm({total:'50',vencimento:'2026-11-10'},config),cliente={nome:'Teste'};
    await ctx.saveCliente(cliente,novas);
    assert.equal(cliente.id,'novo');assert.deepEqual(gravado.honorarios,novas);
});
test('formulário reabre parcelas salvas e não duplica IDs ao repetir tentativa de salvar',async()=>{
    const mod=await import('../assets/crm-honorarios.mjs');
    const fields=new Map();
    const element=()=>({value:'',textContent:'',children:[],addEventListener(){},replaceChildren(){this.children=[];},appendChild(x){this.children.push(x);}});
    const document={getElementById(id){if(!fields.has(id))fields.set(id,element());return fields.get(id);},createElement:element};
    let id=0;
    const ctx=vm.createContext({...mod,document,crypto:{randomUUID:()=>String(++id)}});
    const source=html.slice(html.indexOf('    const honTotal ='),html.indexOf('    let currentDocs ='));
    vm.runInContext(source,ctx);
    ctx.carregarHonorariosFormulario({honorarios:[{parcela:'À Vista',valor:'100,00',status:'Pago',vencimento:'2026-10-29'}]});
    assert.ok(document.getElementById('crmHonResumo').textContent.includes('100,00'));
    assert.equal(document.getElementById('crmHonExistentes').children.length,1);
    assert.equal(ctx.prepararHonorariosFormulario().length,0);
    document.getElementById('crmHonTotal').value='300,00';
    const a=ctx.prepararHonorariosFormulario(),b=ctx.prepararHonorariosFormulario();
    assert.equal(a,b);assert.equal(a[0].status,'Pendente');
    ctx.carregarHonorariosFormulario(null);
    assert.equal(document.getElementById('crmHonTotal').value,'');
    assert.equal(document.getElementById('crmHonExistentes').children.length,0);
    assert.equal(ctx.prepararHonorariosFormulario().length,0);
});
