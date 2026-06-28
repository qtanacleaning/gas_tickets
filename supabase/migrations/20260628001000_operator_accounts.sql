create table if not exists public.gas_operators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text not null,
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gas_operators_name_key_unique unique (name_key)
);

alter table public.gas_receipts
  add column if not exists operator_id uuid references public.gas_operators(id) on delete set null;

alter table public.gas_tickets
  add column if not exists operator_id uuid references public.gas_operators(id) on delete set null;

create index if not exists gas_operators_active_idx
  on public.gas_operators (active, name_key);

create index if not exists gas_tickets_operator_id_status_idx
  on public.gas_tickets (operator_id, status, created_at desc);

alter table public.gas_operators enable row level security;
