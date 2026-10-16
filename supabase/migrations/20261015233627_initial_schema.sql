-- ig_events: raw webhook ledger, dedup on external_id
create table public.ig_events (
  id bigint generated always as identity primary key,
  external_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending', -- pending | processing | done | error
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- contacts: homeowner registry
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  ig_user_id text not null unique,
  ig_username text,
  phone text,
  close_lead_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- conversations: qualification state machine
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id),
  state text not null default 'new', -- new | asked_location | asked_project | asked_timeline | asked_phone | qualified | in_close | handed_off
  keyword text,
  project_type text,
  timeline text,
  location text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- outbound_messages: sent-message audit log, double-send guards
create table public.outbound_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id),
  kind text not null, -- private_reply | dm
  comment_id text,
  in_reply_to text,
  content text not null,
  sent_at timestamptz not null default now()
);

create unique index outbound_messages_comment_unique
  on public.outbound_messages (comment_id)
  where kind = 'private_reply';

create unique index outbound_messages_reply_unique
  on public.outbound_messages (in_reply_to)
  where kind = 'dm';

-- keywords: active campaign trigger config
create table public.keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null unique,
  label text,
  active boolean not null default true,
  response_template text
);

-- credentials: single-row OAuth token vault
create table public.credentials (
  id int primary key check (id = 1),
  access_token text,
  expires_at timestamptz,
  refreshed_at timestamptz not null default now()
);

-- media_metrics: post performance ledger
create table public.media_metrics (
  id uuid primary key default gen_random_uuid(),
  media_id text not null unique,
  caption text,
  reach int,
  comments_count int,
  likes_count int,
  fetched_at timestamptz not null default now()
);

-- system_errors: background job error log
create table public.system_errors (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  message text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- staff: dashboard access allow-list
create table public.staff (
  id uuid primary key references auth.users(id),
  email text not null,
  role text not null default 'staff',
  created_at timestamptz not null default now()
);

-- is_staff(): security-hardened check used by every RLS policy below
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.staff where id = auth.uid()
  );
$$;

-- RLS: enable on all nine tables
alter table public.ig_events enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.outbound_messages enable row level security;
alter table public.keywords enable row level security;
alter table public.credentials enable row level security;
alter table public.media_metrics enable row level security;
alter table public.system_errors enable row level security;
alter table public.staff enable row level security;

-- Staff can read/write everything except credentials (no policy = no access for anon/authenticated)
create policy "staff full access" on public.ig_events for all using (is_staff()) with check (is_staff());
create policy "staff full access" on public.contacts for all using (is_staff()) with check (is_staff());
create policy "staff full access" on public.conversations for all using (is_staff()) with check (is_staff());
create policy "staff full access" on public.outbound_messages for all using (is_staff()) with check (is_staff());
create policy "staff full access" on public.keywords for all using (is_staff()) with check (is_staff());
create policy "staff full access" on public.media_metrics for all using (is_staff()) with check (is_staff());
create policy "staff full access" on public.system_errors for all using (is_staff()) with check (is_staff());
create policy "staff can read staff" on public.staff for select using (is_staff());

-- credentials: deliberately NO policies — only the service_role key (which bypasses RLS)
-- can ever read or write this table. Nothing for anon/authenticated.
