create extension if not exists pgcrypto;

do $$
begin
  create type gas_receipt_status as enum ('ocr_pending', 'processed', 'needs_review', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type gas_ticket_status as enum ('submit_pending', 'submitted', 'already_invoiced', 'needs_review', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type gas_payment_type as enum ('debit', 'credit');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.gas_receipts (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  storage_path text,
  mime_type text not null,
  uploaded_by text,
  source text not null default 'operator_portal',
  status gas_receipt_status not null default 'ocr_pending',
  extracted_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gas_tickets (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid references public.gas_receipts(id) on delete set null,
  folio text not null,
  referencia text not null,
  importe_total numeric(12, 2) not null,
  iva numeric(12, 2),
  rfc text not null,
  cfdi text not null default 'Gastos en General',
  payment_type gas_payment_type not null,
  status gas_ticket_status not null default 'submit_pending',
  error_message text,
  petromayab_consumption_id text,
  petromayab_client_id text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gas_tickets_unique_ticket unique (referencia, folio, importe_total)
);

create table if not exists public.gas_ticket_attempts (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.gas_tickets(id) on delete cascade,
  receipt_id uuid references public.gas_receipts(id) on delete cascade,
  stage text not null,
  ok boolean not null default false,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists gas_receipts_status_created_idx
  on public.gas_receipts (status, created_at);

create index if not exists gas_tickets_status_created_idx
  on public.gas_tickets (status, created_at);

create index if not exists gas_ticket_attempts_ticket_idx
  on public.gas_ticket_attempts (ticket_id, created_at desc);

alter table public.gas_receipts enable row level security;
alter table public.gas_tickets enable row level security;
alter table public.gas_ticket_attempts enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gas-receipts',
  'gas-receipts',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
