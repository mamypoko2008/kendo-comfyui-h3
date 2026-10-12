import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildKiePayload, createKieService } from '../mcp/kie-client.mjs';
import { createStudioServer } from '../mcp/studio-server.mjs';
import { IMAGE_MODELS } from '../mcp/image-models.mjs';
const require=createRequire(import.meta.url);
const images=require('../web/workflow-images.js');
const urls=n=>Array.from({length:n},(_,i)=>`https://example.org/ref-${i}.png`);
const video={kind:'video',prompt:'A person walking naturally',request_id:'request-test-001',confirm_cost:true};

test('KIE image adapters use documented model IDs and distinct input fields at 2K',()=>{
  const base={kind:'image',prompt:'A glass perfume bottle',ratio:'1:1',reference_urls:urls(2)};
  const cases=[
    ['seedream-5-pro','seedream/5-pro-image-to-image','image_urls',.0725],
    ['flux-2-pro','flux-2/pro-image-to-image','input_urls',.035],
    ['qwen-3-pro','qwen3/pro-image-to-image','image_urls',.065],
    ['grok-image-2','grok-imagine-image-2-0/image-edit','image_urls',.02],
    ['nano-banana-pro','nano-banana-pro','image_input',.09],
    ['gpt-image-2','gpt-image-2-image-to-image','input_urls',.05]
  ];
  for(const [id,provider,field,price] of cases) {
    const result=buildKiePayload({...base,model:id});
    assert.equal(result.payload.model,provider); assert.deepEqual(result.payload.input[field],base.reference_urls);
    assert.equal(result.estimate_usd,price);
    const text=buildKiePayload({...base,model:id,reference_urls:[]});
    assert.equal(text.payload.model,IMAGE_MODELS[id].textModel);
    assert.equal(text.payload.input.prompt,base.prompt);
    if(id!=='nano-banana-pro') assert.equal(text.payload.input[field],undefined);
  }
  const seedream=buildKiePayload({...base,model:'seedream-5-pro'}).payload.input;
  assert.equal(seedream.quality,'high');assert.equal(seedream.resolution,undefined);
  const qwen=buildKiePayload({...base,model:'qwen-3-pro'}).payload.input;
  assert.equal(qwen.image_size,'1:1');assert.equal(qwen.aspect_ratio,undefined);assert.equal(qwen.resolution,'2K');
  const grok=buildKiePayload({...base,model:'grok-image-2'}).payload.input;
  assert.equal(grok.resolution,undefined);assert.equal(grok.output_format,undefined);
  assert.equal(buildKiePayload({...base,model:'nano-banana-pro',output_format:'jpg'}).payload.input.output_format,'jpg');
  assert.equal(buildKiePayload({...base,quality:'basic'}).payload.input.quality,'basic'); // old MCP compatibility
});

test('unsupported image choices are blocked before any paid provider request',()=>{
  const base={kind:'image',prompt:'A detailed landscape'};
  for(const [id,m] of Object.entries(IMAGE_MODELS)) {
    assert.throws(()=>buildKiePayload({...base,model:id,reference_urls:urls(m.maxImages+1)}),/Maximum/);
  }
  assert.throws(()=>buildKiePayload({...base,model:'grok-image-2',resolution:'2K'}),/resolution/);
  assert.throws(()=>buildKiePayload({...base,model:'flux-2-pro',output_format:'png'}),/output format/);
  assert.throws(()=>buildKiePayload({...base,model:'flux-2-pro',ratio:'21:9'}),/aspect ratio/);
  assert.throws(()=>buildKiePayload({...base,model:'qwen-3-pro',quality:'high'}),/quality/);
  assert.throws(()=>buildKiePayload({...base,quality:'basic',resolution:'2K'}),/conflict/);
  assert.throws(()=>buildKiePayload({...base,model:'krea-2'}),/image model/);
  assert.throws(()=>buildKiePayload({...base,prompt:'x'}),/4-5000/);
  assert.equal(buildKiePayload({...base,model:'gpt-image-2',resolution:'4K'}).estimate_usd,.08);
});

test('model switch selects regular 2.0, changes billing and enforces provider limits',()=>{
  const v2=buildKiePayload({...video,model:'seedance-2',duration:10,resolution:'720p',reference_urls:urls(9)});
  assert.equal(v2.payload.model,'bytedance/seedance-2');
  assert.equal(v2.estimate_usd,2.05);
  assert.equal(v2.payload.input.reference_image_urls.length,9);
  assert.equal(v2.payload.input.output_format,undefined);
  assert.throws(()=>buildKiePayload({...video,model:'seedance-2',reference_urls:urls(10)}),/Maximum 9/);
  assert.throws(()=>buildKiePayload({...video,model:'seedance-2',duration:16}),/4 to 15/);
  assert.throws(()=>buildKiePayload({...video,model:'seedance-2',prompt:'x'.repeat(20001)}),/20000/);
  const v25=buildKiePayload({...video,duration:30,reference_urls:urls(30)});
  assert.equal(v25.payload.model,'bytedance/seedance-2-5');
  assert.equal(v25.estimate_usd,9.45);
  assert.equal(v25.payload.input.output_format,'mp4');
  assert.throws(()=>buildKiePayload({...video,resolution:'4k'}),/resolution/);
  assert.equal(buildKiePayload({...video,model:'seedance-2',resolution:'4k'}).estimate_usd,10.4);
  assert.throws(()=>buildKiePayload({...video,model:'untrusted'}),/video model/);
});

test('Qwen graph uses native encoding outputs, edit latent and correct separate VAE',()=>{
  const base=images.buildWorkflow({prompt:'A glass bottle',model:'qwen21-turbo',ratio:'16:9',resolution:1024,transparent:true});
  assert.equal(base['1'].inputs.unet_name,'qwen_image_2.1_turbo_int8_convrot.safetensors');
  assert.equal(base['3'].inputs.vae_name,'qwen_image_2.1_vae_bf16.safetensors');
  assert.equal(base['6'].inputs.steps,8);
  assert.equal(base['6'].inputs.cfg,1);
  assert.match(base['4'].inputs.prompt,/RGBA/);
  assert.equal(base['5'].inputs.width%32,0);
  assert.ok(base['5'].inputs.width>base['5'].inputs.height);
  const edit=images.buildWorkflow({prompt:'Change the background',references:['hero.png','scene.png']});
  assert.deepEqual(edit['6'].inputs.latent_image,['4',2]);
  assert.equal(edit['5'],undefined);
  assert.deepEqual(edit['4'].inputs['images.image_2'],['21',0]);
  assert.deepEqual(edit['4'].inputs.vae,['3',0]);
  assert.equal(edit['20'].inputs.image,'hero.png');
  assert.throws(()=>images.buildWorkflow({prompt:'test',references:Array(11).fill('x.png')}),/references/);
  assert.throws(()=>images.buildWorkflow({prompt:'test',references:['../secret']}),/references/);
  assert.throws(()=>images.buildWorkflow({prompt:'test',steps:0}),/steps/);
  assert.equal(images.readiness({},'qwen21-turbo').ready,false);
});

test('attached Qwen/Klein graph preserves active wiring, bypasses muted nodes and requires optional LoRA only when enabled',async()=>{
  const source=JSON.parse(await fs.readFile(new URL('../workflows/qwen21_flux_klein_source.json',import.meta.url),'utf8'));
  const nodes=new Map(source.nodes.map(n=>[String(n.id),n])), links=new Map(source.links.map(l=>[l[0],l]));
  const graph=images.buildWorkflow({model:'qwen21-klein',prompt:'A ceramic cup',resolution:2048,seed:123,use_attached_lora:true});
  function resolve(linkId) {
    const link=links.get(linkId), node=nodes.get(String(link[1]));
    if(node.mode===4) return resolve(node.inputs.find(i=>i.type===link[5]).link);
    return [String(link[1]),link[2]];
  }
  for(const [id,n] of Object.entries(graph)) {
    if(!nodes.has(id)) continue; // new permanent output nodes
    assert.equal(n.class_type,nodes.get(id).type);
    for(const [name,value] of Object.entries(n.inputs)) {
      if(!Array.isArray(value)) continue;
      const input=nodes.get(id).inputs.find(i=>i.name===name);
      assert.deepEqual(value,resolve(input.link),`${id}.${name} differs from attached wiring`);
    }
  }
  assert.equal(graph['139'].inputs.noise_seed,123);assert.equal(graph['50'].inputs.noise_seed,123);
  assert.equal(graph['141'].inputs.steps,30);assert.equal(graph['53'].inputs.steps,2);
  assert.equal(graph['56'].inputs.megapixels,4);
  assert.equal(graph['157'].inputs.lora_name,images.ATTACHED_LORA);
  assert.equal(graph['142'],undefined);assert.equal(graph['75'],undefined);assert.equal(graph['158'],undefined);
  assert.equal(graph['161'].inputs.filename_prefix,'Kendo_Qwen21_Klein_before');
  assert.equal(graph['162'].inputs.filename_prefix,'Kendo_Qwen21_Klein_after');
  const plain=images.buildWorkflow({model:'qwen21-klein',prompt:'A cup'});
  assert.equal(plain['157'],undefined);assert.deepEqual(plain['139'].inputs.model,['14',0]);
  assert.throws(()=>images.buildWorkflow({model:'qwen21-klein',prompt:'A cup',references:['ref.png']}),/text-to-image/);
  assert.throws(()=>images.buildWorkflow({model:'qwen21-klein',prompt:'A cup',transparent:true}),/transparency/);
  const info=Object.fromEntries(images.KLEIN_REQUIRED.map(n=>[n,{}]));
  info.UNETLoader={input:{required:{unet_name:[['sub/'+images.MODELS['qwen21-klein'].diffusion,images.KLEIN.diffusion]]}}};
  info.CLIPLoader={input:{required:{clip_name:[[images.MODELS['qwen21-klein'].encoder,images.KLEIN.encoder]]}}};
  info.VAELoader={input:{required:{vae_name:[[images.VAE,images.KLEIN.vae]]}}};
  assert.equal(images.readiness(info,'qwen21-klein').ready,true);
  assert.equal(images.readiness(info,'qwen21-klein').files.diffusion,'sub/'+images.MODELS['qwen21-klein'].diffusion);
  const lora=images.readiness(info,'qwen21-klein',{use_attached_lora:true});
  assert.deepEqual(lora.missingNodes,['LoraLoaderModelOnly']);assert.deepEqual(lora.missingFileNames,[images.ATTACHED_LORA]);
  delete info.DetailDaemonSamplerNode;
  assert.equal(images.readiness(info,'qwen21-klein').ready,false);
  assert.ok(!JSON.stringify(source).includes('Rh-Comfy-Auth'));
});

test('paid submissions are deduplicated concurrently and across service restart',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kendo-kie-dedupe-')); let calls=0;
  const fake=async()=>{calls++;return Response.json({code:200,data:{taskId:'provider-001'}});};
  try {
    const a=createKieService({dataDir:dir,apiKey:'not-a-real-key',fetchImpl:fake});
    const requests=await Promise.all([a.submit(video),a.submit(video)]);
    assert.equal(calls,1);assert.equal(requests[0].task_id,requests[1].task_id);
    const b=createKieService({dataDir:dir,apiKey:'not-a-real-key',fetchImpl:fake});
    assert.equal((await b.submit(video)).task_id,'provider-001');assert.equal(calls,1);
    await assert.rejects(b.submit({...video,duration:5}),/different settings/);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('uncertain paid request cannot be automatically resubmitted and secrets are not echoed',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kendo-kie-error-'));let calls=0;
  const service=createKieService({dataDir:dir,apiKey:'secret-test-key',fetchImpl:async()=>{calls++;throw new Error('secret-test-key');}});
  try {
    await assert.rejects(service.submit(video),e=>e.message.includes('Do not resubmit')&&!e.message.includes('secret-test-key'));
    await assert.rejects(service.submit(video),/already have been sent/);
    assert.equal(calls,1);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('successful result is persisted locally; result download receives no API credential',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kendo-kie-result-'));
  const fake=async(url,init)=>{
    if(url.includes('createTask')) return Response.json({code:200,data:{taskId:'completed-01'}});
    if(url.includes('recordInfo')) return Response.json({code:200,data:{state:'success',resultJson:JSON.stringify({resultUrls:['https://example.org/result.mp4']})}});
    assert.equal(init.headers,undefined);
    return new Response(Buffer.from('mock-video'),{headers:{'Content-Type':'video/mp4'}});
  };
  try {
    const service=createKieService({dataDir:dir,apiKey:'not-a-real-key',fetchImpl:fake});
    await service.submit(video);const job=await service.getJob('completed-01');
    assert.equal(job.state,'success');assert.equal(job.result_urls[0],'/api/kie/results/completed-01/result-1.mp4');
    assert.equal((await fs.readFile(await service.resultFile('completed-01','result-1.mp4'))).toString(),'mock-video');
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('KIE image results share persistent history and retain every returned PNG',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'kendo-kie-images-'));
  const fake=async(url,init)=>{
    if(url.includes('createTask')) {
      const sent=JSON.parse(init.body);
      assert.equal(sent.model,'qwen3/pro-text-to-image');assert.equal(sent.input.resolution,'2K');
      return Response.json({code:200,data:{taskId:'image-multiple-01'}});
    }
    if(url.includes('recordInfo')) return Response.json({code:200,data:{state:'success',resultJson:JSON.stringify({resultUrls:['https://example.org/one.png','https://example.org/two.png']})}});
    assert.equal(init.headers,undefined);
    return new Response(Buffer.from('mock-png'),{headers:{'Content-Type':'image/png'}});
  };
  try {
    const service=createKieService({dataDir:dir,apiKey:'not-a-real-key',fetchImpl:fake});
    await service.submit({...video,kind:'image',model:'qwen-3-pro'});
    const job=await service.getJob('image-multiple-01');
    assert.equal(job.kind,'image');assert.equal(job.result_urls.length,2);
    assert.match(job.result_urls[1],/result-2.png$/);
    const restarted=createKieService({dataDir:dir,apiKey:'not-a-real-key',fetchImpl:fake});
    assert.equal((await restarted.history())[0].model,'qwen3/pro-text-to-image');
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('Studio requires the access code, same-origin requests and cost confirmation',async()=>{
  let submits=0;
  const server=createStudioServer({code:'studio-test-code',service:{configured:()=>true,history:async()=>[],submit:async args=>{submits++;return {task_id:'test',model:args.model};}}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const request={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(video)};
    assert.equal((await fetch(base+'/api/kie/jobs',request)).status,401);
    assert.equal((await fetch(base+'/api/kie/connect',{...request,body:JSON.stringify({code:'wrong'})})).status,401);
    const connection=await fetch(base+'/api/kie/connect',{...request,body:JSON.stringify({code:'studio-test-code'})});
    const cookie=connection.headers.get('set-cookie').split(';')[0];
    assert.match(connection.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
    const authenticated={...request,headers:{...request.headers,Cookie:cookie,Origin:base}};
    assert.equal((await fetch(base+'/api/kie/jobs',{...authenticated,body:JSON.stringify({...video,confirm_cost:false})})).status,400);
    assert.equal((await fetch(base+'/api/kie/jobs',{...authenticated,headers:{...authenticated.headers,Origin:'https://foreign.example'}})).status,403);
    assert.equal((await fetch(base+'/api/kie/jobs',authenticated)).status,200);
    assert.equal(submits,1);
    const catalogue=await (await fetch(base+'/api/kie/image-models')).json();
    assert.equal(Object.keys(catalogue.models).length,6);
    assert.equal(catalogue.models['qwen-3-pro'].maxImages,3);
    assert.equal((await fetch(base+'/api/kie/upload?model=qwen-3-pro',{method:'POST',headers:{Cookie:cookie,'Content-Type':'image/png','Content-Length':String(11*1024*1024)},body:new Uint8Array(11*1024*1024)})).status,413);
    assert.equal((await fetch(base+'/api/kie/upload?model=unknown',{method:'POST',headers:{Cookie:cookie,'Content-Type':'image/png'},body:new Uint8Array(1)})).status,400);
    for(const page of ['/images.html','/seedance25.html','/workflow-images.js']) assert.equal((await fetch(base+page)).status,200);
    assert.equal((await fetch(base+'/../mcp/kie-client.mjs')).status,404);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
