-- Operational rollback for the dual-model migration.
-- This intentionally keeps all new columns and historical records so rollback
-- does not destroy data. Run only after stopping writers that use task_type.

begin;

update public.model_registry
set is_active = false,
    activated_at = null
where task_type = 'classification'
  and is_active;

drop index if exists public.uq_model_registry_one_active_per_task;

with ranked as (
  select id,
         row_number() over (
           partition by province_id
           order by trained_at desc, id desc
         ) as active_rank
  from public.model_registry
  where task_type = 'regression'
    and is_active
)
update public.model_registry as registry
set is_active = false,
    activated_at = null
from ranked
where registry.id = ranked.id
  and ranked.active_rank > 1;

create unique index if not exists uq_model_registry_one_active_per_province
  on public.model_registry (province_id)
  where is_active and province_id is not null;

commit;
