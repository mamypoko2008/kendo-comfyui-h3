const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

(async()=>{
  const allowed=new Set(['v3-beta.html','v3-beta.js','v3-beta.css','workflow-v3-beta.js']);
  const server=http.createServer((req,res)=>{
    const name=req.url==='/'?'v3-beta.html':req.url.slice(1);
    if(!allowed.has(name)){res.writeHead(404);res.end();return}
    res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html');
    res.end(fs.readFileSync(path.join(__dirname,'../web',name)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[];let submitted;let uploads=0;
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>localStorage.setItem('kendo-h3-v3-beta-history',JSON.stringify([{url:'/api/comfy/view?filename=old.mp4',prompt:'PROMPT MUST NOT APPEAR'}])));
    await page.route('**/api/kendo/status',route=>route.fulfill({json:{models_ready:true,base_models_ready:true,upscale_models_ready:true,fast_upscale_ready:true,quality_upscale_ready:true,comfy_ready:true,progress:100}}));
    await page.route('**/api/comfy/view?filename=old.mp4',route=>route.fulfill({status:200,contentType:'video/mp4',body:Buffer.from('mock-video')}));
    await page.route('**/api/comfy/upload/image',route=>{uploads++;route.fulfill({json:{name:'uploaded.mp4',subfolder:''}})});
    await page.route('**/api/comfy/prompt',route=>{submitted=route.request().postDataJSON();route.fulfill({json:{prompt_id:'upscale-job'}})});
    await page.route('**/api/comfy/history/*',route=>route.fulfill({json:{}}));
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.waitForFunction(()=>document.querySelector('#status').textContent==='READY');
    assert.equal(await page.locator('#history article').count(),1);
    assert.equal(await page.locator('#history').getByText('PROMPT MUST NOT APPEAR').count(),0);
    assert.equal(await page.locator('#history p').count(),0);
    const historyUpscale=page.locator('#history button');
    assert.equal(await historyUpscale.textContent(),'↑ อัปสเกล');
    assert.equal(await historyUpscale.isDisabled(),false);
    await historyUpscale.click();
    assert.equal(await page.locator('#upscale-workspace').isVisible(),true);
    assert.equal(await page.locator('#upscale-source-preview').getAttribute('src'),'/api/comfy/view?filename=old.mp4');
    assert.equal(uploads,0);
    assert.equal(submitted,undefined);
    await page.locator('#start-upscale').click();
    await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Real-ESRGAN Fast'));
    assert.equal(uploads,1);
    assert.equal(submitted.prompt.source.class_type,'VHS_LoadVideo');
    assert.equal(submitted.prompt.upscaleModel.class_type,'UpscaleModelLoader');
    assert.equal(submitted.prompt.upscale.class_type,'ImageUpscaleWithModel');
    assert.ok(!submitted.prompt.model&&!submitted.prompt.reference);
    assert.ok(!JSON.stringify(submitted).includes('FlashVSR'));
    if(process.env.KENDO_UI_SCREENSHOT)await page.screenshot({path:process.env.KENDO_UI_SCREENSHOT,fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('v3 beta.5 UI passed: hidden prompts and clip-selected standalone upscale workspace');
  }finally{
    if(browser)await browser.close();
    server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
