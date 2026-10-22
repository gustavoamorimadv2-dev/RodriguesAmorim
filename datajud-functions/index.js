import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {warn, error as registrarErro} from 'firebase-functions/logger';
import {defineSecret} from 'firebase-functions/params';
import {initializeApp, getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {consultarDatajud, identificarTribunal, ConsultaError} from './datajud.js';
import {validarClienteProcesso, prepararAtualizacaoCrm} from './integracao-crm.js';

if (!getApps().length) initializeApp();
const datajudApiKey = defineSecret('DATAJUD_API_KEY');
const opcoes = {
  region:'us-central1', secrets:[datajudApiKey], timeoutSeconds:150,
  memory:'256MiB', maxInstances:3,
  cors:['https://rodrigues-amr.web.app','https://rodrigues-amr.firebaseapp.com','https://gustavoamorimadv2-dev.github.io', /^https:\/\/(?:www\.)?gruporodriguesamorim\.com$/],
};
async function executarConsulta(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Entre no sistema para consultar o DataJud.');
  let etapa = 'validacao';
  try {
    const {numero} = identificarTribunal(request.data?.numeroProcesso);
    const idCliente = request.data?.idClienteFirebase;
    let clienteRef;
    // Compatibilidade com páginas antigas: sem ID, retorna apenas a prévia.
    if (idCliente !== undefined) {
      if (typeof idCliente !== 'string' || !idCliente || idCliente.length > 1500 || idCliente.includes('/')) {
        throw new ConsultaError('invalid-argument', 'Identificação do cliente inválida.');
      }
      etapa = 'leitura-cliente';
      clienteRef = getFirestore().collection('clientes').doc(idCliente);
      const snapshot = await clienteRef.get();
      validarClienteProcesso(snapshot.exists ? snapshot.data() : null, numero);
    }
    etapa = 'datajud';
    const resultado = await consultarDatajud(numero, datajudApiKey.value(), fetch,
      {registrarFalha:detalhes => warn('Consulta DataJud sem resultado', detalhes)});
    const atualizacaoCrm = prepararAtualizacaoCrm(resultado, request.auth.uid);
    if (clienteRef) {
      etapa = 'gravar-rascunho';
      await clienteRef.update(atualizacaoCrm);
    }
    return {...resultado, atualizacaoCrm:clienteRef ? atualizacaoCrm : null, salvoNoCrm:!!clienteRef, sucesso:true};
  } catch (erro) {
    // Preserva not-found/unavailable. O código enviado convertia tudo em internal.
    if (erro instanceof HttpsError) throw erro;
    if (erro instanceof ConsultaError) throw new HttpsError(erro.code, erro.message);
    registrarErro('Falha na integração DataJud CRM', {etapa, tipo:erro?.name || 'Error', codigo:String(erro?.code || 'desconhecido')});
    throw new HttpsError('internal', `Não foi possível concluir a atualização (${etapa}). Tente novamente.`);
  }
}

export const gerarAndamentoDatajud = onCall(opcoes, executarConsulta);
export const consultarTribunalCrm = onCall(opcoes, executarConsulta);
