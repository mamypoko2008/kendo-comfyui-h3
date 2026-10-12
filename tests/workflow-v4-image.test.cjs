const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const qwen=require('../web/workflow-qwen-v4.js');
const v3=require('../web/workflow-v3-beta.js');
const video=require('../web/workflow-video-v4-image.js');
const template=JSON.parse(fs.readFileSync(path.join(__dirname,'../workflows/image_qwen_image_2_1_t2i.json'),'utf8'));
const officialNodes=[...template.nodes,...(template.definitions?.subgraphs||[]).flatMap(g=>g.nodes)];
const node=type=>officialNodes.find(n=>n.type===type);

test('V4 Qwen standard graph matches the pinned official template model and sampler',()=>{
  const graph=qwen.buildWorkflow({prompt:'A glass perfume bottle',seed:42});
  assert.equal(graph['1'].inputs.unet_name,node('UNETLoader').widgets_values[0]);
  assert.equal(graph['2'].inputs.clip_name,node('CLIPLoader').widgets_values[0]);
  assert.equal(graph['3'].inputs.vae_name,node('VAELoader').widgets_values[0]);
  const sampler=node('KSampler').widgets_values;
  assert.equal(graph['6'].inputs.steps,sampler[2]);assert.equal(graph['6'].inputs.cfg,sampler[3]);
  assert.equal(graph['6'].inputs.sampler_name,sampler[4]);assert.equal(graph['6'].inputs.scheduler,sampler[5]);
  assert.equal(graph['5'].inputs.width,2048);assert.equal(graph['5'].inputs.height,2048);
  assert.equal(graph['8'].inputs.filename_prefix,'Kendo_Qwen_V4');
  assert.equal(Object.values(graph).some(n=>n.class_type.includes('DetailDaemon')),false);
  assert.throws(()=>qwen.buildWorkflow({model:'qwen21-klein',prompt:'test'}),/uses Qwen/);
});

test('V4 image edits wire ordered references and use the encoder latent instead of a new canvas',()=>{
  const refs=Array.from({length:10},(_,i)=>`input-${i}.png`),graph=qwen.buildWorkflow({prompt:'Change <image1> using <image2>',references:refs,transparent:true});
  assert.equal(graph['5'],undefined);assert.deepEqual(graph['6'].inputs.latent_image,['4',2]);
  assert.deepEqual(graph['4'].inputs['images.image_10'],['29',0]);assert.equal(graph['29'].inputs.image,'input-9.png');
  assert.match(graph['4'].inputs.prompt,/RGBA/);assert.deepEqual(graph['4'].inputs.vae,['3',0]);
  assert.throws(()=>qwen.buildWorkflow({prompt:'test',references:[...refs,'extra.png']}),/references/i);
  assert.throws(()=>qwen.buildWorkflow({prompt:'test',steps:0}),/seed or steps/);
});

test('V4 video graph preserves the V3 stack and only separates the output prefix',()=>{
  const options={prompt:'Walk slowly',seed:42,duration:5,steps:10,ratio:'16:9',megapixels:0.4,images:['qwen.png']},old=v3.buildWorkflow(options),next=video.buildWorkflow(options);
  assert.equal(next.save.inputs.filename_prefix,'video/Kendo_H3_v4image');next.save.inputs.filename_prefix=old.save.inputs.filename_prefix;
  assert.deepEqual(next,old);
});

test('V4 MCP restricts the native model and returns image results on the new page',async()=>{
  const http=require('node:http');
  const requireMcp=require('node:module').createRequire(path.resolve(__dirname,'../mcp/package.json'));
  const {McpServer}=requireMcp('@modelcontextprotocol/sdk/server/mcp.js');
  const {InMemoryTransport}=requireMcp('@modelcontextprotocol/sdk/inMemory.js');
  const {Client}=requireMcp('@modelcontextprotocol/sdk/client/index.js');
  const {registerImageTools}=await import('../mcp/image-tools.mjs');
  const info=Object.fromEntries(qwen.REQUIRED.map(name=>[name,{input:{required:{}}}]));
  info.UNETLoader.input.required.unet_name=[[qwen.MODELS.qwen21.diffusion]];
  info.CLIPLoader.input.required.clip_name=[[qwen.ENCODER]];info.VAELoader.input.required.vae_name=[[qwen.VAE]];
  let submitted=[];
  const comfy=http.createServer(async(req,res)=>{let data={};if(req.url==='/object_info')data=info;if(req.url==='/prompt'){const parts=[];for await(const part of req)parts.push(part);submitted.push(JSON.parse(Buffer.concat(parts)));data={prompt_id:'local-qwen-1'};}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));});
  await new Promise(resolve=>comfy.listen(0,'127.0.0.1',resolve));
  const server=new McpServer({name:'v4-image-test',version:'1'}),client=new Client({name:'test',version:'1'});
  registerImageTools(server,{workflowFile:path.resolve(__dirname,'../web/workflow-qwen-v4.js'),comfyBase:'http://127.0.0.1:'+comfy.address().port,defaultModel:'qwen21',defaultResolution:2048,imagePage:'/images-v4.html',pageUrl:'http://127.0.0.1:3000'});
  const [a,b]=InMemoryTransport.createLinkedPair();
  try{
    await server.connect(a);await client.connect(b);
    const status=await client.callTool({name:'kendo_image_status',arguments:{}});
    assert.deepEqual(Object.keys(status.structuredContent.models),['qwen21']);assert.match(status.structuredContent.page_url,/images-v4/);
    const result=await client.callTool({name:'kendo_image_generate',arguments:{prompt:'A premium product photograph'}});
    assert.equal(result.isError,undefined);assert.equal(result.structuredContent.model,'qwen21');
    assert.equal(submitted.length,1);assert.deepEqual(submitted[0].prompt,qwen.buildWorkflow({prompt:'A premium product photograph',seed:42}));
    info.TextEncodeQwenImage21=undefined;
    const missing=await client.callTool({name:'kendo_image_generate',arguments:{prompt:'A product photograph'}});
    assert.equal(missing.isError,true);assert.equal(submitted.length,1);
  }finally{await client.close();await server.close();await new Promise(resolve=>comfy.close(resolve));}
});
