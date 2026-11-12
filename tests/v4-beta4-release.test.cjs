const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

test('V4 beta.4 enables one managed Video/Image submission path',()=>{
  const docker=fs.readFileSync(path.join(root,'Dockerfile.v4-beta4'),'utf8');
  const manager=fs.readFileSync(path.join(root,'scripts','page_server_v4_beta4.py'),'utf8');
  const browser=fs.readFileSync(path.join(root,'web','mode-manager-v4.js'),'utf8');
  assert.match(docker,/KENDO_MANAGED_MODES=1/);
  assert.match(docker,/mode-manager-v4\.js/);
  assert.match(manager,/\/api\/kendo\/prompt/);
  assert.match(manager,/unload_models.*True/);
  assert.match(manager,/free_memory.*True/);
  assert.match(browser,/\/api\/comfy\/prompt/);
  assert.match(browser,/\/api\/kendo\/prompt/);
});

test('RunPod beta.4 keeps storage, ports and public MCP',()=>{
  const template=JSON.parse(fs.readFileSync(path.join(root,'runpod-v4-beta4.json'),'utf8'));
  assert.equal(template.name,'Kendo-ComfyUI-H3 V4 beta.4');
  assert.equal(template.imageName,'ghcr.io/mamypoko2008/kendo-comfyui-h3:v4.0.0-beta.4');
  assert.equal(template.env.KENDO_MANAGED_MODES,'1');
  assert.equal(template.env.KENDO_MCP_HOST,'0.0.0.0');
  assert.ok(template.ports.includes('3001/http'));
  assert.ok(template.containerDiskInGb>=200 && template.volumeInGb>=200);
});

test('V3 and V4 beta.3 template identities remain unchanged',()=>{
  const v3=JSON.parse(fs.readFileSync(path.join(root,'runpod-v3-beta.json'),'utf8'));
  const beta3=JSON.parse(fs.readFileSync(path.join(root,'runpod-v4-beta3.json'),'utf8'));
  assert.equal(v3.imageName,'ghcr.io/mamypoko2008/kendo-comfyui-h3:v3.0.0-beta.17');
  assert.equal(beta3.imageName,'ghcr.io/mamypoko2008/kendo-comfyui-h3:v4.0.0-beta.3');
});
