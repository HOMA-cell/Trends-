set lock_timeout = '5s';
set statement_timeout = '30s';

alter table public.posts
  add column if not exists video_kind text;

update public.posts
set video_kind = 'standard'
where media_type = 'video'
  and video_kind is null;

alter table public.posts
  drop constraint if exists posts_video_kind_check;

alter table public.posts
  add constraint posts_video_kind_check
  check (
    video_kind is null
    or (
      media_type is not distinct from 'video'
      and video_kind in ('standard', 'short')
    )
  );

create index if not exists posts_video_kind_created_at_idx
  on public.posts (video_kind, created_at desc)
  where media_type = 'video';

comment on column public.posts.video_kind is
  'Video placement: standard for the main feed, short for the Shorts viewer.';

