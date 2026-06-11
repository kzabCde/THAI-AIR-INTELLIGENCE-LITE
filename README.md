# Isan Air Intelligence — คุณภาพอากาศภาคอีสาน

แพลตฟอร์มติดตามคุณภาพอากาศ **PM2.5 / AQI** แบบเรียลไทม์ ครอบคลุม **20 จังหวัดภาคตะวันออกเฉียงเหนือ (อีสาน)** เท่านั้น — ออกแบบให้คล้ายระบบเฝ้าระวังคุณภาพอากาศระดับหน่วยงานราชการ พร้อมพยากรณ์ 168 ชั่วโมงและการวิเคราะห์ย้อนหลัง

ข้อมูลทั้งหมดเชื่อมต่อกับฐานข้อมูล **Supabase (PostgreSQL)** ระดับจังหวัด ไม่มีข้อมูลจำลอง (mock) อีกต่อไป

---

## ขอบเขต (Isan-only)

- เก็บและแสดงผลข้อมูล **ระดับจังหวัดเท่านั้น** (20 จังหวัด `TH-30` … `TH-49`)
- ตัดฟังก์ชันระดับอำเภอ / ตำบล / ทั้งประเทศ ออกทั้งหมด
- ตัดระบบ interpolation grid และ province-grid mapping ออก

## เทคโนโลยี

- Next.js 15 (App Router, Server Components) · React 19 · TypeScript (strict)
- Supabase JS v2 (typed queries) — ดึงข้อมูลฝั่งเซิร์ฟเวอร์ + Next Data Cache
- Tailwind CSS (ดีไซน์ระบบสี AQI + dark mode) · Recharts · Leaflet
- Deploy บน Vercel พร้อม Cron Jobs

## โครงสร้างโปรเจกต์

```txt
app/
  page.tsx                ภาพรวมภูมิภาค (Overview)
  province/[id]/page.tsx   รายละเอียดจังหวัด
  forecast/page.tsx        พยากรณ์ 168 ชม.
  trends/page.tsx          แนวโน้มย้อนหลัง (7/30/90 วัน, รายเดือน, ฤดูกาล)
  analytics/page.tsx       วิเคราะห์ + ตัวกรองจังหวัด/ช่วงเวลา
  system/page.tsx          สถานะระบบ (sync_state, cleanup_logs, ความสดข้อมูล)
  map/page.tsx             แผนที่ภาคอีสาน
  api/                     provinces, air-quality, weather, forecast, history,
                           analytics, system-status, cron/[job]
lib/
  isan.ts                  ข้อมูล 20 จังหวัด (single source of truth)
  aqi.ts                   ระบบสี/หมวด AQI + การแปลง PM2.5 → AQI
  supabase/                client + generated database types
services/                  PM2.5 / Weather / Hotspot / Forecast / Daily-summary /
                           Overview / Analytics / System / Sync (server-only)
components/                ui, charts, map, layout, controls, province, overview
supabase/migrations/       SQL migrations
```

## การติดตั้ง

```bash
npm install
cp .env.example .env.local   # แล้วกรอกค่า Supabase
npm run dev
```

### Environment Variables

| ตัวแปร | จำเป็น | คำอธิบาย |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL ของโปรเจกต์ Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Publishable / anon key (อ่านอย่างเดียว) |
| `SUPABASE_SERVICE_ROLE_KEY` | ⛔️ optional | ใช้โดย cron ที่เขียนข้อมูล (อย่าเปิดเผยฝั่ง browser) |
| `CRON_SECRET` | ⛔️ optional | ความลับสำหรับ `/api/cron/*` (`Authorization: Bearer <secret>`) |

## คำสั่ง

```bash
npm run dev        # โหมดพัฒนา
npm run build      # production build
npm run typecheck  # tsc --noEmit
```

## API

| Endpoint | คำอธิบาย |
| --- | --- |
| `GET /api/provinces` | รายชื่อ 20 จังหวัด |
| `GET /api/air-quality` | snapshot ล่าสุดทุกจังหวัด (`?province=TH-30`, `&hours=72`) |
| `GET /api/weather` | สภาพอากาศล่าสุด (`?province=`, `&hours=`) |
| `GET /api/forecast?province=TH-30` | พยากรณ์ 168 ชม. + รายวัน 7 วัน |
| `GET /api/history?province=TH-40&days=30` | สรุปรายวันย้อนหลัง |
| `GET /api/analytics?province=all&from=&to=` | วิเคราะห์ + สถิติ |
| `GET /api/system-status` | สถานะ pipeline |
| `GET /api/cron/<job>` | งานตามกำหนดเวลา (ต้องมี `CRON_SECRET`) |

## สถาปัตยกรรม Realtime (ไม่พึ่ง Vercel Cron)

แดชบอร์ด **ไม่ผูกกับ Vercel Cron** — เหมาะกับ Vercel Hobby Plan
ข้อมูลถูกอัปเดตจากภายนอก (worker/edge function ใดก็ได้) ลง Supabase ส่วนฟรอนต์เอนด์
จะ **ตอบสนองต่อการเปลี่ยนแปลง** ผ่าน Supabase Realtime + TanStack Query:

- อ่านข้อมูลผ่าน Server Components + ISR (`revalidate = 300`) และ `/api/*`
- React Query: SWR caching, dedupe, retry/backoff (`hooks/`, `lib/query/`)
- Supabase Realtime invalidate cache + `router.refresh()` เมื่อ DB เปลี่ยน
- Error boundary, offline banner, skeleton/empty/error states ครบ

รายละเอียดเชิงสถาปัตยกรรม (diagram, data flow, state, perf checklist, roadmap):
ดู [`docs/FRONTEND-ARCHITECTURE.md`](docs/FRONTEND-ARCHITECTURE.md)

## Data Update Workflow

```
Backfill (one-time) → Incremental sync → Forecast generation → Dashboard refresh
```

Cron jobs ด้านล่างเป็น **ทางเลือก** (สำหรับ scheduler ภายนอกหรือ Vercel Pro)
กำหนดใน `vercel.json`, เวลาเป็น UTC:

| งาน | ความถี่ | เวลา (ICT) | Endpoint |
| --- | --- | --- | --- |
| ซิงค์ PM2.5 | รายชั่วโมง | ทุกชั่วโมง | `/api/cron/pm25-sync` |
| ซิงค์สภาพอากาศ | รายชั่วโมง | ทุกชั่วโมง | `/api/cron/weather-sync` |
| ซิงค์จุดความร้อน | ทุก 6 ชม. | — | `/api/cron/hotspot-sync` |
| ล้างข้อมูลเก่า | รายวัน | 01:00 (18:00 UTC) | `/api/cron/cleanup` |
| เทรนโมเดล + สร้างพยากรณ์ | รายวัน | 02:00 (19:00 UTC) | `/api/cron/retrain` |

## Deploy บน Vercel

1. Push โค้ดขึ้น GitHub แล้ว Import ใน Vercel
2. ตั้งค่า Environment Variables ข้างต้น
3. `vercel.json` จะตั้ง Cron Jobs ให้อัตโนมัติ (ต้องตั้ง `CRON_SECRET`)

## ⚠️ หมายเหตุด้านความปลอดภัย (RLS)

ปัจจุบันตารางทั้งหมดใน Supabase **ปิด Row Level Security (RLS)** — anon key สามารถอ่าน/เขียนได้ทุกแถว
สำหรับแดชบอร์ดสาธารณะแบบอ่านอย่างเดียว แนะนำให้รัน `supabase/migrations/0002_rls_readonly_policies.sql`
เพื่อเปิด RLS + อนุญาตเฉพาะ `SELECT` (การเขียนทำผ่าน service-role ใน cron เท่านั้น) — ตรวจสอบก่อนรันเสมอ

---

© 2026 Isan Air Intelligence — ข้อมูลเชิงสาธิต
