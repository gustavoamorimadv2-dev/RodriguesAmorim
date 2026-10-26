import {localizarTribunal, rotaCorresponde} from './roteamento.js';
// NNNNNNN-DD.AAAA.J.TR.OOOO: J identifica o segmento; TR, o tribunal de origem.
export class ConsultaError extends Error {
  constructor(code, message, motivo = code) { super(message); this.code = code; this.motivo = motivo; }
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
  const rota = localizarTribunal(segmento, codigoTribunal);
  if (!rota) throw new ConsultaError('invalid-argument', 'O tribunal de origem deste número não possui endpoint público configurado no DataJud.');
  return {numero, tribunal:rota.sigla, segmento, codigoTribunal, chaveTribunal:rota.id,
    tribunalNome:rota.nome, uf:rota.uf, endpoint:rota.endpoint};
}
export function extrairUltimaMovimentacao(payload, numero) {
  if (!payload?.hits || !Array.isArray(payload.hits.hits) || payload.timed_out || payload._shards?.failed > 0) {
    throw new ConsultaError('unavailable', 'O DataJud retornou uma consulta incompleta. Tente novamente.', 'consulta-incompleta');
  }
  const total = typeof payload.hits.total === 'number' ? payload.hits.total : payload.hits.total?.value;
  if (total > payload.hits.hits.length || payload.hits.total?.relation === 'gte') throw new ConsultaError('unavailable', 'Há mais registros do que o limite de consulta. Não foi possível determinar a última movimentação.');
  const registros = payload.hits.hits.map(h => h?._source).filter(s => typeof s?.numeroProcesso === 'string' && s.numeroProcesso.replace(/\D/g,'') === numero);
  if (!registros.length && payload.hits.hits.length) throw new ConsultaError('data-loss', 'O DataJud retornou registros com uma numeração diferente da solicitada. A atualização foi interrompida.', 'numero-incompativel');
  if (!registros.length) throw new ConsultaError('not-found', 'Processo não encontrado na base pública do DataJud. Confira o número ou consulte o tribunal.', 'processo-ausente');
  const movimentos = registros.flatMap(s => (Array.isArray(s.movimentos) ? s.movimentos : []).filter(m => m && typeof m === 'object').map(m => ({...m, grau: s.grau})))
    .filter(m => typeof m.nome === 'string' && m.nome.trim() && Number.isFinite(Date.parse(m.dataHora)))
    .sort((a, b) => Date.parse(b.dataHora) - Date.parse(a.dataHora));
  if (!movimentos.length) throw new ConsultaError('not-found', 'O DataJud não disponibilizou movimentações com data para este processo.', 'movimentos-ausentes');
  const m = movimentos[0];
  const complementos = (Array.isArray(m.complementosTabelados) ? m.complementosTabelados : [])
    .map(c => typeof c?.nome === 'string' ? c.nome.trim() : '').filter(Boolean);
  return {nome:m.nome, codigo:m.codigo ?? null, dataHora:m.dataHora, grau:m.grau ?? null, termoTribunal:[m.nome, ...complementos].join(' - ')};
}
// Cada tentativa tem prazo próprio; a função e o navegador aguardam o ciclo completo.
export const PRAZO_DATAJUD_MS = 35000;
export const MAX_TENTATIVAS = 3;
export async function consultarDatajud(valor, chave, fetchImpl = fetch, opcoes = {}) {
  const identificacao = identificarTribunal(valor);
  const esperado = localizarTribunal(identificacao.segmento, identificacao.codigoTribunal);
  if (opcoes.rota && !rotaCorresponde(opcoes.rota, esperado)) throw new ConsultaError('failed-precondition', 'A rota configurada não corresponde ao tribunal do processo.', 'rota-incompativel');
  const endpoint = opcoes.rota?.endpoint || identificacao.endpoint;
  const fonteRoteamento = opcoes.rota?.fonte || 'catalogo-local';
  const aguardar = opcoes.aguardar || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method:'POST', headers:{'Content-Type':'application/json', Authorization:`APIKey ${String(chave).trim()}`},
          // Mesmo corpo de consulta do código que já funciona no aplicativo.
          body:JSON.stringify({query:{match:{numeroProcesso:identificacao.numero}}}),
          signal:AbortSignal.timeout(PRAZO_DATAJUD_MS),
        });
      } catch {
        throw new ConsultaError('unavailable', 'O DataJud demorou a responder ou está temporariamente indisponível. Tente novamente em instantes.', 'conexao-ou-tempo');
      }
      if (!response.ok) {
        const credencial = response.status === 401 || response.status === 403;
        throw new ConsultaError(credencial ? 'failed-precondition' : 'unavailable', credencial
          ? 'A chave de acesso ao DataJud precisa ser atualizada no servidor.'
          : 'O DataJud está temporariamente indisponível. Tente novamente em instantes.', `http-${response.status}`);
      }
      let payload;
      try { payload = await response.json(); } catch {
        throw new ConsultaError('unavailable', 'Resposta inválida do DataJud. Tente novamente.', 'json-invalido');
      }
      const totalRegistros = typeof payload?.hits?.total === 'number' ? payload.hits.total : payload?.hits?.total?.value;
      const registrosRetornados = Array.isArray(payload?.hits?.hits) ? payload.hits.hits.length : 0;
      opcoes.registrarResposta?.({tribunal:identificacao.tribunal, chaveTribunal:identificacao.chaveTribunal,
        endpoint, fonteRoteamento, tentativa, http:response.status || 200,
        totalRegistros:totalRegistros ?? null, registrosRetornados, consultaParcial:!!payload?.timed_out || !!payload?._shards?.failed});
      try {
        return {...identificacao, endpoint, fonteRoteamento, movimentacao:extrairUltimaMovimentacao(payload, identificacao.numero), consultadoEm:new Date().toISOString()};
      } catch (erro) {
        if (erro instanceof ConsultaError) {
          erro.detalhes = {tribunal:identificacao.tribunal, uf:identificacao.uf, endpoint,
            chaveTribunal:identificacao.chaveTribunal, totalRegistros:totalRegistros ?? null, registrosRetornados};
          if (erro.motivo === 'processo-ausente') erro.message = `Nenhum registro encontrado no DataJud do ${identificacao.tribunal.toUpperCase()}. O tribunal foi selecionado pela numeração do processo.`;
        }
        throw erro;
      }
    } catch (error) {
      // Diagnóstico sem número de processo, nome, token ou chave de acesso.
      opcoes.registrarFalha?.({tribunal:identificacao.tribunal, tentativa, motivo:error.motivo || 'interno', codigo:error.code || 'internal'});
      if (error.code !== 'unavailable' || tentativa === MAX_TENTATIVAS) throw error;
      await aguardar(tentativa * 500);
    }
  }
}
