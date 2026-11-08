// Verifies the MCP schema actually exposed by the V4 beta.2 HTTP server.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const require = createRequire(path.join(root, 'mcp', 'package.json'));
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

test('V4 beta.2 MCP advertises model and High Resolution controls', async () => {
  process.env.KENDO_MCP_CODE = 'v4-schema-test';
  process.env.KENDO_MCP_ALLOW_LOOPBACK = '1';
  process.env.KENDO_DUAL_PASS = '1';
  process.env.KENDO_WORKFLOW_FILE = path.join(root, 'web', 'workflow-v4-beta2.js');

  const moduleUrl = pathToFileURL(path.join(root, 'mcp', 'server.mjs')).href + '?v4-schema-test';
  const { createHttpServer } = await import(moduleUrl);
  const server = createHttpServer({ enableImages: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  const port = server.address().port;
  const client = new Client({ name: 'v4-schema-test', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp/v4-schema-test`)));
    const tools = await client.listTools();
    const generate = tools.tools.find(tool => tool.name === 'kendo_generate');
    assert.ok(generate, 'kendo_generate must be advertised');

    const properties = generate.inputSchema.properties;
    assert.deepEqual(properties.model.enum, ['original', 'singularity']);
    assert.deepEqual(properties.render_mode.enum, ['fast', 'highres']);
    assert.deepEqual(new Set(properties.upscale_factor.enum), new Set(['1.5', '2']));
    assert.deepEqual(properties.attention_mode.enum, ['global_sage', 'kj_memory']);
    assert.equal(properties.render_mode.default, 'fast');
    assert.equal(properties.upscale_factor.default, '2');
  } finally {
    await client.close();
    await new Promise(resolve => server.close(resolve));
  }
});
