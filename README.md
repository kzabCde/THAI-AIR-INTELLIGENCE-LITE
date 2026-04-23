# ประเทศไทย AI คุณภาพอากาศอัจฉริยะ (Thailand Air Intelligence)

แพลตฟอร์ม Web App ระดับ Thesis/Demo สำหรับติดตาม **PM2.5 / PM10 / AQI แบบเรียลไทม์** ครอบคลุม **77 จังหวัดของประเทศไทย** พร้อมระบบคาดการณ์และการวิเคราะห์ความเสี่ยงอัตโนมัติ.

## เทคโนโลยีหลัก

- Next.js 15 (App Router)
- React 19 + TypeScript (strict)
- Tailwind CSS + Framer Motion
- Recharts
- SWR (stale-while-revalidate)
- Zustand
- date-fns
- พร้อม Deploy บน Vercel

## ความสามารถหลัก

- แดชบอร์ดภาษาไทยเต็มระบบ (ฟอนต์ Kanit, Prompt, Sarabun)
- ครอบคลุมข้อมูล 77 จังหวัด (จังหวัด, ภูมิภาค, พิกัด centroid, สถานีใกล้เคียง)
- ระบบผู้ให้บริการข้อมูลแบบ fallback:
  1. Air4Thai/PCD (soft fail)
  2. OpenAQ
  3. Open-Meteo Air
  4. Fallback sample mode
- Realtime refresh policy:
  - PM2.5 ทุก 1 นาที
  - สภาพอากาศทุก 5 นาที
  - Hotspot ทุก 10 นาที
- Prediction Engine 3 โมเดล:
  - Moving Average (7 วัน)
  - Linear Regression
  - Smart Weighted Formula
- Risk Engine:
  - ต่ำ / ปานกลาง / สูง / วิกฤต
  - อธิบายเหตุผลความเสี่ยง
- แจ้งเตือนเมื่อ PM2.5 > 100
- ค้นหาจังหวัด, ดูอันดับ, เทียบจังหวัด, โหมดกลางวัน/กลางคืน, จังหวัดโปรด

## โครงสร้างโปรเจกต์

```txt
app/
  page.tsx
  layout.tsx
  api/air/route.ts
  api/weather/route.ts
components/
  ThailandMap.tsx
  ProvincePanel.tsx
  RealtimeTicker.tsx
  dashboard/thailand-map-intelligence.tsx
  charts/*
lib/
  providers.ts
  mergeData.ts
  prediction.ts
  risk.ts
  thaiDate.ts
  provinces.ts
  colors.ts
  cache.ts
  engine.ts
  apis/*
  store/app-store.ts
  hooks/use-thailand-snapshot.ts
types/
  air.ts
  index.ts
```

## วิธีติดตั้ง

```bash
npm install
```

## วิธีรันในเครื่อง

```bash
npm run dev
```

เปิดที่ `http://localhost:3000`

## คำสั่งที่แนะนำ

```bash
npm run typecheck
npm run lint
npm run build
```

## ตั้งค่า Environment

คัดลอกไฟล์ตัวอย่าง:

```bash
cp .env.example .env.local
```

## Deploy บน Vercel

1. Push โค้ดขึ้น GitHub
2. Import โปรเจกต์ใน Vercel
3. Framework preset: **Next.js**
4. Build Command: `npm run build`
5. Output: `.next`
6. Deploy

## สถาปัตยกรรม (ย่อ)

- **Presentation Layer:** `app/` + `components/` แสดงผลแดชบอร์ด, แผนที่, กราฟ
- **State Layer:** Zustand สำหรับสถานะผู้ใช้ (selected province/favorite)
- **Data Layer:** SWR + API routes (`/api/air`, `/api/weather`) + provider fallback
- **Domain Layer:** Prediction / Risk / Merge / Score utilities ใน `lib/`
- **Cache Layer:** localStorage สำหรับ snapshot และ history

