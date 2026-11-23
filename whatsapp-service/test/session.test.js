import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {WhatsAppSession} from '../session.js';
import {CloudSessionStore} from '../cloud-store.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(options={}){
 const clients=[];
 const controller=new WhatsAppSession({createClient:()=>{const c=new EventEmitter();c.initialize=()=>new Promise(()=>{});c.destroy=async()=>{c.destroyed=true;};clients.push(c);return c;},hasBackup:async()=>true,encodeQr:async value=>'image:'+value,canRun:()=>true,...options});
 return {controller,clients};
}
test('falha de restauração não deixa conexão presa; nova tentativa usa outro navegador',async()=>{
 const f=fixture();f.controller.connect();await flush();f.clients[0].emit('auth_failure');await flush();assert.equal(f.controller.state,'error');assert.equal(f.clients[0].destroyed,true);
 f.controller.connect({fresh:true});await flush();f.clients[1].emit('qr','fresh');await flush();assert.equal(f.controller.state,'qr');assert.equal(f.controller.qr,'image:fresh');assert.equal(f.controller.persisted,false);await f.controller.stop();
});
test('eventos do navegador anterior não sobrescrevem nova conexão',async()=>{
 const f=fixture();f.controller.connect();await flush();const old=f.clients[0];f.controller.connect({fresh:true});await flush();old.emit('ready');old.emit('disconnected');assert.equal(f.controller.state,'connecting');f.clients[1].emit('qr','new');await flush();assert.equal(f.controller.qr,'image:new');await f.controller.stop();
});
test('timeout encerra inicialização pendente e libera tentativa posterior',async()=>{
 const f=fixture({timeoutMs:15});f.controller.connect();await new Promise(r=>setTimeout(r,30));assert.equal(f.controller.state,'error');assert.equal(f.controller.error,'timeout');assert.equal(f.clients[0].destroyed,true);f.controller.connect();await flush();assert.equal(f.clients.length,2);await f.controller.stop();
});
test('QR suspende timeout enquanto usuário faz o pareamento; ready não afirma backup inexistente',async()=>{
 const f=fixture({timeoutMs:15,hasBackup:async()=>false});f.controller.connect();await flush();const c=f.clients[0];c.emit('qr','code');await flush();await new Promise(r=>setTimeout(r,30));assert.equal(f.controller.state,'qr');c.emit('authenticated');c.emit('ready');assert.equal(f.controller.state,'connected');assert.equal(f.controller.persisted,false);c.emit('remote_session_saved');assert.equal(f.controller.persisted,true);await f.controller.stop();
});
test('novo QR mantém o backup anterior até novo pareamento ser salvo',async()=>{
 let uploads=0,deletes=0;const file={name:'sessions/RemoteAuth-office.zip',exists:async()=>[true],delete:async()=>{deletes++;}};
 const bucket={file:()=>file,upload:async()=>{uploads++;}};const store=new CloudSessionStore(bucket,'/tmp/auth',{fresh:true});
 assert.equal(await store.sessionExists({session:'RemoteAuth-office'}),false);await store.delete({session:'RemoteAuth-office'});assert.equal(deletes,0);
 await store.save({session:'RemoteAuth-office'});assert.equal(uploads,1);assert.equal(await store.sessionExists({session:'RemoteAuth-office'}),true);
});
test('nova tentativa aguarda o navegador anterior terminar de fechar',async()=>{
 let close;const f=fixture();f.controller.connect();await flush();f.clients[0].destroy=()=>new Promise(r=>{close=r;});f.clients[0].emit('auth_failure');await flush();f.controller.connect({fresh:true});await flush();assert.equal(f.clients.length,1);close();await flush();await flush();assert.equal(f.clients.length,2);await f.controller.stop();
});

test('backup periódico confirma sessão mesmo sem evento inicial da biblioteca',async()=>{
 let onSaved;const f=fixture({hasBackup:async()=>true,createClient:options=>{onSaved=options.onSaved;const c=new EventEmitter();c.initialize=()=>new Promise(()=>{});c.destroy=async()=>{};f.clients.push(c);return c;}});
 f.controller.connect();await flush();const c=f.clients[0];c.emit('qr','reauth');await flush();c.emit('authenticated');c.emit('ready');assert.equal(f.controller.persisted,false);
 onSaved();assert.equal(f.controller.persisted,true);await f.controller.stop();
});
