-- PM2.5 model registry hardening for Colab-trained candidates.
-- Keeps every training run immutable via run_id, allows inactive candidates,
-- and enforces exactly one active model per province through a partial unique
-- index. Activation is serialized per province by the RPC below.

alter table public.model_registry
  add column if not exists run_id uuid,
  add column if not exists data_cutoff date,
  add column if not exists train_start date,
  add column if not exists train_end date,
  add column if not exists test_start date,
  add column if not exists test_end date,
  add column if not exists source text;

update public.model_registry
set run_id = coalesce(run_id, gen_random_uuid())
where run_id is null;

alter table public.model_registry
  alter column run_id set not null,
  alter column is_active set default false;

-- The original schema used one row per (model_name, province_id). New Colab
-- runs need independent candidate rows, so replace that legacy uniqueness with
-- one uniqueness scope per run/model/province.
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.model_registry'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) = 'UNIQUE (model_name, province_id)'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.model_registry drop constraint %I', constraint_name);
  end if;
end $$;

create unique index if not exists idx_model_registry_run_model_province
  on public.model_registry (run_id, model_name, province_id);

-- There can be only one active model per province. NULL province_id rows are
-- metadata/global rows and are excluded from this province-level invariant.
create unique index if not exists idx_model_registry_one_active_per_province
  on public.model_registry (province_id)
  where is_active and province_id is not null;

create index if not exists idx_model_registry_active_province
  on public.model_registry (province_id, trained_at desc)
  where is_active;

create or replace function public.fn_activate_model_candidate(
  p_province_id text,
  p_run_id uuid,
  p_model_name text
)
returns table(activated_id bigint, deactivated_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_id bigint;
  inactive_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role required';
  end if;

  perform pg_advisory_xact_lock(hashtext('model_registry:' || p_province_id));

  select id into target_id
  from public.model_registry
  where province_id = p_province_id
    and run_id = p_run_id
    and model_name = p_model_name
    and coalesce(is_active, false) = false
  for update;

  if target_id is null then
    raise exception 'inactive candidate not found for province %, run %, model %', p_province_id, p_run_id, p_model_name;
  end if;

  update public.model_registry
  set is_active = false
  where province_id = p_province_id
    and is_active = true;
  get diagnostics inactive_count = row_count;

  update public.model_registry
  set is_active = true
  where id = target_id;

  return query select target_id, inactive_count;
end;
$$;

revoke all on function public.fn_activate_model_candidate(text, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_activate_model_candidate(text, uuid, text) to service_role;
