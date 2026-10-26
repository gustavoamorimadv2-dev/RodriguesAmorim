import {ConsultaError} from './datajud.js';

export function validarClienteProcesso(cliente, numero) {
  if (!cliente) throw new ConsultaError('not-found', 'Cliente não encontrado no CRM.');
  const cadastro = String(cliente.processo || cliente.numeroProcesso || '');
  const numeros = (cadastro.match(/(?:\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}|\d{20})/g) || []).map(n => n.replace(/\D/g, ''));
  if (!numeros.includes(numero)) throw new ConsultaError('invalid-argument', 'Este processo não está cadastrado no cliente selecionado.');
}

export function prepararAtualizacaoCrm(resultado, uid) {
  // Campos de envio/fila/status são exclusivos do fluxo de revisão e envio do CRM.
  return {
    datajudNumeroProcesso:resultado.numero,
    datajudTribunal:resultado.tribunal,
    datajudEndpoint:resultado.endpoint || '',
    datajudTribunalNome:resultado.tribunalNome || resultado.tribunal.toUpperCase(),
    datajudRoteamentoFonte:resultado.fonteRoteamento || 'catalogo-local',
    datajudUltimaMovimentacaoEm:resultado.movimentacao.dataHora,
    datajudUltimoAndamentoTexto:resultado.movimentacao.termoTribunal,
    datajudConsultadoEm:resultado.consultadoEm,
    datajudAtualizadoPor:uid,
  };
}
