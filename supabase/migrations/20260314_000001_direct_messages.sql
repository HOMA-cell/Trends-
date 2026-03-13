-- Direct messages schema + RLS policies for Trends app.
-- Safe to run multiple times.

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id),
  check (char_length(trim(body)) > 0)
);

alter table public.direct_messages
  add column if not exists sender_id uuid references auth.users(id) on delete cascade;
alter table public.direct_messages
  add column if not exists recipient_id uuid references auth.users(id) on delete cascade;
alter table public.direct_messages
  add column if not exists body text;
alter table public.direct_messages
  add column if not exists read_at timestamptz;
alter table public.direct_messages
  add column if not exists created_at timestamptz not null default now();

create index if not exists direct_messages_sender_id_idx
  on public.direct_messages(sender_id);
create index if not exists direct_messages_recipient_id_idx
  on public.direct_messages(recipient_id);
create index if not exists direct_messages_created_at_idx
  on public.direct_messages(created_at desc);
create index if not exists direct_messages_pair_created_idx
  on public.direct_messages(
    least(sender_id, recipient_id),
    greatest(sender_id, recipient_id),
    created_at desc
  );

alter table public.direct_messages enable row level security;

drop policy if exists "direct_messages_select_participants" on public.direct_messages;
create policy "direct_messages_select_participants"
  on public.direct_messages
  for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "direct_messages_insert_sender" on public.direct_messages;
create policy "direct_messages_insert_sender"
  on public.direct_messages
  for insert
  with check (
    auth.uid() = sender_id
    and sender_id <> recipient_id
    and char_length(trim(body)) > 0
  );

drop policy if exists "direct_messages_update_recipient" on public.direct_messages;
create policy "direct_messages_update_recipient"
  on public.direct_messages
  for update
  using (auth.uid() = recipient_id)
  with check (
    auth.uid() = recipient_id
    and sender_id <> recipient_id
    and char_length(trim(body)) > 0
  );

drop policy if exists "direct_messages_delete_sender" on public.direct_messages;
create policy "direct_messages_delete_sender"
  on public.direct_messages
  for delete
  using (auth.uid() = sender_id);
