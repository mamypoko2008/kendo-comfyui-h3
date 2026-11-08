const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');

test('V4 beta.2 image pins both required custom node commits',()=>{
  const docker=fs.readFileSync(path.join(root,'Dockerfile.v4-beta2'),'utf8');
  assert.match(docker,/H3_UPSCALER_COMMIT=40316cf008b2fd8663263270669eb4da23f89d2c/);
  assert.match(docker,/H3_YC_NODES_COMMIT=efbe83f69ffa97a251a575ce42edc7bf8005da0c/);
  assert.match(docker,/KENDO_WORKFLOW_FILE=\/opt\/kendo-page\/workflow-v4-beta2\.js/);
  assert.match(docker,/KENDO_DUAL_PASS=1/);
  assert.match(docker,/COPY mcp\/server\.mjs \/opt\/kendo-mcp\/server\.mjs/);
  assert.match(docker,/ENTRYPOINT \["\/opt\/kendo\/entrypoint-v4-beta2\.sh"\]/);
});

test('RunPod definition is a new public template and leaves V3 identity untouched',()=>{
  const v4=JSON.parse(fs.readFileSync(path.join(root,'runpod-v4-beta2.json'),'utf8'));
  const v3=JSON.parse(fs.readFileSync(path.join(root,'runpod-v3-beta.json'),'utf8'));
  assert.equal(v4.name,'Kendo-ComfyUI-H3 V4 beta.2');
  assert.equal(v4.imageName,'ghcr.io/mamypoko2008/kendo-comfyui-h3:v4.0.0-beta.2');
  assert.equal(v4.env.KENDO_DUAL_PASS,'1');
  assert.equal(v4.ports.includes('3001/http'),true);
  assert.ok(v4.volumeInGb>=120);
  assert.equal(v3.name,'Kendo-ComfyUI-H3 Fast v3 beta');
  assert.equal(v3.imageName,'ghcr.io/mamypoko2008/kendo-comfyui-h3:v3.0.0-beta.17');
});

test('New page keeps existing V3 assets separate and exposes all requested controls',()=>{
  const html=fs.readFileSync(path.join(root,'web','v4-beta2.html'),'utf8');
  for(const id of ['render-mode','upscale-factor','realism-enabled','facial-enabled','attention-mode','seed-lock','claude-url','console-panel'])assert.match(html,new RegExp(id));
  assert.match(html,/workflow-v4-beta2\.js/);
  assert.match(html,/data-history-key="kendo-h3-v4-beta2-history"/);
});
