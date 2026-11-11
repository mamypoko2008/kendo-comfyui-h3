import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'mcp','package.json'));
const native=require('../web/workflow-h3-image.js');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const state={submitted:[],history:{}};
let inputDir,comfy,page,mcp,client;
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const body=req=>new Promise(resolve=>{const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>resolve(JSON.parse(Buffer.concat(chunks).toString()||'{}')));});
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
function objectInfo(){const info=Object.fromEntries(native.REQUIRED.map(name=>[name,{}])),model=native.MODELS.h3image;info.UNETLoader={input:{required:{unet_name:[[model.diffusion]]}}};info.CLIPLoader={input:{required:{clip_name:[[model.encoder]]}}};info.VAELoader={input:{required:{vae_name:[[model.vae]]}}};return info;}

before(async()=>{
  inputDir=await fs.mkdtemp(path.join(os.tmpdir(),'kendo-h3-image-mcp-'));
  await fs.writeFile(path.join(inputDir,'portrait.png'),'mock');
  comfy=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://x');if(url.pathname==='/object_info')return json(res,objectInfo());if(url.pathname==='/queue')return json(res,{queue_running:[],queue_pending:[]});if(url.pathname==='/prompt'){const request=await body(req);state.submitted.push(request);return json(res,{prompt_id:'h3-image-job'});}if(url.pathname.startsWith('/history/')){const id=decodeURIComponent(url.pathname.slice(9));return json(res,state.history[id]?{[id]:state.history[id]}:{});}if(url.pathname==='/history')return json(res,state.history);return json(res,{},404);});
  page=http.createServer((req,res)=>json(res,{models_ready:true,comfy_ready:true,progress:100}));
  const comfyPort=await listen(comfy),pagePort=await listen(page);
  Object.assign(process.env,{KENDO_MCP_CODE:'v4-beta3-test',KENDO_COMFY_PORT:String(comfyPort),KENDO_PAGE_PORT:String(pagePort),KENDO_INPUT_DIR:inputDir,KENDO_WORKFLOW_FILE:path.join(root,'web','workflow-v3-beta.js'),KENDO_IMAGE_WORKFLOW_FILE:path.join(root,'web','workflow-h3-image.js'),KENDO_IMAGE_PAGE_PATH:'/h3-image.html',KENDO_PUBLIC_PAGE_URL:'https://pod-3000.proxy.runpod.net',KENDO_IMAGE_DEFAULT_MODEL:'h3image',KENDO_IMAGE_DEFAULT_RESOLUTION:'2K'});
  const module=await import(pathToFileURL(path.join(root,'mcp','server.mjs')).href+'?v4beta3');mcp=module.createHttpServer();const port=await listen(mcp);client=new Client({name:'v4-test',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp/v4-beta3-test`)));
});
after(async()=>{await client?.close();await Promise.all([mcp,comfy,page].map(server=>new Promise(resolve=>server?.close(resolve))));await fs.rm(inputDir,{recursive:true,force:true});});

test('same MCP lists video and H3 Image tools with the intended schema',async()=>{
  const tools=(await client.listTools()).tools,byName=Object.fromEntries(tools.map(tool=>[tool.name,tool]));
  assert.ok(byName.kendo_generate);assert.ok(byName.kendo_image_generate);assert.ok(byName.kendo_image_job_status);
  assert.equal(byName.kendo_image_generate.inputSchema.properties.references.maxItems,16);
  assert.deepEqual(byName.kendo_image_generate.inputSchema.properties.resolution.enum,['1K','2K','4K','MAX']);
  assert.equal(byName.kendo_image_generate.inputSchema.properties.steps.const,6);
  assert.match(client.getInstructions(),/still-image flow/);
});

test('MCP queues official H3 Image graph and returns image URL',async()=>{
  const ready=await client.callTool({name:'kendo_image_status',arguments:{}});assert.equal(ready.structuredContent.models.h3image.ready,true);
  const task=await client.callTool({name:'kendo_image_generate',arguments:{prompt:'Keep <Picture 1> identity',references:['portrait.png'],ratio:'3:1',resolution:'MAX',steps:6,seed:123}});
  assert.equal(task.structuredContent.prompt_id,'h3-image-job');const graph=state.submitted[0].prompt;
  assert.equal(graph.conditioning.class_type,'MiniMaxH3ImageConditioning');assert.equal(graph.sampler.inputs.steps,6);assert.deepEqual(graph.conditioning.inputs['images.image_1'],['reference_1',0]);assert.ok(graph.conditioning.inputs.width>=7680);
  state.history['h3-image-job']={status:{completed:true,status_str:'success'},outputs:{save:{images:[{filename:'Kendo_H3_Image_00001.png',subfolder:'image',type:'output'}]}}};
  const done=await client.callTool({name:'kendo_image_job_status',arguments:{prompt_id:'h3-image-job'}});assert.equal(done.structuredContent.status,'done');assert.match(done.structuredContent.image_urls[0],/^https:\/\/pod-3000\.proxy\.runpod\.net\/api\/comfy\/view\?/);
});
