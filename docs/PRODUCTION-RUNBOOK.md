# Production Runbook

## Deploy

1. Deploy application changes from a reviewed pull request.
2. Apply forward-only Supabase migrations in order.
3. Confirm environment variables are present in production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ML_SECRET`, and optional `ML_FORECAST_URL`.
4. Verify data freshness and cron status read-only before enabling traffic.

## Rollback

1. Roll back the web deployment to the previous Vercel deployment.
2. Disable new cron invocations if the issue is write-path related.
3. Do not reset, drop, truncate, or rotate secrets without explicit approval.
4. For forward-only migrations, apply a reviewed compensating migration rather than editing deployed migrations.

## Cron troubleshooting

- `/api/cron/*` requires `Authorization: Bearer <CRON_SECRET>` in production.
- `/api/ml/forecast` POST requires `Authorization: Bearer <ML_SECRET>` in production.
- Check `sync_state` and `cron_log` with read-only SQL; do not write production data during diagnostics.

## Data freshness

Use Asia/Bangkok for business-day reporting and UTC for stored timestamps. Alert when latest observed PM2.5 or weather rows fall behind the expected hourly cadence.
