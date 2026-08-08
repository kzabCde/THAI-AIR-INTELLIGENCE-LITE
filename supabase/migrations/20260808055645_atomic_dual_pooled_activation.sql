-- Promote a complete pooled dual-model run as one transaction. The nested
-- task RPCs perform all artifact/evidence checks; any failure aborts and rolls
-- back both task promotions.

set lock_timeout = '5s';
set statement_timeout = '90s';

create or replace function public.fn_activate_pooled_dual_model_run(
  p_run_id uuid,
  p_required_provinces integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  regression_result jsonb;
  classification_result jsonb;
begin
  if p_required_provinces < 1 then
    raise exception 'p_required_provinces must be positive';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('pooled-dual-model-activation')
  );

  regression_result := public.fn_activate_pooled_model_run(
    p_run_id,
    'regression',
    p_required_provinces
  );
  classification_result := public.fn_activate_pooled_model_run(
    p_run_id,
    'classification',
    p_required_provinces
  );

  return jsonb_build_object(
    'run_id', p_run_id,
    'required_provinces', p_required_provinces,
    'regression', regression_result,
    'classification', classification_result,
    'activated_rows', p_required_provinces * 2,
    'atomic', true
  );
end;
$$;

comment on function public.fn_activate_pooled_dual_model_run(uuid, integer) is
  'Atomically activates complete pooled regression and classification candidates for one run; any task failure rolls back both.';

revoke all on function public.fn_activate_pooled_dual_model_run(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.fn_activate_pooled_dual_model_run(uuid, integer)
  to service_role;
