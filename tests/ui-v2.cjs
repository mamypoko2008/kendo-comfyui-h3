const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async()=>{
 const server=http.createServer((req,res)=>{const name=req.url==='/'?'v2.html':req.url.slice(1);if(!['v2.html','v2.js','v2.css','workflow.js'].includes(name)){res.writeHead(404);res.end();return}res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(path.join(__dirname,'../web',name)))});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('kendo-h3-v2-history',JSON.stringify([{url:'/api/comfy/view?filename=old.mp4',prompt:'PROMPT MUST NOT APPEAR',seed:2847193051}])));
  let ready=false,submitted,uploads=0;
  await page.route('**/api/kendo/status',r=>r.fulfill({json:{models_ready:ready,comfy_ready:true,progress:ready?100:42}}));
  await page.route('**/api/comfy/upload/image',r=>{uploads++;return r.fulfill({json:{name:'uploaded-'+uploads+'.mp4',subfolder:''}})});
  await page.route('**/api/comfy/prompt',r=>{submitted=r.request().postDataJSON();return r.fulfill({json:{prompt_id:'test'}})});
  await page.route('**/api/comfy/history/*',r=>r.fulfill({json:{}}));
  await page.goto('http://127.0.0.1:'+server.address().port);
  assert.equal(await page.locator('#history article').count(),1);
  assert.equal(await page.locator('#history p').count(),0);
  assert.equal(await page.locator('#history').getByText('PROMPT MUST NOT APPEAR').count(),0);
  assert.equal(await page.locator('#video-enabled').isChecked(),false);
  assert.equal(await page.locator('#video-body').isHidden(),true);
  assert.equal(await page.locator('#seed-lock').isChecked(),false);
  await page.locator('.history-actions button').click();
  assert.equal(await page.locator('#seed-lock').isChecked(),true);
  assert.equal(await page.locator('#seed').inputValue(),'2847193051');
  assert.equal(await page.locator('#advanced').getAttribute('open'),'');
  assert.equal(await page.locator('#duration').getAttribute('type'),'range');
  assert.equal(await page.locator('#duration').getAttribute('min'),'5');assert.equal(await page.locator('#duration').getAttribute('max'),'20');
  await page.locator('#duration').fill('20');assert.equal(await page.locator('#duration-value').textContent(),'20 วินาที');
  assert.deepEqual(await page.locator('#quality option').evaluateAll(options=>options.map(option=>option.value)),['0.4','0.7','1','1.2','1.5','2']);
  assert.equal(await page.locator('#steps').inputValue(),'10');
  const controlWidth=await page.locator('.controls').evaluate(el=>getComputedStyle(el).resize);assert.equal(controlWidth,'horizontal');
  await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('42'));
  assert.ok(await page.locator('#generate').isDisabled());
  if(process.env.KENDO_UI_SCREENSHOT)await page.screenshot({path:process.env.KENDO_UI_SCREENSHOT.replace('{theme}','light'),fullPage:true});
  await page.locator('#theme').click();assert.equal(await page.locator('html').getAttribute('class'),'dark');
  if(process.env.KENDO_UI_SCREENSHOT)await page.screenshot({path:process.env.KENDO_UI_SCREENSHOT.replace('{theme}','dark'),fullPage:true});
  await page.reload();assert.equal(await page.locator('html').getAttribute('class'),'dark');
  const sample=(label,color)=>Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="'+color+'"/><circle cx="320" cy="245" r="105" fill="#f8d9c9"/><path d="M150 620c18-150 96-220 170-220s152 70 170 220" fill="#2a2633"/><text x="320" y="92" text-anchor="middle" font-family="Arial" font-size="42" fill="white">'+label+'</text></svg>');
  await page.locator('#image-input').setInputFiles([
    {name:'hero-closeup.png',mimeType:'image/svg+xml',buffer:sample('CLOSE UP','#7d1730')},
    {name:'character-side.png',mimeType:'image/svg+xml',buffer:sample('SIDE VIEW','#3a4668')},
    {name:'wardrobe-ref.png',mimeType:'image/svg+xml',buffer:sample('WARDROBE','#8a5a34')}
  ]);
  assert.equal(await page.locator('#image-count').textContent(),'3 / 9');
  assert.ok(await page.locator('#image-files img').first().evaluate(img=>img.getBoundingClientRect().width>=100));
  await page.locator('#advanced').evaluate(details=>details.open=true);
  await page.locator('#seed-lock').check();
  await page.locator('#seed').fill('123456789');
  if(process.env.KENDO_DESIGN_SCREENSHOT)await page.screenshot({path:process.env.KENDO_DESIGN_SCREENSHOT,fullPage:true});
  await page.locator('#image-input').setInputFiles(Array.from({length:10},(_,i)=>({name:i+'.png',mimeType:'image/svg+xml',buffer:sample('REF '+(i+1),i%2?'#475569':'#7d1730')})));
  assert.equal(await page.locator('#image-count').textContent(),'9 / 9');
  await page.locator('#video-input').setInputFiles({name:'ref.mp4',mimeType:'video/mp4',buffer:Buffer.from('mock')});
  await page.locator('#video-enabled').uncheck();
  await page.locator('#audio-enabled').check();
  await page.locator('#audio-input').setInputFiles(Array.from({length:4},(_,i)=>({name:i+'.wav',mimeType:'audio/wav',buffer:Buffer.from('mock')})));
  assert.equal(await page.locator('#audio-count').textContent(),'3 / 3');
  await page.locator('#prompt').fill('Use <Picture 1> and <Audio 1>');ready=true;
  await page.waitForFunction(()=>!document.querySelector('#generate').disabled);
  await page.locator('#generate').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('ส่งเข้าคิวแล้ว'));
  assert.equal(uploads,12);assert.ok(!submitted.prompt.refVideo0);assert.ok(submitted.prompt.audio2);assert.ok(submitted.prompt.image8);assert.equal(submitted.prompt.noise.inputs.noise_seed,123456789);
  await page.locator('#video-enabled').check();assert.equal(await page.locator('#video-count').textContent(),'1 / 1');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert.deepEqual(errors,[]);console.log('UI passed: seed reuse and lock, larger image thumbnails, prompt-free history, responsive controls, generation settings and reference limits');
 }finally{if(browser)await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
