import {onSchedule} from 'firebase-functions/v2/scheduler';
import {defineString} from 'firebase-functions/params';
import {GoogleAuth} from 'google-auth-library';
const serviceUrl=defineString('WHATSAPP_SERVICE_URL');
const schedulerEmail=defineString('WHATSAPP_SCHEDULER_EMAIL');
export const lembrarParcelasWhatsApp=onSchedule({
  schedule:'*/5 9-17 * * *',timeZone:'America/Sao_Paulo',region:'us-central1',
  serviceAccount:schedulerEmail,timeoutSeconds:540,maxInstances:1,retryCount:2,minBackoffSeconds:60,
},async()=>{
  const url=serviceUrl.value().replace(/\/$/,'');
  const client=await new GoogleAuth().getIdTokenClient(url);
  await client.request({url:`${url}/internal/billing`,method:'POST',timeout:480_000});
});
