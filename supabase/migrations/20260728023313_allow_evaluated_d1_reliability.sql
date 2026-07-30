-- Keep the database reliability contract aligned with the forecast runtime.
-- PR #55 emits `evaluated_d1` when D+1 has retrospective evaluation evidence.

set lock_timeout = '5s';

alter table public.forecast_daily
  drop constraint if exists forecast_daily_horizon_reliability_check;

alter table public.forecast_daily
  add constraint forecast_daily_horizon_reliability_check
  check (
    horizon_reliability is null
    or horizon_reliability in (
      'validated_d1',
      'evaluated_d1',
      'experimental_recursive',
      'legacy_unverified_d1',
      'legacy_unverified',
      'typescript_fallback'
    )
  ) not valid;

alter table public.forecast_daily
  validate constraint forecast_daily_horizon_reliability_check;
