'use strict';
const $ = s => document.querySelector(s);
const media = {image:[],video:[],audio:[]};
const limits = {image:9,video:1,audio:3};
const extensions = {image:/\.(png|jpe?g|webp)$/i,video:/\.(mp4|webm|mov)$/i,audio:/\.(wav|mp3|flac|ogg|m4a)$/i};
let ready=false,submitting=false,lastSeed=null;
const jobs=new Map();
function notice(text){$('#notice').textContent=text}
function updateButton(){$('#generate').disabled=!ready||submitting}
function renderMedia(kind){
  $('#'+kind+'-count').textContent=`${media[kind].length} / ${limits[kind]}`;
  $('#'+kind+'-files').replaceChildren(...media[kind].map((item,index)=>{
    const row=document.createElement('div');row.className='file '+kind;
    if(kind==='image'){const img=document.createElement('img');img.src=item.url;img.alt='ภาพ '+(index+1);row.append(img)}
    const name=document.createElement('span');name.textContent=item.file.name;
    const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','ลบ '+item.file.name);
    remove.onclick=()=>{URL.revokeObjectURL(item.url);media[kind].splice(index,1);renderMedia(kind)};
    row.append(name,remove);return row;
  }));renderTags();
}
function renderTags(){
  const tags=media.image.map((_,i)=>`<Picture ${i+1}>`);let audioIndex=1;
  if($('#video-enabled').checked&&media.video.length){tags.push('<Video 1>');if($('#video-audio').checked)tags.push(`<Audio ${audioIndex++}>`)}
  if($('#audio-enabled').checked)media.audio.forEach(()=>tags.push(`<Audio ${audioIndex++}>`));
  $('#tags').replaceChildren(...tags.map(tag=>{const b=document.createElement('button');b.textContent=tag;b.onclick=()=>{$('#prompt').value+=' '+tag;$('#prompt').focus()};return b}));
}
for(const kind of Object.keys(media)){
  $('#'+kind+'-input').onchange=event=>{
    for(const file of event.target.files){
      if(media[kind].length>=limits[kind]){notice(`เพิ่มได้สูงสุด ${limits[kind]} ไฟล์ในหมวดนี้`);break}
      if(!extensions[kind].test(file.name)||file.size>512*1024*1024){notice('ชนิดไฟล์ไม่รองรับหรือไฟล์เกิน 512 MB');continue}
      media[kind].push({file,url:URL.createObjectURL(file)});
    }event.target.value='';renderMedia(kind);
  };
}
for(const kind of ['video','audio'])$('#'+kind+'-enabled').onchange=()=>{$('#'+kind+'-body').hidden=!$('#'+kind+'-enabled').checked;renderTags()};
$('#video-audio').onchange=renderTags;
function randomSeed(){const values=new Uint32Array(1);crypto.getRandomValues(values);return values[0]}
function validSeed(){const seed=Number($('#seed').value);return Number.isInteger(seed)&&seed>=0&&seed<=4294967295}
function updateSeedControls(){
  const locked=$('#seed-lock').checked;
  $('#seed').disabled=!locked;$('#seed-randomize').disabled=!locked;
  $('#seed-status').textContent=locked?'ล็อกอยู่ · งานถัดไปจะใช้ Seed นี้':'Auto · ระบบจะสุ่ม Seed ใหม่ทุกครั้ง';
}
function setLockedSeed(seed){
  $('#seed').value=String(seed);$('#seed-lock').checked=true;updateSeedControls();$('#advanced').open=true;$('#seed').focus();
}
$('#seed').value=String(randomSeed());
$('#seed-lock').onchange=()=>{if($('#seed-lock').checked&&!validSeed())$('#seed').value=String(randomSeed());updateSeedControls()};
$('#seed-randomize').onclick=()=>{$('#seed').value=String(randomSeed());$('#seed').focus()};
$('#reuse-latest-seed').onclick=()=>lastSeed!==null&&setLockedSeed(lastSeed);
updateSeedControls();
function updateDuration(){const seconds=Number($('#duration').value);$('#duration-value').textContent=`${seconds} วินาที`;$('#duration').setAttribute('aria-valuetext',`${seconds} วินาที`)}
$('#duration').oninput=updateDuration;updateDuration();
function setTheme(dark){document.documentElement.classList.toggle('dark',dark);$('#theme').textContent=dark?'โหมดสว่าง':'โหมดมืด';$('#theme').setAttribute('aria-pressed',String(dark));try{localStorage.setItem('kendo-theme',dark?'dark':'light')}catch{}}
let savedTheme='light';try{savedTheme=localStorage.getItem('kendo-theme')}catch{}setTheme(savedTheme==='dark');
$('#theme').onclick=()=>setTheme(!document.documentElement.classList.contains('dark'));
async function api(path,options={}){const response=await fetch('/api/comfy'+path,options);const result=await response.json();if(!response.ok)throw new Error(result.error?.message||result.error||JSON.stringify(result.node_errors||result));return result}
async function systemStatus(){
  try{const response=await fetch('/api/kendo/status',{cache:'no-store'});if(!response.ok)throw new Error();const s=await response.json();ready=s.models_ready&&s.comfy_ready;updateButton();$('#status').textContent=ready?'READY':s.download_error?'DOWNLOAD ERROR':'PREPARING';$('#progress').hidden=ready;$('#progress').value=s.progress||0;
    if(!submitting&&!jobs.size)notice(s.download_error?'ดาวน์โหลดสะดุด กรุณา Restart Pod เพื่อดาวน์โหลดต่อ':!s.models_ready?`กำลังดาวน์โหลดโมเดล ${s.progress}%`:!s.comfy_ready?'กำลังเริ่ม ComfyUI':'ระบบพร้อมสร้างวิดีโอ');
    renderClaude(s);
  }catch{ready=false;updateButton();$('#status').textContent='OFFLINE'}
}
function renderClaude(s){
  const card=$('#claude');if(!s.mcp_url){card.hidden=true;return}
  card.hidden=false;$('#claude-url').value=s.mcp_url;$('#claude-code-cmd').textContent='claude mcp add --transport http kendo '+s.mcp_url;
  $('#claude-state').textContent=s.mcp_ready?'พร้อมให้ Claude สั่งงาน':'กำลังเริ่มบริการ…';
}
$('#claude-toggle').onclick=()=>{const open=$('#claude-steps').hidden;$('#claude-steps').hidden=!open;$('#claude-toggle').setAttribute('aria-expanded',String(open))};
$('#claude-copy').onclick=async()=>{const url=$('#claude-url').value;try{await navigator.clipboard.writeText(url)}catch{$('#claude-url').select();document.execCommand('copy')}$('#claude-copy').textContent='คัดลอกแล้ว ✓';setTimeout(()=>{$('#claude-copy').textContent='คัดลอก URL'},2000)};
// Jobs Claude submits through the MCP server never pass through this tab, so
// merge finished Kendo clips from ComfyUI history into the local history.
async function syncServerHistory(){
  let history;try{history=await api('/history?max_items=40')}catch{return}
  const local=readHistory(),known=new Set(local.map(item=>item.url));const added=[];
  for(const [id,entry] of Object.entries(history)){const workflow=Array.isArray(entry.prompt)?entry.prompt[2]:null;if(!workflow?.reference||!String(workflow.save?.inputs?.filename_prefix||'').startsWith('video/Kendo_H3'))continue;const file=findVideo(entry.outputs);if(!file)continue;const url=videoUrl(file);if(known.has(url))continue;known.add(url);added.push({url,seed:workflow.noise?.inputs?.noise_seed,id})}
  if(!added.length)return;try{localStorage.setItem('kendo-h3-v3-history',JSON.stringify([...added.reverse(),...local].slice(0,20)))}catch{}renderHistory();
}
function uploadName(name){const dot=name.lastIndexOf('.');const base=(dot>0?name.slice(0,dot):name).normalize('NFKD').replace(/[^\w.-]+/g,'-').replace(/^[-.]+|[-.]+$/g,'').slice(0,48)||'ref';return base+'-'+crypto.randomUUID().slice(0,6)+(dot>0?name.slice(dot).toLowerCase():'')}
async function upload(file){const form=new FormData();form.append('image',file,uploadName(file.name));form.append('type','input');form.append('overwrite','false');const r=await api('/upload/image',{method:'POST',body:form});return r.subfolder?`${r.subfolder}/${r.name}`:r.name}
function findVideo(value){if(!value||typeof value!=='object')return null;if(typeof value.filename==='string'&&/\.(mp4|webm|mov|mkv)$/i.test(value.filename))return value;for(const v of Object.values(value)){const match=findVideo(v);if(match)return match}return null}
function videoUrl(file){return '/api/comfy/view?'+new URLSearchParams({filename:file.filename,subfolder:file.subfolder||'',type:file.type||'output'})}
function showVideo(url){$('#welcome').hidden=true;$('#preview video')?.remove();const v=document.createElement('video');v.src=url;v.controls=true;v.playsInline=true;$('#preview').append(v);$('#download').href=url;$('#download').hidden=false}
function readHistory(){try{return JSON.parse(localStorage.getItem('kendo-h3-v3-history')||'[]')}catch{return []}}
function renderHistory(){const history=readHistory();$('#history').replaceChildren(...history.map(item=>{const article=document.createElement('article'),v=document.createElement('video'),actions=document.createElement('div'),a=document.createElement('a');v.src=item.url;v.controls=true;v.preload='metadata';actions.className='history-actions';a.href=item.url;a.download='';a.textContent='↓ ดาวน์โหลด';actions.append(a);if(Number.isInteger(item.seed)){const use=document.createElement('button');use.textContent='Seed '+item.seed+' · ใช้ต่อ';use.onclick=()=>setLockedSeed(item.seed);actions.append(use)}article.append(v,actions);return article}))}
async function monitor(id,seed){
  try{const deadline=Date.now()+6*60*60*1000;while(Date.now()<deadline){await new Promise(r=>setTimeout(r,4000));let history;try{history=await api('/history/'+encodeURIComponent(id))}catch{continue}const entry=history[id];if(!entry)continue;if(entry.status?.status_str==='error')throw new Error('ComfyUI ประมวลผลไม่สำเร็จ ตรวจ Logs ที่พอร์ต 8188');const file=findVideo(entry.outputs);if(file){const url=videoUrl(file);showVideo(url);try{localStorage.setItem('kendo-h3-v3-history',JSON.stringify([{url,seed},...readHistory()].slice(0,20)))}catch{}renderHistory();return}}throw new Error('หมดเวลาติดตามงาน ตรวจประวัติใน ComfyUI');
  }catch(e){notice(e.message)}finally{jobs.delete(id);$('#activity').textContent=jobs.size?`${jobs.size} งานในคิว`:'สิ้นสุดการติดตามงาน'}
}
async function generate(){
  if(!ready||submitting)return;
  const prompt=$('#prompt').value.trim();if(!prompt)return notice('กรุณากรอกคำอธิบายวิดีโอ');
  if($('#seed-lock').checked&&!validSeed())return notice('Seed ต้องเป็นเลขจำนวนเต็ม 0–4,294,967,295');
  const seed=$('#seed-lock').checked?Number($('#seed').value):randomSeed();
  lastSeed=seed;$('#seed').value=String(seed);$('#reuse-latest-seed').hidden=false;$('#reuse-latest-seed').textContent='ใช้ Seed ล่าสุดต่อ · '+seed;
  const selected={images:media.image.map(x=>x.file),videos:$('#video-enabled').checked?media.video.map(x=>x.file):[],audios:$('#audio-enabled').checked?media.audio.map(x=>x.file):[]};
  const settings={prompt,ratio:$('#ratio').value,megapixels:Number($('#quality').value),duration:Number($('#duration').value),steps:Number($('#steps').value),seed,videoAudio:$('#video-audio').checked};
  try{KendoWorkflow.buildWorkflow({...settings,images:[],videos:[],audios:[]})}catch(e){return notice(e.message)}
  submitting=true;updateButton();notice('กำลังอัปโหลดไฟล์…');
  try{const names={};for(const [kind,files] of Object.entries(selected)){names[kind]=[];for(const file of files)names[kind].push(await upload(file))}const workflow=KendoWorkflow.buildWorkflow({...settings,...names});const result=await api('/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:workflow,client_id:crypto.randomUUID()})});if(!result.prompt_id)throw new Error('ไม่พบหมายเลขงาน');jobs.set(result.prompt_id,true);$('#activity').textContent=`${jobs.size} งานในคิว`;notice('ส่งเข้าคิวแล้ว · Seed '+seed);void monitor(result.prompt_id,seed)}catch(e){notice(String(e.message))}finally{submitting=false;updateButton()}
}
$('#generate').onclick=generate;renderHistory();void systemStatus();setInterval(systemStatus,5000);void syncServerHistory();setInterval(syncServerHistory,20000);
