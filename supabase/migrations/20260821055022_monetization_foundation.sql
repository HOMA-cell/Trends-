-- Monetization foundations are intentionally launch-safe:
-- public flags control visibility, billing writes remain server-only, and
-- gym reviews cannot be submitted until the corresponding flag is enabled.

create table if not exists public.app_feature_flags (
  key text primary key,
  enabled boolean not null default false,
  rollout_percent smallint not null default 0,
  config jsonb not null default '{}'::jsonb,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_feature_flags_key_check
    check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint app_feature_flags_rollout_check
    check (rollout_percent between 0 and 100),
  constraint app_feature_flags_config_check
    check (jsonb_typeof(config) = 'object')
);

drop trigger if exists trg_app_feature_flags_updated_at on public.app_feature_flags;
create trigger trg_app_feature_flags_updated_at
before update on public.app_feature_flags
for each row execute function public.set_updated_at();

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_key text not null,
  source text not null default 'manual',
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_entitlements_key_check
    check (entitlement_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint user_entitlements_source_check
    check (source in ('manual', 'apple', 'google', 'stripe', 'promo')),
  constraint user_entitlements_status_check
    check (status in ('active', 'trialing', 'grace_period', 'expired', 'revoked')),
  constraint user_entitlements_period_check
    check (expires_at is null or expires_at > starts_at)
);

create unique index if not exists user_entitlements_identity_idx
  on public.user_entitlements (user_id, entitlement_key, source);
create index if not exists user_entitlements_active_lookup_idx
  on public.user_entitlements (user_id, status, expires_at);

drop trigger if exists trg_user_entitlements_updated_at on public.user_entitlements;
create trigger trg_user_entitlements_updated_at
before update on public.user_entitlements
for each row execute function public.set_updated_at();

create table if not exists public.sponsor_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  status text not null default 'draft',
  placement text not null default 'feed',
  campaign_kind text not null default 'sponsored',
  sponsor_name text not null,
  disclosure_ja text not null default '広告・PR',
  disclosure_en text not null default 'Sponsored',
  headline_ja text not null,
  headline_en text not null,
  body_ja text not null,
  body_en text not null,
  cta_ja text not null,
  cta_en text not null,
  destination_url text not null,
  image_url text,
  priority smallint not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_campaigns_slug_check
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  constraint sponsor_campaigns_status_check
    check (status in ('draft', 'active', 'paused', 'ended')),
  constraint sponsor_campaigns_placement_check
    check (placement in ('feed')),
  constraint sponsor_campaigns_kind_check
    check (campaign_kind in ('house', 'sponsored')),
  constraint sponsor_campaigns_copy_check check (
    char_length(sponsor_name) between 1 and 100
    and char_length(disclosure_ja) between 1 and 40
    and char_length(disclosure_en) between 1 and 40
    and char_length(headline_ja) between 1 and 120
    and char_length(headline_en) between 1 and 120
    and char_length(body_ja) between 1 and 360
    and char_length(body_en) between 1 and 360
    and char_length(cta_ja) between 1 and 40
    and char_length(cta_en) between 1 and 40
    and char_length(destination_url) between 1 and 2048
    and (image_url is null or char_length(image_url) <= 2048)
  ),
  constraint sponsor_campaigns_urls_check check (
    destination_url ~ '^(#|https://)'
    and (image_url is null or image_url ~ '^https://')
  ),
  constraint sponsor_campaigns_priority_check
    check (priority between -100 and 100),
  constraint sponsor_campaigns_period_check
    check (ends_at is null or ends_at > starts_at)
);

create index if not exists sponsor_campaigns_delivery_idx
  on public.sponsor_campaigns (placement, status, priority desc, starts_at desc);

drop trigger if exists trg_sponsor_campaigns_updated_at on public.sponsor_campaigns;
create trigger trg_sponsor_campaigns_updated_at
before update on public.sponsor_campaigns
for each row execute function public.set_updated_at();

create table if not exists public.gyms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  prefecture text,
  city text,
  address text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  website_url text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gyms_slug_check
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,99}$'),
  constraint gyms_name_check
    check (char_length(name) between 1 and 160),
  constraint gyms_description_check
    check (description is null or char_length(description) <= 3000),
  constraint gyms_location_text_check check (
    (prefecture is null or char_length(prefecture) <= 80)
    and (city is null or char_length(city) <= 120)
    and (address is null or char_length(address) <= 300)
  ),
  constraint gyms_coordinates_check check (
    (latitude is null and longitude is null)
    or (
      latitude between -90 and 90
      and longitude between -180 and 180
    )
  ),
  constraint gyms_website_url_check
    check (website_url is null or char_length(website_url) <= 2048),
  constraint gyms_status_check
    check (status in ('draft', 'published', 'suspended'))
);

create index if not exists gyms_directory_idx
  on public.gyms (status, prefecture, city, name);

drop trigger if exists trg_gyms_updated_at on public.gyms;
create trigger trg_gyms_updated_at
before update on public.gyms
for each row execute function public.set_updated_at();

create table if not exists public.gym_claims (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_role text not null default 'owner',
  proof_text text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint gym_claims_role_check
    check (requested_role in ('owner', 'manager', 'staff')),
  constraint gym_claims_proof_check
    check (char_length(trim(proof_text)) between 20 and 2000),
  constraint gym_claims_status_check
    check (status in ('pending', 'reviewing', 'approved', 'rejected'))
);

create unique index if not exists gym_claims_open_request_idx
  on public.gym_claims (gym_id, user_id)
  where status in ('pending', 'reviewing', 'approved');
create index if not exists gym_claims_user_idx
  on public.gym_claims (user_id, created_at desc);

create table if not exists public.gym_managers (
  gym_id uuid not null references public.gyms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'manager',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key (gym_id, user_id),
  constraint gym_managers_role_check
    check (role in ('owner', 'manager', 'staff')),
  constraint gym_managers_status_check
    check (status in ('active', 'suspended'))
);

create index if not exists gym_managers_user_idx
  on public.gym_managers (user_id, status);

create table if not exists public.gym_reviews (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null,
  title text,
  body text not null,
  visit_date date,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gym_reviews_rating_check
    check (rating between 1 and 5),
  constraint gym_reviews_title_check
    check (title is null or char_length(title) <= 100),
  constraint gym_reviews_body_check
    check (char_length(trim(body)) between 20 and 2000),
  constraint gym_reviews_visit_date_check
    check (visit_date is null or visit_date <= current_date),
  constraint gym_reviews_status_check
    check (status in ('pending', 'published', 'rejected', 'removed'))
);

create unique index if not exists gym_reviews_one_per_user_idx
  on public.gym_reviews (gym_id, reviewer_id);
create index if not exists gym_reviews_public_feed_idx
  on public.gym_reviews (gym_id, status, created_at desc);
create index if not exists gym_reviews_reviewer_idx
  on public.gym_reviews (reviewer_id, created_at desc);

drop trigger if exists trg_gym_reviews_updated_at on public.gym_reviews;
create trigger trg_gym_reviews_updated_at
before update on public.gym_reviews
for each row execute function public.set_updated_at();

alter table public.app_feature_flags enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.sponsor_campaigns enable row level security;
alter table public.gyms enable row level security;
alter table public.gym_claims enable row level security;
alter table public.gym_managers enable row level security;
alter table public.gym_reviews enable row level security;

drop policy if exists "app_feature_flags_select_public" on public.app_feature_flags;
create policy "app_feature_flags_select_public"
  on public.app_feature_flags for select
  to anon, authenticated
  using (is_public = true);

drop policy if exists "user_entitlements_select_own" on public.user_entitlements;
create policy "user_entitlements_select_own"
  on public.user_entitlements for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "sponsor_campaigns_select_active" on public.sponsor_campaigns;
create policy "sponsor_campaigns_select_active"
  on public.sponsor_campaigns for select
  to anon, authenticated
  using (
    status = 'active'
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
    and exists (
      select 1
      from public.app_feature_flags flag
      where flag.key = 'sponsor_ads'
        and flag.enabled = true
        and flag.rollout_percent > 0
        and flag.is_public = true
    )
  );

drop policy if exists "gyms_select_published" on public.gyms;
create policy "gyms_select_published"
  on public.gyms for select
  to anon, authenticated
  using (
    status = 'published'
    and exists (
      select 1
      from public.app_feature_flags flag
      where flag.key = 'gym_directory'
        and flag.enabled = true
        and flag.rollout_percent > 0
        and flag.is_public = true
    )
  );

drop policy if exists "gym_claims_select_own" on public.gym_claims;
create policy "gym_claims_select_own"
  on public.gym_claims for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "gym_claims_insert_own" on public.gym_claims;
create policy "gym_claims_insert_own"
  on public.gym_claims for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and status = 'pending'
    and reviewed_at is null
    and exists (
      select 1
      from public.app_feature_flags flag
      where flag.key = 'gym_claims'
        and flag.enabled = true
        and flag.rollout_percent > 0
        and flag.is_public = true
    )
    and exists (
      select 1
      from public.gyms gym
      where gym.id = gym_claims.gym_id
        and gym.status = 'published'
    )
  );

drop policy if exists "gym_managers_select_own" on public.gym_managers;
create policy "gym_managers_select_own"
  on public.gym_managers for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "gym_reviews_select_visible" on public.gym_reviews;
create policy "gym_reviews_select_visible"
  on public.gym_reviews for select
  to anon, authenticated
  using (
    (select auth.uid()) = reviewer_id
    or (
      status = 'published'
      and exists (
        select 1
        from public.app_feature_flags flag
        where flag.key = 'gym_reviews'
          and flag.enabled = true
          and flag.rollout_percent > 0
          and flag.is_public = true
      )
    )
  );

drop policy if exists "gym_reviews_insert_own" on public.gym_reviews;
create policy "gym_reviews_insert_own"
  on public.gym_reviews for insert
  to authenticated
  with check (
    (select auth.uid()) = reviewer_id
    and status = 'pending'
    and exists (
      select 1
      from public.app_feature_flags flag
      where flag.key = 'gym_reviews'
        and flag.enabled = true
        and flag.rollout_percent > 0
        and flag.is_public = true
    )
    and exists (
      select 1
      from public.gyms gym
      where gym.id = gym_reviews.gym_id
        and gym.status = 'published'
    )
  );

drop policy if exists "gym_reviews_update_own_pending" on public.gym_reviews;
create policy "gym_reviews_update_own_pending"
  on public.gym_reviews for update
  to authenticated
  using (
    (select auth.uid()) = reviewer_id
    and status = 'pending'
  )
  with check (
    (select auth.uid()) = reviewer_id
    and status = 'pending'
    and exists (
      select 1
      from public.app_feature_flags flag
      where flag.key = 'gym_reviews'
        and flag.enabled = true
        and flag.rollout_percent > 0
        and flag.is_public = true
    )
  );

drop policy if exists "gym_reviews_delete_own" on public.gym_reviews;
create policy "gym_reviews_delete_own"
  on public.gym_reviews for delete
  to authenticated
  using ((select auth.uid()) = reviewer_id);

revoke all privileges on table public.app_feature_flags from public, anon, authenticated;
revoke all privileges on table public.user_entitlements from public, anon, authenticated;
revoke all privileges on table public.sponsor_campaigns from public, anon, authenticated;
revoke all privileges on table public.gyms from public, anon, authenticated;
revoke all privileges on table public.gym_claims from public, anon, authenticated;
revoke all privileges on table public.gym_managers from public, anon, authenticated;
revoke all privileges on table public.gym_reviews from public, anon, authenticated;

grant select on table public.app_feature_flags to anon, authenticated;
grant select on table public.user_entitlements to authenticated;
grant select on table public.sponsor_campaigns to anon, authenticated;
grant select on table public.gyms to anon, authenticated;
grant select, insert on table public.gym_claims to authenticated;
grant select on table public.gym_managers to authenticated;
grant select, insert, update, delete on table public.gym_reviews to authenticated;

grant all privileges on table public.app_feature_flags to service_role;
grant all privileges on table public.user_entitlements to service_role;
grant all privileges on table public.sponsor_campaigns to service_role;
grant all privileges on table public.gyms to service_role;
grant all privileges on table public.gym_claims to service_role;
grant all privileges on table public.gym_managers to service_role;
grant all privileges on table public.gym_reviews to service_role;

insert into public.app_feature_flags (key, enabled, rollout_percent, config)
values
  ('pro_preview', true, 100, '{"billing_enabled": false}'::jsonb),
  ('pro_membership', false, 0, '{"billing_enabled": false}'::jsonb),
  ('sponsor_ads', true, 100, '{"feed_start_at": 6, "feed_interval": 12, "feed_max_ads": 2, "session_max_ads": 2, "personalized": false}'::jsonb),
  ('external_ads', false, 0, '{"personalized": false}'::jsonb),
  ('gym_directory', false, 0, '{}'::jsonb),
  ('gym_reviews', false, 0, '{}'::jsonb),
  ('gym_claims', false, 0, '{}'::jsonb)
on conflict (key) do nothing;

insert into public.sponsor_campaigns (
  slug,
  status,
  placement,
  campaign_kind,
  sponsor_name,
  disclosure_ja,
  disclosure_en,
  headline_ja,
  headline_en,
  body_ja,
  body_en,
  cta_ja,
  cta_en,
  destination_url,
  priority
)
values (
  'trends-pro-preview-2026',
  'active',
  'feed',
  'house',
  'Trends',
  'Trendsからのお知らせ',
  'From Trends',
  'Trends Proを準備中',
  'Trends Pro is on the way',
  '記録分析や長期レポートを、トレーニングを続ける人のために開発しています。',
  'We are building deeper training insights and long-term reports for consistent athletes.',
  '先行プレビュー',
  'Preview Pro',
  '#pro-preview',
  10
)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
