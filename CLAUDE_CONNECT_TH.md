# เชื่อม Claude กับ Kendo Studio (v3 beta)

ให้ Claude คิด prompt, ส่งรูปเข้า Pod, สั่งเจนวิดีโอ และส่งลิงก์ผลงานกลับมาในแชท
โดย **ไม่ต้องติดตั้งอะไรเพิ่ม** นอกจาก Claude Desktop (หรือ Claude Code)

## 1. เอา URL จากหน้า Page

1. เปิด Pod แล้วเข้า **Page** (พอร์ต 3000)
2. ดูกล่อง **"เชื่อมต่อ Claude"** ด้านบนของผลงาน → กด **คัดลอก URL**

URL หน้าตาแบบนี้ (ของแต่ละ Pod ไม่เหมือนกัน และเปลี่ยนเมื่อสร้าง Pod ใหม่):

```
https://POD_ID-3001.proxy.runpod.net/mcp/kendo-xxxxxxxxxxxxxxxx
```

ส่วนท้าย `kendo-…` คือ **รหัสเชื่อมต่อ** ของ Pod นี้ ใครมี URL นี้จะสั่งงาน Pod ได้
จึงส่งให้เฉพาะคนที่ต้องการให้ใช้ ไม่ใช่ token ที่ต้องซื้อ ไม่มีค่าใช้จ่ายเพิ่ม

## 2. วางใน Claude

**Claude Desktop (แนะนำ)**
Settings → Connectors → **Add custom connector** → วาง URL → **Add**
(ไม่ต้องกรอก OAuth Client ID / Secret)

**Claude Code**

```bash
claude mcp add --transport http kendo https://POD_ID-3001.proxy.runpod.net/mcp/kendo-xxxx
```

## 3. ใช้งาน

ลองพิมพ์ในแชท:

- “เช็คสถานะ Kendo”
- “เอารูปจากลิงก์นี้เข้า Kendo แล้วทำคลิป 9:16 5 วิ ตัวละครเดินในตลาดกลางคืน”
- “ดูรูปที่ฉันอัปไว้ในหน้า Page แล้วทำคลิป 16:9 ใช้ <Picture 1>”
- “ดูคลิปล่าสุดที่เจนไว้”

Claude จะใช้เครื่องมือเหล่านี้เอง:

| เครื่องมือ | ทำอะไร |
|---|---|
| `kendo_status` | โมเดลพร้อมหรือยัง คิวมีกี่งาน |
| `kendo_upload_from_url` | ดึงรูป/วิดีโอ/เสียงจากลิงก์สาธารณะเข้า Pod (เช่น รูปที่เจนจาก KIE) |
| `kendo_list_references` | ดูไฟล์ที่อัปไว้ในหน้า Page |
| `kendo_generate` | สั่งเจนวิดีโอ ได้ `job_id` กลับมาทันที |
| `kendo_job_status` | เช็คงาน พอเสร็จจะได้ `video_url` |
| `kendo_history` | คลิปล่าสุดบน Pod (มี seed ไม่มี prompt) |
| `kendo_cancel` | ยกเลิกงาน |

## ข้อควรรู้

- **ไฟล์แนบในแชท Claude Desktop ส่งไปถึง Pod ไม่ได้** ให้ใช้ลิงก์ (`kendo_upload_from_url`) หรืออัปโหลดในหน้า Page แทน
- คลิปที่ Claude สั่งจะโผล่ในประวัติของหน้า Page ด้วย (ภายใน ~20 วินาที)
- เจนหนึ่งคลิปใช้เวลาหลายนาที Claude จะเช็คสถานะให้เป็นระยะ
- Pod ต้องเปิดอยู่ ถ้าปิด Pod แล้วสร้างใหม่ ต้องคัดลอก URL ใหม่ไปใส่ใน Claude อีกครั้ง
- อยากกำหนดรหัสเอง: ตั้ง env `KENDO_MCP_CODE` ใน RunPod Template (ไม่ตั้ง ระบบสุ่มให้ครั้งแรกแล้วเก็บไว้ที่ `/workspace/.kendo-mcp-code`)
