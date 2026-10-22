// NNNNNNN-DD.AAAA.J.TR.OOOO: J identifica o segmento; TR, o tribunal de origem.
export const TRIBUNAIS_ESTADUAIS = ['ac','al','ap','am','ba','ce','dft','es','go','ma','mt','ms','mg','pa','pb','pr','pe','pi','rj','rn','rs','ro','rr','sc','se','sp','to'];
export class ConsultaError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export function identificarTribunal(valor) {
  if (typeof valor !== 'string' || !/^(?:\d{20}|\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})$/.test(valor.trim())) {
    throw new ConsultaError('invalid-argument', 'Informe um único processo com os 20 dígitos da numeração CNJ.');
  }
  const numero = valor.replace(/\D/g, '');
  const base = numero.slice(0, 7) + numero.slice(9) + '00';
  const digito = String(98n - BigInt(base) % 97n).padStart(2, '0');
  if (numero.slice(7, 9) !== digito) throw new ConsultaError('invalid-argument', 'O dígito verificador do processo é inválido. Confira o cadastro.');
  const segmento = Number(numero[13]);
  const codigoTribunal = Number(numero.slice(14, 16));
  let tribunal;
  if (segmento === 8 && codigoTribunal >= 1 && codigoTribunal <= 27) tribunal = `tj${TRIBUNAIS_ESTADUAIS[codigoTribunal - 1]}`;
  if (segmento === 4 && codigoTribunal >= 1 && codigoTribunal <= 6) tribunal = `trf${codigoTribunal}`;
  if (segmento === 5 && codigoTribunal >= 1 && codigoTribunal <= 24) tribunal = `trt${codigoTribunal}`;
  if (segmento === 6 && codigoTribunal >= 1 && codigoTribunal <= 27) tribunal = `tre-${TRIBUNAIS_ESTADUAIS[codigoTribunal - 1]}`;
  if (segmento === 9) tribunal = ({13:'tjmmg',21:'tjmrs',26:'tjmsp'})[codigoTribunal];
  if (codigoTribunal === 0) tribunal = ({3:'stj',5:'tst',6:'tse',7:'stm'})[segmento];
  if (!tribunal) throw new ConsultaError('invalid-argument', 'O tribunal de origem deste número não possui integração DataJud configurada.');
  return {numero, tribunal, segmento, codigoTribunal};
}
export function extrairUltimaMovimentacao(payload, numero) {
  if (!payload?.hits || !Array.isArray(payload.hits.hits) || payload.timed_out || payload._shards?.failed > 0) {
    throw new ConsultaError('unavailable', 'O DataJud retornou uma consulta incompleta. Tente novamente.');
  }
  const total = typeof payload.hits.total === 'number' ? payload.hits.total : payload.hits.total?.value;
  if (total > payload.hits.hits.length || payload.hits.total?.relation === 'gte') throw new ConsultaError('unavailable', 'Há mais registros do que o limite de consulta. Não foi possível determinar a última movimentação.');
  const registros = payload.hits.hits.map(h => h._source).filter(s => s?.numeroProcesso === numero);
  if (!registros.length) throw new ConsultaError('not-found', 'Processo não encontrado na base pública do DataJud. Confira o número ou consulte o tribunal.');
  const movimentos = registros.flatMap(s => (s.movimentos || []).map(m => ({...m, grau: s.grau})))
    .filter(m => typeof m.nome === 'string' && m.nome.trim() && Number.isFinite(Date.parse(m.dataHora)))
    .sort((a, b) => Date.parse(b.dataHora) - Date.parse(a.dataHora));
  if (!movimentos.length) throw new ConsultaError('not-found', 'O DataJud não disponibilizou movimentações com data para este processo.');
  const m = movimentos[0];
  return {nome:m.nome, codigo:m.codigo ?? null, dataHora:m.dataHora, grau:m.grau ?? null};
}
export async function consultarDatajud(valor, chave, fetchImpl = fetch) {
  const identificacao = identificarTribunal(valor);
  let response;
  try {
    response = await fetchImpl(`https://api-publica.datajud.cnj.jus.br/api_publica_${identificacao.tribunal}/_search`, {
      method:'POST', headers:{'Content-Type':'application/json', Authorization:`APIKey ${chave}`},
      body:JSON.stringify({size:100, track_total_hits:true, query:{match:{numeroProcesso:identificacao.numero}}, _source:['numeroProcesso','movimentos','grau']}),
      signal:AbortSignal.timeout(20000),
    });
  } catch { throw new ConsultaError('unavailable', 'Não foi possível conectar ao DataJud. Tente novamente em instantes.'); }
  if (!response.ok) throw new ConsultaError('unavailable', 'O DataJud está indisponível ou a chave de acesso precisa ser atualizada.');
  let payload;
  try { payload = await response.json(); } catch { throw new ConsultaError('unavailable', 'Resposta inválida do DataJud. Tente novamente.'); }
  return {...identificacao, movimentacao:extrairUltimaMovimentacao(payload, identificacao.numero), consultadoEm:new Date().toISOString()};
}
