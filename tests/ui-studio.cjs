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

    let paid=[], imageHistory=[], connected=true, configured=true, savedKeys=[], loginCodes=[];
    await p.route('**/api/kendo/status',route=>route.fulfill({json:{mcp_url:url+'/mcp/ui-test-code'}}));
    await p.route('**/api/kie/**',async route=>{
      const req=route.request(),pathname=new URL(req.url()).pathname;
      if(pathname.endsWith('/image-models')) return route.continue();
      let data={};
      if(pathname.endsWith('/status')) data={configured,authenticated:connected,access_configured:true,mcp_url:connected?url+'/mcp/ui-test-code':null};
      if(pathname.endsWith('/connect')) {loginCodes.push(req.postDataJSON().code);connected=true;data={authenticated:true};}
      if(pathname.endsWith('/config')) {savedKeys.push(req.postDataJSON().api_key);configured=true;data={configured:true};}
      if(pathname.endsWith('/jobs')&&req.method()==='GET') data={jobs:imageHistory};
      if(pathname.endsWith('/upload')) data={url:'https://example.org/ref.png'};
      if(pathname.endsWith('/jobs')&&req.method()==='POST') {paid.push(req.postDataJSON());data={task_id:'mock-paid',kind:paid.at(-1).kind,model:paid.at(-1).model,state:'waiting',estimate_usd:2.05,created_at:new Date().toISOString(),result_urls:[]};}
      await route.fulfill({json:data});
    });
    await p.reload();await p.waitForFunction(()=>document.querySelector('#connection-state').textContent.includes('เชื่อมต่อแล้ว'));
    await p.locator('#video-model').selectOption('seedance-2');await p.locator('#prompt').fill('Walk forward slowly');
    await p.locator('#generate').click();assert.equal(paid.length,0);
    await p.locator('#confirm-generate').click();await p.waitForFunction(()=>document.querySelector('#job-notice').textContent.includes('ส่งงานแล้ว'));
    assert.equal(paid.length,1);assert.equal(paid[0].model,'seedance-2');assert.equal(paid[0].confirm_cost,true);

    assert.equal(await p.locator('nav a[href="./images.html"]').count(),1);
    await p.locator('nav a[href="./images.html"]').click();
    await p.waitForFunction(()=>document.querySelector('#image-model').disabled===false);
    assert.equal(await p.locator('h1').textContent(),'สร้างภาพนิ่ง');
    assert.equal(await p.locator('#image-model option').count(),6);
    assert.equal(await p.locator('#resolution').inputValue(),'2K');
    assert.equal(await p.locator('#price').textContent(),'$0.07');
    assert.equal(await p.locator('.reference-slot').count(),3);
    await p.locator('#add-references').click();assert.equal(await p.locator('.reference-slot').count(),4);
    assert.ok((await p.locator('#image-model').boundingBox()).x>(await p.locator('.composer').boundingBox()).width);
    await p.locator('.upload-input input').first().setInputFiles(refs(4));
    await p.waitForFunction(()=>document.querySelector('#image-count').textContent==='4 / 10');
    assert.equal(await p.locator('#price').textContent(),'$0.0775');
    await p.locator('#image-model').selectOption('qwen-3-pro');
    assert.equal(await p.locator('#image-count').textContent(),'4 / 3');
    assert.equal(await p.locator('.remove-image').count(),4);
    await p.locator('#prompt').fill('A premium glass perfume bottle');
    await p.locator('#generate').click();assert.equal(await p.locator('#review-dialog').isVisible(),false);
    await p.locator('.remove-image').last().click();
    assert.equal(await p.locator('#price').textContent(),'$0.0675');
    for(const id of ['flux-2-pro','grok-image-2','nano-banana-pro','gpt-image-2']) {
      await p.locator('#image-model').selectOption(id);
      assert.equal(await p.locator('#format-control').isVisible(),id==='nano-banana-pro');
      if(id==='grok-image-2') {
        assert.equal(await p.locator('#resolution').inputValue(),'native');
        assert.equal(await p.locator('#resolution option').count(),1);
      }
    }
    await p.locator('#resolution').selectOption('4K');assert.equal(await p.locator('#price').textContent(),'$0.08');
    await p.locator('#image-model').selectOption('qwen-3-pro');assert.equal(await p.locator('#resolution').inputValue(),'2K');
    const before=paid.length;
    await p.locator('#generate').click();assert.equal(paid.length,before);
    await p.locator('#confirm-generate').click();
    await p.waitForFunction(()=>document.querySelector('#job-notice').textContent.includes('ส่งงานแล้ว'));
    assert.equal(paid.length,before+1);assert.equal(paid.at(-1).kind,'image');assert.equal(paid.at(-1).model,'qwen-3-pro');
    assert.equal(paid.at(-1).reference_urls.length,3);assert.equal(paid.at(-1).resolution,'2K');assert.equal(paid.at(-1).confirm_cost,true);
    imageHistory=[{task_id:'image-success',kind:'image',model:'qwen3/pro-text-to-image',state:'success',estimate_usd:.06,result_urls:['/mock-one.png','/mock-two.png']},{task_id:'video-success',kind:'video',model:'bytedance/seedance-2',state:'success',estimate_usd:2.05,result_urls:['/mock.mp4']}];
    await p.route('**/mock-*.png',route=>route.fulfill({body:fixture,contentType:'image/png'}));
    await p.reload();await p.waitForFunction(()=>document.querySelector('#history-count').textContent==='1 งาน');
    assert.equal(await p.locator('.job-card').count(),1);
    assert.equal(await p.locator('.job-card button').count(),2);
    await p.locator('.job-card button').last().click();
    assert.match(await p.locator('#preview-canvas>img').getAttribute('src'),/mock-two/);
    imageHistory=[];
    await p.reload();await p.waitForFunction(()=>document.querySelector('#image-model').disabled===false);
    await p.screenshot({path:path.join(output,'image-kie-desktop.png'),fullPage:true});
    await p.locator('#theme').click();await p.screenshot({path:path.join(output,'image-kie-dark.png'),fullPage:true});
    for(const width of [390,320]) {
      await p.setViewportSize({width,height:1100});
      for(const page of ['images.html','seedance25.html']) {
        await p.goto(url+'/'+page);
        if(page==='images.html') await p.waitForFunction(()=>document.querySelector('#image-model').disabled===false);
        assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${page} ${width}px overflow`);
        assert.equal(await p.locator('nav a[href="./images.html"]').count(),1);
        await p.screenshot({path:path.join(output,`${page.replace('.html','')}-mobile-${width}.png`),fullPage:true});
      }
    }
    connected=false;configured=false;
    await p.setViewportSize({width:1440,height:1100});
    await p.goto(url+'/seedance25.html');
    await p.waitForFunction(()=>!document.querySelector('#kie-key').disabled);
    assert.deepEqual(loginCodes,['ui-test-code']);
    assert.equal(await p.locator('#connection-panel').getAttribute('open'),null);
    await p.locator('#connection-panel>summary').click();
    assert.equal(await p.locator('#mcp-url').inputValue(),url+'/mcp/ui-test-code');
    assert.equal(await p.locator('#mcp-copy').isDisabled(),false);
    const paidBeforeSetup=paid.length;
    await p.locator('#kie-key').fill('fake-ui-key-1234');
    await p.locator('#kie-key-save').click();
    await p.waitForFunction(()=>document.querySelector('#connection-state').textContent.includes('เชื่อมต่อแล้ว'));
    assert.deepEqual(savedKeys,['fake-ui-key-1234']);
    assert.equal(await p.locator('#kie-key').inputValue(),'');
    assert.equal(await p.evaluate(()=>JSON.stringify(localStorage).includes('fake-ui-key-1234')),false);
    await p.screenshot({path:path.join(output,'connection-desktop.png'),fullPage:true});
    for(const page of ['images.html','seedance25.html']) {
      await p.setViewportSize({width:320,height:1100});await p.goto(url+'/'+page);
      await p.waitForFunction(()=>document.querySelector('#connection-state').textContent.includes('เชื่อมต่อแล้ว'));
      await p.locator('#connection-panel>summary').click();
      assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${page} expanded connection overflow`);
      assert.equal(await p.locator('#kie-key').inputValue(),'');
      await p.screenshot({path:path.join(output,`connection-${page.replace('.html','')}-mobile.png`),fullPage:true});
    }
    connected=false;
    await p.route('**/api/kendo/status',route=>route.fulfill({status:404,json:{error:'standalone'}}));
    await p.goto(url+'/images.html');
    await p.waitForFunction(()=>document.querySelector('#connection-state').textContent.includes('เข้า Studio'));
    await p.locator('#connection-panel>summary').click();
    await p.locator('.manual-connection>summary').click();
    await p.locator('#access-code').fill(url+'/mcp/manual-test-code');
    await p.locator('#connection-form button').click();
    await p.waitForFunction(()=>document.querySelector('#connection-state').textContent.includes('เชื่อมต่อแล้ว'));
    assert.equal(loginCodes.at(-1),'manual-test-code');
    assert.equal(await p.locator('#access-code').inputValue(),'');
    assert.equal(paid.length,paidBeforeSetup);
    assert.deepEqual(errors,[]);console.log('Studio UI passed: image/video models, automatic MCP login, private key setup, manual URL fallback, paid confirmation and desktop/mobile layouts.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
