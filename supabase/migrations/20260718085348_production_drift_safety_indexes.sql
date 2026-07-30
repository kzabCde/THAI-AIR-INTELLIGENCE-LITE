-- Forward-only safety migration for production drift cleanup.
-- Does not delete data or modify already-deployed migration files.

create index if not exists idx_backfill_checkpoints_province_id
  on public.backfill_checkpoints (province_id);

create index if not exists idx_model_registry_province_id
  on public.model_registry (province_id);

create index if not exists idx_province_neighbours_neighbour_id
  on public.province_neighbours (neighbour_id);

-- Synthetic data retirement is intentionally staged, not executed.
create table if not exists public.synthetic_data_retirement_plan (
  id bigint generated always as identity primary key,
  table_name text not null,
  candidate_filter text not null,
  proposed_action text not null check (proposed_action in ('archive', 'delete')),
  approved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.synthetic_data_retirement_plan enable row level security;

drop policy if exists "synthetic retirement plan read" on public.synthetic_data_retirement_plan;
create policy "synthetic retirement plan read"
  on public.synthetic_data_retirement_plan
  for select
  to anon, authenticated
  using (true);

revoke all on public.synthetic_data_retirement_plan from anon, authenticated;
grant select on public.synthetic_data_retirement_plan to anon, authenticated;
