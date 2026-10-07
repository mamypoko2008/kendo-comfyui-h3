/* Browser integration: both generated ingress paths, upload, one result, reload. */
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://local').pathname.slice(1)||'v4.html';
  if(!/^[a-z0-9.-]+\.(html|js|css)$/.test(name)){res.writeHead(404);res.end();return;}
  const file=path.join(__dirname,'../web',name);
  if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({channel:process.env.KENDO_BROWSER_CHANNEL||'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const origin='http://127.0.0.1:'+server.address().port;
  const file={filename:'H3_latest.mp4',subfolder:'video',type:'output'};
  const metadata={display_width:1080,display_height:1920,orientation:'portrait',duration:5,fps:24,frame_count:120,has_audio:true};
  let ready=true,selected,submitted,done=false,emptyStatus=1,truncatedSource=1,emptySubmit=false,submitCount=0,source={source_id:'chosen',name:file.filename,source_kind:'generated',metadata};
  let job;
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url()),p=url.pathname;
   let data={};let status=200;
   if(p==='/api/kendo/status')data={models_ready:true,comfy_ready:true,mcp_ready:false,progress:100};
   else if(p==='/api/kendo/files')data={files:[file]};
   else if(p==='/api/kendo/upscale/status'){
    if(emptyStatus-->0){await route.fulfill({status:200,contentType:'application/json',body:''});return;}
    data={models_ready:ready,nodes_ready:ready,progress:ready?100:25};
   }
   else if(p==='/api/kendo/upscale/select'){selected=route.request().postDataJSON();data=source;}
   else if(p.startsWith('/api/kendo/upscale/source/')){
    if(truncatedSource-->0){await route.fulfill({status:200,contentType:'application/json',body:'{"source_id":'});return;}
    data=source;
   }
   else if(p==='/api/kendo/upscale/upload'){
    assert.ok((route.request().postDataBuffer()||Buffer.alloc(0)).length>0);
    source={source_id:'uploaded',name:'local.webm',source_kind:'upload',metadata:{...metadata,display_width:1920,display_height:1080,orientation:'landscape',has_audio:false}};data=source;status=201;
   }else if(p==='/api/kendo/upscale'){
    submitCount++;submitted=route.request().postDataJSON();
    if(emptySubmit){await route.fulfill({status:200,contentType:'application/json',body:''});return;}
    job={job_id:'upscale-job',name:source.name,source_id:source.source_id,preset:submitted.preset,metadata:source.metadata,target_width:3840,target_height:2160,status:'queued'};data=job;status=202;
   }else if(p==='/api/kendo/upscale/jobs')data={jobs:job?[job]:[]};
   else if(p==='/api/kendo/upscale/job/upscale-job'){
    if(done)job={...job,status:'done',file:{filename:'upscaled.mp4',subfolder:'video',type:'output'}};data=job;
   }else if(p==='/api/comfy/queue')data={queue_running:[],queue_pending:[]};
   else if(p==='/api/comfy/history')data={h3:{prompt:[0,'h3',{reference:{class_type:'MiniMaxH3ReferenceToVideo',inputs:{}},save:{inputs:{filename_prefix:'video/Kendo_H3_v4'}}}],outputs:{save:{images:[file]}},status:{status_str:'success'}}};
   else if(p==='/api/comfy/view'){await route.fulfill({status:200,contentType:'video/mp4',body:Buffer.alloc(0)});return;}
   await route.fulfill({status,json:data});
  });
  await page.goto(origin+'/v4.html');
  await page.waitForSelector('#history .upscale-link');
  await page.locator('#history .upscale-link').first().click();
  await page.waitForFunction(()=>document.querySelector('#source-name')?.textContent==='H3_latest.mp4');
  assert.deepEqual(selected,file);
  assert.equal(await page.locator('#source-orientation').textContent(),'แนวตั้ง');
  await page.waitForFunction(()=>!document.querySelector('#start-upscale').disabled);
  assert.equal(await page.locator('#upscale-result').isHidden(),true);
  await page.goto(origin+'/files-v4.html');
  await page.locator('.generated-actions a').filter({hasText:'อัพสเกล'}).click();
  await page.waitForFunction(()=>document.querySelector('#source-name')?.textContent==='H3_latest.mp4');
  assert.deepEqual(selected,file);
  await page.locator('#upload-tab').click();
  assert.ok(await page.locator('#start-upscale').isDisabled());
  await page.locator('#upscale-file').setInputFiles({name:'local.webm',mimeType:'video/webm',buffer:Buffer.from('mock video; decoded metadata is tested by Python')});
  await page.waitForFunction(()=>document.querySelector('#source-name').textContent==='local.webm');
  assert.equal(await page.locator('#source-orientation').textContent(),'แนวนอน');
  assert.equal(await page.locator('#source-audio').textContent(),'ต้นฉบับไม่มีเสียง');
  await page.locator('#upscale-preset').selectOption('4K');
  await page.locator('details').evaluate(el=>el.open=true);
  await page.locator('#refine-seed').fill('123');
  await page.locator('#start-upscale').click();
  await page.waitForFunction(()=>document.querySelector('#upscale-notice').textContent.includes('ส่งเข้าคิวแล้ว'));
  assert.equal(submitted.source_id,'uploaded');assert.equal(submitted.seed,123);assert.equal(submitted.preset,'4K');
  done=true;
  await page.waitForSelector('#upscale-result:not([hidden])',{timeout:12000});
  assert.equal(await page.locator('main video').count(),1);
  assert.ok((await page.locator('#result-download').getAttribute('href')).includes('upscaled.mp4'));
  assert.equal(await page.getByText(/compare|ก่อน.*หลัง/i).count(),0);
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#source-name').textContent==='local.webm');
  await page.getByRole('button',{name:'ดูผลลัพธ์'}).click();
  assert.equal(await page.locator('#upscale-result').isVisible(),true);
  emptySubmit=true;await page.locator('#start-upscale').click();
  await page.waitForFunction(()=>document.querySelector('#upscale-notice').textContent.includes('ตรวจรายการงานก่อน'));
  assert.equal(submitCount,2,'an empty queue response must never resubmit the upscale automatically');
  assert.ok(!(await page.locator('#upscale-notice').textContent()).includes('JSON'));
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:900});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow at '+width);
  }
  ready=false;await page.reload();
  await page.waitForFunction(()=>document.querySelector('#upscale-ready').textContent.includes('ดาวน์โหลด'));
  assert.ok(await page.locator('#start-upscale').isDisabled());
  assert.deepEqual(errors,[]);
  console.log('V4 UI passed: generation → upscale, files → upscale, upload, automatic orientation/audio, queue, single result, reload, mobile, readiness');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
