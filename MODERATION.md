# Trends Moderation Runbook

Use `アカウント > 運営コンソール > 通報` for normal triage. Its actions are
authorized by Postgres and recorded in the private audit log. Use the SQL below only
as an incident-response fallback when the console is unavailable.

## Triage A Report

Mark a report under review:

```sql
update public.content_reports
set status = 'reviewing'
where id = 'REPORT_ID'
  and status = 'pending';
```

Confirm the target exists before taking action:

```sql
select id, user_id, caption, media_type, media_url, created_at
from public.posts
where id = 'TARGET_ID';
```

For comments:

```sql
select id, post_id, user_id, body, created_at
from public.comments
where id = 'TARGET_ID';
```

## Hide Content

Hide a post or comment without letting its owner restore visibility:

```sql
insert into private.content_moderation (target_type, target_id, state, reason)
values ('post', 'TARGET_ID', 'hidden', 'REPORT_ID: concise operator reason')
on conflict (target_type, target_id) do update
set state = 'hidden',
    reason = excluded.reason,
    updated_at = now();
```

Use `comment` instead of `post` for a comment. Verify from a signed-out browser and a normal test account after hiding.

## Restore Content

```sql
update private.content_moderation
set state = 'visible',
    reason = 'Restored after review: REPORT_ID',
    updated_at = now()
where target_type = 'post'
  and target_id = 'TARGET_ID';
```

## Close A Report

Resolve after action:

```sql
update public.content_reports
set status = 'resolved', reviewed_at = now()
where id = 'REPORT_ID';
```

Dismiss when no violation is found:

```sql
update public.content_reports
set status = 'dismissed', reviewed_at = now()
where id = 'REPORT_ID';
```

## Escalation Rules

- Preserve the report ID, target ID, timestamps, and a short operator reason.
- Do not download or redistribute intimate, illegal, or suspected child sexual abuse material.
- For immediate threats to life or safety, preserve only necessary evidence and follow applicable emergency and legal reporting procedures.
- Do not promise a reporter a specific outcome or reveal another user's private account information.
- Use account deletion only when the policy basis and data-retention impact are understood.
