import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SessionLease} from '../lease.js';
import {CloudSessionStore} from '../cloud-store.js';
function lockFixture(){
 let value,clock=100000;
 const ref={firestore:{runTransaction:async fn=>fn({get:async()=>({data:()=>value}),set:(_ref,v)=>{value=v;},delete:()=>{value=undefined;}})}};
 return {a:new SessionLease(ref,'a',{now:()=>clock}),b:new SessionLease(ref,'b',{now:()=>clock}),advance:ms=>{clock+=ms;},value:()=>value};
}
test('somente uma revisão assume a sessão durante a validade do lease',async()=>{
 const f=lockFixture();assert.equal(await f.a.acquire(),true);assert.equal(await f.b.acquire(),false);
 f.advance(10000);assert.equal(await f.a.acquire(),true);assert.equal(await f.b.acquire(),false);
});
test('lease expira antes do próximo dono assumir; dono antigo não apaga lease novo',async()=>{
 const f=lockFixture();await f.a.acquire();f.advance(80000);assert.equal(f.a.valid(),false);
 f.advance(11000);assert.equal(await f.b.acquire(),true);await f.a.release();assert.equal(f.value().owner,'b');
});
test('liberação normal permite atualização sem aguardar o TTL',async()=>{
 const f=lockFixture();await f.a.acquire();await f.a.release();assert.equal(await f.b.acquire(),true);
});
test('backup e restauração usam somente o objeto privado da sessão',async()=>{
 const calls=[];const file={name:'sessions/RemoteAuth-office.zip',exists:async()=>[true],download:async x=>calls.push(['download',x]),delete:async x=>calls.push(['delete',x])};
 const bucket={file:name=>{assert.equal(name,file.name);return file;},upload:async(p,opts)=>calls.push(['upload',p,opts])};
 const store=new CloudSessionStore(bucket,'/tmp/ra-auth-test');
 assert.equal(await store.sessionExists({session:'RemoteAuth-office'}),true);
 await store.save({session:'RemoteAuth-office'});await store.extract({session:'RemoteAuth-office',path:'/tmp/restored.zip'});await store.delete({session:'RemoteAuth-office'});
 assert.equal(calls[0][1],'/tmp/ra-auth-test/RemoteAuth-office.zip');assert.equal(calls[0][2].destination,file.name);assert.equal(calls[0][2].metadata.cacheControl,'no-store');assert.deepEqual(calls[1],['download',{destination:'/tmp/restored.zip'}]);
 assert.throws(()=>store.file('../other-session'),/Invalid session/);
});
