create table if not exists public.gas_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rfc text not null,
  email text not null,
  tax_regime text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gas_clients_email_unique unique (email),
  constraint gas_clients_rfc_unique unique (rfc)
);

alter table public.gas_receipts
  add column if not exists client_id uuid references public.gas_clients(id) on delete set null;

alter table public.gas_receipts
  add column if not exists operator_name text;

alter table public.gas_tickets
  add column if not exists client_id uuid references public.gas_clients(id) on delete set null;

alter table public.gas_tickets
  add column if not exists operator_name text;

alter table public.gas_tickets
  add column if not exists operator_commission numeric(12, 2) not null default 0;

update public.gas_receipts
set operator_name = uploaded_by
where operator_name is null and uploaded_by is not null;

update public.gas_tickets t
set operator_name = r.uploaded_by
from public.gas_receipts r
where t.receipt_id = r.id and t.operator_name is null and r.uploaded_by is not null;

update public.gas_tickets
set operator_commission = round(coalesce(iva, 0) * 0.10, 2)
where operator_commission = 0 and iva is not null;

create index if not exists gas_clients_email_idx
  on public.gas_clients (email);

create index if not exists gas_tickets_client_status_idx
  on public.gas_tickets (client_id, status, created_at desc);

create index if not exists gas_tickets_operator_status_idx
  on public.gas_tickets (operator_name, status, created_at desc);

alter table public.gas_clients enable row level security;
