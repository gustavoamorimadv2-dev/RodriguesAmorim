import { createHash } from 'node:crypto';
export function targetDate(now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 3);
  return date.toISOString().slice(0,10);
}
export function phoneNumber(value) {
  // Ambiguous lists and extensions require correcting the client record.
  if (!/^[+\d\s().-]+$/.test(String(value || ''))) return null;
  let number = String(value).replace(/\D/g, '');
  if (number.length === 10 || number.length === 11) number = '55' + number;
  return /^55[1-9]\d\d{8,9}$/.test(number) ? number : null;
}
export function eligible(p, date) {
  return p && p.id_parcela && p.status !== 'Pago' && p.vencimento === date;
}
export function deliveryKey(clientId, p) {
  return createHash('sha256').update(JSON.stringify([clientId,p.id_parcela,p.vencimento])).digest('hex');
}
export function message(client, p) {
  const date = p.vencimento.split('-').reverse().join('/');
  return `Olá, ${client.nome || 'cliente'}! Aqui é do Rodrigues Amorim. Passando para lembrar que sua parcela ${p.parcela || ''}, no valor de R$ ${p.valor}, vence em ${date}, daqui a três dias. Se já efetuou o pagamento, por favor desconsidere e nos envie o comprovante. Estamos à disposição!`;
}
export async function runBilling({db, logDb = db, session, now = new Date(), isEnabled = () => true}) {
  if (session.state !== 'connected' || !isEnabled()) return;
  const date = targetDate(now);
  const clients = await db.collection('clientes').get();
  for (const record of clients.docs) {
    for (const installment of (Array.isArray(record.data().honorarios) ? record.data().honorarios : [])) {
      if (!eligible(installment,date) || session.state !== 'connected' || !isEnabled()) continue;
      const ref = logDb.collection('whatsapp_envios').doc(deliveryKey(record.id,installment));
      // A durable claim prevents duplicate delivery after restarts or uncertain send results.
      const claimed = await logDb.runTransaction(async tx => {
        if ((await tx.get(ref)).exists) return false;
        tx.set(ref,{clientId:record.id,installmentId:installment.id_parcela,dueDate:date,status:'reserved',createdAt:new Date()});
        return true;
      });
      if (!claimed) continue;
      let sending = false;
      try {
        const fresh = (await record.ref.get()).data();
        const p = fresh?.honorarios?.find(p=>p.id_parcela===installment.id_parcela);
        if (!eligible(p,date)) { await ref.update({status:'cancelled'}); continue; }
        const phone = phoneNumber(fresh.numeros);
        if (!phone) { await ref.update({status:'invalid_phone'}); continue; }
        const number = await session.client.getNumberId(phone);
        if (!number) { await ref.update({status:'not_registered'}); continue; }
        // Recheck payment after WhatsApp lookup, immediately before sending.
        const latest = (await record.ref.get()).data();
        const current = latest?.honorarios?.find(p=>p.id_parcela===installment.id_parcela);
        if (!eligible(current,date) || session.state !== 'connected' || !isEnabled()) { await ref.update({status:'cancelled'}); continue; }
        sending = true;
        await session.client.sendMessage(number._serialized,message(latest,current));
        await ref.update({status:'sent',sentAt:new Date()});
      } catch {
        await ref.update({status:sending?'uncertain':'failed',updatedAt:new Date()});
      }
    }
  }
}
