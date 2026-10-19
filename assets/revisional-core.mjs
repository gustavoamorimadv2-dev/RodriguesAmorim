export const series = { '25471': 'PF - Aquisição de veículos', '25464': 'PF - Crédito pessoal não consignado' };
export const annual = rate => (Math.pow(1 + rate / 100, 12) - 1) * 100;
export function payment(principal, rate, count) {
  if (![principal, rate, count].every(Number.isFinite) || principal <= 0 || rate < 0 || !Number.isInteger(count) || count < 1) throw Error('Capital, taxa ou prazo inválido.');
  const i = rate / 100;
  return i === 0 ? principal / count : principal * i / -Math.expm1(-count * Math.log1p(i));
}
export function calculate(d, rate) {
  const parts = d.net + d.fee + d.iof + d.insurance + d.other;
  if (Math.abs(parts - d.total) > .011) throw Error('A composição do crédito não fecha. Confira os encargos e o total financiado.');
  if (d.exclude < 0 || d.exclude > d.fee + d.iof + d.insurance + d.other || d.exclude >= d.total) throw Error('A exclusão deve estar dentro do total de encargos financiados.');
  if (d.exclude > 0 && !d.reason.trim()) throw Error('Descreva o fundamento da exclusão simulada.');
  const revised = payment(d.total - d.exclude, rate, d.count);
  const original = payment(d.total, d.monthly, d.count);
  return {revised, original, difference: d.installment - revised, totalDifference: (d.installment - revised) * d.count, totalPaid: d.installment * d.count, revisedTotal: revised * d.count, principal: d.total - d.exclude, annual: annual(rate)};
}
export function queryURL(code, date, daily=false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || ![...Object.keys(series), '432'].includes(String(code))) throw Error('Data ou série inválida.');
  const [y,m,d] = date.split('-');
  const end = daily ? d : new Date(Number(y),Number(m),0).getDate();
  return `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=01/${m}/${y}&dataFinal=${end}/${m}/${y}`;
}
export function selectObservation(rows, date, daily=false) {
  if (!Array.isArray(rows)) throw Error('Resposta inválida do Banco Central.');
  const [y,m,d] = date.split('-');
  const valid = rows.filter(r => /^\d{2}\/\d{2}\/\d{4}$/.test(r.data) && r.data.slice(3) === `${m}/${y}` && (!daily || Number(r.data.slice(0,2)) <= Number(d)));
  valid.sort((a,b) => Number(a.data.slice(0,2))-Number(b.data.slice(0,2)));
  const row = daily ? valid.at(-1) : valid.length === 1 ? valid[0] : null;
  if (!row || String(row.valor).trim() === '' || !Number.isFinite(Number(row.valor)) || Number(row.valor)<0) throw Error('Não há taxa disponível para esse período. Confira a data e tente novamente.');
  return {date:row.data, value:Number(row.valor)};
}
