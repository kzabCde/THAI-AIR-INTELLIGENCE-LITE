import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Execute the actual migration against PostgreSQL, not a SQL text snapshot.
test('closed-day evaluation, late corrections, provenance and report selection', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table isan_provinces(province_id text primary key);
      insert into isan_provinces values ('TH-40');
      create table forecast_runs(run_id uuid primary key, status text);
      insert into forecast_runs values ('00000000-0000-0000-0000-000000000001','success');
      create table forecast_daily (
        id bigint primary key, province_id text, target_date date, forecast_at timestamptz,
        forecast_run_id uuid, forecast_horizon_days smallint, pm25_mean_forecast numeric,
        pm25_p10_forecast numeric, pm25_p90_forecast numeric, displayed_class smallint,
        regression_model_name text, regression_run_id uuid, classifier_model_name text,
        classifier_run_id uuid, classifier_predicted_class smallint,
        regression_derived_class smallint, classification_source text
      );
      create table air_quality_hourly (
        province_id text, observed_at timestamptz, pm25 numeric, source text
      );
      create table forecast_evaluations (
        id bigint generated always as identity primary key,
        forecast_daily_id bigint unique references forecast_daily(id), actual_pm25 numeric not null,
        actual_class smallint, actual_source text not null, actual_observed_at timestamptz,
        absolute_error numeric, squared_error numeric, interval_covered boolean,
        class_correct boolean, evaluated_at timestamptz default now()
      );
      create table model_registry(id bigint primary key, province_id text, task_type text,
        model_name text, run_id uuid);
      create table model_drift_metrics (
        model_registry_id bigint, province_id text, window_start date, window_end date,
        horizon_days smallint, sample_count integer, mae numeric, rmse numeric, bias numeric,
        interval_coverage numeric, feature_drift jsonb, residual_drift jsonb,
        created_at timestamptz default now(),
        unique(model_registry_id,window_start,window_end,horizon_days)
      );
    `);
    await db.exec(readFileSync(new URL('../supabase/migrations/20260913085852_forecast_verification_closed_days.sql', import.meta.url), 'utf8'));
    await db.exec(`
      insert into forecast_daily (
        id, province_id, target_date, forecast_at, forecast_run_id, forecast_horizon_days,
        pm25_mean_forecast, pm25_p10_forecast, pm25_p90_forecast, displayed_class
      ) select id, 'TH-40', (now() at time zone 'Asia/Bangkok')::date - offset_days,
        ((now() at time zone 'Asia/Bangkok')::date - offset_days - 1)::timestamp at time zone 'Asia/Bangkok',
        '00000000-0000-0000-0000-000000000001', 1, 20, 10, 30, 2
      from (values (1,1),(2,0),(3,2),(4,3)) x(id,offset_days);
      insert into air_quality_hourly
        select 'TH-40', ((now() at time zone 'Asia/Bangkok')::date - 1)::timestamp
          at time zone 'Asia/Bangkok' + h * interval '1 hour', 20, 'open-meteo'
        from generate_series(0,17) h;
      insert into air_quality_hourly
        select 'TH-40', ((now() at time zone 'Asia/Bangkok')::date)::timestamp
          at time zone 'Asia/Bangkok' + h * interval '1 hour', 99, 'open-meteo'
        from generate_series(0,23) h;
    `);
    const evaluate = () => db.query('select fn_evaluate_due_forecasts() as result');
    await evaluate();
    let rows = (await db.query('select * from forecast_evaluations')).rows;
    assert.equal(rows.length, 1, 'today and missing observations must not be scored');
    assert.equal(Number(rows[0].actual_pm25), 20);
    assert.equal(rows[0].hours_available, 18);
    assert.equal(rows[0].evaluation_status, 'final');
    const revision = rows[0].revision;
    assert.equal((await evaluate()).rows[0].result.evaluated, 0, 'idempotent unchanged rerun');
    await db.exec(`
      insert into air_quality_hourly
        select 'TH-40', (((now() at time zone 'Asia/Bangkok')::date - 1)::timestamp
          at time zone 'Asia/Bangkok') + h * interval '1 hour', 40, 'open-meteo'
        from generate_series(18,23) h;
    `);
    await evaluate();
    rows = (await db.query('select * from forecast_evaluations')).rows;
    assert.equal(Number(rows[0].actual_pm25), 25, 'late hours replace the old partial mean');
    assert.equal(rows[0].hours_available, 24);
    assert.equal(Number(rows[0].absolute_error), 5);
    assert.equal(rows[0].revision, revision + 1);
    await db.exec(`
      insert into model_registry values (1,'TH-40','regression','lightgbm',
        '00000000-0000-0000-0000-000000000003');
      update forecast_daily set regression_model_name='lightgbm',
        regression_run_id='00000000-0000-0000-0000-000000000003';
      select fn_refresh_model_drift_metrics();
    `);
    const drift = (await db.query('select * from model_drift_metrics')).rows[0];
    assert.equal(Number(drift.mae), 5);
    assert.equal(drift.sample_count, 1);
    assert.equal(drift.residual_drift.actual_source, 'open-meteo');
    // Duplicate 00:xx observations must not overweight that hour in a daily mean.
    await db.exec(`insert into air_quality_hourly
      select province_id, observed_at + interval '5 minutes', pm25, 'air4thai'
      from air_quality_hourly where observed_at =
        ((now() at time zone 'Asia/Bangkok')::date - 1)::timestamp at time zone 'Asia/Bangkok';`);
    await evaluate();
    rows = (await db.query('select * from forecast_evaluations')).rows;
    assert.equal(Number(rows[0].actual_pm25), 25);
    assert.equal(rows[0].reference_kind, 'mixed_reference');
    assert.equal(rows[0].actual_source, 'air4thai,open-meteo');
    assert.equal((await db.query('select fn_refresh_model_drift_metrics() as result')).rows[0].result.upserted, 0,
      'mixed references do not enter the model-reference drift series');
    await db.exec(`insert into air_quality_hourly values
      ('TH-40', now() - interval '1 day', 500, 'synthetic');`);
    assert.equal((await evaluate()).rows[0].result.evaluated, 0);
    // A new issue is chosen before its score, even if only the older issue has a score.
    await db.exec(`insert into forecast_daily
      select 5, province_id, target_date, forecast_at + interval '1 hour', forecast_run_id,
        forecast_horizon_days, 10, 5, 15, 1, regression_model_name, regression_run_id,
        classifier_model_name, classifier_run_id, classifier_predicted_class,
        regression_derived_class, classification_source from forecast_daily where id = 1;`);
    await db.exec(`
      insert into forecast_runs values ('00000000-0000-0000-0000-000000000002','error');
      insert into forecast_daily select 6,province_id,target_date,forecast_at+interval '2 hours',
        '00000000-0000-0000-0000-000000000002',forecast_horizon_days,pm25_mean_forecast,
        pm25_p10_forecast,pm25_p90_forecast,displayed_class,regression_model_name,regression_run_id,
        classifier_model_name,classifier_run_id,classifier_predicted_class,
        regression_derived_class,classification_source from forecast_daily where id=5;
      insert into forecast_daily select 7,province_id,target_date,
        target_date::timestamp at time zone 'Asia/Bangkok',forecast_run_id,
        forecast_horizon_days,pm25_mean_forecast,pm25_p10_forecast,pm25_p90_forecast,
        displayed_class,regression_model_name,regression_run_id,classifier_model_name,
        classifier_run_id,classifier_predicted_class,regression_derived_class,
        classification_source from forecast_daily where id=5;
    `);
    let report = (await db.query("select fn_get_forecast_verification('TH-40',30,1) as report")).rows[0].report;
    assert.equal(report.rows.length, 4);
    assert.equal(report.rows.find(r => r.id === 5).status, 'insufficient_data');
    assert.equal(report.rows.find(r => r.id === 2).status, 'pending');
    await evaluate();
    report = (await db.query("select fn_get_forecast_verification('TH-40',30,1) as report")).rows[0].report;
    assert.equal(report.rows.find(r => r.id === 5).status, 'final');
    assert.equal(report.rows.find(r => r.id === 5).predicted, 10);
    assert.equal(report.rows.some(r => r.id === 6 || r.id === 7), false,
      'failed runs and issues at/after target midnight are excluded');
    // Withdraw most of yesterday's observations: old scores cannot remain final.
    await db.exec(`delete from air_quality_hourly where observed_at <
      ((now() at time zone 'Asia/Bangkok')::date - 1)::timestamp at time zone 'Asia/Bangkok' + interval '12 hours';`);
    await evaluate();
    assert.equal((await db.query("select count(*)::int as n from forecast_evaluations where evaluation_status='final'")).rows[0].n, 0);
    assert.equal((await db.query('select hours_available from forecast_evaluations limit 1')).rows[0].hours_available, 12,
      'withdrawn hours are reflected in the displayed coverage');
    await assert.rejects(() => db.query("select fn_get_forecast_verification('TH-40',365,1)"));
    await assert.rejects(() => db.query("select fn_get_forecast_verification('TH-99',30,1)"));
    await assert.rejects(() => db.query("select fn_evaluate_forecasts_range((now() at time zone 'Asia/Bangkok')::date,(now() at time zone 'Asia/Bangkok')::date)"));
    const permissions = (await db.query(`select
      has_function_privilege('anon','fn_get_forecast_verification(text,integer,integer)','execute') as anon,
      has_function_privilege('service_role','fn_get_forecast_verification(text,integer,integer)','execute') as service`)).rows[0];
    assert.equal(permissions.anon, false);
    assert.equal(permissions.service, true);
  } finally {
    await db.close();
  }
});
