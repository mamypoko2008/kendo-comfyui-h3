const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8');
const ids=JSON.parse(source.match(/const imageNodeIds = (\[[^;]+\]);/)[1]);
const body=source.slice(source.indexOf('function buildWorkflow'),source.indexOf('function renderRefs'));
const buildWorkflow=new Function('node','imageNodeIds','MAX_IMAGE_REFS',`${body}; return buildWorkflow;`)(
  (class_type,title,inputs)=>({class_type,inputs,_meta:{title}}),ids,9
);
const base={prompt:'test',ratio:'16:9',megapixels:0.4,duration:5,steps:10};

test('v1 supports exactly nine image references',()=>{
  assert.equal(ids.length,9);
  const workflow=buildWorkflow({...base,images:Array.from({length:9},(_,i)=>`${i}.png`)});
  assert.deepEqual(workflow['136'].inputs['ref_images.ref_image_8'],['164',0]);
  assert.equal(workflow['164'].inputs.image,'8.png');
  assert.throws(()=>buildWorkflow({...base,images:Array(10).fill('x.png')}),/สูงสุด 9/);
});

test('v1 page communicates the nine-file limit',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../web/index.html'),'utf8');
  assert.match(html,/สูงสุด 9 ภาพ/);
  assert.match(html,/0 \/ 9 FILES/);
  assert.match(source,/refs\.length<MAX_IMAGE_REFS/);
});