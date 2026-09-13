# ตรวจสอบคำทำนายเมื่อถึงวันเป้าหมาย

สถานะ: ใช้ migration และประเมินย้อนหลังใหม่บน Production แล้ววันที่ 2026-09-13; API/UI ยังอยู่ใน PR #77 และยังไม่เผยแพร่ในขั้นตอนนี้

## ลำดับการเปลี่ยนแปลง

1. SQL ประเมินหลังสิ้นวันตาม `Asia/Bangkok`, เฉพาะคำทำนายที่ออกก่อนวันเป้าหมายและรอบที่มีสถานะ `success`/`partial`.
2. เก็บ metadata รุ่นการประเมิน, ชั่วโมงข้อมูล, ประเภทแหล่งอ้างอิงและเลข revision; API ส่งผลที่ตรวจสอบย้อนกลับได้.
3. หน้า Forecast แสดงกราฟ/ตารางย้อนหลัง 7/30/90 วัน เลือกระยะ D+1–D+7 และแหล่งข้อมูลอ้างอิง.
4. ยกเลิกเปอร์เซ็นต์ความมั่นใจเชิงตัวเลขที่สร้างจากสูตร; `ForecastPoint.confidence` ส่ง `null`. `classConfidence` จากตัวจำแนกยังแยกอยู่ และไม่ได้ใช้แทนความแม่นยำที่วัดได้.

## นิยามข้อมูลและคะแนน

- เปรียบเทียบค่าเฉลี่ยรายวันกับค่าเฉลี่ยรายวันในหน่วย µg/m³.
- รวมรายการภายในแต่ละชั่วโมงก่อน แล้วเฉลี่ยทุกชั่วโมงโดยให้น้ำหนักเท่ากัน ป้องกันชั่วโมงที่มีหลายรายการมีน้ำหนักเกิน.
- ต้องสิ้นวันแล้วและมีอย่างน้อย 18 จาก 24 ชั่วโมง จึงนับเป็น `final`. คำนี้หมายถึงวันเป้าหมายสิ้นสุดแล้ว ไม่ได้แปลว่าข้อมูลครบ 24 ชั่วโมงหรือแก้ไขไม่ได้; UI แสดงความครอบคลุมแยกต่างหาก.
- ฟังก์ชันรายวันเดิมตรวจซ้ำ 7 วันย้อนหลัง ข้อมูลเข้าช้าหรือค่าที่แก้ไขจะอัปเดตผลและเพิ่ม revision เฉพาะเมื่อค่าเปลี่ยน. ข้อมูลเก่ากว่านั้นแก้ได้ผ่านฟังก์ชันช่วงวันที่ที่มีขอบเขตชัดเจน.
- ถ้าข้อมูลถูกถอนจนเหลือต่ำกว่า 18 ชั่วโมง จะเก็บค่าคำนวณก่อนหน้าไว้เพื่อสอบย้อนกลับ แต่เปลี่ยนสถานะเป็น `insufficient_data` และไม่รวมในคะแนน.
- ผลเดิมทั้งหมดเริ่มที่ `evaluation_version=1`, `legacy`; ไม่ถูกนำมาปนกับ v2 จนกว่าจะประเมินใหม่. ไม่สร้างข้อมูลอ้างอิงทดแทนเมื่อข้อมูลรายชั่วโมงหายไป.
- รายงานเลือกคำทำนายล่าสุดต่อจังหวัด/วันเป้าหมาย/ระยะพยากรณ์ **ก่อน** จับคู่ผลประเมิน. ไม่เลือกคำทำนายจากความคลาดเคลื่อนต่ำที่สุด และไม่ให้น้ำหนักวันรันซ้ำมากกว่าวันอื่น.
- `open-meteo` = model reference จาก CAMS. `air4thai`, `openaq`, `waqi` = provider reference; ชื่อผู้ให้บริการเพียงอย่างเดียวไม่พิสูจน์ว่าเป็นค่าฝุ่นจากสถานีที่ผ่านการตรวจหน่วย/คุณภาพแล้ว.
- หากวันเดียวมีหลายแหล่ง จะระบุชื่อแหล่งทั้งหมดและ `mixed_reference`. แยกตัวเลือกจากแหล่งเดียว ไม่อ้างว่าเป็นการยืนยันกับสถานีภาคพื้นดิน. ชุดข้อมูลนี้ยังไม่ได้เพิ่มตัวรับข้อมูลสถานีใหม่หรือเปลี่ยน provider ingestion.
- MAE/RMSE แสดงหน่วย µg/m³; Bias ในรายงาน = predicted − reference. ค่า null หมายถึงไม่มีหลักฐานเพียงพอ ไม่ใช่ความผิดพลาดเป็นศูนย์.
- Classification แยก direct classifier ที่ `classification_source=active_classifier` กับการแบ่งระดับจากค่าพยากรณ์ด้วยเกณฑ์. แสดงจำนวนวันในแต่ละระดับ, precision, recall และ F1; Macro F1 เฉลี่ยเฉพาะ union ของระดับที่ปรากฏจริง/ทำนาย พร้อมแสดงระดับที่ไม่มีหลักฐานเป็น null.
- รายละเอียดแยก regression/classifier ตามชื่อและ training run ID. คะแนนรวมเป็นผลระบบที่เผยแพร่ในช่วงนั้น ซึ่งอาจผ่านหลายรุ่นโมเดล.
- ตาราง drift เดิมไม่มีมิติแหล่งอ้างอิง: รอบใหม่ใช้เฉพาะ v2 final ของ `open-meteo` และบันทึก source/version ใน residual metadata. รายการ drift เก่าคงอยู่เป็นประวัติ และไม่ใช่แหล่งคะแนนสำหรับ UI ใหม่นี้.

## API

`GET /api/forecast/verification?province=TH-40&days=30&horizon=1`

รับเฉพาะจังหวัดในระบบ, days 7/30/90, horizon 1–7; อื่น ๆ ได้ 400. ไม่มี service configuration ได้ 503. ข้อผิดพลาดภายในได้ข้อความทั่วไป ไม่ส่งรายละเอียดฐานข้อมูลให้ browser.

HTTP response ใช้ `Cache-Control: no-store` เพื่อให้การกดอัปเดตไม่รับผลเก่าระหว่าง revalidation; React Query ยังคง deduplicate และเก็บผลในหน่วยความจำ 60 วินาที.

RPC `fn_get_forecast_verification` เป็น `SECURITY INVOKER`, จำกัด EXECUTE เฉพาะ `service_role`, ใช้ผ่าน server route เท่านั้น. ไม่เพิ่มสิทธิ์ตารางให้ `anon`/`authenticated`. ผล JSON มีไม่เกิน 98 วันต่อคำขอ รวมวันปัจจุบันและอนาคตเพื่อแสดงสถานะรอ; วันเหล่านี้ไม่อยู่ในคะแนนย้อนหลัง.

## ลำดับนำขึ้นใช้งาน

1. ตรวจและนำ migration `20260913085852_forecast_verification_closed_days.sql` ไปใช้ก่อนเผยแพร่ frontend. ไม่แก้ไฟล์ SQL ใน Production baseline เดิม.
2. ประเมินย้อนหลังใหม่ทีละช่วงไม่เกิน 7 วัน เพื่อลดเวลาในแต่ละ transaction. ตัวอย่างสำหรับ 7 วันล่าสุด:

   ```sql
   select public.fn_evaluate_forecasts_range(
     (now() at time zone 'Asia/Bangkok')::date - 7,
     (now() at time zone 'Asia/Bangkok')::date - 1
   );
   ```

   ไล่ช่วงก่อนหน้าไม่ทับกันจนครบ 90 วันที่ต้องการ. ฟังก์ชันยอมรับได้สูงสุด 90 วันต่อคำขอ แต่การ backfill แนะนำแบ่งชุด. ไม่เรียกใน page request.
3. ตรวจ `evaluation_version=2`, coverage และ source; เรียก `fn_refresh_model_drift_metrics()` หลัง backfill.
4. เผยแพร่ frontend/API และตรวจจังหวัด TH-40, D+1/D+7, กรณีไม่มีข้อมูลและการโหลดผิดพลาด. การโหลดผลประเมินล้มเหลวไม่ทำให้หน้า Forecast ส่วนเดิมล้มเหลว.
5. ยืนยันรอบอัตโนมัติถัดไปเรียก `fn_evaluate_due_forecasts()` ผ่าน Python pipeline เดิม. ไม่มีการเปลี่ยนโมเดลหรือสั่งเทรนใหม่ใน PR นี้.
6. หลัง apply จริงเท่านั้น จึงอัปเดต `production-migration-baseline.json` ด้วยรายการ/alias/checksum ที่ตรวจจาก Production และนำรายการนี้ออกจาก pending inventory.

## การตรวจสอบ

- `npm test`: SQL ทำงานจริงบน PostgreSQL ผ่าน PGlite; ตรวจสิ้นวันไทย, ข้อมูลเข้าช้า, idempotence, น้ำหนักรายชั่วโมง, mixed source, synthetic exclusion, ถอนข้อมูล, latest issue, failed run, คำทำนายออกช้า และสิทธิ์ RPC. ทดสอบคณิตศาสตร์และการตรวจพารามิเตอร์แยกต่างหาก.
- `npm run typecheck`, `npm run lint`, `npm run build`.
- ตรวจ EXPLAIN ANALYZE เฉพาะคำสั่งอ่านบน Production วันที่ 2026-09-13: การ aggregate ช่วง 7 วัน 3,360 ชั่วโมงใช้ประมาณ 46 ms เมื่อใส่ขอบเขต observed_at ทั้งช่วง. เป็นผล query อ่านหนึ่งครั้ง ไม่ใช่เวลาทั้ง pipeline หรือ SLA.
- Browser smoke ผ่าน Chromium/Playwright ที่ 1440px และ 390px: กราฟ/ตาราง, ตัวกรอง, empty state, HTTP error และกดโหลดใหม่ฟื้นกลับได้; ไม่มี page errors และมือถือไม่มี page overflow. ใช้ข้อมูลจำลองผ่าน Next API → PostgreSQL ในเครื่อง ไม่มีการเขียนข้อมูลจำลองลง Production. Agent Browser CLI เปิด daemon ในสภาพแวดล้อมนี้ไม่ได้ จึงใช้ Playwright กับ Chromium ที่ดาวน์โหลดแทน; ฟอนต์ไทยเพิ่มเฉพาะใน harness เพื่อทดแทนฟอนต์ระบบของเครื่องทดสอบ.

## ผลนำฐานข้อมูลขึ้นใช้งาน 2026-09-13

- Production migration `20260913134347_forecast_verification_closed_days` ตรงกับไฟล์ที่ตรวจใน PR `20260913085852_forecast_verification_closed_days.sql`; MD5 `07043db4b4674a2940b45287abcc0aa3`. บันทึก alias และนำออกจาก pending inventory แล้ว.
- ตรวจพบ migration เดิมบน Production `20260908174224_data_remediation_daily_summary_trusted_sources` ซึ่งยังไม่อยู่ใน snapshot วันที่ 6 ก.ย.; เพิ่มเฉพาะรายการประวัติที่ตรวจพบ ไม่รันซ้ำหรือเปลี่ยน SQL นั้น.
- ประเมินช่วง 15 มิ.ย.–12 ก.ย. 2026 ครบ 90 วัน แบ่ง 13 ชุดไม่เกินชุดละ 7 วัน: อัปเดตเป็น v2 final **7,075 รายการ**, ครอบคลุม 20 จังหวัด วันที่ 28 ก.ค.–12 ก.ย. ทุกผลมีข้อมูล **24/24 ชั่วโมง** และใช้ `open-meteo` เป็น model reference.
- คงผล legacy 9,152 รายการไว้เพื่อสอบย้อนกลับ. คำทำนาย 30 รายการที่มี run ID แต่วันเป้าหมาย 26–27 ก.ค. ถูกออกหลังเริ่มวันเป้าหมาย จึงไม่เข้าเกณฑ์ v2. จำนวนผลประเมินรวมคงเดิม 16,227 รายการ.
- ตรวจ RPC ทั้ง 20 จังหวัด × 7 ระยะพยากรณ์: ได้ 5,955 ผล final หลังเลือกคำทำนายล่าสุดต่อวัน/ระยะ และ 700 รายการ pending; ไม่พบวันซ้ำหรือผล final ของวันปัจจุบัน/อนาคต.
- คะแนนรวมจังหวัดในหน้าต่างนี้ (หลายรุ่นโมเดล, µg/m³): D+1 จำนวน 900 ตัวอย่าง MAE 2.199 / RMSE 2.729; D+7 จำนวน 795 ตัวอย่าง MAE 3.763 / RMSE 4.509. เป็นความสอดคล้องกับ Open-Meteo/CAMS ไม่ใช่ความแม่นยำกับสถานีวัดภาคพื้นดิน.
- Refresh drift 188 รายการ. รัน wrapper 7 วันล่าสุดซ้ำได้ `evaluated=0`, `invalidated=0`; ไม่เพิ่ม revision เมื่อข้อมูลไม่เปลี่ยน. RPC ทั้งสี่เป็น invoker และเรียกได้เฉพาะ service role จากกลุ่มบทบาทแอปที่ตรวจ.
- Supabase security advisor ไม่มี finding ที่อ้างถึงวัตถุใหม่; รายการเดิมคือ [extensions ใน public](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public) และ [RLS ไม่มี policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) ของ cron_log/sync_state. Performance advisor แจ้ง [index ยังไม่ถูกใช้](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) รวม index รายงานที่เพิ่งสร้างและยังไม่ได้เปิด frontend.
- CI ของ commit `5a0e330` ผ่าน lint/typecheck/58 Node tests/build แต่หยุดที่ production dependency audit ของ Next.js/PostCSS/sharp. ยังต้องแก้ dependency gate ก่อนเผยแพร่เว็บ; การอัปเกรด dependency ไม่ได้รวมในการนำฐานข้อมูลขึ้นครั้งนี้.

## การย้อนกลับ

ย้อน frontend ไป commit ก่อนหน้าได้โดยไม่ลบ metadata ใหม่. หากต้องย้อนพฤติกรรม evaluator/drift ให้คืน definitions ของ `fn_evaluate_due_forecasts` และ `fn_refresh_model_drift_metrics` จาก commit ก่อนหน้าใน migration แก้ไขใหม่. ไม่ลบคำทำนายหรือผลประเมินเพื่อย้อนระบบ. API เก่าที่มี consumer ภายนอกต้องรับทราบว่า numeric confidence เปลี่ยนเป็น null แทนค่าที่ไม่ได้สอบเทียบ.
