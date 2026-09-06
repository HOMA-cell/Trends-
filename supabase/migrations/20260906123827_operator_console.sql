-- Private operator roles plus audited, narrowly scoped RPCs for beta operations.

create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.operator_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'moderator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operator_roles_role_check
    check (role in ('owner', 'moderator'))
);

create table if not exists private.operator_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint operator_audit_action_check
    check (action ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint operator_audit_metadata_check
    check (jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096)
);

create index if not exists operator_audit_created_idx
  on private.operator_audit_log (created_at desc);
create index if not exists operator_audit_actor_created_idx
  on private.operator_audit_log (actor_id, created_at desc)
  where actor_id is not null;

alter table private.operator_roles enable row level security;
alter table private.operator_audit_log enable row level security;

revoke all on table private.operator_roles
  from public, anon, authenticated;
revoke all on table private.operator_audit_log
  from public, anon, authenticated;

alter table public.beta_feedback
  add column if not exists status text not null default 'pending';
alter table public.beta_feedback
  add column if not exists reviewed_at timestamptz;
alter table public.beta_feedback
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'beta_feedback_status_check'
      and conrelid = 'public.beta_feedback'::regclass
  ) then
    alter table public.beta_feedback
      add constraint beta_feedback_status_check
      check (status in ('pending', 'reviewing', 'resolved', 'dismissed'));
  end if;
end;
$$;

create index if not exists beta_feedback_status_created_idx
  on public.beta_feedback (status, created_at desc);
create index if not exists beta_feedback_reviewed_by_idx
  on public.beta_feedback (reviewed_by)
  where reviewed_by is not null;

create or replace function private.require_operator(required_role text default 'moderator')
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_role text;
begin
  if (select auth.uid()) is null then
    raise exception 'operator_authentication_required' using errcode = '42501';
  end if;

  select operator_role.role
    into current_role
  from private.operator_roles operator_role
  where operator_role.user_id = (select auth.uid());

  if current_role is null then
    raise exception 'operator_access_required' using errcode = '42501';
  end if;

  if required_role = 'owner' and current_role <> 'owner' then
    raise exception 'operator_owner_required' using errcode = '42501';
  end if;

  return current_role;
end;
$$;

revoke all on function private.require_operator(text)
  from public, anon, authenticated;

create or replace function public.get_my_operator_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select operator_role.role
  from private.operator_roles operator_role
  where operator_role.user_id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.get_my_operator_role()
  from public, anon;
grant execute on function public.get_my_operator_role()
  to authenticated;

create or replace function public.operator_dashboard_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_role text;
begin
  current_role := private.require_operator('moderator');

  return jsonb_build_object(
    'role', current_role,
    'pending_reports', (
      select count(*)
      from public.content_reports report
      where report.status in ('pending', 'reviewing')
    ),
    'pending_feedback', (
      select count(*)
      from public.beta_feedback feedback
      where feedback.status in ('pending', 'reviewing')
    ),
    'active_invites', (
      select count(*)
      from private.beta_signup_allowlist invite
      where invite.status = 'active'
        and (invite.expires_at is null or invite.expires_at > now())
    ),
    'runtime_errors_24h', (
      select count(*)
      from public.app_events event
      where event.event_name = 'runtime_error'
        and event.created_at >= now() - interval '24 hours'
    ),
    'active_users_7d', (
      select count(distinct event.user_id)
      from public.app_events event
      where event.event_name = 'session_started'
        and event.created_at >= now() - interval '7 days'
    ),
    'posts_7d', (
      select count(*)
      from public.posts post
      where post.created_at >= now() - interval '7 days'
    ),
    'generated_at', now()
  );
end;
$$;

revoke all on function public.operator_dashboard_snapshot()
  from public, anon;
grant execute on function public.operator_dashboard_snapshot()
  to authenticated;

create or replace function public.operator_list_reports(
  requested_status text default 'open',
  requested_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_limit integer := least(greatest(coalesce(requested_limit, 50), 1), 100);
  result jsonb;
begin
  perform private.require_operator('moderator');

  if requested_status not in ('open', 'all', 'pending', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'invalid_report_status' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(queue_row) order by queue_row.created_at asc), '[]'::jsonb)
    into result
  from (
    select
      report.id,
      report.target_type,
      report.target_id,
      report.target_user_id,
      report.reason,
      report.details,
      report.status,
      report.created_at,
      report.reviewed_at,
      coalesce(target_profile.display_name, target_profile.handle, 'Unknown') as target_name,
      target_profile.handle as target_handle,
      coalesce(reporter_profile.display_name, reporter_profile.handle, 'Unknown') as reporter_name,
      moderation.state as moderation_state
    from public.content_reports report
    left join public.profiles target_profile
      on target_profile.id = report.target_user_id
    left join public.profiles reporter_profile
      on reporter_profile.id = report.reporter_id
    left join private.content_moderation moderation
      on moderation.target_type = report.target_type
     and moderation.target_id = report.target_id
    where requested_status = 'all'
       or (requested_status = 'open' and report.status in ('pending', 'reviewing'))
       or report.status = requested_status
    order by report.created_at asc
    limit safe_limit
  ) queue_row;

  return result;
end;
$$;

revoke all on function public.operator_list_reports(text, integer)
  from public, anon;
grant execute on function public.operator_list_reports(text, integer)
  to authenticated;

create or replace function public.operator_update_report(
  requested_report_id uuid,
  requested_status text,
  requested_moderation_state text default null,
  requested_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_row public.content_reports%rowtype;
  clean_note text := nullif(trim(coalesce(requested_note, '')), '');
begin
  perform private.require_operator('moderator');

  if requested_status not in ('pending', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'invalid_report_status' using errcode = '22023';
  end if;

  if requested_moderation_state is not null
     and requested_moderation_state not in ('hidden', 'visible') then
    raise exception 'invalid_moderation_state' using errcode = '22023';
  end if;

  select *
    into report_row
  from public.content_reports report
  where report.id = requested_report_id
  for update;

  if not found then
    raise exception 'report_not_found' using errcode = 'P0002';
  end if;

  if requested_moderation_state is not null then
    if report_row.target_type not in ('post', 'comment') then
      raise exception 'moderation_state_not_supported_for_target' using errcode = '22023';
    end if;
    if clean_note is null or char_length(clean_note) not between 3 and 500 then
      raise exception 'moderation_note_required' using errcode = '22023';
    end if;

    insert into private.content_moderation (
      target_type,
      target_id,
      state,
      reason,
      moderator_id
    ) values (
      report_row.target_type,
      report_row.target_id,
      requested_moderation_state,
      clean_note,
      (select auth.uid())
    )
    on conflict (target_type, target_id) do update
    set state = excluded.state,
        reason = excluded.reason,
        moderator_id = excluded.moderator_id,
        updated_at = now();
  end if;

  update public.content_reports
  set status = requested_status,
      reviewed_at = case
        when requested_status in ('resolved', 'dismissed') then now()
        else null
      end
  where id = requested_report_id;

  insert into private.operator_audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    (select auth.uid()),
    'report_updated',
    report_row.target_type,
    report_row.target_id::text,
    jsonb_build_object(
      'report_id', requested_report_id,
      'status', requested_status,
      'moderation_state', requested_moderation_state
    )
  );

  return jsonb_build_object(
    'ok', true,
    'report_id', requested_report_id,
    'status', requested_status,
    'moderation_state', requested_moderation_state
  );
end;
$$;

revoke all on function public.operator_update_report(uuid, text, text, text)
  from public, anon;
grant execute on function public.operator_update_report(uuid, text, text, text)
  to authenticated;

create or replace function public.operator_list_feedback(requested_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_limit integer := least(greatest(coalesce(requested_limit, 50), 1), 100);
  result jsonb;
begin
  perform private.require_operator('moderator');

  select coalesce(jsonb_agg(to_jsonb(queue_row) order by queue_row.created_at desc), '[]'::jsonb)
    into result
  from (
    select
      feedback.id,
      feedback.category,
      feedback.message,
      feedback.page,
      feedback.build_version,
      feedback.status,
      feedback.created_at,
      feedback.reviewed_at,
      coalesce(profile.display_name, profile.handle, 'Unknown') as user_name,
      profile.handle as user_handle
    from public.beta_feedback feedback
    left join public.profiles profile on profile.id = feedback.user_id
    order by
      case when feedback.status in ('pending', 'reviewing') then 0 else 1 end,
      feedback.created_at desc
    limit safe_limit
  ) queue_row;

  return result;
end;
$$;

revoke all on function public.operator_list_feedback(integer)
  from public, anon;
grant execute on function public.operator_list_feedback(integer)
  to authenticated;

create or replace function public.operator_update_feedback(
  requested_feedback_id uuid,
  requested_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_operator('moderator');

  if requested_status not in ('pending', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'invalid_feedback_status' using errcode = '22023';
  end if;

  update public.beta_feedback
  set status = requested_status,
      reviewed_at = case
        when requested_status in ('resolved', 'dismissed') then now()
        else null
      end,
      reviewed_by = (select auth.uid())
  where id = requested_feedback_id;

  if not found then
    raise exception 'feedback_not_found' using errcode = 'P0002';
  end if;

  insert into private.operator_audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    (select auth.uid()),
    'feedback_updated',
    'feedback',
    requested_feedback_id::text,
    jsonb_build_object('status', requested_status)
  );

  return jsonb_build_object(
    'ok', true,
    'feedback_id', requested_feedback_id,
    'status', requested_status
  );
end;
$$;

revoke all on function public.operator_update_feedback(uuid, text)
  from public, anon;
grant execute on function public.operator_update_feedback(uuid, text)
  to authenticated;

create or replace function public.operator_list_invites(requested_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_limit integer := least(greatest(coalesce(requested_limit, 100), 1), 200);
  result jsonb;
begin
  perform private.require_operator('owner');

  select coalesce(jsonb_agg(to_jsonb(invite_row) order by invite_row.created_at desc), '[]'::jsonb)
    into result
  from (
    select
      invite.email,
      invite.status,
      invite.expires_at,
      invite.note,
      invite.created_at,
      invite.updated_at
    from private.beta_signup_allowlist invite
    order by invite.created_at desc
    limit safe_limit
  ) invite_row;

  return result;
end;
$$;

revoke all on function public.operator_list_invites(integer)
  from public, anon;
grant execute on function public.operator_list_invites(integer)
  to authenticated;

create or replace function public.operator_upsert_invite(
  requested_email text,
  requested_expires_days integer default 30,
  requested_note text default 'closed beta'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(coalesce(requested_email, '')));
  safe_days integer := least(greatest(coalesce(requested_expires_days, 30), 1), 365);
  clean_note text := nullif(trim(coalesce(requested_note, '')), '');
  invite_row private.beta_signup_allowlist%rowtype;
begin
  perform private.require_operator('owner');

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or char_length(normalized_email) > 320 then
    raise exception 'invalid_invite_email' using errcode = '22023';
  end if;

  if clean_note is not null and char_length(clean_note) > 500 then
    raise exception 'invite_note_too_long' using errcode = '22023';
  end if;

  insert into private.beta_signup_allowlist (
    email,
    status,
    expires_at,
    invited_by,
    note
  ) values (
    normalized_email,
    'active',
    now() + make_interval(days => safe_days),
    (select auth.uid()),
    clean_note
  )
  on conflict (email) do update
  set status = 'active',
      expires_at = excluded.expires_at,
      invited_by = excluded.invited_by,
      note = excluded.note,
      updated_at = now()
  returning * into invite_row;

  insert into private.operator_audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    (select auth.uid()),
    'invite_upserted',
    'beta_invite',
    encode(digest(normalized_email, 'sha256'), 'hex'),
    jsonb_build_object('expires_days', safe_days)
  );

  return jsonb_build_object(
    'ok', true,
    'email', invite_row.email,
    'status', invite_row.status,
    'expires_at', invite_row.expires_at
  );
end;
$$;

revoke all on function public.operator_upsert_invite(text, integer, text)
  from public, anon;
grant execute on function public.operator_upsert_invite(text, integer, text)
  to authenticated;

create or replace function public.operator_revoke_invite(requested_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(coalesce(requested_email, '')));
begin
  perform private.require_operator('owner');

  update private.beta_signup_allowlist
  set status = 'revoked',
      updated_at = now()
  where email = normalized_email;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;

  insert into private.operator_audit_log (
    actor_id,
    action,
    target_type,
    target_id
  ) values (
    (select auth.uid()),
    'invite_revoked',
    'beta_invite',
    encode(digest(normalized_email, 'sha256'), 'hex')
  );

  return jsonb_build_object('ok', true, 'email', normalized_email, 'status', 'revoked');
end;
$$;

revoke all on function public.operator_revoke_invite(text)
  from public, anon;
grant execute on function public.operator_revoke_invite(text)
  to authenticated;

notify pgrst, 'reload schema';

-- Bootstrap exactly one owner after applying this migration. Keep the email out
-- of version control and run this once in the SQL Editor:
-- insert into private.operator_roles (user_id, role)
-- select id, 'owner' from auth.users where lower(email) = lower('OWNER_EMAIL')
-- on conflict (user_id) do update set role = 'owner', updated_at = now();
