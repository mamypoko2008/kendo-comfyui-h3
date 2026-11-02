'use strict';
(function () {
  const query = selector => document.querySelector(selector);
  const originalBuild = globalThis.KendoWorkflow.buildWorkflow;
  const sizes = globalThis.KendoWorkflow.SIZES;
  const selectedMode = () => document.querySelector('input[name="render-mode"]:checked')?.value || 'fast';
  globalThis.KendoWorkflow.buildWorkflow = options => originalBuild({
    ...options,
    renderMode: selectedMode(),
    upscaleFactor: Number(query('#upscale-factor').value),
    realismEnabled: query('#realism-enabled').checked,
    realismStrength: Number(query('#realism-strength').value),
    facialEnabled: query('#facial-enabled').checked,
    facialStrength: Number(query('#facial-strength').value)
  });
  globalThis.KendoWorkflow.SIZES = sizes;

  function dimensions() {
    const quality = query('#quality').value;
    let [width, height] = sizes[quality] || sizes['0.4'];
    const ratio = query('#ratio').value;
    if (ratio === '9:16') [width, height] = [height, width];
    if (ratio === '1:1') width = height = Math.round(Math.sqrt(Number(quality) * 1e6) / 32) * 32;
    if (selectedMode() === 'highres') {
      const scale = Number(query('#upscale-factor').value);
      width = Math.round(width * scale / 32) * 32;
      height = Math.round(height * scale / 32) * 32;
    }
    return [width, height];
  }

  function updateMode() {
    const highres = selectedMode() === 'highres';
    document.querySelectorAll('.mode-option').forEach(label => label.classList.toggle('active', label.querySelector('input').checked));
    query('#hires-options').hidden = !highres;
    query('#render-plan').classList.toggle('highres', highres);
    query('#generate').classList.toggle('highres', highres);
    query('#render-plan-title').textContent = highres ? 'High Resolution · Dual Pass' : 'Fast · Single Pass';
    query('#generate-mode-label').textContent = highres ? 'DUAL PASS' : 'FAST MODE';
    query('#quality-label').textContent = highres ? 'ความละเอียดฐาน' : 'ความละเอียด';
    query('#steps-help').textContent = highres ? 'แนะนำ 8 steps · แบ่งรอบที่ step 4' : 'Turbo Ref2VA ค่าเริ่มต้น 10';
    for (const option of query('#quality').options) option.disabled = highres && Number(option.value) > 0.7;
    if (highres && Number(query('#quality').value) > 0.7) query('#quality').value = '0.5';
    if (highres && Number(query('#steps').value) === 10) query('#steps').value = '8';
    const [width, height] = dimensions();
    const scale = Number(query('#upscale-factor').value);
    query('#output-estimate').textContent = highres
      ? `ฐาน ${query('#quality').value} MP → Latent ${scale}× → ประมาณ ${width}×${height}`
      : `ผลลัพธ์ประมาณ ${width}×${height} · เจนรอบเดียว`;
    const flow = query('#render-plan .flow');
    flow.replaceChildren(...(highres ? ['H3 Base','→','Latent '+scale+'×','→','Refine'] : ['Prompt','→','H3','→','Video']).map((text, index) => {
      const element = document.createElement(index % 2 ? 'i' : 'span'); element.textContent = text; return element;
    }));
  }

  document.querySelectorAll('input[name="render-mode"]').forEach(input => input.addEventListener('change', updateMode));
  for (const id of ['#upscale-factor', '#quality', '#ratio']) query(id).addEventListener('change', updateMode);
  updateMode();
})();
