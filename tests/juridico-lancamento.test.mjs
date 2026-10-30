import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(process.env.JURIDICO_HTML || new URL('../juridico.html',import.meta.url),'utf8');
const authCode=html.slice(html.indexOf('const auth = getAuth(app);'),html.indexOf('const storage = getStorage(app);'));
const toggleCode=html.slice(html.indexOf('const lancamentosEmGravacao ='),html.indexOf('// ================= CARREGAR E RENDERIZAR CARDS'));
function ambiente({usuario={uid:'equipe'},salvar=async()=>{}}={}) {
    let restaurar;
    const auth={currentUser:null},cliente={id:'teste',lancadoSistemaInterno:false},button={disabled:false};
    const eventos={gravacoes:[],cache:0,render:0,mensagens:[]};
    const ctx=vm.createContext({app:{},db:{},getAuth:()=>auth,onAuthStateChanged:(_,callback)=>{restaurar=()=>{auth.currentUser=usuario;callback(usuario);};return ()=>{};},console:{error(){}},window:{},clientesData:[cliente],document:{getElementById:()=>button},doc:(_,colecao,id)=>({colecao,id}),updateDoc:async(ref,patch)=>{eventos.gravacoes.push({ref,patch});await salvar();},atualizarCacheLocal:()=>eventos.cache++,aplicarFiltrosEOrdenacao:()=>eventos.render++,showToast:msg=>eventos.mensagens.push(msg)});
    vm.runInContext(authCode+toggleCode,ctx);
    return {ctx,auth,cliente,button,eventos,restaurar:()=>restaurar(),toggle:()=>ctx.window.toggleLancamento('teste')};
}
test('aguarda restauração de login e confirmação de gravação para marcar card',async()=>{
    let confirmar;const a=ambiente({salvar:()=>new Promise(resolve=>confirmar=resolve)});
    const p=a.toggle();assert.equal(a.button.disabled,true);assert.equal(a.eventos.gravacoes.length,0);
    a.restaurar();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(a.eventos.gravacoes.length,1);assert.equal(a.cliente.lancadoSistemaInterno,false);assert.equal(a.eventos.render,0);
    confirmar();await p;assert.equal(a.cliente.lancadoSistemaInterno,true);assert.equal(a.eventos.cache,1);assert.equal(a.eventos.render,1);assert.equal(a.button.disabled,false);
    assert.equal(a.eventos.gravacoes[0].patch.lancadoSistemaInterno,true);assert.equal(Object.keys(a.eventos.gravacoes[0].patch).length,1);
});
test('sem sessão não tenta gravar e orienta novo login',async()=>{
    const a=ambiente({usuario:null});a.restaurar();await a.toggle();
    assert.equal(a.eventos.gravacoes.length,0);assert.equal(a.cliente.lancadoSistemaInterno,false);assert.match(a.eventos.mensagens[0],/Entre novamente/);assert.equal(a.button.disabled,false);
});
test('permissão negada não deixa card marcado nem altera cache',async()=>{
    const a=ambiente({salvar:async()=>{throw {code:'permission-denied'};}});a.restaurar();await a.toggle();
    assert.equal(a.cliente.lancadoSistemaInterno,false);assert.equal(a.eventos.cache,0);assert.equal(a.eventos.render,0);assert.match(a.eventos.mensagens[0],/permissão/);assert.equal(a.button.disabled,false);
});
test('duplo clique durante gravação não envia duas alterações',async()=>{
    let confirmar;const a=ambiente({salvar:()=>new Promise(r=>confirmar=r)});a.restaurar();const p=a.toggle();await a.toggle();await new Promise(r=>setImmediate(r));
    assert.equal(a.eventos.gravacoes.length,1);confirmar();await p;
});
test('desmarca a partir do estado salvo, sem depender de argumento antigo do HTML',async()=>{
    const a=ambiente();a.cliente.lancadoSistemaInterno=true;a.restaurar();await a.ctx.window.toggleLancamento('teste',false);
    assert.equal(a.eventos.gravacoes[0].patch.lancadoSistemaInterno,false);assert.equal(a.cliente.lancadoSistemaInterno,false);
});
test('falha de conexão mantém marcação anterior e permite tentar novamente',async()=>{
    let falhar=true;const a=ambiente({salvar:async()=>{if(falhar)throw {code:'firestore/unavailable'};}});a.restaurar();await a.toggle();
    assert.equal(a.cliente.lancadoSistemaInterno,false);assert.match(a.eventos.mensagens[0],/conexão/);
    falhar=false;await a.toggle();assert.equal(a.cliente.lancadoSistemaInterno,true);
});
test('cliente removido recebe mensagem específica e mantém o estado anterior',async()=>{
    const a=ambiente({salvar:async()=>{throw {code:'not-found'};}});a.restaurar();await a.toggle();assert.equal(a.eventos.cache,0);assert.match(a.eventos.mensagens[0],/Sincronize/);
});
