import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260729052105_fix_cron_reliability.sql",
    import.meta.url,
  ),
  "utf8",
);
const cronRoute = readFileSync(
  new URL("../app/api/cron/[job]/route.ts", import.meta.url),
  "utf8",
);
const refreshStart = migration.indexOf(
  "create or replace function public.fn_refresh_next_runs",
);
const refreshEnd = migration.indexOf(
  "revoke all on function public.fn_refresh_next_runs",
);
const refreshFunction = migration.slice(refreshStart, refreshEnd);

test("daily next-run timestamps are maintained by a row-local trigger", () => {
  assert.match(
    migration,
    /before update of last_run_at on public\.sync_state/i,
  );
  assert.match(
    migration,
    /new\.job_name in \('daily_cleanup', 'daily_pipeline'\)/i,
  );
});

test("periodic refresher cannot lock daily pipeline rows", () => {
  assert.doesNotMatch(refreshFunction, /daily_cleanup|daily_pipeline/i);
  assert.match(
    refreshFunction,
    /where job_name in \('hotspot_sync', 'pm25_sync', 'weather_sync'\)/i,
  );
  assert.match(
    refreshFunction,
    /order by job_name[\s\S]+for update/i,
  );
});

test("next-run refresher does not make stale job status look current", () => {
  assert.doesNotMatch(refreshFunction, /updated_at\s*=/i);
  assert.match(
    migration,
    /where job_name in \('forecast_generate', 'model_retrain'\)[\s\S]+and next_run_at is not null/i,
  );
});

test("refresh cron is staggered away from the daily pipeline", () => {
  assert.match(
    migration,
    /schedule := '2,12,22,32,42,52 \* \* \* \*'/,
  );
});

test("cron route returns an HTTP error when a service returns error status", () => {
  assert.match(cronRoute, /if \(result\.status === "error"\)/);
  assert.match(
    cronRoute,
    /if \(result\.status === "error"\)[\s\S]+return fail\("Cron job failed", 500\)/,
  );
});
