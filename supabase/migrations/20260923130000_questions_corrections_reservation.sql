-- Keeps the original reflection row immutable, stores one confirmation question
-- through the existing questions array, and releases only the in-flight AI
-- reservation when the server finishes a run. Daily admission rows stay.

begin;

create table public.reflection_corrections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  user_id uuid not null,
  lesson text not null check (length(btrim(lesson)) between 1 and 10000),
  well_founded text not null default '' check (length(well_founded) <= 10000),
  overreach text not null default '' check (length(overreach) <= 10000),
  missing text not null default '' check (length(missing) <= 10000),
  source text not null default 'user' check (source = 'user'),
  created_at timestamptz not null default now(),
  foreign key (event_id, user_id) references public.events(id, user_id) on delete cascade
);

create index reflection_corrections_event_idx
  on public.reflection_corrections(event_id, created_at);

alter table public.reflection_corrections enable row level security;
create policy reflection_corrections_read_own
  on public.reflection_corrections
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.reflection_corrections from anon, authenticated;
grant select on public.reflection_corrections to authenticated;

create or replace function public.update_event(
  p_event_id uuid, p_expected_version integer, p_payload jsonb, p_request_id uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare v_uid uuid := public.require_uid(); v_event public.events%rowtype; v_replay jsonb; v_response jsonb;
begin
  v_replay := public.claim_idempotency('update_event', p_request_id, p_event_id, p_expected_version, p_payload);
  if v_replay is not null then return v_replay; end if;
  select * into v_event from public.events where id=p_event_id and user_id=v_uid for update;
  if not found then raise exception 'event not found' using errcode='P0002'; end if;
  if v_event.version <> p_expected_version then raise exception 'version conflict' using errcode='40001'; end if;
  if exists(select 1 from public.predictions where event_id=p_event_id) then
    raise exception 'event snapshot is locked after prediction' using errcode='P0001';
  end if;
  if jsonb_array_length(case when p_payload?'hypotheses' then p_payload->'hypotheses' else v_event.hypotheses end) > 0
     and nullif(btrim(case when p_payload?'userHypothesis' then p_payload->>'userHypothesis'
                          else v_event.user_hypothesis end),'') is null then
    raise exception 'user hypothesis required before alternatives' using errcode='P0001';
  end if;
  update public.events set
    title=case when p_payload?'title' then btrim(p_payload->>'title') else title end,
    raw_text=case when p_payload?'rawText' then btrim(p_payload->>'rawText') else raw_text end,
    facts=case when p_payload?'facts' then p_payload->'facts' else facts end,
    inferences=case when p_payload?'inferences' then p_payload->'inferences' else inferences end,
    unknowns=case when p_payload?'unknowns' then p_payload->'unknowns' else unknowns end,
    questions=case when p_payload?'questions' then p_payload->'questions' else questions end,
    context=case when p_payload?'context' then p_payload->>'context' else context end,
    user_hypothesis=case when p_payload?'userHypothesis' then p_payload->>'userHypothesis' else user_hypothesis end,
    hypotheses=case when p_payload?'hypotheses' then p_payload->'hypotheses' else hypotheses end,
    version=version+1, updated_at=now()
  where id=p_event_id and user_id=v_uid;
  perform public.snapshot_event(p_event_id);
  v_response:=jsonb_build_object('id',p_event_id);
  perform public.complete_idempotency('update_event',p_request_id,v_response);
  return v_response;
end $$;

create or replace function public.append_reflection_correction(
  p_event_id uuid, p_expected_version integer, p_request_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare v_uid uuid := public.require_uid(); v_event public.events%rowtype; v_replay jsonb; v_response jsonb;
begin
  v_replay := public.claim_idempotency('append_reflection_correction', p_request_id, p_event_id, p_expected_version, p_payload);
  if v_replay is not null then return v_replay; end if;
  select * into v_event from public.events where id=p_event_id and user_id=v_uid for update;
  if not found then raise exception 'event not found' using errcode='P0002'; end if;
  if v_event.version <> p_expected_version then raise exception 'version conflict' using errcode='40001'; end if;
  if not exists(select 1 from public.reflections where event_id=p_event_id and user_id=v_uid) then
    raise exception 'reflection required before correction' using errcode='P0001';
  end if;
  if nullif(btrim(p_payload->>'lesson'),'') is null then raise exception 'lesson required' using errcode='22023'; end if;
  insert into public.reflection_corrections(event_id, user_id, lesson, well_founded, overreach, missing, source)
  values(
    p_event_id,
    v_uid,
    btrim(p_payload->>'lesson'),
    coalesce(p_payload->>'wellFounded',''),
    coalesce(p_payload->>'overreach',''),
    coalesce(p_payload->>'missing',''),
    'user'
  );
  update public.events set version=version+1, updated_at=now() where id=p_event_id and user_id=v_uid;
  perform public.snapshot_event(p_event_id);
  v_response := jsonb_build_object('id', p_event_id);
  perform public.complete_idempotency('append_reflection_correction', p_request_id, v_response);
  return v_response;
end $$;

create or replace function public.finish_ai_run(
  p_run_id uuid, p_output jsonb, p_status text, p_error_code text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare v_uid uuid:=public.require_uid(); v_run public.agent_runs%rowtype;
begin
  if p_status not in ('succeeded','failed') then raise exception 'invalid run status' using errcode='22023'; end if;
  select * into v_run from public.agent_runs where id=p_run_id and user_id=v_uid for update;
  if not found then raise exception 'run not found' using errcode='P0002'; end if;
  if v_run.status<>'running' then
    return jsonb_build_object('id',v_run.id,'status',v_run.status,'output',v_run.output,'error_code',v_run.error_code);
  end if;
  if v_run.deadline_at<=now() then
    update public.agent_runs set status='expired',error_code='RUN_EXPIRED',finished_at=now() where id=p_run_id;
  else
    update public.agent_runs set status=p_status,output=case when p_status='succeeded' then p_output else null end,
      error_code=p_error_code,finished_at=now() where id=p_run_id and user_id=v_uid;
    -- Release the in-flight slot only. The admission row remains and still counts
    -- toward the daily cap; there is no client RPC that refunds a start.
    update public.ai_usage_starts set reservation_until=now() where run_id=p_run_id and user_id=v_uid;
  end if;
  select * into v_run from public.agent_runs where id=p_run_id;
  return jsonb_build_object('id',v_run.id,'status',v_run.status,'output',v_run.output,'error_code',v_run.error_code);
end $$;

revoke all on function public.append_reflection_correction(uuid,integer,uuid,jsonb) from public, anon;
grant execute on function public.append_reflection_correction(uuid,integer,uuid,jsonb) to authenticated;

commit;
