import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bridgeLoginQr} from '../client.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('publica o QR oficial antes de existir Socket, acompanha rotação e só conclui quando Socket carrega',async()=>{
 const signal=new AbortController();let state={socket:false,qr:'official-a'},finish;const values=[];
 const page={evaluate:async()=>({...state}),waitForFunction:()=>new Promise(resolve=>{finish=resolve;})};
 let resolved=false;const waiting=bridgeLoginQr({page,emitQr:value=>values.push(value),signal:signal.signal,intervalMs:2}).then(()=>{resolved=true;});
 await sleep(8);assert.deepEqual(values,['official-a']);assert.equal(resolved,false);
 state.qr='official-b';await sleep(8);assert.deepEqual(values,['official-a','official-b']);assert.equal(resolved,false);
 state={socket:true,qr:'official-c'};await sleep(8);assert.equal(values.length,2);finish();await waiting;assert.equal(resolved,true);
});
test('cancelar uma conexão remove o monitor e não publica QR atrasado',async()=>{
 const abort=new AbortController();let reads=0;const values=[];
 const page={evaluate:async()=>{reads++;return {socket:false,qr:'official-a'};},waitForFunction:(_fn,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}))};
 const waiting=bridgeLoginQr({page,emitQr:value=>values.push(value),signal:abort.signal,intervalMs:2});
 await sleep(8);abort.abort();await assert.rejects(waiting,/aborted/);const count=reads;await sleep(8);assert.equal(reads,count);assert.deepEqual(values,['official-a']);
});
