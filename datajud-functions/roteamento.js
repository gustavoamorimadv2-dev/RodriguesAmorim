import catalogo from './tribunais.json' with {type:'json'};
export const TRIBUNAIS = Object.freeze(catalogo.tribunais.map(rota => Object.freeze(rota)));
export const CATALOGO_VERSAO = catalogo.versao;
const porCodigo = new Map(TRIBUNAIS.map(rota => [rota.id, rota]));
export function localizarTribunal(segmento, codigoTribunal) {
  return porCodigo.get(`${Number(segmento)}-${String(Number(codigoTribunal)).padStart(2,'0')}`) || null;
}
export function rotaCorresponde(rota, esperado) {
  return !!rota && rota.id === esperado.id && rota.segmento === esperado.segmento &&
    rota.codigoTribunal === esperado.codigoTribunal && rota.sigla === esperado.sigla &&
    rota.endpoint === esperado.endpoint;
}
// A tabela no Firestore espelha somente os endereços oficiais do CNJ.
// Em falha de leitura/configuração, o catálogo embarcado mantém a mesma rota oficial.
export async function carregarRotaTribunal(db, identificacao, registrar = () => {}) {
  const esperado = localizarTribunal(identificacao.segmento, identificacao.codigoTribunal);
  if (!esperado) throw new Error('Tribunal não configurado');
  try {
    const doc = await db.collection('datajudTribunais').doc(esperado.id).get();
    if (doc.exists && rotaCorresponde(doc.data(), esperado)) return {...esperado, fonte:'firestore'};
    registrar({tribunal:esperado.sigla, motivo:doc.exists ? 'rota-incompativel' : 'rota-ausente'});
  } catch {
    registrar({tribunal:esperado.sigla, motivo:'catalogo-indisponivel'});
  }
  return {...esperado, fonte:'catalogo-local'};
}
