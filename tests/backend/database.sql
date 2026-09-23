-- Transactional verification for a freshly migrated Supabase project.
-- Apply both migrations before this script:
-- supabase/migrations/20260322120000_context_lab_backend.sql
-- supabase/migrations/20260923130000_questions_corrections_reservation.sql
-- Creates no persistent users and sends no email: everything is rolled back.
begin;

insert into auth.users (id)
values
  ('10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002');

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';

select public.create_event(
  '{"title":"tenant-a","rawText":"同事没有回复消息","category":"work"}',
  'a0000000-0000-4000-8000-000000000001'
);

do $$
begin
  if (select count(*) from public.events where title='tenant-a') <> 1 then
    raise exception 'owner cannot read own event';
  end if;
end $$;

-- Direct table mutation is denied even to an authenticated owner.
do $$
declare t text;
begin
  foreach t in array array[
    'events','predictions','outcomes','reflections','reflection_corrections','event_revisions',
    'agent_runs','ai_usage_starts','idempotency_keys'
  ] loop
    begin
      execute format('delete from public.%I where false', t);
      raise exception 'direct delete unexpectedly allowed on %', t;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  begin
    update public.events set title=title where false;
    raise exception 'direct update unexpectedly allowed';
  exception when insufficient_privilege then
    null;
  end;
end $$;

-- Illegal prediction order (no user hypothesis) is rejected.
do $$
begin
  perform public.submit_prediction(
    (select id from public.events where title='tenant-a'), 1,
    'a0000000-0000-4000-8000-000000000002',
    jsonb_build_object(
      'text','周五前回复','probability',50,'criteria','收到文字回复',
      'dueAt',to_jsonb(now()+interval '1 day')
    )
  );
  raise exception 'prediction without hypothesis unexpectedly allowed';
exception when raise_exception then
  if sqlerrm not like '%hypothesis required%' then raise; end if;
end $$;

select public.update_event(
  (select id from public.events where title='tenant-a'), 1,
  '{"version":1,"userHypothesis":"暂不知道","questions":["谁负责周五的交付"],"context":"对方是否写出负责人和日期"}',
  'a0000000-0000-4000-8000-000000000003'
);

do $$
begin
  if (select questions->>0 from public.events where title='tenant-a') <> '谁负责周五的交付' then
    raise exception 'confirmation question was not saved';
  end if;
  if (select context from public.events where title='tenant-a') <> '对方是否写出负责人和日期' then
    raise exception 'observation signal was not saved';
  end if;
end $$;

-- CAS rejects a different stale write.
do $$
begin
  perform public.update_event(
    (select id from public.events where title='tenant-a'), 1,
    '{"version":1,"context":"stale"}',
    'a0000000-0000-4000-8000-000000000004'
  );
  raise exception 'stale CAS unexpectedly allowed';
exception when serialization_failure then null;
end $$;

select public.submit_prediction(
  (select id from public.events where title='tenant-a'), 2,
  'a0000000-0000-4000-8000-000000000005',
  jsonb_build_object(
    'version',2,'requestId','a0000000-0000-4000-8000-000000000005',
    'text','周五前回复','probability',50,'criteria','收到文字回复',
    'dueAt',to_jsonb(now()+interval '1 day')
  )
);

-- Exact replay returns stored success despite the now-stale version.
select public.submit_prediction(
  (select id from public.events where title='tenant-a'), 2,
  'a0000000-0000-4000-8000-000000000005',
  jsonb_build_object(
    'version',2,'requestId','a0000000-0000-4000-8000-000000000005',
    'text','周五前回复','probability',50,'criteria','收到文字回复',
    'dueAt',to_jsonb((select due_at from public.predictions where event_id=(select id from public.events where title='tenant-a')))
  )
);

do $$
begin
  if (select count(*) from public.predictions) <> 1 then
    raise exception 'exact replay duplicated prediction';
  end if;
end $$;

do $$
begin
  perform public.start_ai_run(
    (select id from public.events where title='tenant-a'), 3,
    'a0000000-0000-4000-8000-000000000016','organize',
    repeat('e',64),'gpt-5.4-mini','test',true
  );
  raise exception 'organize after prediction unexpectedly allowed';
exception when raise_exception then
  if sqlerrm not like '%locked after prediction%' then raise; end if;
end $$;

-- Same idempotency key with changed parameters is rejected.
do $$
begin
  perform public.submit_prediction(
    (select id from public.events where title='tenant-a'), 2,
    'a0000000-0000-4000-8000-000000000005',
    jsonb_build_object(
      'version',2,'requestId','a0000000-0000-4000-8000-000000000005',
      'text','周五前回复','probability',90,'criteria','收到文字回复',
      'dueAt',to_jsonb((select due_at from public.predictions limit 1))
    )
  );
  raise exception 'changed idempotent payload unexpectedly allowed';
exception when raise_exception then
  if sqlerrm not like '%different parameters%' then raise; end if;
end $$;

-- Snapshot fields remain locked after prediction.
do $$
begin
  perform public.update_event(
    (select id from public.events where title='tenant-a'), 3,
    '{"version":3,"context":"attempted overwrite"}',
    'a0000000-0000-4000-8000-000000000006'
  );
  raise exception 'post-prediction update unexpectedly allowed';
exception when raise_exception then
  if sqlerrm not like '%locked after prediction%' then raise; end if;
end $$;

select public.record_outcome(
  (select id from public.events where title='tenant-a'), 3,
  'a0000000-0000-4000-8000-000000000007',
  '{"version":3,"requestId":"a0000000-0000-4000-8000-000000000007","result":"unknown","notes":"无法观察","intervention":""}'
);

do $$
begin
  if (select result from public.outcomes limit 1) <> 'unknown' then
    raise exception 'unknown outcome was not preserved';
  end if;
end $$;

select public.save_reflection(
  (select id from public.events where title='tenant-a'), 4,
  'a0000000-0000-4000-8000-000000000008',
  '{"version":4,"lesson":"未知不是未发生","wellFounded":"","overreach":"","missing":""}'
);

-- A completed loop cannot request another reflection analysis.
do $$
begin
  perform public.start_ai_run(
    (select id from public.events where title='tenant-a'), 5,
    'a0000000-0000-4000-8000-000000000009','reflection',
    repeat('a',64),'gpt-5.4-mini','test',true
  );
  raise exception 'completed reflection analysis unexpectedly allowed';
exception when raise_exception then
  if sqlerrm not like '%already completed%' then raise; end if;
end $$;

select public.append_reflection_correction(
  (select id from public.events where title='tenant-a'), 5,
  'a0000000-0000-4000-8000-000000000018',
  '{"version":5,"lesson":"更正：未知要单独计数","wellFounded":"","overreach":"","missing":""}'
);

do $$
begin
  if (select lesson from public.reflections limit 1) <> '未知不是未发生' then
    raise exception 'correction overwrote the original reflection';
  end if;
  if (select count(*) from public.reflection_corrections) <> 1 then
    raise exception 'correction was not appended';
  end if;
  if (select source from public.reflection_corrections limit 1) <> 'user' then
    raise exception 'correction source was not recorded';
  end if;
end $$;

select set_config(
  'context_lab.tenant_a_event',
  (select id::text from public.events where title='tenant-a'),
  true
);

reset role;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
set local role authenticated;

do $$
declare v_id uuid := nullif(current_setting('context_lab.tenant_a_event', true), '')::uuid;
begin
  if v_id is null then
    raise exception 'known tenant A id was not retained';
  end if;
  if (select count(*) from public.events) <> 0 then
    raise exception 'RLS leaked tenant A event to tenant B';
  end if;
  begin
    perform public.delete_event(v_id, 'b0000000-0000-4000-8000-000000000001');
    raise exception 'cross-tenant delete unexpectedly allowed';
  exception when no_data_found then null;
  end;
  begin
    perform public.update_event(v_id, 1, '{"version":1,"title":"stolen"}', 'b0000000-0000-4000-8000-000000000002');
    raise exception 'cross-tenant update unexpectedly allowed';
  exception when no_data_found then null;
  end;
  begin
    perform public.submit_prediction(
      v_id, 1, 'b0000000-0000-4000-8000-000000000003',
      '{"version":1,"requestId":"b0000000-0000-4000-8000-000000000003","text":"stolen","probability":50,"criteria":"stolen","dueAt":"2099-01-01T00:00:00Z"}'
    );
    raise exception 'cross-tenant prediction unexpectedly allowed';
  exception when no_data_found then null;
  end;
  begin
    perform public.record_outcome(
      v_id, 1, 'b0000000-0000-4000-8000-000000000004',
      '{"version":1,"requestId":"b0000000-0000-4000-8000-000000000004","result":"occurred","notes":"stolen","intervention":""}'
    );
    raise exception 'cross-tenant outcome unexpectedly allowed';
  exception when no_data_found then null;
  end;
  begin
    perform public.save_reflection(
      v_id, 1, 'b0000000-0000-4000-8000-000000000005',
      '{"version":1,"lesson":"stolen"}'
    );
    raise exception 'cross-tenant reflection unexpectedly allowed';
  exception when no_data_found then null;
  end;
  begin
    perform public.append_reflection_correction(
      v_id, 1, 'b0000000-0000-4000-8000-000000000006',
      '{"version":1,"lesson":"stolen"}'
    );
    raise exception 'cross-tenant correction unexpectedly allowed';
  exception when no_data_found then null;
  end;
  begin
    perform public.start_ai_run(
      v_id, 1, 'b0000000-0000-4000-8000-000000000007', 'organize',
      repeat('f', 64), 'gpt-5.4-mini', 'test', true
    );
    raise exception 'cross-tenant analysis unexpectedly allowed';
  exception when no_data_found then null;
  end;
end $$;

reset role;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local role authenticated;

select public.create_event(
  '{"title":"reservation-one","rawText":"one","category":"other"}',
  'a0000000-0000-4000-8000-000000000010'
);
select public.create_event(
  '{"title":"reservation-two","rawText":"two","category":"other"}',
  'a0000000-0000-4000-8000-000000000011'
);

select public.start_ai_run(
  (select id from public.events where title='reservation-one'), 1,
  'a0000000-0000-4000-8000-000000000012','organize',
  repeat('b',64),'gpt-5.4-mini','test',true
);
select public.finish_ai_run(
  (select id from public.agent_runs where event_id=(select id from public.events where title='reservation-one')),
  '{"facts":[],"inferences":[],"unknowns":[],"questions":[],"hypotheses":[],"predictionSuggestion":"","criteriaSuggestion":"","wellFounded":"","overreach":"","missing":"","lesson":""}',
  'succeeded',null
);

-- Finishing releases the in-flight slot and keeps the daily admission row.
select public.start_ai_run(
  (select id from public.events where title='reservation-two'), 1,
  'a0000000-0000-4000-8000-000000000013','organize',
  repeat('c',64),'gpt-5.4-mini','test',true
);

do $$
begin
  if exists (
    select 1 from public.ai_usage_starts s
    join public.agent_runs r on r.id = s.run_id
    where r.event_id = (select id from public.events where title='reservation-one')
      and s.reservation_until > now()
  ) then
    raise exception 'finished run kept its concurrency reservation';
  end if;
  if (select count(*) from public.ai_usage_starts) <> 2 then
    raise exception 'daily admission ledger was released or skipped';
  end if;
end $$;

select public.delete_event(
  (select id from public.events where title='reservation-one'),
  'a0000000-0000-4000-8000-000000000014'
);

do $$
begin
  if (select count(*) from public.agent_runs where event_id not in (select id from public.events)) <> 0 then
    raise exception 'event deletion left private run data';
  end if;
end $$;

-- Ledger assertions intentionally run as the test transaction owner. The
-- authenticated role must not receive SELECT on quota/admission accounting.
reset role;
do $$
begin
  if (
    select count(*) from public.ai_usage_starts
    where event_id not in (select id from public.events)
  ) <> 1 then
    raise exception 'event deletion erased or duplicated quota ledger';
  end if;
end $$;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local role authenticated;

-- Deletion also cannot release the reservation.
do $$
begin
  perform public.start_ai_run(
    (select id from public.events where title='reservation-two'), 1,
    'a0000000-0000-4000-8000-000000000015','organize',
    repeat('d',64),'gpt-5.4-mini','test',true
  );
  raise exception 'event deletion bypassed active reservation';
exception when raise_exception then
  if sqlerrm not like '%another AI run is active%' then raise; end if;
end $$;

select public.delete_event(
  (select id from public.events where title='tenant-a'),
  'a0000000-0000-4000-8000-000000000017'
);

do $$
begin
  if exists(select 1 from public.predictions)
     or exists(select 1 from public.outcomes)
     or exists(select 1 from public.reflections)
     or exists(
       select 1 from public.event_revisions
       where event_id not in (select id from public.events)
     ) then
    raise exception 'event deletion did not cascade private loop data';
  end if;
end $$;

reset role;
do $$
begin
  if (select count(*) from public.ai_usage_starts) <> 2 then
    raise exception 'quota ledger did not survive event deletion';
  end if;
end $$;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
set local role authenticated;

rollback;