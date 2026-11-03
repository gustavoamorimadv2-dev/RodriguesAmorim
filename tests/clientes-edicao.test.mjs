import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../clientes.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function renderizarDadosCliente('),html.indexOf('window.abrirModalCompleto ='));
function ambiente({salvar=async()=>{},usuario={uid:'equipe'}}={}) {
    const els=new Map();const el=()=>({value:'',hidden:false,disabled:false,children:[],focus(){},reportValidity:()=>true,appendChild(x){this.children.push(x);},replaceChildren(){this.children=[];}});
    const document={getElementById(id){if(!els.has(id))els.set(id,el());return els.get(id);},createElement:el,createTextNode:text=>({textContent:text})};
    const cliente={id:'teste',nome:'Nome anterior',cpf:'cadastro',email:'',numeros:'123',processo:'processo anterior',honorarios:[{valor:'100,00',status:'Pago'}],status:'fechado',documentos:{},lancadoSistemaInterno:true};
    const eventos={writes:[],cache:0,render:0,msg:[]};
    const ctx=vm.createContext({document,clienteAtual:cliente,clientesData:[cliente],db:{},doc:(_,col,id)=>({col,id}),obterUsuarioAutenticado:async()=>usuario,updateDoc:async(ref,patch)=>{eventos.writes.push({ref,patch});await salvar();},atualizarCacheLocal:()=>eventos.cache++,aplicarFiltros:()=>eventos.render++,showToast:s=>eventos.msg.push(s),console:{error(){}}});
    ctx.window=ctx;vm.runInContext(source,ctx);ctx.editarDadosCliente();
    return {ctx,cliente,eventos,field:k=>document.getElementById('dadosCliente_'+k),form:document.getElementById('formEditarDadosCliente'),save:()=>document.getElementById('formEditarDadosCliente').onsubmit({preventDefault(){}})};
}
test('salva só os campos alterados e preserva dados financeiros e de lançamento',async()=>{
    const a=ambiente();a.field('nome').value='Nome atualizado';a.field('numeros').value='456';await a.save();
    assert.deepEqual(Object.keys(a.eventos.writes[0].patch).sort(),['nome','numeros']);assert.equal(a.cliente.nome,'Nome atualizado');assert.equal(a.cliente.honorarios[0].status,'Pago');assert.equal(a.cliente.lancadoSistemaInterno,true);assert.equal(a.cliente.status,'fechado');assert.equal(a.form.hidden,true);assert.equal(a.eventos.cache,1);
});
test('cancelar não grava nem altera o cadastro',()=>{
    const a=ambiente();a.field('nome').value='Descartado';a.ctx.cancelarEdicaoDadosCliente();assert.equal(a.cliente.nome,'Nome anterior');assert.equal(a.eventos.writes.length,0);assert.equal(a.form.hidden,true);
});
test('sem alterações não faz gravação',async()=>{const a=ambiente();await a.save();assert.equal(a.eventos.writes.length,0);});
test('sem login não grava e mantém os campos editados',async()=>{
    const a=ambiente({usuario:null});a.field('nome').value='Novo';await a.save();assert.equal(a.eventos.writes.length,0);assert.equal(a.cliente.nome,'Nome anterior');assert.equal(a.field('nome').value,'Novo');assert.match(a.eventos.msg[0],/Entre novamente/);
});
test('falha de gravação preserva cadastro e permite nova tentativa',async()=>{
    let falhar=true;const a=ambiente({salvar:async()=>{if(falhar)throw {code:'permission-denied'};}});a.field('nome').value='Novo';await a.save();assert.equal(a.cliente.nome,'Nome anterior');assert.equal(a.eventos.cache,0);assert.match(a.eventos.msg[0],/permissão/);falhar=false;await a.save();assert.equal(a.cliente.nome,'Novo');
});
test('duplo clique não duplica gravação nem muda memória antes da confirmação',async()=>{
    let confirmar;const a=ambiente({salvar:()=>new Promise(r=>confirmar=r)});a.field('nome').value='Novo';const p=a.save();await a.save();await new Promise(r=>setImmediate(r));assert.equal(a.eventos.writes.length,1);assert.equal(a.cliente.nome,'Nome anterior');confirmar();await p;assert.equal(a.cliente.nome,'Novo');
});
test('nome em branco é rejeitado',async()=>{const a=ambiente();a.field('nome').value='   ';await a.save();assert.equal(a.eventos.writes.length,0);assert.match(a.eventos.msg[0],/nome/);});
test('dados digitados são apresentados como texto sem interpretar HTML',async()=>{
    const a=ambiente();a.field('nome').value='<img onerror=alert(1)>';a.field('cpf').value='<b>teste</b>';await a.save();const c=a.ctx.document.getElementById('dadosPessoaisContainer');assert.equal(c.children[0].children[1].textContent,'<b>teste</b>');
});
