// Exercises the v3 beta MCP server end to end against a mock ComfyUI and a
// mock Page status endpoint, using the official MCP client over Streamable HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire(path.join(root, 'mcp', 'package.json'));
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const CODE = 'kendo-testcode';
const state = { ready: true, submitted: [], queue: { queue_running: [], queue_pending: [] }, history: {} };
let mockComfy, mockPage, mcpHttp, inputDir, mcpUrl, client;

function listen(server) { return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port))); }
function readBody(req) { return new Promise(resolve => { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); }); }
const json = (res, body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

before(async () => {
  inputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kendo-mcp-input-'));
  mockComfy = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/queue' && req.method === 'GET') return json(res, state.queue);
    if (url.pathname === '/queue' && req.method === 'POST') { const body = JSON.parse(await readBody(req)); state.queue.queue_pending = state.queue.queue_pending.filter(item => !body.delete.includes(item[1])); return json(res, {}); }
    if (url.pathname === '/interrupt') { state.queue.queue_running = []; return json(res, {}); }
    if (url.pathname === '/prompt') { const body = JSON.parse(await readBody(req)); if (!body.prompt?.reference) return json(res, { error: { message: 'bad workflow' } }, 400); const id = 'job-' + (state.submitted.length + 1); state.submitted.push(body); return json(res, { prompt_id: id, number: state.submitted.length }); }
    if (url.pathname.startsWith('/history/')) { const id = decodeURIComponent(url.pathname.slice('/history/'.length)); return json(res, state.history[id] ? { [id]: state.history[id] } : {}); }
    if (url.pathname === '/history') return json(res, state.history);
    if (url.pathname === '/sample.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(Buffer.from('89504e470d0a1a0a', 'hex')); }
    if (url.pathname === '/voice') { res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); return res.end(Buffer.from('mp3-bytes')); }
    if (url.pathname === '/page.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html></html>'); }
    json(res, { error: 'not found' }, 404);
  });
  mockPage = http.createServer((req, res) => json(res, { models_ready: state.ready, comfy_ready: state.ready, progress: state.ready ? 100 : 37, download_error: null, version: '3.0.0-beta.12' }));
  const comfyPort = await listen(mockComfy), pagePort = await listen(mockPage);
  process.env.KENDO_MCP_CODE = CODE;
  process.env.KENDO_MCP_ALLOW_LOOPBACK = '1';
  process.env.KENDO_COMFY_PORT = String(comfyPort);
  process.env.KENDO_PAGE_PORT = String(pagePort);
  process.env.KENDO_INPUT_DIR = inputDir;
  process.env.KENDO_WORKFLOW_FILE = path.join(root, 'web', 'workflow-v3-beta.js');
  process.env.KENDO_PUBLIC_PAGE_URL = 'https://pod123-3000.proxy.runpod.net';
  const { createHttpServer } = await import(path.join(root, 'mcp', 'server.mjs').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'));
  mcpHttp = createHttpServer();
  const mcpPort = await listen(mcpHttp);
  mcpUrl = `http://127.0.0.1:${mcpPort}/mcp/${CODE}`;
  state.comfyOrigin = `http://127.0.0.1:${comfyPort}`;
  client = new Client({ name: 'test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));
});

after(async () => { await client?.close(); mcpHttp?.close(); mockComfy?.close(); mockPage?.close(); await fs.rm(inputDir, { recursive: true, force: true }); });

const call = async (name, args = {}) => { const r = await client.callTool({ name, arguments: args }); return { ...r, data: r.structuredContent, text: r.content?.[0]?.text }; };

test('wrong or missing access code is a 404, never a 401 that triggers OAuth', async () => {
  for (const suffix of ['/mcp/wrong', '/mcp', '/mcp/', '/']) {
    const res = await fetch(mcpUrl.replace('/mcp/' + CODE, suffix), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 404, suffix);
    assert.equal(res.headers.get('www-authenticate'), null);
  }
  const health = await fetch(mcpUrl.replace('/mcp/' + CODE, '/healthz'));
  assert.equal(health.status, 200);
  assert.equal((await health.json()).version, '3.0.0-beta.12');
});

test('exposes the Kendo tool set and instructions', async () => {
  const tools = (await client.listTools()).tools.map(t => t.name).sort();
  assert.deepEqual(tools, ['kendo_cancel', 'kendo_generate', 'kendo_history', 'kendo_job_status', 'kendo_list_references', 'kendo_status', 'kendo_upload_from_url']);
  assert.match(client.getInstructions(), /<Picture 1>/);
});

test('status reports readiness and the queue', async () => {
  const { data } = await call('kendo_status');
  assert.equal(data.ready, true);
  assert.deepEqual(data.queue, { running: 0, pending: 0 });
  assert.equal(data.page_url, 'https://pod123-3000.proxy.runpod.net');
});

test('uploads references from URLs with readable names and rejects bad ones', async () => {
  const raw = await call('kendo_upload_from_url', { urls: [state.comfyOrigin + '/sample.png', state.comfyOrigin + '/voice', state.comfyOrigin + '/page.html', 'http://10.0.0.1/x.png'], names: ['hero front', 'narration'] });
  const { data } = raw;
  assert.equal(data.uploaded.length, 2);
  assert.match(data.uploaded[0].name, /^hero-front-[0-9a-f]{6}\.png$/);
  assert.equal(data.uploaded[0].kind, 'image');
  assert.match(data.uploaded[1].name, /^narration-[0-9a-f]{6}\.mp3$/);
  assert.equal(data.uploaded[1].kind, 'audio');
  assert.equal(data.failed.length, 2);
  assert.match(data.failed[0].error, /Unsupported file type/);
  assert.match(data.failed[1].error, /not allowed/);
  const listed = (await call('kendo_list_references')).data;
  assert.deepEqual(listed.references.map(r => r.kind).sort(), ['audio', 'image']);
  assert.equal((await call('kendo_list_references', { kind: 'video' })).data.count, 0);
});

test('generate validates references, builds the v3 graph and returns a job id with tags', async () => {
  const image = (await call('kendo_list_references', { kind: 'image' })).data.references[0].name;
  const audio = (await call('kendo_list_references', { kind: 'audio' })).data.references[0].name;
  const missing = await call('kendo_generate', { prompt: 'x', images: ['nope.png'] });
  assert.equal(missing.isError, true); assert.match(missing.text, /not found/);
  const traversal = await call('kendo_generate', { prompt: 'x', images: ['../etc/passwd.png'] });
  assert.equal(traversal.isError, true);
  const { data } = await call('kendo_generate', { prompt: 'Use <Picture 1> with <Audio 1>', images: [image], audios: [audio], ratio: '9:16', megapixels: '0.7', duration: 8, seed: 2847193051 });
  assert.equal(data.job_id, 'job-1');
  assert.equal(data.seed, 2847193051);
  assert.deepEqual([data.width, data.height], [640, 1152]);
  assert.deepEqual(data.tags, { '<Picture 1>': image, '<Audio 1>': audio });
  const workflow = state.submitted[0].prompt;
  assert.equal(workflow.save.inputs.filename_prefix, 'video/Kendo_H3_v3');
  assert.equal(workflow.noise.inputs.noise_seed, 2847193051);
  assert.deepEqual(workflow.reference.inputs['ref_images.ref_image_0'], ['image0', 0]);
  assert.equal(workflow.image0.inputs.image, image);
  assert.equal(workflow.audio0.inputs.audio, audio);
  assert.equal(workflow.reference.inputs.width, 640);
  assert.equal(workflow.reference.inputs.length % 17, 5);
  assert.equal(workflow.schedule.inputs.steps, 10);
});

test('generate refuses while the Pod is still downloading models', async () => {
  state.ready = false;
  const r = await call('kendo_generate', { prompt: 'x' });
  state.ready = true;
  assert.equal(r.isError, true); assert.match(r.text, /37%/);
});

test('job status walks queued, running, done and error', async () => {
  state.queue = { queue_running: [[0, 'other']], queue_pending: [[1, 'job-1']] };
  let s = (await call('kendo_job_status', { job_id: 'job-1' })).data;
  assert.equal(s.status, 'queued'); assert.equal(s.ahead, 1);
  state.queue = { queue_running: [[0, 'job-1']], queue_pending: [] };
  assert.equal((await call('kendo_job_status', { job_id: 'job-1' })).data.status, 'running');
  state.queue = { queue_running: [], queue_pending: [] };
  assert.equal((await call('kendo_job_status', { job_id: 'job-1' })).data.status, 'unknown');
  state.history['job-1'] = { prompt: [1, 'job-1', state.submitted[0].prompt], outputs: { video: { images: [{ filename: 'Kendo_H3_v3_00001.mp4', subfolder: 'video', type: 'output' }] } }, status: { status_str: 'success', messages: [] } };
  s = (await call('kendo_job_status', { job_id: 'job-1' })).data;
  assert.equal(s.status, 'done');
  assert.equal(s.seed, 2847193051);
  assert.equal(s.video_url, 'https://pod123-3000.proxy.runpod.net/api/comfy/view?filename=Kendo_H3_v3_00001.mp4&subfolder=video&type=output');
  assert.equal(s.duration_seconds, 8);
  state.history['job-2'] = { prompt: [2, 'job-2', state.submitted[0].prompt], outputs: {}, status: { status_str: 'error', messages: [['execution_error', { exception_message: 'CUDA out of memory' }]] } };
  s = (await call('kendo_job_status', { job_id: 'job-2' })).data;
  assert.equal(s.status, 'error'); assert.match(s.error, /out of memory/);
});

test('history lists only Kendo jobs without prompts, newest first', async () => {
  state.history['foreign'] = { prompt: [3, 'foreign', { other: { class_type: 'X', inputs: {} } }], outputs: {}, status: {} };
  const { data, text } = await call('kendo_history', { limit: 5 });
  assert.deepEqual(data.jobs.map(j => j.job_id), ['job-2', 'job-1']);
  assert.ok(!text.includes('<Picture 1> with <Audio 1>'), 'prompt text must not be returned');
});

test('cancel removes a queued job and interrupts a running one', async () => {
  state.queue = { queue_running: [], queue_pending: [[1, 'job-9']] };
  assert.deepEqual((await call('kendo_cancel', { job_id: 'job-9' })).data, { job_id: 'job-9', cancelled: true, was: 'queued' });
  assert.equal(state.queue.queue_pending.length, 0);
  state.queue = { queue_running: [[0, 'job-8']], queue_pending: [] };
  assert.equal((await call('kendo_cancel', { job_id: 'job-8' })).data.was, 'running');
  assert.equal((await call('kendo_cancel', { job_id: 'job-7' })).data.cancelled, false);
});
