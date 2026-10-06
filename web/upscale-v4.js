'use strict';
const $=s=>document.querySelector(s);
let mode='generated',sources={generated:null,upload:null},ready=false,busy=false,jobs=new Map(),statusPending=false;
const orientation={landscape:'แนวนอน',portrait:'แนวตั้ง',square:'สี่เหลี่ยมจัตุรัส'};
const states={queued:'รอคิว',running:'กำลังอัพสเกล',done:'เสร็จแล้ว',error:'เกิดข้อผิดพลาด',unknown:'ไม่พบงานในคิว กรุณาตรวจ ComfyUI',missing_output:'ไม่พบไฟล์ผลลัพธ์'};
function theme(dark){document.documentElement.classList.toggle('dark',dark);$('#theme').textContent=dark?'โหมดสว่าง':'โหมดมืด';$('#theme').setAttribute('aria-pressed',String(dark));try{localStorage.setItem('kendo-theme',dark?'dark':'light')}catch{}}
let dark=false;try{dark=localStorage.getItem('kendo-theme')==='dark'}catch{}theme(dark);$('#theme').onclick=()=>theme(!document.documentElement.classList.contains('dark'));
async function api(path,options={}){const response=await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(180000),...options});const body=await response.json();if(!response.ok)throw Error(body.error||'คำขอไม่สำเร็จ');return body;}
const post=(path,body)=>api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const videoUrl=file=>'/api/comfy/view?'+new URLSearchParams({filename:file.filename,subfolder:file.subfolder||'',type:file.type||'output'});
function notice(text){$('#upscale-notice').textContent=text;}
function renderSource(){
 const source=sources[mode],m=source?.metadata;
 for(const button of document.querySelectorAll('[data-source]'))button.setAttribute('aria-selected',String(button.dataset.source===mode));
 $('#generated-panel').hidden=mode!=='generated';$('#upload-panel').hidden=mode!=='upload';
 $('#source-name').textContent=source?.name||'ยังไม่ได้เลือกคลิป';
 $('#source-meta').textContent=m?`${orientation[m.orientation]} · ${Math.round(m.display_width)} × ${Math.round(m.display_height)} · ${m.duration.toFixed(2)} วินาที`:'ระบบอ่านสัดส่วนจากวิดีโอที่เลือก';
 $('#source-orientation').textContent=m?orientation[m.orientation]:'อ่านจากคลิปอัตโนมัติ';
 $('#source-fps').textContent=m?`${Number(m.fps.toFixed(3))} fps`:'ตามต้นฉบับ';
 $('#source-audio').textContent=m&&!m.has_audio?'ต้นฉบับไม่มีเสียง':'เก็บเสียงเดิม';
 $('#received-title').textContent=sources.generated?'รับคลิปที่เลือกแล้ว':'เลือกคลิปจากงานของคุณ';
 $('#received-note').textContent=sources.generated?sources.generated.name:'กดอัพสเกลท้ายคลิปที่เจนเสร็จ หรือเลือกคลิปจากหน้าไฟล์งาน';
 $('#start-upscale').disabled=!source||!ready||busy;
 $('#upscale-file').disabled=busy;
}
function selectSource(source){const kind=source.source_kind==='upload'?'upload':'generated';sources[kind]=source;mode=kind;renderSource();try{localStorage.setItem('kendo-v4-upscale-source',source.source_id)}catch{}history.replaceState({},'', '/upscale.html?'+new URLSearchParams({source_id:source.source_id}));notice('พร้อมตั้งค่าอัพสเกล');}
for(const button of document.querySelectorAll('[data-source]'))button.onclick=()=>{mode=button.dataset.source;renderSource();};
async function readiness(){if(statusPending)return;statusPending=true;try{const s=await api('/api/kendo/upscale/status');ready=s.models_ready&&s.nodes_ready;$('#upscale-ready').textContent=ready?'LTX READY':s.download_error?'LTX DOWNLOAD ERROR':s.models_ready?'กำลังเริ่ม LTX':'กำลังดาวน์โหลด LTX';$('#upscale-model-state').textContent=ready?'LTX Refine Details · Tiled Fusion':s.download_error||`โมเดลอัพสเกล ${s.progress}%`;renderSource();}catch{ready=false;$('#upscale-ready').textContent='เชื่อมต่อระบบไม่ได้';renderSource();}finally{statusPending=false;}}
function upload(file){return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST','/api/kendo/upscale/upload?'+new URLSearchParams({name:file.name}));xhr.timeout=180000;xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.upload.onprogress=e=>{if(e.lengthComputable){$('#upload-progress').value=e.loaded/e.total*100;$('#upload-state').textContent=e.loaded===e.total?'กำลังอ่านข้อมูลวิดีโอ…':`กำลังอัปโหลด ${Math.round(e.loaded/e.total*100)}%`;}};xhr.onload=()=>{try{const body=JSON.parse(xhr.responseText);if(xhr.status>=400)reject(Error(body.error||'อัปโหลดไม่สำเร็จ'));else resolve(body);}catch{reject(Error('อัปโหลดไม่สำเร็จ'));}};xhr.onerror=()=>reject(Error('เชื่อมต่อระหว่างอัปโหลดไม่สำเร็จ'));xhr.ontimeout=()=>reject(Error('หมดเวลาอัปโหลด กรุณาลองใหม่'));xhr.send(file);});}
$('#upscale-file').onchange=async()=>{const file=$('#upscale-file').files[0];if(!file)return;sources.upload=null;renderSource();if(!/\.(mp4|mov|webm)$/i.test(file.name)||file.size>512*1024*1024){$('#upload-state').textContent='เลือก MP4, MOV หรือ WebM ขนาดไม่เกิน 512 MB';return;}busy=true;renderSource();$('#upload-progress').hidden=false;$('#upload-progress').value=0;$('#upload-state').textContent='กำลังอัปโหลด…';try{selectSource(await upload(file));$('#upload-state').textContent=file.name+' · อัปโหลดและอ่านข้อมูลแล้ว';}catch(error){$('#upload-state').textContent=error.message;}finally{busy=false;$('#upload-progress').hidden=true;renderSource();}};
function showResult(job){if(!job.file)return;$('#upscale-result').hidden=false;$('#result-title').textContent='ผลอัพสเกล · '+job.preset;const url=videoUrl(job.file);$('#result-video').src=url;$('#result-download').href=url;$('#result-download').download=job.file.filename;$('#result-meta').textContent=`${job.name} → ${job.target_width} × ${job.target_height} · ${Number(job.metadata.fps.toFixed(3))} fps`;}
function renderJobs(){
 $('#jobs-empty').hidden=jobs.size>0;
 $('#upscale-jobs').replaceChildren(...[...jobs.values()].slice().reverse().map(job=>{const row=document.createElement('article');row.className='upscale-job';const text=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small');name.textContent=job.name+' · '+job.preset;detail.textContent=states[job.status]||job.status;if(job.error){detail.textContent+=' · '+job.error;detail.className='job-error';}text.append(name,detail);row.append(text);if(job.status==='done'){const button=document.createElement('button');button.textContent='ดูผลลัพธ์';button.onclick=()=>showResult(job);row.append(button);}return row;}));
}
let polling=false;
async function pollJobs(){if(polling)return;polling=true;try{for(const [id,job] of jobs){if(!['queued','running','unknown'].includes(job.status))continue;try{const updated=await api('/api/kendo/upscale/job/'+encodeURIComponent(id));jobs.set(id,updated);if(updated.status==='done'&&job.status!=='done')showResult(updated);}catch{} }renderJobs();}finally{polling=false;}}
$('#start-upscale').onclick=async()=>{const source=sources[mode];if(!source||!ready||busy)return;const prompt=$('#refine-prompt').value.trim(),seed=Number($('#refine-seed').value);if(!prompt||!Number.isInteger(seed)||seed<0||seed>4294967295)return notice('ตรวจคำอธิบายรายละเอียดและ Seed');busy=true;renderSource();notice('กำลังส่งเข้าคิวอัพสเกล…');try{const job=await post('/api/kendo/upscale',{source_id:source.source_id,preset:$('#upscale-preset').value,prompt,seed});jobs.set(job.job_id,job);renderJobs();notice('ส่งเข้าคิวแล้ว · ไม่ต้องเจนคลิปใหม่');void pollJobs();}catch(error){notice(error.message);}finally{busy=false;renderSource();}};
async function init(){renderSource();void readiness();try{const s=await api('/api/kendo/status');if(s.comfy_url)document.querySelectorAll('.comfy-link').forEach(a=>a.href=s.comfy_url);}catch{}
 const params=new URLSearchParams(location.search);let sourceId=params.get('source_id');
 if(!sourceId&&!params.get('filename'))try{sourceId=localStorage.getItem('kendo-v4-upscale-source')}catch{}
 try{if(params.get('filename')){notice('กำลังรับคลิปจากไฟล์งาน…');selectSource(await post('/api/kendo/upscale/select',{filename:params.get('filename'),subfolder:params.get('subfolder')||'',type:params.get('type')||'output'}));}else if(sourceId)selectSource(await api('/api/kendo/upscale/source/'+encodeURIComponent(sourceId)));}catch(error){notice(error.message);}
 try{const data=await api('/api/kendo/upscale/jobs');for(const job of data.jobs.reverse())jobs.set(job.job_id,job);renderJobs();void pollJobs();}catch{}
}
void init();setInterval(readiness,10000);setInterval(pollJobs,5000);
