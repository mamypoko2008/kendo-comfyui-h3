// Same-origin Studio page API, backed by the same service as the Kendo MCP tools.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createKieService, KieError } from './kie-client.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime' };
const STATIC_FILES = new Set(['seedance25.html', 'seedance25.css', 'seedance25.js', 'images.html', 'images.js', 'workflow-images.js']);
export function createStudioServer(options = {}) {
  const service = options.service ?? createKieService();
  const code = options.code ?? process.env.KENDO_MCP_CODE ?? '';
  const pageRoot = options.pageRoot ?? process.env.KENDO_PAGE_ROOT ?? path.resolve(here, '../web');
  const comfyBase = options.comfyBase ?? `http://${process.env.KENDO_COMFY_HOST ?? '127.0.0.1'}:${process.env.KENDO_COMFY_PORT ?? 8188}`;
  const mcpUrl = options.mcpUrl ?? process.env.KENDO_MCP_PUBLIC_URL ?? (process.env.RUNPOD_POD_ID ? `https://${process.env.RUNPOD_POD_ID}-${process.env.KENDO_MCP_PORT ?? 3001}.proxy.runpod.net/mcp/{code}` : `http://127.0.0.1:${process.env.KENDO_MCP_PORT ?? 3001}/mcp/{code}`);
  const session = code ? crypto.createHmac('sha256', code).update('kendo-studio-session-v1').digest('hex') : '';
  const matches = (given, expected) => {
    const a = Buffer.from(given ?? ''), b = Buffer.from(expected);
    return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const authenticated = req => matches((req.headers.cookie ?? '').split(';').map(s => s.trim()).find(s => s.startsWith('kendo_studio='))?.slice('kendo_studio='.length), session);
  const json = (res, status, body, headers = {}) => { const payload = JSON.stringify(body); res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); res.end(payload); };
  async function body(req, limit) {
    if (Number(req.headers['content-length'] ?? 0) > limit) throw new KieError('Request is too large', 413);
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > limit) throw new KieError('Request is too large', 413); chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  async function jsonBody(req) {
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new KieError('Use application/json', 415);
    try { return JSON.parse((await body(req, 128 * 1024)).toString()); }
    catch (error) { if (error instanceof KieError) throw error; throw new KieError('Invalid JSON'); }
  }
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      // No CORS: browser calls stay on this page's origin; cookies are HTTP-only.
      const origin = req.headers.origin;
      if (req.method === 'POST' && origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'Cross-origin requests are not allowed' });
      if (url.pathname.startsWith('/api/comfy/')) {
        const target = new URL(req.url.slice('/api/comfy'.length), comfyBase);
        const headers = { ...req.headers, host: target.host };
        delete headers.origin; delete headers.referer; delete headers.cookie; delete headers.authorization;
        const upstream = http.request(target, { method: req.method, headers }, response => {
          res.writeHead(response.statusCode, response.headers); response.pipe(res);
        });
        upstream.setTimeout(120000, () => upstream.destroy(new Error('ComfyUI timeout')));
        upstream.on('error', () => { if (!res.headersSent) json(res, 503, { error: 'ComfyUI is not ready' }); else res.destroy(); });
        req.on('aborted', () => upstream.destroy());
        req.pipe(upstream);
        return;
      }
      if (url.pathname === '/api/kie/status' && req.method === 'GET') {
        const auth = authenticated(req);
        return json(res, 200, { configured: service.configured(), authenticated: auth, access_configured: Boolean(code), mcp_url: auth ? mcpUrl.replace('{code}', encodeURIComponent(code)) : null });
      }
      if (url.pathname === '/api/kie/connect' && req.method === 'POST') {
        const input = await jsonBody(req);
        if (!matches(input.code, code)) return json(res, 401, { error: 'รหัสเข้า Studio / MCP ไม่ถูกต้อง' });
        const secure = req.headers['x-forwarded-proto'] === 'https' || origin?.startsWith('https:');
        return json(res, 200, { ok: true }, { 'Set-Cookie': `kendo_studio=${session}; Path=/api/kie; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}` });
      }
      if (url.pathname.startsWith('/api/kie/')) {
        if (!authenticated(req)) return json(res, 401, { error: 'กรุณาเชื่อมต่อด้วยรหัส Studio / MCP ก่อน' });
        if (url.pathname === '/api/kie/upload' && req.method === 'POST') return json(res, 200, await service.uploadImage(await body(req, 30 * 1024 * 1024), (req.headers['content-type'] ?? '').split(';')[0], url.searchParams.get('name') ?? 'reference'));
        if (url.pathname === '/api/kie/jobs' && req.method === 'POST') {
          const input = await jsonBody(req);
          if (input.confirm_cost !== true) throw new KieError('Confirm the generation cost before submitting');
          return json(res, 200, await service.submit(input));
        }
        if (url.pathname === '/api/kie/jobs' && req.method === 'GET') return json(res, 200, { jobs: await service.history() });
        const jobMatch = url.pathname.match(/^\/api\/kie\/jobs\/([\w-]+)$/);
        if (jobMatch && req.method === 'GET') return json(res, 200, await service.getJob(jobMatch[1]));
        const resultMatch = url.pathname.match(/^\/api\/kie\/results\/([\w-]+)\/(result-\d+\.(?:png|jpg|webp|mp4|mov))$/);
        if (resultMatch && req.method === 'GET') {
          const file = await service.resultFile(resultMatch[1], resultMatch[2]);
          const bytes = await fs.readFile(file);
          res.writeHead(200, { 'Content-Type': MIME[path.extname(file)], 'Content-Length': bytes.length, 'Cache-Control': 'private, max-age=3600' });
          return res.end(bytes);
        }
        return json(res, 404, { error: 'Not found' });
      }
      const filename = url.pathname === '/' ? 'seedance25.html' : url.pathname.slice(1);
      if (req.method !== 'GET' || !STATIC_FILES.has(filename)) return json(res, 404, { error: 'Not found' });
      const bytes = await fs.readFile(path.join(pageRoot, filename));
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filename)], 'Content-Length': bytes.length, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
      res.end(bytes);
    } catch (error) {
      json(res, error instanceof KieError ? error.status : error.code === 'ENOENT' ? 404 : 500, { error: error instanceof KieError ? error.message : 'Studio request failed' });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  createStudioServer().listen(Number(process.env.KENDO_STUDIO_PORT ?? 8766), process.env.KENDO_STUDIO_HOST ?? '127.0.0.1', () => console.log('Kendo Studio page ready'));
}
