const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const qwen=require('../web/workflow-qwen-v4.js');
(async()=>{
  const root=path.resolve(__dirname,'../web'),output=path.resolve(__dirname,'../studio-preview');
  const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://x').pathname.slice(1)||'v4-image.html';if(!/^[\w.-]+\.(html|js|css)$/.test(name)||!fs.existsSync(path.join(root,name))){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(root,name)));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
  const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  const info=Object.fromEntries(qwen.REQUIRED.map(name=>[name,{input:{required:{}}}]));
  info.UNETLoader.input.required.unet_name=[[qwen.MODELS.qwen21.diffusion]];info.CLIPLoader.input.required.clip_name=[[qwen.ENCODER]];info.VAELoader.input.required.vae_name=[[qwen.VAE]];
  let filesReady=false,missingNode=false,submitted=[],history={},uploadCount=0,kieCalls=0,fixture;
  let queue={queue_running:[],queue_pending:[]},queueFailure=false,historyFailure=false;
  try{
    await p.route('**/api/kie/**',route=>{kieCalls++;return route.fulfill({status:503,json:{error:'not used'}});});
    await p.route('**/api/kendo/image-status',route=>route.fulfill({json:{files_ready:filesReady,progress:filesReady?100:42}}));
    await p.route('**/api/kendo/status',route=>route.fulfill({json:{models_ready:true,comfy_ready:true,progress:100,mcp_ready:true,mcp_url:'https://testpod-3001.proxy.runpod.net/mcp/test-code',comfy_url:'https://testpod-8188.proxy.runpod.net/'}}));
    await p.route('**/api/kendo/logs',route=>route.fulfill({json:{text:'Ready'}}));
    await p.route('**/api/comfy/object_info',route=>route.fulfill({json:missingNode?{...info,TextEncodeQwenImage21:undefined}:info}));
    await p.route('**/api/comfy/queue',route=>route.fulfill(queueFailure?{status:503,json:{error:'Queue unavailable'}}:{json:queue}));
    await p.route('**/api/comfy/history**',route=>route.fulfill(historyFailure?{status:503,json:{error:'History unavailable'}}:{json:history}));
    await p.route('**/api/comfy/upload/image',route=>{uploadCount++;return route.fulfill({json:{name:`reference-${uploadCount}.png`,subfolder:''}});});
    await p.route('**/api/comfy/view?*',route=>route.fulfill({body:fixture,contentType:'image/png'}));
    await p.route('**/api/comfy/prompt',route=>{const body=route.request().postDataJSON();submitted.push(body);return route.fulfill({json:{prompt_id:body.prompt.reference?'video-job':'image-job'}});});
    await p.goto(url+'/images-v4.html');await p.waitForFunction(()=>document.querySelector('#notice').textContent.includes('42%'));
    assert.equal(await p.locator('#generate').isDisabled(),true);assert.equal(await p.locator('#resolution').inputValue(),'2048');
    assert.equal(await p.locator('.reference-slot').count(),3);await p.locator('#add-reference').click();assert.equal(await p.locator('.reference-slot').count(),4);
    filesReady=true;missingNode=true;await p.reload();await p.waitForFunction(()=>document.querySelector('#notice').textContent.includes('ขาด node'));assert.equal(await p.locator('#generate').isDisabled(),true);
    missingNode=false;await p.reload();await p.waitForFunction(()=>!document.querySelector('#generate').disabled);
    await p.waitForFunction(()=>document.querySelector('#queue-state').textContent==='คิวว่าง');
    assert.equal(await p.locator('#queue-active-count').textContent(),'0');assert.equal(await p.locator('#queue-pending-count').textContent(),'0');
    // Queue updates independently of image history, including jobs submitted by video or MCP.
    historyFailure=true;queue={queue_running:[[1,'mcp-job',{},{}]],queue_pending:[[2,'video-job',{},{}],[3,'image-job',{},{}]]};
    await p.waitForFunction(()=>document.querySelector('#queue-active-count').textContent==='1'&&document.querySelector('#queue-pending-count').textContent==='2');
    assert.equal(await p.locator('#queue-state').textContent(),'ทั้งหมด 3 งาน');
    assert.equal(await p.locator('#queue-summary .has-jobs').count(),2);
    queueFailure=true;await p.waitForFunction(()=>document.querySelector('#queue-state').textContent==='อ่านคิวไม่ได้');
    assert.equal(await p.locator('#queue-active-count').textContent(),'–');assert.equal(await p.locator('#queue-pending-count').textContent(),'–');
    assert.equal(await p.locator('#queue-summary .has-jobs').count(),0);
    queueFailure=false;queue={queue_running:[],queue_pending:[[3,'image-job',{},{}]]};
    await p.waitForFunction(()=>document.querySelector('#queue-active-count').textContent==='0'&&document.querySelector('#queue-pending-count').textContent==='1');
    assert.equal(await p.locator('#queue-summary .queue-item.active.has-jobs').count(),0);
    assert.equal(await p.locator('#queue-summary .queue-item.pending.has-jobs').count(),1);
    historyFailure=false;queue={queue_running:[],queue_pending:[]};
    await p.waitForFunction(()=>document.querySelector('#queue-state').textContent==='คิวว่าง');
    assert.equal(await p.locator('#mcp-url').inputValue(),'https://testpod-3001.proxy.runpod.net/mcp/test-code');
    fixture=await p.locator('.logo').first().screenshot();
    await p.locator('#prompt').fill('Change <image1> into a premium product photograph');
    await p.locator('.reference-slot input').first().setInputFiles([{name:'ref.png',mimeType:'image/png',buffer:fixture}]);
    await p.waitForFunction(()=>document.querySelector('#image-count').textContent==='1 / 10');
    assert.equal(await p.locator('#ratio').isDisabled(),true);await p.locator('#transparent').check();
    await p.locator('#advanced').evaluate(el=>el.open=true);await p.locator('#seed-lock').check();await p.locator('#seed').fill('12345');
    assert.equal(submitted.length,0);await p.locator('#generate').click();await p.waitForFunction(()=>document.querySelector('#notice').textContent.includes('ส่งเข้าคิวแล้ว'));
    assert.equal(submitted.length,1);assert.equal(uploadCount,1);
    const graph=submitted[0].prompt;assert.equal(graph['6'].inputs.seed,12345);assert.equal(graph['6'].inputs.steps,25);
    assert.deepEqual(graph['6'].inputs.latent_image,['4',2]);assert.equal(graph['4'].inputs.resolution,2048);assert.match(graph['4'].inputs.prompt,/RGBA/);
    history={'image-job':{status:{completed:true,status_str:'success'},outputs:{'8':{images:[{filename:'Kendo_Qwen_V4_00001_.png',subfolder:'',type:'output'}]}}},'old-image':{outputs:{'8':{images:[{filename:'Kendo_Qwen21_00001_.png',type:'output'}]}}}};
    await p.waitForSelector('#result-actions:not([hidden])');assert.equal(await p.locator('.image-history article').count(),1);
    await p.locator('#use-video').click();await p.waitForURL('**/v4-image.html');await p.waitForFunction(()=>document.querySelector('#image-count').textContent==='1 / 9');
    assert.equal(submitted.length,1);assert.equal(await p.evaluate(()=>sessionStorage.getItem('kendo-v4-image-reference')),null);
    await p.locator('#prompt').fill('Slowly rotate the product');await p.waitForFunction(()=>!document.querySelector('#generate').disabled);await p.locator('#generate').click();
    await p.waitForFunction(()=>document.querySelector('#notice').textContent.includes('ส่งเข้าคิวแล้ว'));
    assert.equal(submitted.length,2);assert.equal(submitted[1].prompt.save.inputs.filename_prefix,'video/Kendo_H3_v4image');
    queue={queue_running:[[1,'image-job',{},{}]],queue_pending:[[2,'video-job',{},{}]]};
    await p.goto(url+'/images-v4.html');await p.waitForFunction(()=>!document.querySelector('#generate').disabled&&document.querySelector('#queue-active-count').textContent==='1');
    await p.screenshot({path:path.join(output,'v4-qwen-light.png'),fullPage:true});await p.locator('#theme').click();await p.screenshot({path:path.join(output,'v4-qwen-dark.png'),fullPage:true});
    for(const width of [390,320]){
      await p.setViewportSize({width,height:1000});
      for(const page of ['images-v4.html','v4-image.html']){
        await p.goto(url+'/'+page);await p.waitForFunction(()=>!document.querySelector('#generate').disabled);
        if(page==='images-v4.html')await p.locator('.image-connection').evaluate(el=>el.open=true);
        assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${page} at ${width}px`);
        await p.screenshot({path:path.join(output,`${page.replace('.html','')}-${width}.png`),fullPage:true});
      }
    }
    assert.equal(kieCalls,0);assert.deepEqual(errors,[]);
    console.log('V4 local Qwen UI passed: live shared queue counts, queue failure/recovery independent of history, readiness, standard 2K edits, direct generation, image/video handoff and mobile layouts.');
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
