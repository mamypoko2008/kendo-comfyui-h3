const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

test('V4 beta.3 replaces upscale/Singularity with native H3 Image',()=>{
  const docker=fs.readFileSync(path.join(root,'Dockerfile.v4-beta3'),'utf8');
  assert.match(docker,/COMFYUI_VERSION=v0\.45\.0/);
  assert.match(docker,/KENDO_DUAL_PASS=0/);
  assert.match(docker,/workflow-h3-image\.js/);
  assert.doesNotMatch(docker,/latent_Upscaler|YCNodes|Singularity_ref2va/);
  assert.match(docker,/COPY mcp\/server\.mjs mcp\/image-tools\.mjs/);
});

test('RunPod template has one public MCP port and safe model storage',()=>{
  const template=JSON.parse(fs.readFileSync(path.join(root,'runpod-v4-beta3.json'),'utf8'));
  assert.equal(template.name,'Kendo-ComfyUI-H3 V4 beta.3');
  assert.equal(template.imageName,'ghcr.io/mamypoko2008/kendo-comfyui-h3:v4.0.0-beta.3');
  assert.ok(template.ports.includes('3001/http'));
  assert.ok(template.containerDiskInGb>=200);
  assert.ok(template.volumeInGb>=200);
  assert.equal(template.env.KENDO_ENABLE_IMAGES,'1');
});

test('Image page exposes 16 refs, ratios, MAX and the same MCP URL',()=>{
  const html=fs.readFileSync(path.join(root,'web','h3-image.html'),'utf8');
  for(const token of ['0 / 16','3:1','1:3','MAX · 20 MP','claude-url','console-panel','workflow-h3-image.js'])assert.match(html,new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('V3 template identity remains unchanged',()=>{
  const v3=JSON.parse(fs.readFileSync(path.join(root,'runpod-v3-beta.json'),'utf8'));
  assert.equal(v3.imageName,'ghcr.io/mamypoko2008/kendo-comfyui-h3:v3.0.0-beta.17');
});
