-- Follow-up to the applied research_hardening_v4 migration.
-- Makes the service-role-only RLS intent explicit and covers the stations FK.

create index if not exists idx_stations_province_id
  on public.stations (province_id);

do $$
declare
  protected_table text;
begin
  foreach protected_table in array array[
    'stations',
    'station_observations',
    'region_membership',
    'feature_snapshots',
    'forecast_runs',
    'forecast_evaluations',
    'model_artifacts',
    'model_drift_metrics',
    'pipeline_alerts'
  ]
  loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = protected_table
        and policyname = 'service role full access'
    ) then
      execute format(
        'create policy %I on public.%I for all to service_role using (true) with check (true)',
        'service role full access',
        protected_table
      );
    end if;
  end loop;
end
$$;
