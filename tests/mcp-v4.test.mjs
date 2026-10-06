import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../mcp/package.json',import.meta.url));
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
let page,mcp,client,selected,submitted;
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',()=>r(s.address().port)));
before(async()=>{
 page=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  let data;
  if(req.url==='/api/kendo/upscale/status')data={models_ready:true,nodes_ready:true};
  else if(req.url==='/api/kendo/upscale/select'){selected=JSON.parse(body);data={source_id:'clip-source'};}
  else if(req.url==='/api/kendo/upscale'){submitted=JSON.parse(body);data={job_id:'upscale-id',status:'queued'};}
  else if(req.url==='/api/kendo/upscale/job/upscale-id')data={job_id:'upscale-id',status:'done',file:{filename:'result.mp4',subfolder:'video',type:'output'}};
  else {res.writeHead(404);res.end('{}');return;}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));
 });
 process.env.KENDO_PAGE_PORT=String(await listen(page));
 process.env.KENDO_MCP_CODE='test-v4';
 process.env.KENDO_WORKFLOW_FILE=fileURLToPath(new URL('../web/workflow-v4.js',import.meta.url));
 process.env.KENDO_PUBLIC_PAGE_URL='https://v4.example';
 const {createHttpServer}=await import('../mcp/server-v4.mjs');
 mcp=createHttpServer();const port=await listen(mcp);
 client=new Client({name:'v4-tests',version:'1'});
 await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp/test-v4`)));
});
after(async()=>{await client?.close();await Promise.all([mcp,page].map(s=>new Promise(r=>s.close(r))));});
test('V4 MCP sends existing clips to upscale and returns the result URL',async()=>{
 const names=(await client.listTools()).tools.map(t=>t.name);
 for(const name of ['kendo_generate','kendo_upscale','kendo_upscale_status','kendo_upscale_job_status'])assert.ok(names.includes(name));
 const status=await client.callTool({name:'kendo_upscale_status',arguments:{}});
 assert.equal(status.structuredContent.nodes_ready,true);
 const result=await client.callTool({name:'kendo_upscale',arguments:{filename:'chosen.mp4',preset:'1080p',seed:12}});
 assert.equal(result.structuredContent.job_id,'upscale-id');
 assert.deepEqual(selected,{filename:'chosen.mp4',subfolder:'video',type:'output'});
 assert.deepEqual(submitted,{source_id:'clip-source',preset:'1080p',seed:12});
 await client.callTool({name:'kendo_upscale',arguments:{source_id:'uploaded'}});
 assert.equal(submitted.source_id,'uploaded');
 const completed=await client.callTool({name:'kendo_upscale_job_status',arguments:{job_id:'upscale-id'}});
 assert.equal(completed.structuredContent.video_url,'https://v4.example/api/comfy/view?filename=result.mp4&subfolder=video&type=output');
 const invalid=await client.callTool({name:'kendo_upscale',arguments:{}});
 assert.equal(invalid.isError,true);
});
