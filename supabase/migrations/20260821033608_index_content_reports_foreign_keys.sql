-- Keep moderation and account-deletion lookups efficient as reports grow.
create index if not exists content_reports_reporter_id_idx
  on public.content_reports (reporter_id, created_at desc);

create index if not exists content_reports_target_user_id_idx
  on public.content_reports (target_user_id, created_at desc)
  where target_user_id is not null;
