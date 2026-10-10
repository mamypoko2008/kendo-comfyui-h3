(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const maximum=()=>10;
  const INITIAL_SLOTS = 3;
  const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
  const slots = Array(10).fill(null);
  let visibleSlots = INITIAL_SLOTS;

  function error(message = '') {
    $('#upload-error').textContent = message;
    $('#upload-error').hidden = !message;
  }
  function fileAccepted(file) {
    return /\.(jpe?g|png|webp)$/i.test(file.name) && /^image\/(jpeg|png|webp)$/.test(file.type) && file.size <= MAX_IMAGE_BYTES;
  }
  function setImage(index, file) {
    if (slots[index]) URL.revokeObjectURL(slots[index].url);
    slots[index] = { file, url: URL.createObjectURL(file) };
  }
  async function readableImage(file) {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      bitmap.close();
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
  }
  let readingFiles = false;
  async function acceptFiles(files, startIndex) {
    if (current().textOnly) { error('Workflow Qwen + Flux Klein นี้ใช้ข้อความเท่านั้น เลือก Qwen รุ่นปกติหรือ Turbo เพื่อแนบภาพ'); return; }
    if (readingFiles) return;
    readingFiles = true;
    error();
    const messages = [];
    let nextIndex = startIndex;
    try {
      for (const [position, file] of Array.from(files).entries()) {
        if (!fileAccepted(file)) {
          messages.push(`${file.name}: ใช้ JPG, PNG หรือ WEBP ขนาดไม่เกิน 30 MB`);
          continue;
        }
        try { await readableImage(file); }
        catch { messages.push(`${file.name}: เปิดภาพไม่ได้ กรุณาเลือกไฟล์ภาพที่สมบูรณ์`); continue; }
        if (position > 0 || slots[nextIndex]) {
          // A single file replaces the selected slot; additional files fill empty slots.
          if (!(files.length === 1 && position === 0)) {
            nextIndex = slots.findIndex((item, index) => !item && index >= nextIndex);
            if (nextIndex < 0) nextIndex = slots.findIndex(item => !item);
          }
        }
        if (nextIndex < 0 || nextIndex >= maximum()) {
          messages.push(`โมเดลนี้แนบได้สูงสุด ${maximum()} ภาพ`);
          break;
        }
        setImage(nextIndex, file);
        visibleSlots = Math.max(visibleSlots, Math.min(maximum(), nextIndex + 1));
        nextIndex += 1;
      }
      renderReferences(); updateSettings();
      error(messages.join(' · '));
    } finally { readingFiles = false; }
  }
  function renderReferences() {
    const grid = $('#reference-grid');
    const nodes = [];
    for (let index = 0; index < visibleSlots; index++) {
      const item = slots[index];
      const card = document.createElement('div');
      card.className = `reference-slot${item ? ' has-image' : ''}`;
      card.dataset.slot = String(index);
      if (item) {
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = `ภาพอ้างอิง ${index + 1}: ${item.file.name}`;
        card.append(img);
      }
      const label = document.createElement('label');
      label.className = 'upload-input';
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';
      input.multiple = true;
      input.setAttribute('aria-label', `${item ? 'เปลี่ยน' : 'แนบ'}ภาพอ้างอิง ${index + 1}`);
      input.addEventListener('change', event => { void acceptFiles(event.target.files, index); });
      if (!item) {
        const plus = document.createElement('span'); plus.className = 'upload-plus'; plus.textContent = '＋';
        const text = document.createElement('span'); text.textContent = 'แนบภาพ';
        label.append(plus, text);
      }
      label.append(input);
      const number = document.createElement('span');
      number.className = 'slot-number'; number.textContent = String(index + 1).padStart(2, '0');
      card.append(label, number);
      if (item) {
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'remove-image'; remove.textContent = '×';
        remove.setAttribute('aria-label', `ลบภาพอ้างอิง ${index + 1}`);
        remove.addEventListener('click', () => {
          URL.revokeObjectURL(slots[index].url);
          slots[index] = null;
          error(); renderReferences(); updateSettings();
          grid.children[index].querySelector('input').focus();
        });
        const name = document.createElement('span');
        name.className = 'file-name'; name.textContent = item.file.name; name.title = item.file.name;
        card.append(remove, name);
      }
      card.addEventListener('dragover', event => { event.preventDefault(); card.classList.add('drag-over'); });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', event => {
        event.preventDefault(); card.classList.remove('drag-over');
        void acceptFiles(event.dataTransfer.files, index);
      });
      nodes.push(card);
    }
    grid.replaceChildren(...nodes);
    const count = slots.filter(Boolean).length;
    $('#image-count').textContent = `${count} / ${maximum()}`;
    $('#summary-images').textContent = `${count} ภาพ`;
    $('#slot-count').textContent = `${visibleSlots} / ${maximum()} ช่อง`;
    $('#add-references').disabled = visibleSlots >= maximum();
    $('#add-references').firstChild.textContent = visibleSlots >= maximum() ? `ครบ ${maximum()} ช่องแล้ว ` : '＋ เพิ่มช่องแนบภาพ ';
  }
  $('#add-references').addEventListener('click', () => {
    if (visibleSlots >= maximum()) return;
    const firstNewIndex = visibleSlots;
    visibleSlots = Math.min(maximum(), visibleSlots + 1);
    renderReferences();
    $('#reference-grid').children[firstNewIndex].querySelector('input').focus({ preventScroll: true });
  });

  let nodeInfo=null, review=null, busy=false, pollTimer;
  let jobs=[];
  try { jobs=JSON.parse(localStorage.getItem('kendo-qwen-jobs')||'[]').filter(j=>typeof j.id==='string' && /^[\w-]+$/.test(j.id)).slice(0,30); } catch {}
  function remember() { try { localStorage.setItem('kendo-qwen-jobs',JSON.stringify(jobs.slice(0,30))); } catch {} }
  function current() { return KendoImages.MODELS[$('#image-model').value]; }
  function updateSettings() {
    const refs=slots.filter(Boolean).length, resolution=Number($('#resolution').value), ratio=$('#ratio').value;
    const klein=Boolean(current().textOnly);
    const [w,h]=KendoImages.dimensions(ratio,resolution);
    $('#ratio').disabled=refs>0&&!klein;
    $('#klein-settings').hidden=!klein;
    $('#transparent').disabled=klein;
    if(klein) $('#transparent').checked=false;
    $('#model-note').textContent=klein?'Workflow ที่แนบ · Qwen BF16 + Detail Daemon + Flux Klein 9B · สร้างจากข้อความ':'สร้างและแก้ไขภาพบน GPU ของ Pod · ภาพอ้างอิงสูงสุด 10 ภาพ';
    $('#reference-note').textContent=klein?'ชุดนี้สร้างจากข้อความ · เลือก Qwen รุ่นปกติหรือ Turbo เมื่อต้องการใช้ภาพอ้างอิง':'แนบภาพเมื่อต้องการแก้ไขภาพ หรือสร้างโดยคงตัวละครและสินค้า';
    $('#prompt-input-note').textContent=klein?'Qwen สร้างภาพ แล้ว Flux Klein ปรับรายละเอียด':'ภาพทั้งหมดจะใช้เป็นภาพอ้างอิง';
    $('#add-references').disabled=klein||visibleSlots>=maximum();
    document.querySelectorAll('.upload-input input').forEach(input=>input.disabled=klein);
    $('#image-size-note').textContent=klein?'ขนาดนี้เป็นภาพต้นฉบับ Qwen · Flux Klein ปรับผลลัพธ์เป็นประมาณ 4 MP':refs ? 'งานแก้ไขใช้สัดส่วนภาพแรก เพื่อรักษาตำแหน่งองค์ประกอบเดิม' : 'ไม่มีภาพอ้างอิง: เลือกสัดส่วนและขนาดได้';
    $('#preview-format').textContent=refs&&!klein ? `ตามภาพแรก · ${resolution===2048?'4':'1'} MP` : `${ratio} · ${w} × ${h}`;
    $('#summary-duration').textContent=klein?`4 MP · ${$('#image-steps').value} + 2 steps`:`${resolution===2048?'4':'1'} MP · ${$('#image-steps').value} steps`;
    $('#summary-ratio').textContent=refs&&!klein ? 'ตามภาพแรก' : ratio;
    $('#summary-audio').textContent=$('#transparent').checked?'PNG · โปร่งใส':'PNG';
  }
  function promptCount() { $('#prompt-count').textContent=`${$('#prompt').value.length.toLocaleString('en-US')} / 5,000`; $('#prompt').setCustomValidity(''); }
  $('#prompt').addEventListener('input',promptCount);
  ['ratio','resolution','image-steps','image-seed','transparent'].forEach(id=>$('#'+id).addEventListener('input',updateSettings));
  $('#image-model').addEventListener('change',()=>{
    $('#image-steps').value=current().steps; $('#model-card b').textContent=current().name;
    if(current().textOnly) $('#resolution').value='2048';
    $('#product-name').textContent=current().name;
    updateSettings(); showReadiness();
  });
  $('#attached-lora').addEventListener('change',showReadiness);
  $('#example').addEventListener('click',()=>{
    $('#prompt').value='A cinematic product photograph of a ceramic coffee cup on a wooden table, warm morning sunlight from the left, soft shadows, natural texture, a quiet cafe in the background, realistic editorial photography.';
    promptCount(); $('#prompt').focus();
  });
  function theme(dark) {
    document.documentElement.classList.toggle('dark',dark);
    $('#theme span').textContent=dark?'โหมดสว่าง':'โหมดมืด';
    $('#theme').setAttribute('aria-pressed',String(dark));
    try {localStorage.setItem('kendo-theme',dark?'dark':'light');} catch {}
  }
  let dark=false; try {dark=localStorage.getItem('kendo-theme')==='dark';} catch {}
  theme(dark); $('#theme').onclick=()=>theme(!document.documentElement.classList.contains('dark'));
  async function comfy(route,init={}) {
    const response=await fetch('/api/comfy/'+route,{...init,signal:AbortSignal.timeout(90000)});
    let data; try {data=await response.json();} catch {throw new Error('ยังไม่มีบริการ ComfyUI ที่หน้านี้');}
    if(!response.ok) throw new Error(typeof data.error==='string'?data.error:data.error?.message || 'ComfyUI ปฏิเสธคำขอ กรุณาตรวจ Console');
    return data;
  }
  function showReadiness() {
    const ready=nodeInfo&&KendoImages.readiness(nodeInfo,$('#image-model').value,{use_attached_lora:$('#attached-lora').checked});
    $('#connection-state').textContent=!ready?'ยังเชื่อมต่อ ComfyUI ไม่ได้':ready.ready?'พร้อมสร้าง · GPU ของ Pod':`ยังขาด ${[ready.missingNodes.length?'โหนด: '+ready.missingNodes.join(', '):'',ready.missingFileNames.length?'ไฟล์: '+ready.missingFileNames.join(', '):''].filter(Boolean).join(' · ')}`;
    $('#connection-note').textContent=ready?.ready?'สร้างบน GPU · ไม่มีการหักเครดิต KIE':'ดูสรุปได้ · รอ ComfyUI และไฟล์โมเดลพร้อม';
    $('.draft-badge').textContent=ready?.ready?'COMFYUI READY':'DESIGN PREVIEW';
    return ready;
  }
  async function connect() {
    $('#connection-refresh').disabled=true;
    try {nodeInfo=await comfy('object_info');} catch {nodeInfo=null;}
    showReadiness(); $('#connection-refresh').disabled=false;
    if(nodeInfo) {await refreshJobs(); schedulePoll();}
  }
  $('#connection-refresh').onclick=()=>void connect();
  $('#generate').onclick=()=>{
    if(busy) return;
    const prompt=$('#prompt').value.trim();
    if(!prompt) {$('#prompt').setCustomValidity('กรุณาอธิบายภาพที่ต้องการ');$('#prompt').reportValidity();return;}
    if(!$('#image-steps').reportValidity()||!$('#image-seed').reportValidity()) return;
    if(current().textOnly&&slots.some(Boolean)) {$('#job-notice').textContent='Workflow ที่แนบใช้ข้อความเท่านั้น กรุณาลบภาพอ้างอิง หรือเลือก Qwen รุ่นปกติ / Turbo';return;}
    const ready=showReadiness();
    review={model:$('#image-model').value,prompt,ratio:$('#ratio').value,resolution:Number($('#resolution').value),seed:Number($('#image-seed').value),steps:Number($('#image-steps').value),transparent:$('#transparent').checked,use_attached_lora:current().textOnly&&$('#attached-lora').checked,files:slots.filter(Boolean).map(s=>s.file),...ready?.files};
    $('#review-prompt').textContent=prompt;
    $('#review-images').replaceChildren(...slots.filter(Boolean).map(item=>{const img=document.createElement('img');img.src=item.url;img.alt=item.file.name;return img;}));
    const entries=[['โมเดล',current().name],['ภาพอ้างอิง',`${review.files.length} ภาพ`],['ขนาด',$('#preview-format').textContent],['Steps / Seed',`${review.steps} / ${review.seed}`],['ไฟล์',review.transparent?'PNG · โปร่งใส':'PNG'],['ค่าใช้จ่าย','ค่าเช่า GPU ตามเวลา · ไม่ใช้ KIE']];
    if(current().textOnly) entries.push(['ผลลัพธ์','PNG ก่อนและหลัง Flux Klein · หลังประมาณ 4 MP / 2 steps'],['LoRA',review.use_attached_lora?'LoRA จาก workflow · strength 1':'ไม่ใช้ LoRA']);
    $('#review-details').replaceChildren(...entries.flatMap(([key,value])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;return [dt,dd];}));
    $('#review-dialog .review-note').textContent=ready?.ready?'ยืนยันเพื่อส่งเข้าคิว ComfyUI และใช้ GPU ของ Pod':$('#connection-state').textContent;
    $('#confirm-image').hidden=!ready?.ready;
    $('#review-dialog').showModal();
  };
  $('#confirm-image').onclick=async()=>{
    if(busy||!review) return;
    busy=true; $('#generate').disabled=true; $('#confirm-image').disabled=true; $('#review-dialog').close();
    try {
      const refs=[];
      for(const file of review.files) {
        $('#job-notice').textContent=`กำลังอัปโหลดภาพ ${refs.length+1} / ${review.files.length}`;
        const form=new FormData();form.append('image',file,`kendo-qwen-${crypto.randomUUID()}.${file.name.split('.').at(-1)}`);form.append('type','input');
        const data=await comfy('upload/image',{method:'POST',body:form});refs.push(data.subfolder?`${data.subfolder}/${data.name}`:data.name);
      }
      const graph=KendoImages.buildWorkflow({...review,references:refs});
      $('#job-notice').textContent='กำลังส่งเข้าคิว ComfyUI…';
      const result=await comfy('prompt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:graph,client_id:crypto.randomUUID()})});
      if(!result.prompt_id) throw new Error('ComfyUI ไม่ได้ส่งรหัสงานกลับมา');
      jobs.unshift({id:result.prompt_id,model:review.model,state:'waiting',created_at:Date.now(),images:[]});remember();renderJobs();schedulePoll();
      $('#job-notice').textContent=`ส่งงานแล้ว ${result.prompt_id}`;
    } catch(e) {$('#job-notice').textContent=e.message+' · ตรวจคิวก่อนส่งซ้ำหากคำขอขาดการเชื่อมต่อ';}
    finally {review=null;busy=false;$('#generate').disabled=false;$('#confirm-image').disabled=false;}
  };
  function resultUrl(image) {const p=new URLSearchParams({filename:image.filename,subfolder:image.subfolder||'',type:image.type||'output'});return '/api/comfy/view?'+p;}
  function displayImage(image) {const img=document.createElement('img');img.src=resultUrl(image);img.alt='ภาพที่สร้างด้วย Qwen Image 2.1';$('#preview-canvas').replaceChildren(img);}
  function renderJobs() {
    $('#history-count').textContent=`${jobs.length} งาน`;$('.library-empty').hidden=jobs.length>0;
    $('#history-results').replaceChildren(...jobs.map(job=>{
      const card=document.createElement('article');card.className='job-card';
      const title=document.createElement('b');title.textContent=`${KendoImages.MODELS[job.model]?.name||'Qwen Image 2.1'} · ${{waiting:'รอคิว / กำลังสร้าง',success:'สำเร็จ',fail:'ไม่สำเร็จ'}[job.state]||job.state}`;
      const detail=document.createElement('small');detail.textContent=job.id;card.append(title,detail);
      for(const image of job.images||[]) {
        const button=document.createElement('button');button.type='button';button.textContent=image.filename?.includes('Klein_before')?'ก่อน Flux Klein':image.filename?.includes('Klein_after')?'หลัง Flux Klein':'ดูภาพ';button.onclick=()=>displayImage(image);
        const link=document.createElement('a');link.textContent='ดาวน์โหลด PNG ↗';link.href=resultUrl(image);link.download=image.filename;card.append(button,link);
      }
      if(job.error) {const note=document.createElement('p');note.textContent=job.error;card.append(note);}
      return card;
    }));
  }
  async function refreshJobs() {
    // Include images made through the shared ComfyUI MCP, as well as this browser.
    try {
      const history=await comfy('history?max_items=50');
      for(const [id,result] of Object.entries(history)) {
        if(jobs.some(j=>j.id===id)) continue;
        const images=Object.values(result.outputs||{}).flatMap(o=>o.images||[]).filter(i=>i.filename?.startsWith('Kendo_Qwen21'));
        if(images.length) {
          const graph=result.prompt?.[2]||{}, diffusion=graph['1']?.inputs?.unet_name||'';
          const klein=Object.values(graph).some(n=>n.inputs?.unet_name?.includes('flux-2-klein'));
          jobs.unshift({id,model:klein?'qwen21-klein':diffusion.includes('turbo')?'qwen21-turbo':'qwen21',state:'success',created_at:Date.now(),images});
        }
      }
      jobs=jobs.slice(0,30);
    } catch {}

    for(const job of jobs.filter(j=>j.state==='waiting')) {
      try {
        const history=await comfy('history/'+encodeURIComponent(job.id)),result=history[job.id];
        if(!result) continue;
        if(result.status?.status_str==='error') {job.state='fail';job.error='ComfyUI สร้างไม่สำเร็จ กรุณาตรวจ Console';}
        else if(result.status?.completed) {job.images=Object.values(result.outputs||{}).flatMap(o=>o.images||[]);job.state=job.images.length?'success':'fail';if(job.images.length) displayImage(job.images.find(i=>i.filename?.includes('Klein_after'))||job.images[0]);}
      } catch(e) {$('#job-notice').textContent=e.message;}
    }
    remember();renderJobs();
  }
  function schedulePoll() {
    clearTimeout(pollTimer);
    if(jobs.some(j=>j.state==='waiting'&&Date.now()-j.created_at<15*60*1000)) pollTimer=setTimeout(async()=>{await refreshJobs();schedulePoll();},3000);
  }
  let mcpConnection=null;
  async function kie(route,init={}) {
    const response=await fetch('/api/kie/'+route,{...init,signal:AbortSignal.timeout(10000)});
    const data=await response.json();if(!response.ok) throw new Error(data.error||'เชื่อมต่อ MCP ไม่สำเร็จ');return data;
  }
  async function mcpStatus() {
    try {mcpConnection=await kie('status');} catch {mcpConnection=null;}
    $('#connection-help').textContent='ใช้รหัส Studio / MCP ของ Pod ลิงก์เดียวควบคุมได้ทั้ง Seedance ผ่าน KIE และภาพ Qwen บน GPU';
    $('#connection-form button[type=submit]').disabled=!mcpConnection?.access_configured;
    $('#mcp-details').hidden=!mcpConnection?.mcp_url;$('#mcp-url').value=mcpConnection?.mcp_url||'';
    $('#connection-message').textContent=!mcpConnection?.access_configured?'ยังไม่ได้ตั้งรหัส MCP บนเซิร์ฟเวอร์':mcpConnection?.authenticated?'เชื่อมต่อแล้ว คัดลอก URL ได้เลย':'';
  }
  $('#mcp-open').onclick=()=>{void mcpStatus();$('#connection-dialog').showModal();};
  $('#connection-close').onclick=()=>$('#connection-dialog').close();
  $('#connection-form').onsubmit=async event=>{
    event.preventDefault();const button=$('#connection-form button[type=submit]');button.disabled=true;
    try {await kie('connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:$('#access-code').value})});$('#access-code').value='';await mcpStatus();}
    catch(e) {$('#connection-message').textContent=e.message;}
    finally {button.disabled=!mcpConnection?.access_configured;}
  };
  $('#mcp-copy').onclick=async()=>{
    try {await navigator.clipboard.writeText($('#mcp-url').value);$('#connection-message').textContent='คัดลอก URL แล้ว';}
    catch {$('#mcp-url').select();$('#connection-message').textContent='เลือก URL แล้ว กรุณาคัดลอก';}
  };
  window.addEventListener('beforeunload' ,()=>slots.filter(Boolean).forEach(i=>URL.revokeObjectURL(i.url)));
  $('#ratio').replaceChildren(...['1:1','16:9','9:16','4:3','3:4','3:2','2:3'].map(r=>new Option(r,r)));
  const linkedModel=new URLSearchParams(location.search).get('model');
  if(KendoImages.MODELS[linkedModel]) {$('#image-model').value=linkedModel;$('#image-model').dispatchEvent(new Event('change'));}
  renderReferences();updateSettings();promptCount();renderJobs();void connect();
})();
