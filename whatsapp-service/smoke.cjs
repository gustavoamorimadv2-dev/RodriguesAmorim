// Build-time verification on Linux / Node 22; never connects or sends WhatsApp messages.
const puppeteer=require('puppeteer');
(async()=>{
 const browser=await puppeteer.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']});
 try{const page=await browser.newPage();await page.setContent('<h1>Rodrigues Amorim</h1>');if(await page.$eval('h1',node=>node.textContent)!=='Rodrigues Amorim')throw Error('Browser smoke failed');console.log('Chromium and Puppeteer smoke passed');}
 finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
