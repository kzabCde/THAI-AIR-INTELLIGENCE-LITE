-- ─────────────────────────────────────────────────────────────
-- Fix: ml_forecast job stuck at status='pending'.
--
-- fn_daily_pipeline() POSTed to a HARD-CODED Vercel deployment URL
-- (https://isan-air-intelligence.vercel.app/api/cron/ml-forecast).
-- That host belonged to a previous project name and now returns
-- 404 DEPLOYMENT_NOT_FOUND, so the fire-and-forget call never
-- reached the TypeScript route. Because the trigger is wrapped in
-- `EXCEPTION WHEN OTHERS THEN NULL` and pg_net is async, the failure
-- was swallowed: runMlForecast() never ran, so markStart/markDone
-- never fired and the sync_state row sat at 'pending' (last_run_at
-- NULL) indefinitely.
--
-- Fix: read the deployment base URL from a Vault secret
-- (`vercel_base_url`) instead of hard-coding it, so future domain
-- changes need no function redefinition. A literal fallback to the
-- current production host keeps the pipeline working even if the
-- secret is absent.
--
-- Also seed/reset the ml_forecast sync_state row so the schema is
-- self-contained and the stuck 'pending' status is cleared.
-- ─────────────────────────────────────────────────────────────

create or replace function public.fn_daily_pipeline()
  returns jsonb
  language plpgsql
  security definer
  set search_path to 'public', 'vault'
as $function$
DECLARE
  v_start       timestamptz := clock_timestamp();
  v_maxobs      date;
  v_d           date;
  v_built       int := 0;
  v_fc          int := 0;
  v_clean       jsonb;
  v_result      jsonb;
  v_ml_secret   text;
  v_base_url    text;
  v_ml_url      text;
BEGIN
  -- แปลงเป็น ICT ก่อน cast เป็น date
  SELECT max(observed_at AT TIME ZONE 'Asia/Bangkok')::date
  INTO v_maxobs
  FROM air_quality_hourly;

  IF v_maxobs IS NULL THEN
    RETURN jsonb_build_object('status','skipped','reason','no data');
  END IF;

  -- rebuild daily_summary ย้อนหลัง 2 วัน
  FOR v_d IN SELECT generate_series(v_maxobs - 1, v_maxobs, '1 day')::date LOOP
    v_built := v_built + public.fn_build_daily_summary(v_d);
  END LOOP;

  -- คำนวณ forecast (persist-revert-v2 — fallback ถ้า ML ล้มเหลว)
  v_fc := public.fn_generate_forecast(7);

  -- ล้างข้อมูลเก่า
  v_clean := public.fn_cleanup_old_data();

  -- ★ เรียก Vercel /api/cron/ml-forecast ด้วย ml_secret จาก Vault
  --   base URL อ่านจาก Vault (vercel_base_url) — แก้ไขโดเมนได้โดยไม่ต้อง
  --   redefine ฟังก์ชัน. fallback เป็น production host ปัจจุบันถ้า secret หาย.
  --   fire-and-forget: ถ้าล้มเหลว pipeline ยังรันต่อปกติ
  BEGIN
    SELECT decrypted_secret
    INTO v_ml_secret
    FROM vault.decrypted_secrets
    WHERE name = 'ml_secret'
    LIMIT 1;

    SELECT decrypted_secret
    INTO v_base_url
    FROM vault.decrypted_secrets
    WHERE name = 'vercel_base_url'
    LIMIT 1;

    -- fallback ถ้า Vault ไม่มี vercel_base_url
    v_base_url := coalesce(nullif(trim(v_base_url), ''),
                           'https://northeastthailand-airquality.vercel.app');
    -- ตัด trailing slash แล้วต่อ path
    v_ml_url := rtrim(v_base_url, '/') || '/api/cron/ml-forecast';

    IF v_ml_secret IS NOT NULL THEN
      PERFORM net.http_post(
        url     := v_ml_url,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_ml_secret
        ),
        body    := '{}'::jsonb
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  v_result := jsonb_build_object(
    'status',            'success',
    'as_of',             v_maxobs,
    'daily_rows_built',  v_built,
    'forecast_rows',     v_fc,
    'cleanup',           v_clean,
    'ml_triggered',      (v_ml_secret IS NOT NULL),
    'ml_url',            v_ml_url,
    'duration_ms',       EXTRACT(epoch FROM clock_timestamp()-v_start)*1000
  );

  INSERT INTO cron_log (job_name, started_at, finished_at, status, duration_ms, records_out, meta)
  VALUES ('daily_pipeline', v_start, clock_timestamp(), 'success',
          (EXTRACT(epoch FROM clock_timestamp()-v_start)*1000)::int,
          v_built + v_fc, v_result);

  UPDATE sync_state SET
    status='success', last_run_at=v_start, last_success_at=now(),
    next_run_at = (now() + interval '1 day'),
    records_processed = v_built + v_fc,
    duration_ms = (EXTRACT(epoch FROM clock_timestamp()-v_start)*1000)::int,
    error_msg = NULL, updated_at = now()
  WHERE job_name IN ('daily_cleanup','model_retrain','forecast_generate');

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  INSERT INTO cron_log (job_name, started_at, finished_at, status, error_msg)
  VALUES ('daily_pipeline', v_start, clock_timestamp(), 'error', SQLERRM);
  UPDATE sync_state SET status='error', last_run_at=v_start, error_msg=SQLERRM, updated_at=now()
  WHERE job_name IN ('daily_cleanup','model_retrain','forecast_generate');
  RETURN jsonb_build_object('status','error','error', SQLERRM);
END;
$function$;

-- Seed/reset the ml_forecast job row. The TS route /api/cron/ml-forecast
-- (runMlForecast) drives its status via markStart/markDone; reset the stuck
-- 'pending' to 'idle' so the next pipeline run can take it through
-- running → success.
insert into public.sync_state (job_name, source, schedule, status)
values ('ml_forecast', 'vercel_python', 'triggered by daily_pipeline', 'idle')
on conflict (job_name) do update
  set status = 'idle',
      source = excluded.source,
      schedule = excluded.schedule,
      error_msg = null,
      updated_at = now();
