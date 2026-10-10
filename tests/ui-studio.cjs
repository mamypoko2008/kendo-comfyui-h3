const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const model=require('../web/workflow-images.js');
const output=path.resolve(__dirname,'../studio-preview');
(async()=>{
  const {createStudioServer}=await import('../mcp/studio-server.mjs');
  const server=createStudioServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  await fs.mkdir(output,{recursive:true});
  const errors=[];
  try {
    const p=await browser.newPage({viewport:{width:1440,height:1100}});
    p.on('pageerror',e=>errors.push(e.message));
    await p.goto(url+'/seedance25.html');
    await p.waitForFunction(()=>document.querySelector('#connection-state').textContent.includes('ยังไม่ได้ตั้ง'));
    assert.equal(await p.locator('.reference-slot').count(),3);
    assert.equal(await p.locator('#price').textContent(),'$3.15');
    assert.match(await p.locator('#price-baht').textContent(),/105.62/);
    await p.locator('#add-references').click();assert.equal(await p.locator('.reference-slot').count(),4);
    await p.locator('#video-model').selectOption('seedance-2');
    assert.equal(await p.locator('#price').textContent(),'$2.05');
    assert.equal(await p.locator('#duration').getAttribute('max'),'15');
    assert.equal(await p.locator('#prompt').getAttribute('maxlength'),'20000');
    await p.locator('#resolution').selectOption('4k');
    assert.equal(await p.locator('#price').textContent(),'$10.40');
    await p.locator('#video-model').selectOption('seedance-2-5');
    assert.equal(await p.locator('#resolution').inputValue(),'720p');
    const fixture=await p.locator('.logo').screenshot();
    const refs=n=>Array.from({length:n},(_,i)=>({name:`ref-${i}.png`,mimeType:'image/png',buffer:fixture}));
    await p.locator('.upload-input input').first().setInputFiles(refs(10));
    await p.waitForFunction(()=>document.querySelector('#image-count').textContent==='10 / 30');
    await p.locator('#video-model').selectOption('seedance-2');
    assert.equal(await p.locator('#image-count').textContent(),'10 / 9');
    assert.equal(await p.locator('.remove-image').count(),10); // retains every reference
    await p.locator('#prompt').fill('A natural walking motion');
    await p.locator('#generate').click();assert.equal(await p.locator('#review-dialog').isVisible(),false);
    await p.locator('.remove-image').last().click();await p.locator('#generate').click();
    assert.equal(await p.locator('#confirm-generate').isVisible(),false);await p.locator('.review-done').click();
    await p.locator('#video-model').selectOption('seedance-2-5');
    for(let i=await p.locator('.reference-slot').count();i<30;i++) await p.locator('#add-references').click();
    assert.equal(await p.locator('.reference-slot').count(),30);assert.equal(await p.locator('#add-references').isDisabled(),true);
    await p.reload();await p.screenshot({path:path.join(output,'video-desktop.png'),fullPage:true});

    let paid=[];
    await p.route('**/api/kie/**',async route=>{
      const req=route.request(),pathname=new URL(req.url()).pathname;
      let data={};
      if(pathname.endsWith('/status')) data={configured:true,authenticated:true,access_configured:true};
      if(pathname.endsWith('/jobs')&&req.method()==='GET') data={jobs:[]};
      if(pathname.endsWith('/jobs')&&req.method()==='POST') {paid.push(req.postDataJSON());data={task_id:'mock-paid',kind:'video',model:'bytedance/seedance-2',state:'waiting',estimate_usd:2.05,created_at:new Date().toISOString(),result_urls:[]};}
      await route.fulfill({json:data});
    });
    await p.reload();await p.waitForFunction(()=>document.querySelector('#connection-state').textContent.includes('เชื่อมต่อแล้ว'));
    await p.locator('#video-model').selectOption('seedance-2');await p.locator('#prompt').fill('Walk forward slowly');
    await p.locator('#generate').click();assert.equal(paid.length,0);
    await p.locator('#confirm-generate').click();await p.waitForFunction(()=>document.querySelector('#job-notice').textContent.includes('ส่งงานแล้ว'));
    assert.equal(paid.length,1);assert.equal(paid[0].model,'seedance-2');assert.equal(paid[0].confirm_cost,true);

    await p.goto(url+'/images.html');await p.waitForFunction(()=>document.querySelector('#connection-state').textContent.includes('ยังเชื่อมต่อ'));
    assert.equal(await p.locator('.reference-slot').count(),3);
    await p.locator('#prompt').fill('A realistic ceramic cup');await p.locator('#generate').click();
    assert.equal(await p.locator('#confirm-image').isVisible(),false);await p.locator('.review-done').click();
    await p.screenshot({path:path.join(output,'images-desktop.png'),fullPage:true});
    const info=Object.fromEntries(model.REQUIRED.map(n=>[n,{}]));
    info.UNETLoader={input:{required:{unet_name:[[model.MODELS['qwen21-turbo'].diffusion,model.MODELS.qwen21.diffusion]]}}};
    info.CLIPLoader={input:{required:{clip_name:[[model.ENCODER]]}}};info.VAELoader={input:{required:{vae_name:[[model.VAE]]}}};
    let local=[];
    await p.route('**/api/comfy/**',async route=>{
      const req=route.request(),pathname=new URL(req.url()).pathname;
      let data={};
      if(pathname.endsWith('/object_info')) data=info;
      if(pathname.endsWith('/upload/image')) data={name:'uploaded-ref.png',subfolder:'',type:'input'};
      if(pathname.endsWith('/prompt')) {local.push(req.postDataJSON());data={prompt_id:`image-test-0${local.length}`};}
      if(pathname.endsWith('/history/image-test-01')) data={'image-test-01':{status:{completed:true,status_str:'success'},outputs:{8:{images:[{filename:'test-result.png',subfolder:'',type:'output'}]}}}};
      if(pathname.endsWith('/history/image-test-02')) data={'image-test-02':{status:{completed:true,status_str:'success'},outputs:{161:{images:[{filename:'Kendo_Qwen21_Klein_before_00001.png',type:'output'}]},162:{images:[{filename:'Kendo_Qwen21_Klein_after_00001.png',type:'output'}]}}}};
      if(pathname.endsWith('/view')) return route.fulfill({contentType:'image/png',body:fixture});
      await route.fulfill({json:data});
    });
    await p.locator('#connection-refresh').click();await p.waitForFunction(()=>document.querySelector('#connection-state').textContent.includes('พร้อมสร้าง'));
    await p.locator('.upload-input input').first().setInputFiles(refs(2));
    await p.waitForFunction(()=>document.querySelector('#image-count').textContent==='2 / 10');
    assert.equal(await p.locator('#ratio').isDisabled(),true);
    await p.locator('#transparent').check();await p.locator('#generate').click();assert.equal(local.length,0);
    await p.locator('#confirm-image').click();await p.waitForFunction(()=>document.querySelector('#job-notice').textContent.includes('ส่งงานแล้ว'));
    assert.equal(local.length,1);assert.deepEqual(local[0].prompt['6'].inputs.latent_image,['4',2]);
    assert.match(local[0].prompt['4'].inputs.prompt,/RGBA/);
    await p.locator('#history-results').getByText('ดูภาพ',{exact:true}).waitFor();
    assert.equal(await p.locator('#preview-canvas>img').count(),1);
    await p.locator('#image-model').selectOption('qwen21-klein');
    assert.equal(await p.locator('.remove-image').count(),2);
    assert.equal(await p.locator('#transparent').isDisabled(),true);
    assert.equal(await p.locator('#image-steps').inputValue(),'30');
    assert.equal(await p.locator('#resolution').inputValue(),'2048');
    await p.locator('#generate').click();assert.equal(await p.locator('#review-dialog').isVisible(),false);assert.equal(local.length,1);
    await p.locator('.remove-image').last().click();await p.locator('.remove-image').last().click();
    await p.locator('#generate').click();assert.equal(await p.locator('#confirm-image').isVisible(),false);await p.locator('.review-done').click();
    for(const n of model.KLEIN_REQUIRED) info[n]??={};
    info.UNETLoader.input.required.unet_name[0].push(model.MODELS['qwen21-klein'].diffusion,model.KLEIN.diffusion);
    info.CLIPLoader.input.required.clip_name[0].push(model.MODELS['qwen21-klein'].encoder,model.KLEIN.encoder);
    info.VAELoader.input.required.vae_name[0].push(model.KLEIN.vae);
    await p.locator('#connection-refresh').click();await p.waitForFunction(()=>document.querySelector('#connection-state').textContent.includes('พร้อมสร้าง'));
    await p.locator('#attached-lora').check();
    await p.locator('#generate').click();assert.equal(await p.locator('#confirm-image').isVisible(),false);await p.locator('.review-done').click();
    await p.locator('#attached-lora').uncheck();await p.locator('#generate').click();assert.equal(local.length,1);
    await p.locator('#confirm-image').click();await p.waitForFunction(()=>document.querySelector('#job-notice').textContent.includes('image-test-02'));
    assert.equal(local.length,2);assert.equal(local[1].prompt['53'].inputs.steps,2);
    await p.locator('#history-results').getByText('หลัง Flux Klein',{exact:true}).waitFor();
    assert.ok((await p.locator('#preview-canvas>img').getAttribute('src')).includes('Klein_after'));
    await p.screenshot({path:path.join(output,'images-klein-desktop.png'),fullPage:true});
    await p.locator('#theme').click();await p.screenshot({path:path.join(output,'images-dark.png'),fullPage:true});
    for(const width of [390,320]) {
      await p.setViewportSize({width,height:1100});
      for(const name of ['images.html','seedance25.html']) {
        await p.goto(url+'/'+name);await p.waitForTimeout(120);
        assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name} ${width}px overflow`);
        assert.equal(await p.locator('nav a[href="./images.html"]').isVisible(),true);
        await p.screenshot({path:path.join(output,`${name.split('.')[0]}-mobile-${width}.png`),fullPage:true});
      }
      await p.goto(url+'/images.html');await p.locator('#image-model').selectOption('qwen21-klein');
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Klein ${width}px overflow`);
      await p.screenshot({path:path.join(output,`images-klein-mobile-${width}.png`),fullPage:true});
    }
    assert.deepEqual(errors,[]);console.log('Studio UI passed: both models, price/limits, retained refs, confirmations, mocked local generation, results, dark theme, 320/390px layouts.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
