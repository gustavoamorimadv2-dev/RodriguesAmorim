import {onCall, HttpsError} from 'firebase-functions/v2/https';
import {warn} from 'firebase-functions/logger';
import {defineSecret} from 'firebase-functions/params';
import {consultarDatajud, ConsultaError} from './datajud.js';
const datajudApiKey = defineSecret('DATAJUD_API_KEY');
export const gerarAndamentoDatajud = onCall({
  region:'us-central1', secrets:[datajudApiKey], timeoutSeconds:120,
  memory:'256MiB', maxInstances:3,
  cors:['https://rodrigues-amr.web.app','https://rodrigues-amr.firebaseapp.com','https://gustavoamorimadv2-dev.github.io', /^https:\/\/(?:www\.)?gruporodriguesamorim\.com$/],
}, async request => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Entre no sistema para consultar o DataJud.');
  try { return await consultarDatajud(request.data?.numeroProcesso, datajudApiKey.value(), fetch, {registrarFalha: detalhes => warn("Consulta DataJud sem resultado", detalhes)}); }
  catch (error) {
    if (error instanceof ConsultaError) throw new HttpsError(error.code, error.message);
    throw new HttpsError('internal', 'Não foi possível gerar o andamento. Tente novamente.');
  }
});
