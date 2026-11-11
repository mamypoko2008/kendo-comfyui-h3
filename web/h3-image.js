(() => {
  'use strict';
  const $=selector=>document.querySelector(selector), native=window.KendoH3Image;
  const slots=Array(16).fill(null), tracked=new Set();
  let visible=4,ready=null,busy=false,reading=false,queueReading=false;
  const notice=text=>$('#image-notice').textContent=text;
  const randomSeed=()=>crypto.getRandomValues(new Uint32Array(1))[0];
  const updateButton=()=>$('#image-generate').disabled=busy||reading||!ready?.ready;
  async function api(route,options={}) {
    const response=await fetch('/api/comfy'+route,{...options,signal:options.signal??AbortSignal.timeout(60000)});
    let data;try{data=await response.json();}catch{throw new Error('บริการ ComfyUI ยังไม่พร้อม');}
    if(!response.ok)throw new Error(typeof data.error==='string'?data.error:data.error?.message||'ComfyUI ไม่รับงาน กรุณาตรวจ Console');
    return data;
  }
  function setTheme(dark){document.documentElement.classList.toggle('dark',dark);$('#theme').textContent=dark?'โหมดสว่าง':'โหมดมืด';$('#theme').setAttribute('aria-pressed',String(dark));try{localStorage.setItem('kendo-theme',dark?'dark':'light');}catch{}}
  try{setTheme(localStorage.getItem('kendo-theme')==='dark');}catch{setTheme(false);} $('#theme').onclick=()=>setTheme(!document.documentElement.classList.contains('dark'));
  function renderReferences(){
    const cards=[];
    for(let index=0;index<visible;index++){
      const item=slots[index],card=document.createElement('div'),label=document.createElement('label'),input=document.createElement('input'),number=document.createElement('small');
      card.className='reference-slot';input.type='file';input.accept='image/png,image/jpeg,image/webp';input.multiple=true;input.setAttribute('aria-label','แนบภาพ '+(index+1));input.onchange=()=>void acceptFiles(input.files,index);
      if(item){const img=document.createElement('img');img.src=item.url;img.alt=item.file.name;label.append(img);}else label.append(document.createTextNode('＋'));
      label.append(input);number.textContent=String(index+1).padStart(2,'0');card.append(label,number);
      if(item){const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.onclick=()=>{URL.revokeObjectURL(item.url);slots[index]=null;renderReferences();};card.append(remove);}
      card.ondragover=event=>event.preventDefault();card.ondrop=event=>{event.preventDefault();void acceptFiles(event.dataTransfer.files,index);};cards.push(card);
    }
    $('#reference-grid').replaceChildren(...cards);$('#image-count').textContent=slots.filter(Boolean).length+' / 16';$('#add-reference').disabled=visible===16;
  }
  async function acceptFiles(files,start){
    if(reading||busy)return;reading=true;updateButton();let next=start;
    try{for(const file of Array.from(files)){if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>30*1024*1024)throw new Error('ใช้ JPG / PNG / WEBP ไม่เกิน 30 MB ต่อภาพ');if(files.length>1){next=slots.findIndex((item,i)=>!item&&i>=next);if(next<0)next=slots.findIndex(item=>!item);}if(next<0||next>=16)throw new Error('แนบได้สูงสุด 16 ภาพ');if(slots[next])URL.revokeObjectURL(slots[next].url);slots[next]={file,url:URL.createObjectURL(file)};visible=Math.max(visible,next+1);next++;}notice('เพิ่มภาพอ้างอิงแล้ว');}catch(error){notice(error.message);}finally{reading=false;renderReferences();updateButton();}
  }
  $('#add-reference').onclick=()=>{if(visible<16){visible++;renderReferences();}};
  function updateSize(){const [w,h]=native.dimensions($('#image-ratio').value,$('#image-resolution').value),mp=(w*h/1e6).toFixed(1);$('#image-size-note').textContent=`${w.toLocaleString()} × ${h.toLocaleString()} px · ${mp} MP${$('#image-resolution').value==='MAX'?' · ขอบยาวใกล้ 8K เฉพาะสัดส่วนกว้างมาก':''}`;}
  $('#image-ratio').onchange=updateSize;$('#image-resolution').onchange=updateSize;
  $('#image-seed-lock').onchange=()=>{const locked=$('#image-seed-lock').checked;$('#image-seed').disabled=!locked;$('#image-seed-randomize').disabled=!locked;};
  $('#image-seed-randomize').onclick=()=>{$('#image-seed').value=String(randomSeed());};
  async function checkReadiness(){
    try{const [info,response]=await Promise.all([api('/object_info'),fetch('/api/kendo/image-status',{cache:'no-store',signal:AbortSignal.timeout(10000)})]);if(!response.ok)throw new Error('อ่านสถานะโมเดลไม่ได้');const state=await response.json();ready=native.readiness(info,'h3image');ready.ready=ready.ready&&state.files_ready;$('#image-model-state').classList.toggle('ready',ready.ready);$('#image-model-state').textContent=ready.ready?'H3 IMAGE · READY':`H3 IMAGE · ${state.progress??0}%`;$('#image-status').textContent=ready.ready?'READY':'PREPARING';if(state.download_error)notice('ดาวน์โหลดโมเดลไม่สำเร็จ: '+state.download_error);else if(ready.missingNodes.length)notice('ComfyUI ต้องเป็น 0.45.0 ขึ้นไป · ขาด node: '+ready.missingNodes.join(', '));else if(!state.files_ready)notice(`กำลังดาวน์โหลด H3 Image ${state.progress??0}%`);else notice('พร้อมสร้างภาพ · INT8 · 6 Steps');}catch{ready=null;$('#image-status').textContent='CONNECTING';if(!busy)notice('กำลังรอ ComfyUI…');}finally{updateButton();}
  }
  async function connection(){try{const response=await fetch('/api/kendo/status',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)return;const state=await response.json();$('#claude').hidden=!state.mcp_url;$('#claude-url').value=state.mcp_url||'';$('#claude-state').textContent=state.mcp_ready?'MCP พร้อมสั่งทั้งวิดีโอและภาพนิ่ง':'กำลังเริ่ม MCP';document.querySelectorAll('.comfy-link').forEach(a=>a.href=state.comfy_url||'#');}catch{}}
  $('#claude-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#claude-url').value);$('#claude-state').textContent='คัดลอก URL แล้ว';}catch{$('#claude-url').select();}};$('#claude-help').onclick=()=>{$('#claude-steps').hidden=!$('#claude-steps').hidden;};
  async function refreshQueue(){if(queueReading)return;queueReading=true;try{const q=await api('/queue',{cache:'no-store',signal:AbortSignal.timeout(10000)}),active=q.queue_running?.length??0,pending=q.queue_pending?.length??0;$('#queue-active-count').textContent=active;$('#queue-pending-count').textContent=pending;$('#queue-state').textContent=active||pending?`ทั้งหมด ${active+pending} งาน`:'คิวว่าง';$('#queue-summary .active').classList.toggle('has-jobs',active>0);$('#queue-summary .pending').classList.toggle('has-jobs',pending>0);}catch{$('#queue-state').textContent='อ่านคิวไม่ได้';}finally{queueReading=false;}}
  function resultUrl(file){return '/api/comfy/view?'+new URLSearchParams({filename:file.filename,subfolder:file.subfolder||'',type:file.type||'output'});}
  function showResult(file){const img=document.createElement('img');img.src=resultUrl(file);img.alt='ภาพจาก MiniMax H3 Image';$('#image-preview').replaceChildren(img);$('#image-download').href=img.src;$('#image-result-actions').hidden=false;}
  function outputImages(entry){return Object.values(entry.outputs||{}).flatMap(output=>output.images||[]).filter(file=>file.filename?.includes('Kendo_H3_Image'));}
  async function refreshHistory(){try{const history=await api('/history?max_items=100'),cards=[];for(const [id,entry] of Object.entries(history).reverse())for(const file of outputImages(entry)){const article=document.createElement('article'),img=document.createElement('img'),open=document.createElement('button');img.src=resultUrl(file);img.alt='H3 Image';img.loading='lazy';open.textContent='เปิดภาพ';open.onclick=()=>showResult(file);article.append(img,open);cards.push(article);if(tracked.has(id)){tracked.delete(id);showResult(file);notice('สร้างภาพสำเร็จแล้ว');}}for(const id of [...tracked])if(history[id]?.status?.status_str==='error'){tracked.delete(id);notice('สร้างภาพไม่สำเร็จ กรุณาเปิด Comfy Console');}$('#image-history').replaceChildren(...cards);$('#image-activity').textContent=tracked.size?`กำลังติดตาม ${tracked.size} งาน`:cards.length?`${cards.length} ภาพ`:'';}catch{}}
  $('#image-generate').onclick=async()=>{
    if(busy||reading||!ready?.ready)return;const prompt=$('#image-prompt').value.trim();if(!prompt)return notice('กรุณาอธิบายภาพที่ต้องการ');const seed=$('#image-seed-lock').checked?Number($('#image-seed').value):randomSeed();busy=true;updateButton();let attempted=false;
    try{const info=await api('/object_info'),current=native.readiness(info,'h3image');if(!current.ready)throw new Error('โมเดลหรือ node ยังไม่พร้อม');const references=[];notice('กำลังอัปโหลดภาพอ้างอิง…');for(const item of slots.filter(Boolean)){const ext=item.file.name.split('.').pop().toLowerCase(),form=new FormData();form.append('image',item.file,'h3-image-ref-'+crypto.randomUUID()+'.'+ext);form.append('type','input');form.append('overwrite','false');const upload=await api('/upload/image',{method:'POST',body:form});if(!upload.name)throw new Error('อัปโหลดภาพไม่สำเร็จ');references.push(upload.subfolder?upload.subfolder+'/'+upload.name:upload.name);}const graph=native.buildWorkflow({model:'h3image',prompt,references,ratio:$('#image-ratio').value,resolution:$('#image-resolution').value,seed,...current.files});attempted=true;const task=await api('/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:graph,client_id:crypto.randomUUID()})});if(!task.prompt_id)throw new Error('ComfyUI ไม่ส่งหมายเลขงานกลับมา');tracked.add(task.prompt_id);$('#image-seed').value=String(seed);notice('ส่งเข้าคิวแล้ว · 6 Steps · Seed '+seed);void refreshQueue();void refreshHistory();}catch(error){notice(error.message+(attempted?' · ตรวจคิวก่อนส่งใหม่':''));}finally{busy=false;updateButton();}
  };
  async function refreshConsole(){if(!$('#console-panel').open)return;try{const response=await fetch('/api/kendo/logs',{cache:'no-store'}),data=await response.json();$('#comfy-console').textContent=data.text||'ยังไม่มี Log';$('#console-state').textContent=data.available?'กำลังติดตาม':'ยังไม่พบไฟล์ Log';}catch{$('#console-state').textContent='อ่าน Log ไม่ได้';}}
  renderReferences();updateSize();void checkReadiness();void connection();void refreshQueue();void refreshHistory();setInterval(checkReadiness,15000);setInterval(connection,15000);setInterval(refreshQueue,2000);setInterval(refreshHistory,5000);setInterval(refreshConsole,2000);
})();
