-- Operational rollback for pooled tree serving.
-- Preserve registry rows, artifacts, columns, and forecast history so the
-- rollback is recoverable and auditable.

begin;

update public.model_registry
set is_active = false,
    activated_at = null
where model_version = 'pooled-dual-pm25-v1'
  and is_active;

-- Restore the newest eligible pre-v5 model for every affected task/province.
with ranked_legacy as (
  select
    id,
    row_number() over (
      partition by province_id, task_type
      order by trained_at desc, id desc
    ) as priority
  from public.model_registry
  where model_version is distinct from 'pooled-dual-pm25-v1'
    and eligibility_status = true
    and evidence_status = 'validated'
), rollback_targets as (
  select id
  from ranked_legacy
  where priority = 1
)
update public.model_registry registry
set is_active = true,
    activated_at = now()
from rollback_targets target
where registry.id = target.id
  and not exists (
    select 1
    from public.model_registry active
    where active.province_id = registry.province_id
      and active.task_type = registry.task_type
      and active.is_active
  );

commit;
