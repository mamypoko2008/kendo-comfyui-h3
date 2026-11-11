const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const native=require('../web/workflow-h3-image.js');

(async()=>{
  const web=path.join(__dirname,'../web'),allowed=new Set(['h3-image.html','h3-image.css','h3-image.js','workflow-h3-image.js','v3-beta.css','images-v4.css']);
  const model=native.MODELS.h3image,info=Object.fromEntries(native.REQUIRED.map(name=>[name,{}]));
  info.UNETLoader={input:{required:{unet_name:[[model.diffusion]]}}};info.CLIPLoader={input:{required:{clip_name:[[model.encoder]]}}};info.VAELoader={input:{required:{vae_name:[[model.vae]]}}};
  let submitted=null;
  const json=(res,value)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
  const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://x').pathname;
    if(pathname==='/api/kendo/status')return json(res,{models_ready:true,comfy_ready:true,mcp_ready:true,mcp_url:'https://pod-3001.proxy.runpod.net/mcp/kendo-secret',comfy_url:'https://pod-8188.proxy.runpod.net/'});
    if(pathname==='/api/kendo/image-status')return json(res,{files_ready:true,progress:100});
    if(pathname==='/api/kendo/logs')return json(res,{available:true,text:'H3 Image ready'});
    if(pathname==='/api/comfy/object_info')return json(res,info);
    if(pathname==='/api/comfy/queue')return json(res,{queue_running:[],queue_pending:[]});
    if(pathname.startsWith('/api/comfy/history'))return json(res,{});
    if(pathname==='/api/comfy/prompt'&&req.method==='POST'){const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{submitted=JSON.parse(Buffer.concat(chunks));json(res,{prompt_id:'ui-job'});});return;}
    const name=pathname==='/'?'h3-image.html':pathname.slice(1);if(!allowed.has(name)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(path.join(web,name)));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.querySelector('#image-status').textContent==='READY');
    assert.equal(await page.locator('#image-count').textContent(),'0 / 16');assert.equal(await page.locator('#image-resolution').inputValue(),'2K');assert.match(await page.locator('#image-size-note').textContent(),/2,048 × 2,048/);assert.match(await page.locator('#claude-state').textContent(),/วิดีโอและภาพนิ่ง/);
    await page.locator('#image-ratio').selectOption('3:1');await page.locator('#image-resolution').selectOption('MAX');assert.match(await page.locator('#image-size-note').textContent(),/7,7\d\d × 2,5\d\d/);
    await page.locator('#image-prompt').fill('A detailed Thai cinematic poster');await page.locator('#image-generate').click();await page.waitForFunction(()=>document.querySelector('#image-notice').textContent.includes('ส่งเข้าคิวแล้ว'));assert.equal(submitted.prompt.sampler.inputs.steps,6);assert.equal(submitted.prompt.conditioning.inputs.width>=7680,true);
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));assert.deepEqual(errors,[]);console.log('V4 beta.3 H3 Image UI passed');
  }finally{if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
