begin;

create extension if not exists pgcrypto with schema extensions;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  raw_text text not null check (length(btrim(raw_text)) between 1 and 10000),
  category text not null check (category in ('work','relationship','family','other')),
  status text not null default 'draft' check (status in ('draft','analyzing','predicted','completed')),
  version integer not null default 1 check (version > 0),
  facts jsonb not null default '[]'::jsonb check (jsonb_typeof(facts) = 'array' and jsonb_array_length(facts) <= 30),
  inferences jsonb not null default '[]'::jsonb check (jsonb_typeof(inferences) = 'array' and jsonb_array_length(inferences) <= 30),
  unknowns jsonb not null default '[]'::jsonb check (jsonb_typeof(unknowns) = 'array' and jsonb_array_length(unknowns) <= 30),
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 3),
  context text not null default '' check (length(context) <= 10000),
  user_hypothesis text not null default '' check (length(user_hypothesis) <= 3000),
  hypotheses jsonb not null default '[]'::jsonb check (jsonb_typeof(hypotheses) = 'array' and jsonb_array_length(hypotheses) <= 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index events_user_created_idx on public.events(user_id, created_at desc);

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  user_id uuid not null,
  text text not null check (length(btrim(text)) between 1 and 500),
  probability integer not null check (probability between 0 and 100),
  criteria text not null check (length(btrim(criteria)) between 1 and 500),
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (event_id, user_id) references public.events(id, user_id) on delete cascade
);

create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null unique references public.predictions(id) on delete cascade,
  event_id uuid not null unique,
  user_id uuid not null,
  result text not null check (result in ('occurred','not_occurred','unknown')),
  notes text not null default '' check (length(notes) <= 5000),
  intervention text not null default '' check (length(intervention) <= 5000),
  created_at timestamptz not null default now(),
  foreign key (event_id, user_id) references public.events(id, user_id) on delete cascade
);

create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  user_id uuid not null,
  lesson text not null check (length(btrim(lesson)) between 1 and 10000),
  well_founded text not null default '' check (length(well_founded) <= 10000),
  overreach text not null default '' check (length(overreach) <= 10000),
  missing text not null default '' check (length(missing) <= 10000),
  created_at timestamptz not null default now(),
  foreign key (event_id, user_id) references public.events(id, user_id) on delete cascade
);

create table public.event_revisions (
  id bigint generated always as identity primary key,
  event_id uuid not null,
  user_id uuid not null,
  revision integer not null,
  event_version integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (event_id, user_id) references public.events(id, user_id) on delete cascade,
  unique (event_id, revision)
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  user_id uuid not null,
  request_id uuid not null,
  stage text not null check (stage in ('organize','hypotheses','prediction','reflection')),
  status text not null default 'running' check (status in ('running','succeeded','failed','expired')),
  input_version integer not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  model text not null,
  prompt_version text not null,
  output jsonb,
  error_code text,
  deadline_at timestamptz not null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (event_id, user_id) references public.events(id, user_id) on delete cascade,
  unique (user_id, request_id, stage)
);

create index agent_runs_user_created_idx on public.agent_runs(user_id, created_at desc);
create index agent_runs_active_idx on public.agent_runs(user_id, deadline_at) where status = 'running';

-- This admission ledger intentionally has no event foreign key. Deleting private
-- content cannot erase already consumed quota.
create table public.ai_usage_starts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null unique,
  event_id uuid not null,
  started_at timestamptz not null default now(),
  reservation_until timestamptz not null
);
create index ai_usage_user_day_idx on public.ai_usage_starts(user_id, started_at);

create table public.idempotency_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  request_id uuid not null,
  event_id uuid,
  expected_version integer,
  payload_hash text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, action, request_id)
);

create or replace function public.valid_string_array(
  p_value jsonb, p_max_items integer, p_max_length integer
) returns boolean language plpgsql immutable parallel safe
set search_path = pg_catalog as $$
begin
  if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > p_max_items then
    return false;
  end if;
  return not exists (
    select 1 from jsonb_array_elements(p_value) as item
    where jsonb_typeof(item) <> 'string' or length(item #>> '{}') > p_max_length
  );
end
$$;

create or replace function public.valid_hypotheses(p_value jsonb)
returns boolean language plpgsql immutable parallel safe
set search_path = pg_catalog as $$
declare item jsonb;
begin
  if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) > 3 then
    return false;
  end if;
  for item in select value from jsonb_array_elements(p_value) loop
    if jsonb_typeof(item) <> 'object'
       or not (item ?& array['text','evidence','missing'])
       or (select count(*) from jsonb_object_keys(item)) <> 3
       or jsonb_typeof(item->'text') <> 'string'
       or jsonb_typeof(item->'evidence') <> 'string'
       or jsonb_typeof(item->'missing') <> 'string'
       or length(btrim(item->>'text')) not between 1 and 500
       or length(item->>'evidence') > 1000
       or length(item->>'missing') > 1000 then
      return false;
    end if;
  end loop;
  return true;
end
$$;

alter table public.events
  add constraint events_facts_items check (public.valid_string_array(facts,30,500)),
  add constraint events_inferences_items check (public.valid_string_array(inferences,30,500)),
  add constraint events_unknowns_items check (public.valid_string_array(unknowns,30,500)),
  add constraint events_questions_items check (public.valid_string_array(questions,3,500)),
  add constraint events_hypotheses_shape check (public.valid_hypotheses(hypotheses));

alter table public.events enable row level security;
alter table public.predictions enable row level security;
alter table public.outcomes enable row level security;
alter table public.reflections enable row level security;
alter table public.event_revisions enable row level security;
alter table public.agent_runs enable row level security;
alter table public.ai_usage_starts enable row level security;
alter table public.idempotency_keys enable row level security;

create policy events_read_own on public.events for select to authenticated using (user_id = (select auth.uid()));
create policy predictions_read_own on public.predictions for select to authenticated using (user_id = (select auth.uid()));
create policy outcomes_read_own on public.outcomes for select to authenticated using (user_id = (select auth.uid()));
create policy reflections_read_own on public.reflections for select to authenticated using (user_id = (select auth.uid()));
create policy revisions_read_own on public.event_revisions for select to authenticated using (user_id = (select auth.uid()));
create policy runs_read_own on public.agent_runs for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.events, public.predictions, public.outcomes, public.reflections,
  public.event_revisions, public.agent_runs, public.ai_usage_starts, public.idempotency_keys
  from anon, authenticated;
grant select on public.events, public.predictions, public.outcomes, public.reflections,
  public.event_revisions, public.agent_runs to authenticated;

create or replace function public.require_uid()
returns uuid language plpgsql stable security definer
set search_path = pg_catalog, public, auth as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  return v_uid;
end $$;

create or replace function public.claim_idempotency(
  p_action text, p_request_id uuid, p_event_id uuid, p_expected_version integer, p_payload jsonb
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth, extensions as $$
declare
  v_uid uuid := public.require_uid();
  v_hash text := encode(extensions.digest(p_payload::text, 'sha256'), 'hex');
  v_row public.idempotency_keys%rowtype;
begin
  insert into public.idempotency_keys(user_id, action, request_id, event_id, expected_version, payload_hash)
  values (v_uid, p_action, p_request_id, p_event_id, p_expected_version, v_hash)
  on conflict do nothing;

  select * into v_row from public.idempotency_keys
    where user_id = v_uid and action = p_action and request_id = p_request_id
    for update;
  if v_row.payload_hash <> v_hash
     or v_row.event_id is distinct from p_event_id
     or v_row.expected_version is distinct from p_expected_version then
    raise exception 'idempotency key reused with different parameters' using errcode = 'P0001';
  end if;
  if v_row.response is not null then return v_row.response; end if;
  return null;
end $$;

create or replace function public.complete_idempotency(
  p_action text, p_request_id uuid, p_response jsonb
) returns void language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
begin
  update public.idempotency_keys set response = p_response
   where user_id = public.require_uid() and action = p_action and request_id = p_request_id;
  if not found then raise exception 'idempotency claim missing' using errcode = 'P0001'; end if;
end $$;

create or replace function public.snapshot_event(p_event_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare v_event public.events%rowtype; v_revision integer;
begin
  select * into v_event from public.events
   where id = p_event_id and user_id = public.require_uid();
  if not found then raise exception 'event not found' using errcode = 'P0002'; end if;
  select coalesce(max(revision), 0) + 1 into v_revision
    from public.event_revisions where event_id = p_event_id;
  insert into public.event_revisions(event_id, user_id, revision, event_version, snapshot)
  values (v_event.id, v_event.user_id, v_revision, v_event.version, to_jsonb(v_event));
end $$;

create or replace function public.create_event(p_payload jsonb, p_request_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare v_uid uuid := public.require_uid(); v_id uuid; v_replay jsonb; v_response jsonb;
begin
  v_replay := public.claim_idempotency('create_event', p_request_id, null, null, p_payload);
  if v_replay is not null then return v_replay; end if;
  if jsonb_typeof(p_payload) <> 'object'
     or nullif(btrim(p_payload->>'title'),'') is null
     or nullif(btrim(p_payload->>'rawText'),'') is null
     or p_payload->>'category' not in ('work','relationship','family','other')
     or length(p_payload->>'title') > 200 or length(p_payload->>'rawText') > 10000 then
    raise exception 'invalid event payload' using errcode = '22023';
  end if;
  insert into public.events(user_id,title,raw_text,category)
  values(v_uid,btrim(p_payload->>'title'),btrim(p_payload->>'rawText'),p_payload->>'category')
  returning id into v_id;
  perform public.snapshot_event(v_id);
  v_response := jsonb_build_object('id', v_id);
  perform public.complete_idempotency('create_event', p_request_id, v_response);
  return v_response;
end $$;

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

create or replace function public.delete_event(p_event_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare v_uid uuid:=public.require_uid(); v_replay jsonb; v_response jsonb:=jsonb_build_object('id',p_event_id);
begin
  v_replay:=public.claim_idempotency('delete_event',p_request_id,p_event_id,null,v_response);
  if v_replay is not null then return v_replay; end if;
  delete from public.events where id=p_event_id and user_id=v_uid;
  if not found then raise exception 'event not found' using errcode='P0002'; end if;
  perform public.complete_idempotency('delete_event',p_request_id,v_response);
  return v_response;
end $$;

create or replace function public.submit_prediction(
  p_event_id uuid, p_expected_version integer, p_request_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare v_uid uuid:=public.require_uid(); v_event public.events%rowtype; v_replay jsonb; v_response jsonb; v_id uuid;
begin
  v_replay:=public.claim_idempotency('submit_prediction',p_request_id,p_event_id,p_expected_version,p_payload);
  if v_replay is not null then return v_replay; end if;
  select * into v_event from public.events where id=p_event_id and user_id=v_uid for update;
  if not found then raise exception 'event not found' using errcode='P0002'; end if;
  if v_event.version<>p_expected_version then raise exception 'version conflict' using errcode='40001'; end if;
  if nullif(btrim(v_event.user_hypothesis),'') is null then
    raise exception 'hypothesis required before prediction' using errcode='P0001';
  end if;
  if (p_payload->>'probability')::integer not between 0 and 100
     or (p_payload->>'dueAt')::timestamptz <= now()
     or nullif(btrim(p_payload->>'text'),'') is null
     or nullif(btrim(p_payload->>'criteria'),'') is null then
    raise exception 'invalid prediction' using errcode='22023';
  end if;
  insert into public.predictions(event_id,user_id,text,probability,criteria,due_at)
  values(p_event_id,v_uid,btrim(p_payload->>'text'),(p_payload->>'probability')::integer,
    btrim(p_payload->>'criteria'),(p_payload->>'dueAt')::timestamptz) returning id into v_id;
  update public.events set status='predicted',version=version+1,updated_at=now() where id=p_event_id and user_id=v_uid;
  perform public.snapshot_event(p_event_id);
  v_response:=jsonb_build_object('id',p_event_id,'predictionId',v_id);
  perform public.complete_idempotency('submit_prediction',p_request_id,v_response);
  return v_response;
end $$;

create or replace function public.record_outcome(
  p_event_id uuid, p_expected_version integer, p_request_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare v_uid uuid:=public.require_uid(); v_event public.events%rowtype; v_prediction uuid; v_replay jsonb; v_response jsonb;
begin
  v_replay:=public.claim_idempotency('record_outcome',p_request_id,p_event_id,p_expected_version,p_payload);
  if v_replay is not null then return v_replay; end if;
  select * into v_event from public.events where id=p_event_id and user_id=v_uid for update;
  if not found then raise exception 'event not found' using errcode='P0002'; end if;
  if v_event.version<>p_expected_version then raise exception 'version conflict' using errcode='40001'; end if;
  select id into v_prediction from public.predictions where event_id=p_event_id and user_id=v_uid;
  if v_prediction is null then raise exception 'prediction required before outcome' using errcode='P0001'; end if;
  if p_payload->>'result' not in ('occurred','not_occurred','unknown') then
    raise exception 'invalid outcome' using errcode='22023';
  end if;
  insert into public.outcomes(prediction_id,event_id,user_id,result,notes,intervention)
  values(v_prediction,p_event_id,v_uid,p_payload->>'result',coalesce(p_payload->>'notes',''),coalesce(p_payload->>'intervention',''));
  update public.events set version=version+1,updated_at=now() where id=p_event_id and user_id=v_uid;
  perform public.snapshot_event(p_event_id);
  v_response:=jsonb_build_object('id',p_event_id);
  perform public.complete_idempotency('record_outcome',p_request_id,v_response);
  return v_response;
end $$;

create or replace function public.save_reflection(
  p_event_id uuid, p_expected_version integer, p_request_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare v_uid uuid:=public.require_uid(); v_event public.events%rowtype; v_replay jsonb; v_response jsonb;
begin
  v_replay:=public.claim_idempotency('save_reflection',p_request_id,p_event_id,p_expected_version,p_payload);
  if v_replay is not null then return v_replay; end if;
  select * into v_event from public.events where id=p_event_id and user_id=v_uid for update;
  if not found then raise exception 'event not found' using errcode='P0002'; end if;
  if v_event.version<>p_expected_version then raise exception 'version conflict' using errcode='40001'; end if;
  if not exists(select 1 from public.outcomes where event_id=p_event_id and user_id=v_uid) then
    raise exception 'outcome required before reflection' using errcode='P0001';
  end if;
  if nullif(btrim(p_payload->>'lesson'),'') is null then raise exception 'lesson required' using errcode='22023'; end if;
  insert into public.reflections(event_id,user_id,lesson,well_founded,overreach,missing)
  values(p_event_id,v_uid,btrim(p_payload->>'lesson'),coalesce(p_payload->>'wellFounded',''),
    coalesce(p_payload->>'overreach',''),coalesce(p_payload->>'missing',''));
  update public.events set status='completed',version=version+1,updated_at=now() where id=p_event_id and user_id=v_uid;
  perform public.snapshot_event(p_event_id);
  v_response:=jsonb_build_object('id',p_event_id);
  perform public.complete_idempotency('save_reflection',p_request_id,v_response);
  return v_response;
end $$;

create or replace function public.expire_ai_runs()
returns integer language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare v_count integer;
begin
  update public.agent_runs set status='expired',error_code='RUN_EXPIRED',finished_at=now()
   where user_id=public.require_uid() and status='running' and deadline_at<=now();
  get diagnostics v_count=row_count;
  return v_count;
end $$;

create or replace function public.start_ai_run(
  p_event_id uuid, p_expected_version integer, p_request_id uuid, p_stage text,
  p_input_hash text, p_model text, p_prompt_version text, p_consent boolean
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare
  v_uid uuid:=public.require_uid(); v_event public.events%rowtype; v_existing public.agent_runs%rowtype;
  v_run uuid:=gen_random_uuid(); v_daily integer; v_active integer; v_global integer;
begin
  if p_consent is distinct from true then raise exception 'AI consent required' using errcode='P0001'; end if;
  -- Lock globally first, then by user, so every admission observes the same
  -- global/user reservation order and cannot oversubscribe provider credits.
  perform pg_advisory_xact_lock(90420260322);
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  perform public.expire_ai_runs();
  select * into v_existing from public.agent_runs
   where user_id=v_uid and request_id=p_request_id and stage=p_stage;
  if found then
    if v_existing.event_id<>p_event_id or v_existing.input_version<>p_expected_version
       or v_existing.input_hash<>p_input_hash then
      raise exception 'idempotency key reused with different parameters' using errcode='P0001';
    end if;
    return jsonb_build_object('id',v_existing.id,'status',v_existing.status,
      'output',v_existing.output,'error_code',v_existing.error_code,'admitted',false);
  end if;
  select * into v_event from public.events where id=p_event_id and user_id=v_uid for update;
  if not found then raise exception 'event not found' using errcode='P0002'; end if;
  if v_event.version<>p_expected_version then raise exception 'version conflict' using errcode='40001'; end if;
  if p_stage in ('organize','hypotheses','prediction')
     and exists(select 1 from public.predictions where event_id=p_event_id and user_id=v_uid) then
    raise exception 'event snapshot is locked after prediction' using errcode='P0001';
  end if;
  if p_stage='reflection' and v_event.status='completed' then
    raise exception 'reflection already completed' using errcode='P0001';
  end if;
  if p_stage in ('hypotheses','prediction') and nullif(btrim(v_event.user_hypothesis),'') is null then
    raise exception 'user hypothesis required for this stage' using errcode='P0001';
  end if;
  if p_stage='reflection' and not exists(select 1 from public.outcomes where event_id=p_event_id and user_id=v_uid) then
    raise exception 'outcome required for reflection' using errcode='P0001';
  end if;
  select count(*) into v_daily from public.ai_usage_starts
   where user_id=v_uid
     and started_at >= (date_trunc('day',now() at time zone 'UTC') at time zone 'UTC');
  if v_daily>=20 then raise exception 'daily AI limit reached' using errcode='P0001'; end if;
  select count(*) into v_global from public.ai_usage_starts
   where started_at >= (date_trunc('day',now() at time zone 'UTC') at time zone 'UTC');
  if v_global>=200 then raise exception 'global daily AI limit reached' using errcode='P0001'; end if;
  select count(*) into v_active from public.ai_usage_starts
   where user_id=v_uid and reservation_until>now();
  if v_active>=1 then raise exception 'another AI run is active' using errcode='P0001'; end if;
  select count(*) into v_global from public.ai_usage_starts where reservation_until>now();
  if v_global>=5 then raise exception 'global AI concurrency limit reached' using errcode='P0001'; end if;
  insert into public.agent_runs(id,event_id,user_id,request_id,stage,input_version,input_hash,model,prompt_version,deadline_at)
  values(v_run,p_event_id,v_uid,p_request_id,p_stage,p_expected_version,p_input_hash,p_model,p_prompt_version,now()+interval '75 seconds');
  insert into public.ai_usage_starts(user_id,run_id,event_id,reservation_until)
  values(v_uid,v_run,p_event_id,now()+interval '75 seconds');
  return jsonb_build_object('id',v_run,'status','running','output',null,'error_code',null,'admitted',true);
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
  end if;
  select * into v_run from public.agent_runs where id=p_run_id;
  return jsonb_build_object('id',v_run.id,'status',v_run.status,'output',v_run.output,'error_code',v_run.error_code);
end $$;

revoke all on function public.require_uid() from public, anon, authenticated;
revoke all on function public.claim_idempotency(text,uuid,uuid,integer,jsonb) from public, anon, authenticated;
revoke all on function public.complete_idempotency(text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.snapshot_event(uuid) from public, anon, authenticated;
revoke all on function public.valid_string_array(jsonb,integer,integer) from public, anon, authenticated;
revoke all on function public.valid_hypotheses(jsonb) from public, anon, authenticated;

revoke all on function public.create_event(jsonb,uuid) from public, anon;
revoke all on function public.update_event(uuid,integer,jsonb,uuid) from public, anon;
revoke all on function public.delete_event(uuid,uuid) from public, anon;
revoke all on function public.submit_prediction(uuid,integer,uuid,jsonb) from public, anon;
revoke all on function public.record_outcome(uuid,integer,uuid,jsonb) from public, anon;
revoke all on function public.save_reflection(uuid,integer,uuid,jsonb) from public, anon;
revoke all on function public.expire_ai_runs() from public, anon;
revoke all on function public.start_ai_run(uuid,integer,uuid,text,text,text,text,boolean) from public, anon;
revoke all on function public.finish_ai_run(uuid,jsonb,text,text) from public, anon;

grant execute on function public.create_event(jsonb,uuid) to authenticated;
grant execute on function public.update_event(uuid,integer,jsonb,uuid) to authenticated;
grant execute on function public.delete_event(uuid,uuid) to authenticated;
grant execute on function public.submit_prediction(uuid,integer,uuid,jsonb) to authenticated;
grant execute on function public.record_outcome(uuid,integer,uuid,jsonb) to authenticated;
grant execute on function public.save_reflection(uuid,integer,uuid,jsonb) to authenticated;
grant execute on function public.expire_ai_runs() to authenticated;
grant execute on function public.start_ai_run(uuid,integer,uuid,text,text,text,text,boolean) to authenticated;
grant execute on function public.finish_ai_run(uuid,jsonb,text,text) to authenticated;

commit;