import {test} from 'node:test';
import assert from 'node:assert/strict';
import {targetDate,phoneNumber,eligible,deliveryKey,runBilling} from '../billing.js';
test('três dias corridos em Brasília, inclusive virada de mês/ano',()=>{
 assert.equal(targetDate(new Date('2027-01-01T01:00:00Z')),'2027-01-03');
 assert.equal(targetDate(new Date('2026-02-27T15:00:00Z')),'2026-03-02');
});
test('telefone brasileiro e rejeição de listas ambíguas',()=>{
 assert.equal(phoneNumber('(11) 99999-9999'),'5511999999999');
 assert.equal(phoneNumber('+55 11 99999-9999'),'5511999999999');
 assert.equal(phoneNumber('11999999999 / 11888888888'),null);
 assert.equal(phoneNumber(''),null);
});
test('somente parcela não paga com identificador e vencimento exato',()=>{
 const p={id_parcela:'1',status:'Pendente',vencimento:'2026-10-18'};
 assert.ok(eligible(p,'2026-10-18'));
 assert.ok(!eligible({...p,status:'Pago'},'2026-10-18'));
 assert.ok(!eligible(p,'2026-10-19'));
 assert.notEqual(deliveryKey('a',p),deliveryKey('b',p));
});
function fixture({paid=false,fail=false}={}) {
 const p={id_parcela:'1',status:'Pendente',vencimento:'2026-10-18',valor:'100,00'};
 const client={nome:'Maria',numeros:'11999999999',honorarios:[p]};
 const logs=new Map();let count=0;
 const record={id:'a',data:()=>client,ref:{get:async()=>({data:()=>({...client,honorarios:[{...p,status:paid?'Pago':'Pendente'}]})})}};
 const db={collection:name=>name==='clientes'?{get:async()=>({docs:[record]})}:{doc:key=>({key,update:async v=>logs.set(key,{...logs.get(key),...v})})},runTransaction:async fn=>fn({get:async ref=>({exists:logs.has(ref.key)}),set:(ref,value)=>logs.set(ref.key,value)})};
 const session={state:'connected',client:{getNumberId:async()=>({_serialized:'phone@c.us'}),sendMessage:async()=>{count++;if(fail)throw Error('uncertain');}}};
 return {db,session,logs,count:()=>count,now:new Date('2026-10-15T15:00:00Z')};
}
test('reinício não repete lembrete enviado',async()=>{const f=fixture();await runBilling(f);await runBilling(f);assert.equal(f.count(),1);assert.equal([...f.logs.values()][0].status,'sent');});
test('pagamento feito depois da consulta inicial cancela envio',async()=>{const f=fixture({paid:true});await runBilling(f);assert.equal(f.count(),0);});
test('falha ambígua não provoca reenvio automático',async()=>{const f=fixture({fail:true});await runBilling(f);await runBilling(f);assert.equal(f.count(),1);assert.equal([...f.logs.values()][0].status,'uncertain');});
test('sessão desconectada não inicia cobrança',async()=>{const f=fixture();f.session.state='disconnected';await runBilling(f);assert.equal(f.logs.size,0);});

test('desativar durante consulta interrompe antes do envio',async()=>{const f=fixture();let enabled=true;f.isEnabled=()=>enabled;f.session.client.getNumberId=async()=>{enabled=false;return {_serialized:'phone@c.us'};};await runBilling(f);assert.equal(f.count(),0);});
