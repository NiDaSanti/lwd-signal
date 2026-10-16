create or replace function public.claim_ig_events(batch_size int default 50)
returns setof public.ig_events
language sql
as $$
  update public.ig_events
  set status = 'processing'
  where id in (
    select id from public.ig_events
    where status = 'pending'
    order by created_at
    limit batch_size
    for update skip locked
  )
  returning *;
$$;