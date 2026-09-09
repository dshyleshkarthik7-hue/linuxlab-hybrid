import { chromium } from '/tmp/linuxlab-playwright/node_modules/playwright/lib/index.js';

const baseURL=process.argv[2];
if(!baseURL) throw new Error('Missing base URL');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
try{
  await page.route('**/api/iso**', async route=>{
    const range=route.request().headers().range;
    await route.fulfill({
      status:range?206:200,
      headers:range?{'content-range':'bytes 0-0/1','accept-ranges':'bytes','content-length':'1','content-type':'application/octet-stream'}:{'content-length':'1','content-type':'application/octet-stream'},
      body:Buffer.from([0])
    });
  });
  await page.goto(baseURL+'/real-linux/',{waitUntil:'networkidle',timeout:30000});
  for(const selector of ['#btn-v86-terminal','#btn-v86-screen','#btn-v86-alpine','#btn-v86-virt','#btn-v86-restart','#v86-health']) {
    if(await page.locator(selector).count()!==1) throw new Error('Missing control '+selector);
  }
  await page.waitForFunction(()=>Boolean(window.linuxLabVM),(null),{timeout:20000});
  await page.waitForFunction(()=>Boolean(window.linuxLabVM && window.linuxLabVM.emulator),(null),{timeout:20000});
  await page.click('#btn-v86-screen');
  await page.waitForFunction(()=>!document.getElementById('screen_container')?.hidden && Boolean(document.getElementById('v86-terminal-container')?.hidden));
  await page.click('#btn-v86-terminal');
  await page.waitForFunction(()=>Boolean(document.getElementById('screen_container')?.hidden) && !document.getElementById('v86-terminal-container')?.hidden);
  await page.click('#btn-v86-virt');
  await page.waitForFunction(()=>document.getElementById('v86-status')?.textContent?.includes('Alpine Virt') || false,{timeout:20000});
  await page.waitForFunction(()=>Boolean(window.linuxLabVM && window.linuxLabVM.emulator),null,{timeout:20000});
  console.log('Browser VM controls smoke test passed');
} finally {
  await browser.close();
}
