// Isolated build verification: no saved credentials, phone pairing, or messages.
const puppeteer=require('puppeteer');
const {RemoteAuth}=require('whatsapp-web.js');
const browserOptions={headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']};
(async()=>{
 const {chromiumUserAgent}=await import('./session.js');
 const {CompatibleClient}=await import('./client.js');
 const browser=await puppeteer.launch(browserOptions);
 const userAgent=chromiumUserAgent(await browser.version());
 try{const page=await browser.newPage();await page.setContent('<h1>Rodrigues Amorim</h1>');if(await page.$eval('h1',node=>node.textContent)!=='Rodrigues Amorim')throw Error('Browser smoke failed');console.log('Chromium and Puppeteer smoke passed');}
 finally{await browser.close();}
 const store={sessionExists:async()=>false,save:async()=>{},extract:async()=>{},delete:async()=>{}};
 const client=new CompatibleClient({authStrategy:new RemoteAuth({clientId:'build-check',dataPath:'/tmp/qr-check',store,backupSyncIntervalMs:60_000}),userAgent,authTimeoutMs:90_000,webVersionCache:{type:'none'},puppeteer:browserOptions});
 await new Promise((resolve,reject)=>{
  let done=false;
  const timeout=setTimeout(()=>reject(new Error('Real WhatsApp QR generation timed out')),150_000);
  client.once('qr',()=>{done=true;clearTimeout(timeout);console.log('RemoteAuth QR generated successfully; QR contents discarded');resolve();});
  client.initialize().catch(error=>{if(!done){clearTimeout(timeout);reject(error);}});
 }).finally(()=>client.destroy().catch(()=>{}));
})().then(()=>process.exit(0)).catch(error=>{console.error(error.message || String(error));process.exit(1);});
