# Trends Closed Beta Operations

This runbook is for the invited beta. Do not apply a new migration or deploy the beta branch to production without explicit approval.

## Release Order

1. Confirm the production backup and the current Vercel rollback target.
2. Review `supabase/migrations/20260901114459_beta_readiness_controls.sql`.
3. Apply the migration to Supabase.
4. In Supabase Dashboard, open `Authentication > Hooks > Before User Created`.
5. Select the Postgres function `private.hook_restrict_beta_signups` and enable it.
6. Add three test emails to the invite list before testing sign-up.
7. Test the database and Auth hook before deploying the website.
8. Deploy the website branch and verify the build ID.
9. Keep the previous Vercel deployment available until the smoke test passes.

## Invite Management

Use `アカウント > 運営コンソール > 招待` for normal invite management. Run the
queries below only as a fallback in the Supabase SQL Editor. Never commit real email
addresses.

Add or renew an invite:

```sql
insert into private.beta_signup_allowlist (email, status, expires_at, note)
values (lower(trim('INVITED_EMAIL')), 'active', now() + interval '30 days', 'closed beta')
on conflict (email) do update
set status = 'active',
    expires_at = excluded.expires_at,
    note = excluded.note,
    updated_at = now();
```

Revoke an invite:

```sql
update private.beta_signup_allowlist
set status = 'revoked', updated_at = now()
where email = lower(trim('INVITED_EMAIL'));
```

List active invites without showing full addresses in screenshots:

```sql
select left(email, 2) || '***@' || split_part(email, '@', 2) as masked_email,
       expires_at,
       created_at
from private.beta_signup_allowlist
where status = 'active'
order by created_at desc;
```

## Daily Review

Review feedback:

```sql
select id, category, message, page, build_version, created_at
from public.beta_feedback
order by created_at desc
limit 100;
```

Review unresolved reports:

```sql
select id, target_type, target_id, target_user_id, reason, details, status, created_at
from public.content_reports
where status in ('pending', 'reviewing')
order by created_at asc;
```

Review recent runtime errors without collecting post or DM text:

```sql
select metadata ->> 'type' as error_type,
       metadata ->> 'message' as message,
       metadata ->> 'build' as build,
       count(*) as occurrences,
       max(created_at) as last_seen
from public.app_events
where event_name = 'runtime_error'
  and created_at >= now() - interval '7 days'
group by 1, 2, 3
order by occurrences desc, last_seen desc;
```

## Beta Metrics

Weekly activation funnel:

```sql
select event_name,
       count(*) as events,
       count(distinct user_id) as users
from public.app_events
where created_at >= now() - interval '7 days'
  and event_name in (
    'session_started',
    'login_succeeded',
    'post_created',
    'comment_created',
    'follow_created',
    'feedback_submitted'
  )
group by event_name
order by event_name;
```

Registrations and returning users:

```sql
select
  (select count(*) from auth.users where created_at >= now() - interval '7 days') as registrations_7d,
  count(distinct user_id) filter (
    where event_name = 'session_started'
      and created_at >= now() - interval '7 days'
  ) as active_users_7d,
  count(distinct user_id) filter (
    where event_name = 'session_started'
      and created_at >= now() - interval '14 days'
      and created_at < now() - interval '7 days'
  ) as prior_active_users_7d
from public.app_events;
```

## Three-Account Acceptance Test

Use three invited accounts: one existing account and two newly created accounts. Test on desktop Chrome and one real mobile browser.

- Unknown email is rejected by the Auth hook.
- Invited email can sign up, confirm email, log in, log out, and reset password.
- Profile text, avatar, and banner can be added and edited.
- Text, image, standard video, short video, and workout posts can be created.
- Post detail opens from both `写真を見る` and `投稿を見る`.
- Like, unlike, comment, reply, follow, and unfollow work across accounts.
- Notifications appear for like, comment, and follow.
- DM send, receive, unread, image send, report, and block work across accounts.
- Reporting a comment creates a `content_reports` row.
- Blocking removes the relationship and hides content and DM access.
- A moderator can hide and restore a test post by following `MODERATION.md`.
- Feedback submission appears in `beta_feedback`.
- Post deletion removes associated content and media references.
- Account deletion completes and the deleted account cannot log in.
- No new console errors appear during the complete flow.

## Before Inviting Real Users

- Replace the temporary recruitment route with a real operator-owned contact or application form.
- Publish the operator name and a working privacy/account support contact.
- Have the Japanese Terms and Privacy Policy reviewed for the actual operator and business model.
- Before paid Pro or gym promotion sales, publish a legally reviewed commerce disclosure, prices, cancellation terms, and billing support route.
- Confirm Supabase backup/PITR availability for the current plan and document the restore owner.
- Prepare at least 30 useful posts and a weekly posting prompt.
- Name one person responsible for daily reports and one person for incident rollback.
