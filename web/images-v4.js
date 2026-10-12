/* Local Qwen generation: same ComfyUI queue and shared native workflow as MCP. */
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector),native=window.KendoQwenV4;
  const slots=Array(10).fill(null),tracked=new Set();
  let visible=3,ready=null,busy=false,reading=false,selectedResult=null;
  const notice=text=>$('#notice').textContent=text;
  const updateButton=()=>$('#generate').disabled=busy||reading||!ready?.ready;
  async function api(route,options={}) {
    const response=await fetch('/api/comfy'+route,{...options,signal:AbortSignal.timeout(60000)});
    let data;try{data=await response.json();}catch{throw new Error('บริการ ComfyUI ยังไม่พร้อม');}
    if(!response.ok)throw new Error(typeof data.error==='string'?data.error:data.error?.message||'ComfyUI ไม่รับงาน กรุณาตรวจ Console');
    return data;
  }
  function renderReferences() {
    $('#reference-grid').replaceChildren(...Array.from({length:visible},(_,index)=>{
      const item=slots[index],card=document.createElement('div'),label=document.createElement('label'),input=document.createElement('input'),number=document.createElement('small');
      card.className='reference-slot';input.type='file';input.accept='image/png,image/jpeg,image/webp';input.multiple=true;
      input.setAttribute('aria-label','แนบภาพอ้างอิง '+(index+1));input.onchange=()=>void acceptFiles(input.files,index);
      if(item){const img=document.createElement('img');img.src=item.url;img.alt=item.file.name;label.append(img);}else label.append(document.createTextNode('＋'));
      label.append(input);number.textContent=String(index+1).padStart(2,'0');card.append(label,number);
      if(item){const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','ลบภาพ '+(index+1));remove.onclick=()=>{URL.revokeObjectURL(item.url);slots[index]=null;renderReferences();};card.append(remove);}
      card.ondragover=event=>event.preventDefault();card.ondrop=event=>{event.preventDefault();void acceptFiles(event.dataTransfer.files,index);};return card;
    }));
    const count=slots.filter(Boolean).length;
    $('#image-count').textContent=count+' / 10';$('#add-reference').disabled=visible===10;
    $('#ratio').disabled=count>0;updateSize();
  }
  async function acceptFiles(files,start) {
    if(reading||busy)return;reading=true;updateButton();let next=start;
    try {
      for(const file of Array.from(files)) {
        if(!/\.(png|jpe?g|webp)$/i.test(file.name)||!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>30*1024*1024)throw new Error('ใช้ JPG / PNG / WEBP ไม่เกิน 30 MB ต่อภาพ');
        if(files.length>1){next=slots.findIndex((item,i)=>!item&&i>=next);if(next<0)next=slots.findIndex(item=>!item);}
        if(next<0||next>=10)throw new Error('แนบภาพได้สูงสุด 10 ภาพ');
        const bitmap=await createImageBitmap(file),dimensions={width:bitmap.width,height:bitmap.height};bitmap.close();
        if(slots[next])URL.revokeObjectURL(slots[next].url);
        slots[next]={file,url:URL.createObjectURL(file),...dimensions};visible=Math.max(visible,next+1);next++;
      }
      notice('เพิ่มภาพอ้างอิงแล้ว');
    }catch(error){notice(error.message);}finally{reading=false;renderReferences();updateButton();}
  }
  $('#add-reference').onclick=()=>{if(visible<10){visible++;renderReferences();}};
  function updateSize() {
    const resolution=Number($('#resolution').value),first=slots.find(Boolean);
    if(first){const r=first.width/first.height,w=Math.round(Math.sqrt(resolution*resolution*r)/32)*32,h=Math.round(Math.sqrt(resolution*resolution/r)/32)*32;$('#size-note').textContent=`แก้ไขตามสัดส่วนภาพแรก · ประมาณ ${w} × ${h} px`;}
    else {const [w,h]=native.dimensions($('#ratio').value,resolution);$('#size-note').textContent=`${w} × ${h} px · ขนาดรวมประมาณ ${resolution===2048?'4':'1'} MP`;}
  }
  $('#ratio').onchange=updateSize;$('#resolution').onchange=updateSize;
  function setTheme(dark){document.documentElement.classList.toggle('dark',dark);$('#theme').textContent=dark?'โหมดสว่าง':'โหมดมืด';$('#theme').setAttribute('aria-pressed',String(dark));try{localStorage.setItem('kendo-theme',dark?'dark':'light');}catch{}}
  try{setTheme(localStorage.getItem('kendo-theme')==='dark');}catch{setTheme(false);}
  $('#theme').onclick=()=>setTheme(!document.documentElement.classList.contains('dark'));
  async function checkReadiness() {
    try {
      const [info,response]=await Promise.all([api('/object_info'),fetch('/api/kendo/image-status',{cache:'no-store',signal:AbortSignal.timeout(10000)})]);
      if(!response.ok)throw new Error('ยังอ่านสถานะโมเดลไม่ได้');
      const state=await response.json(),wasReady=ready?.ready;ready=native.readiness(info,'qwen21');ready.ready=ready.ready&&state.files_ready;
      $('#status').textContent=ready.ready?'READY':'PREPARING';
      if(!busy){
        if(state.download_error)notice('ดาวน์โหลด Qwen ไม่สำเร็จ: '+state.download_error);
        else if(!state.files_ready)notice(`กำลังเตรียมโมเดล Qwen · ${state.progress??0}%`);
        else if(ready.missingNodes.length)notice('ComfyUI ขาด node: '+ready.missingNodes.join(', ')+' · ใช้ volume ใหม่ของ V4 หรืออัปเดต core ให้รองรับ Qwen 2.1');
        else if(ready.missingFileNames.length)notice('ยังไม่พบไฟล์: '+ready.missingFileNames.join(', '));
        else if(ready.ready&&!wasReady)notice('พร้อมสร้างภาพด้วย Qwen Image 2.1');
      }
    }catch{ready=null;$('#status').textContent='CONNECTING';if(!busy)notice('กำลังรอ ComfyUI…');}finally{updateButton();}
  }
  async function connection() {
    try{const response=await fetch('/api/kendo/status',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)return;const state=await response.json();$('#mcp-url').value=state.mcp_url||'';$('#mcp-copy').disabled=!state.mcp_url;$('#connection-state').textContent=state.mcp_ready?'Comfy MCP พร้อมใช้งาน':'กำลังเริ่ม Comfy MCP';document.querySelectorAll('.comfy-link').forEach(a=>a.href=state.comfy_url||'#');}catch{}
  }
  $('#mcp-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#mcp-url').value);$('#connection-state').textContent='คัดลอกลิงก์ MCP แล้ว';}catch{$('#mcp-url').select();}};
  function resultUrl(file){return '/api/comfy/view?'+new URLSearchParams({filename:file.filename,subfolder:file.subfolder||'',type:file.type||'output'});}
  function sendToVideo(file){sessionStorage.setItem('kendo-v4-image-reference',JSON.stringify({filename:file.filename,subfolder:file.subfolder||''}));location.href='/v4-image.html';}
  function showResult(file){selectedResult=file;const img=document.createElement('img');img.src=resultUrl(file);img.alt='ภาพที่สร้างด้วย Qwen Image 2.1';$('#preview').replaceChildren(img);$('#download').href=img.src;$('#result-actions').hidden=false;}
  $('#use-video').onclick=()=>{if(selectedResult)sendToVideo(selectedResult);};
  function imageFiles(entry){return Object.values(entry.outputs||{}).flatMap(node=>node.images||[]).filter(file=>/^Kendo_Qwen_V4_[\w.-]+\.png$/.test(file.filename));}
  async function refreshHistory() {
    try {
      const history=await api('/history?max_items=100'),cards=[];
      for(const [id,entry] of Object.entries(history).reverse())for(const file of imageFiles(entry)){
        const article=document.createElement('article'),img=document.createElement('img'),view=document.createElement('button'),use=document.createElement('button');
        img.src=resultUrl(file);img.alt='ภาพ Qwen';img.loading='lazy';view.textContent='เปิดภาพ';view.onclick=()=>showResult(file);use.textContent='ใช้ในวิดีโอ';use.onclick=()=>sendToVideo(file);article.append(img,view,use);cards.push(article);
        if(tracked.has(id)){tracked.delete(id);showResult(file);notice('สร้างภาพสำเร็จแล้ว');}
      }
      for(const id of tracked){const entry=history[id];if(entry?.status?.status_str==='error'){tracked.delete(id);notice('สร้างภาพไม่สำเร็จ กรุณาตรวจ ComfyUI Console');}}
      $('#history').replaceChildren(...cards);$('#activity').textContent=tracked.size?`กำลังติดตาม ${tracked.size} งาน`:cards.length?`${cards.length} ภาพ`:'';
    }catch{}
    try{const queue=await api('/queue');$('#queue-state').textContent=`กำลังรัน ${queue.queue_running?.length||0} · รอคิว ${queue.queue_pending?.length||0}`;}catch{}
  }
  $('#generate').onclick=async()=>{
    if(busy||reading||!ready?.ready)return;
    const prompt=$('#prompt').value.trim();if(!prompt)return notice('กรุณาอธิบายภาพที่ต้องการ');
    const seed=$('#seed-lock').checked?Number($('#seed').value):crypto.getRandomValues(new Uint32Array(1))[0];
    const options={model:'qwen21',prompt,ratio:$('#ratio').value,resolution:Number($('#resolution').value),steps:Number($('#steps').value),seed,transparent:$('#transparent').checked};
    try{native.buildWorkflow({...options,...ready.files});}catch(error){return notice(error.message);}
    busy=true;updateButton();notice('กำลังอัปโหลดภาพอ้างอิง…');
    let attempted=false;
    try {
      const info=await api('/object_info'),current=native.readiness(info,'qwen21');if(!current.ready)throw new Error('โมเดลหรือ node ยังไม่พร้อม กรุณารอแล้วลองใหม่');
      const references=[];
      for(const item of slots.filter(Boolean)){const form=new FormData();form.append('image',item.file,'qwen-ref-'+crypto.randomUUID()+'.'+item.file.name.split('.').pop().toLowerCase());form.append('type','input');form.append('overwrite','false');const upload=await api('/upload/image',{method:'POST',body:form});if(!upload.name)throw new Error('อัปโหลดภาพไม่สำเร็จ');references.push(upload.subfolder?upload.subfolder+'/'+upload.name:upload.name);}
      const graph=native.buildWorkflow({...options,...current.files,references});attempted=true;
      const result=await api('/prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:graph,client_id:crypto.randomUUID()})});
      if(!result.prompt_id)throw new Error('ComfyUI ไม่ส่งหมายเลขงานกลับมา');
      tracked.add(result.prompt_id);$('#seed').value=String(seed);notice('ส่งเข้าคิวแล้ว · Seed '+seed);void refreshHistory();
    }catch(error){notice(error.message+(attempted?' · ตรวจคิวก่อนส่งใหม่':''));}finally{busy=false;updateButton();}
  };
  window.addEventListener('beforeunload',()=>slots.filter(Boolean).forEach(item=>URL.revokeObjectURL(item.url)));
  renderReferences();void checkReadiness();void connection();void refreshHistory();
  setInterval(checkReadiness,5000);setInterval(connection,15000);setInterval(refreshHistory,4000);
})();
