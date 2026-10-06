# Kendo Studio V4 · 4.0.0-beta.1

V4 ต่อจากการสร้างคลิป MiniMax H3 ใน V3 และเพิ่มเมนู **อัพสเกล** โดยใช้ LTX-2.5 Refine Details / Tiled Fusion จาก workflow ที่แนบ

สถานะ: โค้ดและการทดสอบในเครื่องผ่านแล้ว ยังไม่ได้ build/publish Docker image และยังไม่ได้ทดสอบ inference บน GPU จริง จึงยังไม่ถือเป็น release ที่ยืนยันคุณภาพ/เวลา/VRAM แล้ว

## การใช้งาน

1. สร้างคลิปตามเดิม แล้วกด **อัพสเกล** ใต้คลิป หรือเปิด **ไฟล์งาน** แล้วกดอัพสเกลคลิปที่ต้องการ
2. หน้าอัพสเกลรับคลิปที่เลือก หรือเลือกแท็บ **อัปโหลดไฟล์** เพื่อส่ง MP4/MOV/WebM สูงสุด 512 MB
3. ระบบอ่านแนวนอน/แนวตั้ง/สี่เหลี่ยมจากตัวไฟล์ รวม rotation และ sample aspect ratio ไม่ต้องเลือกสัดส่วนใหม่
4. เลือก 1080p หรือ 4K และเริ่มงาน แนะนำเริ่มตรวจคลิปสั้นที่ 1080p ก่อน
5. ผลลัพธ์แสดงวิดีโอหนึ่งรายการพร้อมดาวน์โหลด ไม่มี compare รายการงานบันทึกลง volume และเปิดผลที่เสร็จแล้วได้จากปุ่มดูผลลัพธ์หลังรีเฟรช

1080p/4K กำหนดด้านยาว 1920/3840 และคงสัดส่วนจริง เช่น H3 1920×1088 ได้ 4K 3840×2176 ไม่ยืดเป็น 16:9 คลิปจัตุรัส 4K จะเป็น 3840×3840 จึงใช้ทรัพยากรมากกว่าคลิป 16:9

## Workflow ที่ใช้

ไฟล์ต้นฉบับ: `workflows/LTX-2.5_V2V_TiledFusion_Upscale.json`

SHA256: `773f258bead45dfd8af68f89e63ca659a58688230bce17f2d93df4819a4b53ea`

เส้นทางวิดีโอใน `scripts/upscale_workflow_v4.py`:

```text
วิดีโอต้นฉบับ → อ่านเฟรม/ขนาด/FPS → ปรับขนาดและเติมขอบ/เฟรมให้โมเดล
 → LTX-2.5 BF16 + Refine Details LoRA
 → ICLoRA guide → Tiled Fusion (Euler, 8 steps, CFG 1)
 → tiled VAE decode → ตัดขอบและเฟรมที่เติม → รวมเสียงต้นฉบับ → MP4
```

ตั้งค่า tile 1024×576, overlap 0.5, blend 0.05, temporal window 97 ตามแกน Upscale ในไฟล์อ้างอิง ปรับเป็น API graph เพื่อรับคลิป H3 หรือไฟล์อัปโหลดและส่งงานจากหน้าเว็บ

ส่วนที่ปรับจาก JSON: ใช้ prompt ภาษาอังกฤษที่แก้ได้ผ่าน CLIPTextEncode ใน Pod แทน prompt enhancer/API และนำเสียงต้นฉบับกลับมาโดยตรง แทนการ encode/decode เสียงผ่าน LTX audio VAE หาก codec เสียงใส่ MP4 ไม่ได้จะเข้ารหัสเสียงเดิมเป็น AAC คลิปไม่มีเสียงก็ทำงานได้ ไม่สร้างเสียงใหม่

รักษาจำนวนเฟรมและ FPS ต้นฉบับ ตัดเฟรมที่เติมออกก่อนส่งมอบ สำหรับไฟล์ variable frame rate ผลลัพธ์เป็น constant frame rate ที่ค่าเฉลี่ยของต้นฉบับ จึงไม่ได้รักษา timestamp รายเฟรมแบบ VFR และต้องตรวจเสียงให้ตรงเมื่อใช้ไฟล์ประเภทนี้

## ชุดสำหรับ RunPod

- Dockerfile: `Dockerfile.v4`
- Template configuration: `runpod-v4.json` ชื่อ **Kendo-ComfyUI-H3 V4**
- Image tag ที่เตรียมไว้: `ghcr.io/mamypoko2008/kendo-comfyui-h3:v4.0.0-beta.1` **ยังไม่ publish**
- GitHub Actions: `.github/workflows/build-v4.yml` สั่ง workflow_dispatch หรือ tag `v4.*`
- พอร์ตหน้าเว็บ 3000, MCP 3001, ComfyUI 8188
- Persistent volume แยก V4 200 GB; โมเดล H3 ประมาณ 44 GB และ LTX ประมาณ 71 GB รวมราว 115 GB ก่อนไฟล์งาน
- ต้องมี ffmpeg/ffprobe จาก base image และยอมรับสิทธิ์โมเดลบน Hugging Face หาก repository ขอสิทธิ์ ตั้ง `HF_TOKEN` ใน environment ของ Pod เมื่อจำเป็น

ใช้ volume ใหม่สำหรับ V4 เพราะ ComfyUI core อัปเดตเพื่อรองรับ Gemma4 และ Tiled Fusion ตัว entrypoint จะหยุดเมื่อเจอ core คนละรุ่นใน volume เดิม สามารถคัดลอกโมเดลที่มีอยู่และไฟล์ output จาก V3 เข้า volume V4 เพื่อลดการดาวน์โหลด แล้วเลือกคลิปเหล่านั้นจากไฟล์งานได้

ไม่มีการแก้ไข template หรือ Pod V3 ที่ใช้อยู่ ไฟล์ V4 แยกชื่อจาก V3 ยกเว้นหน้า Upscale ที่เป็นไฟล์ใหม่

ก่อนเปิดใช้จริง:

1. Build image บน Linux หรือ GitHub Actions จากชุด source ที่มีไฟล์ V4 และ dependency ที่ Dockerfile อ้างถึงครบ รวม `mcp/kie-client.mjs` และ `mcp/kie-tools.mjs` ที่มีอยู่ใน workspace
2. เปิด Pod ทดสอบด้วย volume ใหม่ รอ H3/LTX ดาวน์โหลดครบและหน้าอัพสเกลขึ้น LTX READY (ตรวจทุก node ใน graph)
3. ทดสอบคลิป H3 แนวนอน แนวตั้ง และไฟล์อัปโหลดมี/ไม่มีเสียงที่ 1080p จากนั้น 4K ตรวจภาพ เสียง จำนวนเฟรม FPS และระยะเวลาจริง
4. บันทึก peak VRAM/RAM และเวลาจาก GPU ที่เลือก ก่อนกำหนดค่าเครื่องและเปิดให้ใช้งานต่อเนื่อง

โมเดล BF16 มีขนาดใหญ่ ค่า tile ช่วยการประมวลผลแต่ไม่ได้รับประกันว่าจะใช้ได้กับ GPU ทุกขนาด หน้า API ตรวจ RAM สำหรับภาพ guide ก่อนเข้าคิว และจำกัดคลิปไว้ 60 วินาที เริ่มจากช็อต 5 วินาทีเพื่อวัดทรัพยากร

## การทดสอบในเครื่อง

- Python: `python -m unittest discover -s tests -v`
- H3 graph regression และ V4 MCP: `node --test tests/workflow.test.cjs tests/workflow-v3-beta.test.cjs tests/workflow-v4.test.cjs tests/mcp-v4.test.mjs`
- Browser: `node tests/ui-v4.cjs` ต้องมี Playwright และ Edge; ตั้ง `KENDO_BROWSER_CHANNEL` เมื่อใช้ browser channel อื่น
- Shell syntax: `bash -n scripts/entrypoint-v4.sh scripts/download-v4.sh`

HTTP/Comfy/GPU และ ffmpeg ในชุดทดสอบ V4 ใช้ mocks: ยืนยันการเชื่อมหน้าเว็บ การเลือก/อัปโหลด การส่ง graph การคงสัดส่วน/เฟรม การ crop/trim การ fallback เสียง และการบันทึกงาน แต่ยังไม่ยืนยันคุณภาพ inference หรือการ build container จริง

แหล่ง source ที่ pin ใน Dockerfile: [ComfyUI](https://github.com/Comfy-Org/ComfyUI/tree/7a5dad695fe1cae25efcb2550530fb20ef68da3d), [ComfyUI-LTXVideo](https://github.com/Lightricks/ComfyUI-LTXVideo/tree/3bf3ca62595f1764c47d01c35c8e5dfe47e1a88f)
