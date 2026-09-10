'use strict';
const $ = s => document.querySelector(s);
const media = {image:[],video:[],audio:[]};
const limits = {image:9,video:1,audio:3};
const extensions = {image:/\.(png|jpe?g|webp)$/i,video:/\.(mp4|webm|mov)$/i,audio:/\.(wav|mp3|flac|ogg|m4a)$/i};
let ready=false,fastUpscaleReady=false,qualityUpscaleReady=false,submitting=false,selectedUpscale=null;
const jobs=new Map();
function notice(text){$('#notice').textContent=text}
function updateButton(){$('#generate').disabled=!ready||submitting}
function renderMedia(kind){
  $('#'+kind+'-count').textContent=`${media[kind].length} / ${limits[kind]}`;
  $('#'+kind+'-files').replaceChildren(...media[kind].map((item,index)=>{
    const row=document.createElement('div');row.className='file';
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
function updateDuration(){const seconds=Number($('#duration').value);$('#duration-value').textContent=`${seconds} วินาที`;$('#duration').setAttribute('aria-valuetext',`${seconds} วินาที`)}
$('#duration').oninput=updateDuration;updateDuration();
function setTheme(dark){document.documentElement.classList.toggle('dark',dark);$('#theme').textContent=dark?'โหมดสว่าง':'โหมดมืด';$('#theme').setAttribute('aria-pressed',String(dark));try{localStorage.setItem('kendo-theme',dark?'dark':'light')}catch{}}
let savedTheme='light';try{savedTheme=localStorage.getItem('kendo-theme')}catch{}setTheme(savedTheme==='dark');
$('#theme').onclick=()=>setTheme(!document.documentElement.classList.contains('dark'));
async function api(path,options={}){const response=await fetch('/api/comfy'+path,options);const result=await response.json();if(!response.ok)throw new Error(result.error?.message||result.error||JSON.stringify(result.node_errors||result));return result}
async function systemStatus(){
  try{const response=await fetch('/api/kendo/status',{cache:'no-store'});if(!response.ok)throw new Error();const s=await response.json(),upscaleChanged=fastUpscaleReady!==s.fast_upscale_ready||qualityUpscaleReady!==s.quality_upscale_ready;ready=s.base_models_ready&&s.comfy_ready;fastUpscaleReady=Boolean(s.fast_upscale_ready);qualityUpscaleReady=Boolean(s.quality_upscale_ready);updateButton();if(upscaleChanged){renderHistory();updateUpscaleWorkspace()}$('#status').textContent=ready?(fastUpscaleReady&&qualityUpscaleReady?'READY':'H3 READY'):s.download_error?'DOWNLOAD ERROR':'PREPARING';$('#progress').hidden=s.models_ready;$('#progress').value=s.progress||0;
    if(!submitting&&!jobs.size)notice(s.download_error?'ดาวน์โหลดสะดุด กรุณา Restart Pod เพื่อดาวน์โหลดต่อ':!s.base_models_ready?`กำลังดาวน์โหลดโมเดล H3 ${s.progress}%`:!s.comfy_ready?'กำลังเริ่ม ComfyUI':!fastUpscaleReady?'H3 พร้อม · กำลังเตรียม Real-ESRGAN':!qualityUpscaleReady?'H3 และ Fast Upscale พร้อม · SeedVR2 กำลังดาวน์โหลด':'ระบบพร้อมสร้างและอัปสเกลวิดีโอ');
  }catch{ready=false;updateButton();$('#status').textContent='OFFLINE'}
}
async function upload(file){const form=new FormData();form.append('image',file,crypto.randomUUID()+file.name.slice(file.name.lastIndexOf('.')).toLowerCase());form.append('type','input');form.append('overwrite','false');const r=await api('/upload/image',{method:'POST',body:form});return r.subfolder?`${r.subfolder}/${r.name}`:r.name}
function findVideo(value){if(!value||typeof value!=='object')return null;if(typeof value.filename==='string'&&/\.(mp4|webm|mov|mkv)$/i.test(value.filename))return value;for(const v of Object.values(value)){const match=findVideo(v);if(match)return match}return null}
function videoUrl(file){return '/api/comfy/view?'+new URLSearchParams({filename:file.filename,subfolder:file.subfolder||'',type:file.type||'output'})}
function showVideo(url){$('#welcome').hidden=true;$('#preview video')?.remove();const v=document.createElement('video');v.src=url;v.controls=true;v.playsInline=true;$('#preview').append(v);$('#download').href=url;$('#download').hidden=false;const button=$('#upscale-current');button.hidden=false;button.disabled=false;button.onclick=()=>openUpscaleWorkspace({url},button)}
function readHistory(){try{return JSON.parse(localStorage.getItem('kendo-h3-v3-beta-history')||'[]')}catch{return []}}
function renderHistory(){const history=readHistory();$('#history').replaceChildren(...history.map(item=>{const article=document.createElement('article'),v=document.createElement('video'),actions=document.createElement('div'),a=document.createElement('a'),b=document.createElement('button');v.src=item.url;v.controls=true;v.preload='metadata';actions.className='history-actions';a.href=item.url;a.download='';a.textContent='↓ ดาวน์โหลด';b.textContent='↑ อัปสเกล';b.onclick=()=>{document.querySelectorAll('.history article').forEach(card=>card.classList.remove('selected'));article.classList.add('selected');openUpscaleWorkspace(item,b)};actions.append(a,b);article.append(v,actions);return article}))}
function updateUpscaleWorkspace(){
  const engine=$('#upscale-engine').value,isQuality=engine==='seedvr2',isReady=isQuality?qualityUpscaleReady:fastUpscaleReady;
  $('#upscale-target').disabled=!isQuality;
  $('#start-upscale').disabled=!selectedUpscale||!isReady;
  $('#upscale-description').textContent=isQuality?(isReady?'SeedVR2 พร้อม · รักษาความต่อเนื่องระหว่างเฟรม ใช้เวลานานกว่า':'SeedVR2 กำลังดาวน์โหลด · เลือกได้แต่ยังเริ่มงานไม่ได้'):(isReady?'Real-ESRGAN พร้อม · ขยาย 2× แบบเร็วและรักษาภาพต้นฉบับ':'Real-ESRGAN กำลังเตรียมไฟล์โมเดล');
}
function openUpscaleWorkspace(item,button){
  selectedUpscale={item,button};const panel=$('#upscale-workspace');panel.hidden=false;$('#upscale-source-preview').src=item.url;updateUpscaleWorkspace();panel.scrollIntoView({behavior:'smooth',block:'start'});
}
function closeUpscaleWorkspace(){selectedUpscale=null;$('#upscale-workspace').hidden=true;$('#upscale-source-preview').removeAttribute('src');$('#upscale-source-preview').load();document.querySelectorAll('.history article').forEach(card=>card.classList.remove('selected'))}
$('#upscale-engine').onchange=updateUpscaleWorkspace;
$('#close-upscale').onclick=closeUpscaleWorkspace;
$('#start-upscale').onclick=()=>selectedUpscale&&upscaleHistory(selectedUpscale.item,selectedUpscale.button);
async function monitor(id){
  try{const deadline=Date.now()+6*60*60*1000;while(Date.now()<deadline){await new Promise(r=>setTimeout(r,4000));let history;try{history=await api('/history/'+encodeURIComponent(id))}catch{continue}const entry=history[id];if(!entry)continue;if(entry.status?.status_str==='error')throw new Error('ComfyUI ประมวลผลไม่สำเร็จ ตรวจ Logs ที่พอร์ต 8188');const file=findVideo(entry.outputs);if(file){const url=videoUrl(file);showVideo(url);try{localStorage.setItem('kendo-h3-v3-beta-history',JSON.stringify([{url},...readHistory()].slice(0,20)))}catch{}renderHistory();return}}throw new Error('หมดเวลาติดตามงาน ตรวจประวัติใน ComfyUI');
  }catch(e){notice(e.message)}finally{jobs.delete(id);$('#activity').textContent=jobs.size?`${jobs.size} งานในคิว`:'สิ้นสุดการติดตามงาน'}
}
async function upscaleHistory(item,button){const engine=$('#upscale-engine').value,isReady=engine==='seedvr2'?qualityUpscaleReady:fastUpscaleReady;if(!isReady)return notice(engine==='seedvr2'?'SeedVR2 ยังดาวน์โหลดไม่เสร็จ':'Real-ESRGAN ยังไม่พร้อม');button.disabled=true;$('#start-upscale').disabled=true;notice('กำลังเตรียมคลิปเดิมสำหรับอัปสเกล…');try{const response=await fetch(item.url);if(!response.ok)throw new Error('เปิดไฟล์วิดีโอเดิมไม่สำเร็จ');const blob=await response.blob();const source=new File([blob],'kendo-upscale-source.mp4',{type:blob.type||'video/mp4'});const name=await upload(source);const workflow=KendoWorkflow.buildUpscaleWorkflow({video:name,engine,targetResolution:Number($('#upscale-target').value)});const result=await api('/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:workflow,client_id:crypto.randomUUID()})});if(!result.prompt_id)throw new Error('ไม่พบหมายเลขงาน');jobs.set(result.prompt_id,true);$('#activity').textContent=`${jobs.size} งานในคิว`;notice(`ส่งคลิปเข้า ${engine==='seedvr2'?'SeedVR2 Quality':'Real-ESRGAN Fast'} แล้ว`);void monitor(result.prompt_id)}catch(e){notice(String(e.message))}finally{button.disabled=false;updateUpscaleWorkspace()}}
async function generate(){
  if(!ready||submitting)return;
  const prompt=$('#prompt').value.trim();if(!prompt)return notice('กรุณากรอกคำอธิบายวิดีโอ');
  const selected={images:media.image.map(x=>x.file),videos:$('#video-enabled').checked?media.video.map(x=>x.file):[],audios:$('#audio-enabled').checked?media.audio.map(x=>x.file):[]};
  const settings={prompt,ratio:$('#ratio').value,megapixels:Number($('#quality').value),duration:Number($('#duration').value),steps:Number($('#steps').value),videoAudio:$('#video-audio').checked};
  try{KendoWorkflow.buildWorkflow({...settings,images:[],videos:[],audios:[]})}catch(e){return notice(e.message)}
  submitting=true;updateButton();notice('กำลังอัปโหลดไฟล์…');
  try{const names={};for(const [kind,files] of Object.entries(selected)){names[kind]=[];for(const file of files)names[kind].push(await upload(file))}const workflow=KendoWorkflow.buildWorkflow({...settings,...names});const result=await api('/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:workflow,client_id:crypto.randomUUID()})});if(!result.prompt_id)throw new Error('ไม่พบหมายเลขงาน');jobs.set(result.prompt_id,true);$('#activity').textContent=`${jobs.size} งานในคิว`;notice('ส่งเข้าคิวแล้ว สามารถเตรียมงานถัดไปได้');void monitor(result.prompt_id)}catch(e){notice(String(e.message))}finally{submitting=false;updateButton()}
}
$('#generate').onclick=generate;renderHistory();updateUpscaleWorkspace();void systemStatus();setInterval(systemStatus,5000);
