# Thailand Air Intelligence (Foundation)

โปรเจกต์นี้เป็นโครงสร้างพื้นฐานสำหรับ Next.js App Router ที่ออกแบบให้พร้อมต่อยอดสู่ production สำหรับแพลตฟอร์มข่าวกรองคุณภาพอากาศประเทศไทย

## Stack
- Next.js (App Router) + TypeScript
- Tailwind CSS
- shadcn/ui style primitives
- Framer Motion transitions
- Thai-first UX + Dark mode

## Routes (placeholder)
- `/`
- `/dashboard`
- `/map`
- `/province`
- `/province/[id]`
- `/analytics`
- `/forecast`
- `/sources`
- `/about`

## โครงสร้างหลัก
- `app/` routes + layout
- `components/layout` app shell, sidebar, top nav, mobile drawer
- `components/ui` reusable UI primitives
- `lib/types.ts` shared types
- `lib/*` folders prepared for scalable modules

## Run
```bash
npm install
npm run dev
```

## Notes
- เวอร์ชันนี้ยังไม่เชื่อม API จริง
- ทุกหน้าเป็น placeholder เพื่อเตรียมโครงสร้างและ UX foundation
