-- Supabase PostgreSQL schema for Chronos.
-- Run this in Supabase Dashboard > SQL Editor if you want to create the table manually.
-- The Node server also creates this table automatically when DATABASE_URL is configured.

create table if not exists public.schedules (
  id bigint generated always as identity primary key,
  title varchar(255) not null,
  description text,
  schedule_datetime timestamp not null,
  hourly_reminder boolean default false,
  priority varchar(20) default 'medium',
  ringtone varchar(30) default 'default',
  is_completed boolean default false,
  last_reminded_at timestamptz null,
  reminder_count integer default 0,
  completed_at timestamptz null,
  created_at timestamptz default now()
);

alter table public.schedules
add column if not exists reminder_count integer default 0;

alter table public.schedules
add column if not exists completed_at timestamptz null;

create index if not exists schedules_schedule_datetime_idx
on public.schedules (schedule_datetime);

create index if not exists schedules_is_completed_idx
on public.schedules (is_completed);
