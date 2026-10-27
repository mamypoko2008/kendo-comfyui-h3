const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async()=>{
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname,name=pathname==='/'?'files.html':pathname.slice(1);
    if(!['files.html','files.js','v3-beta.css'].includes(name)){res.writeHead(404);res.end();return}
    res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html');
    res.end(fs.readFileSync(path.join(__dirname,'../web',name)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    const entry=(sequence,id,filename)=>({prompt:[sequence,id,{reference:{class_type:'MiniMaxH3ReferenceToVideo',inputs:{}},save:{class_type:'SaveVideo',inputs:{filename_prefix:'video/Kendo_H3_v3'}}}],outputs:{save:{images:[{filename,subfolder:'video',type:'output'}]}},status:{status_str:'success'}});
    let payload={old:entry(1,'old','Kendo_00001.mp4'),current:entry(2,'current','Kendo_00002.mp4')};
    await page.route('**/api/comfy/history?*',route=>route.fulfill({json:payload}));
    await page.route('**/api/kendo/status',route=>route.fulfill({json:{}}));
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.waitForFunction(()=>document.querySelectorAll('#generated-files article').length===2);
    assert.match(await page.locator('.generated-card video').nth(0).getAttribute('src'),/00002/);
    await page.locator('.generated-card video').nth(1).evaluate(video=>video.dataset.keep='same-node');
    payload={latest:entry(3,'latest','Kendo_00003.mp4'),old:entry(1,'old','Kendo_00001.mp4'),current:entry(2,'current','Kendo_00002.mp4')};
    await page.evaluate(()=>refresh());
    await page.waitForFunction(()=>document.querySelectorAll('#generated-files article').length===3);
    assert.match(await page.locator('.generated-card video').nth(0).getAttribute('src'),/00003/);
    assert.equal(await page.locator('.generated-card video').nth(2).getAttribute('data-keep'),'same-node');
    assert.deepEqual(errors,[]);
    console.log('Files UI passed: stable newest-first ordering and in-place video card updates');
  }finally{if(browser)await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
