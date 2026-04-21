create extension if not exists pgcrypto;

create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_message text not null default '',
  last_updated timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chat_sessions(id) on delete cascade,
  sender text not null check (sender in ('user', 'admin')),
  body text not null check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists chat_sessions_last_updated_idx
  on chat_sessions (last_updated desc);

create index if not exists chat_messages_chat_id_created_at_idx
  on chat_messages (chat_id, created_at asc);
