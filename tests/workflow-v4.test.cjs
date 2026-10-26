const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const v3=require('../web/workflow-v3-beta.js');
const v4=require('../web/workflow-v4.js');
test('V4 preserves H3 generation, references and seed with its own output prefix',()=>{
 for(const ratio of ['16:9','9:16','1:1']){
  const args={prompt:'Keep character <Picture 1>',ratio,megapixels:1,duration:5,steps:10,seed:321,
   images:['hero.png'],videos:['motion.mp4'],audios:['voice.wav'],videoAudio:true};
  const old=v3.buildWorkflow(args),next=v4.buildWorkflow(args);
  assert.equal(next.save.inputs.filename_prefix,'video/Kendo_H3_v4');
  next.save.inputs.filename_prefix=old.save.inputs.filename_prefix;
  assert.deepEqual(next,old);
 }
});
test('V4 tag builds always use the quality image definition',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'..','.github','workflows','build-v4.yml'),'utf8');
 assert.match(workflow,/file:\s*\$\{\{ inputs\.dockerfile \|\| 'Dockerfile\.v4-quality' \}\}/);
});
