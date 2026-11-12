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
const state={managed:[]};
let inputDir,comfy,page,mcp,client;
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const readBody=req=>new Promise(resolve=>{const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>resolve(JSON.parse(Buffer.concat(chunks).toString()||'{}')));});
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
function objectInfo(){const info=Object.fromEntries(native.REQUIRED.map(name=>[name,{}])),model=native.MODELS.h3image;info.UNETLoader={input:{required:{unet_name:[[model.diffusion]]}}};info.CLIPLoader={input:{required:{clip_name:[[model.encoder]]}}};info.VAELoader={input:{required:{vae_name:[[model.vae]]}}};return info;}

before(async()=>{
  inputDir=await fs.mkdtemp(path.join(os.tmpdir(),'kendo-beta4-mcp-'));
  comfy=http.createServer((req,res)=>{const url=new URL(req.url,'http://x');if(url.pathname==='/object_info')return json(res,objectInfo());if(url.pathname==='/queue')return json(res,{queue_running:[],queue_pending:[]});if(url.pathname.startsWith('/history/'))return json(res,{});if(url.pathname==='/prompt')return json(res,{error:'managed mode was bypassed'},500);return json(res,{},404);});
  const comfyPort=await listen(comfy);
  page=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://x');if(url.pathname==='/api/kendo/status')return json(res,{models_ready:true,comfy_ready:true,progress:100});if(url.pathname==='/api/kendo/prompt'&&req.method==='POST'){const request=await readBody(req);state.managed.push(request);return json(res,{prompt_id:`${request.mode}-job`,kendo_mode:request.mode,vram_cleared:true});}return json(res,{},404);});
  const pagePort=await listen(page);
  Object.assign(process.env,{KENDO_MCP_CODE:'v4-beta4-test',KENDO_MANAGED_MODES:'1',KENDO_COMFY_PORT:String(comfyPort),KENDO_PAGE_PORT:String(pagePort),KENDO_INPUT_DIR:inputDir,KENDO_WORKFLOW_FILE:path.join(root,'web','workflow-v3-beta.js'),KENDO_IMAGE_WORKFLOW_FILE:path.join(root,'web','workflow-h3-image.js'),KENDO_IMAGE_PAGE_PATH:'/h3-image-v4-beta4.html',KENDO_PUBLIC_PAGE_URL:'https://pod-3000.proxy.runpod.net',KENDO_IMAGE_DEFAULT_MODEL:'h3image',KENDO_IMAGE_DEFAULT_RESOLUTION:'2K'});
  const module=await import(pathToFileURL(path.join(root,'mcp','server.mjs')).href+'?v4beta4');mcp=module.createHttpServer();const port=await listen(mcp);client=new Client({name:'v4-beta4-test',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp/v4-beta4-test`)));
});
after(async()=>{await client?.close();await Promise.all([mcp,comfy,page].map(server=>new Promise(resolve=>server?.close(resolve))));await fs.rm(inputDir,{recursive:true,force:true});});

test('video and image MCP tools submit through the shared mode manager',async()=>{
  const video=await client.callTool({name:'kendo_generate',arguments:{prompt:'A calm cinematic shot',ratio:'16:9',megapixels:'0.4',duration:5,steps:4}});
  assert.equal(video.structuredContent.job_id,'video-job');
  const image=await client.callTool({name:'kendo_image_generate',arguments:{prompt:'A detailed portrait',references:[],ratio:'1:1',resolution:'1K',steps:6,seed:7}});
  assert.equal(image.structuredContent.prompt_id,'image-job');
  assert.deepEqual(state.managed.map(item=>item.mode),['video','image']);
  assert.equal(state.managed[0].prompt.reference.class_type,'MiniMaxH3ReferenceToVideo');
  assert.equal(state.managed[1].prompt.conditioning.class_type,'MiniMaxH3ImageConditioning');
});
