do $$
begin
  create type gas_settlement_kind as enum ('operator_withdrawal', 'client_payment');
exception
  when duplicate_object then null;
end $$;

alter table public.gas_tickets
  add column if not exists assigned_by text;

alter table public.gas_tickets
  add column if not exists assigned_at timestamptz;

alter table public.gas_tickets
  add column if not exists client_commission numeric(12, 2) not null default 0;

alter table public.gas_tickets
  add column if not exists client_commission_status gas_commission_status not null default 'pending';

alter table public.gas_tickets
  add column if not exists client_commission_paid_amount numeric(12, 2) not null default 0;

alter table public.gas_tickets
  add column if not exists client_commission_paid_at timestamptz;

update public.gas_tickets
set client_commission = round(coalesce(iva, 0) * 0.30, 2)
where client_commission = 0 and iva is not null;

update public.gas_tickets
set client_commission_status = 'paid',
    client_commission_paid_amount = client_commission
where client_commission <= 0;

alter table public.gas_clients
  add column if not exists fiscal_address_line1 text;

alter table public.gas_clients
  add column if not exists fiscal_address_line2 text;

alter table public.gas_clients
  add column if not exists fiscal_city text;

alter table public.gas_clients
  add column if not exists fiscal_state text;

alter table public.gas_clients
  add column if not exists fiscal_postal_code text;

alter table public.gas_clients
  add column if not exists fiscal_country text not null default 'MX';

alter table public.gas_clients
  add column if not exists phone text;

alter table public.gas_clients
  add column if not exists cfdi_use text not null default 'G03';

create table if not exists public.gas_settlements (
  id uuid primary key default gen_random_uuid(),
  kind gas_settlement_kind not null,
  operator_id uuid references public.gas_operators(id) on delete set null,
  operator_name text,
  client_id uuid references public.gas_clients(id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  created_by text,
  settled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint gas_settlement_owner_check check (
    (kind = 'operator_withdrawal' and operator_name is not null and client_id is null)
    or (kind = 'client_payment' and client_id is not null and operator_name is null)
  )
);

create table if not exists public.gas_settlement_items (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.gas_settlements(id) on delete cascade,
  ticket_id uuid not null references public.gas_tickets(id) on delete cascade,
  kind gas_settlement_kind not null,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  constraint gas_settlement_ticket_kind_unique unique (ticket_id, kind)
);

create table if not exists public.gas_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_role text not null check (recipient_role in ('admin', 'operator', 'client')),
  recipient_id uuid,
  recipient_name text,
  type text not null,
  title text not null,
  message text not null,
  resource_type text,
  resource_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists gas_tickets_assignment_idx
  on public.gas_tickets (client_id, status, created_at desc);

create index if not exists gas_tickets_client_commission_idx
  on public.gas_tickets (client_id, client_commission_status, submitted_at);

create index if not exists gas_settlements_operator_idx
  on public.gas_settlements (operator_id, settled_at desc);

create index if not exists gas_settlements_client_idx
  on public.gas_settlements (client_id, settled_at desc);

create index if not exists gas_notifications_recipient_idx
  on public.gas_notifications (recipient_role, recipient_id, created_at desc);

alter table public.gas_settlements enable row level security;
alter table public.gas_settlement_items enable row level security;
alter table public.gas_notifications enable row level security;

create or replace function public.record_gas_ticket_settlement(
  p_kind gas_settlement_kind,
  p_ticket_ids uuid[],
  p_created_by text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settlement_id uuid;
  v_amount numeric(12, 2);
  v_operator_id uuid;
  v_operator_name text;
  v_client_id uuid;
  v_count integer;
  v_eligible_count integer;
  v_ticket record;
begin
  if p_ticket_ids is null or cardinality(p_ticket_ids) = 0 then
    raise exception 'Select at least one ticket.';
  end if;

  select count(*) into v_count
  from public.gas_tickets
  where id = any(p_ticket_ids)
    and status in ('submitted', 'already_invoiced');

  if v_count <> cardinality(p_ticket_ids) then
    raise exception 'Every selected ticket must be successfully submitted.';
  end if;

  if p_kind = 'operator_withdrawal' then
    select count(*) into v_eligible_count
    from public.gas_tickets
    where id = any(p_ticket_ids)
      and commission_status = 'pending'
      and operator_commission > commission_paid_amount;

    if v_eligible_count <> cardinality(p_ticket_ids) then
      raise exception 'Every selected ticket must have pending operator compensation.';
    end if;

    select count(distinct coalesce(operator_id::text, lower(operator_name))),
           (array_agg(operator_id) filter (where operator_id is not null))[1], min(operator_name),
           round(sum(operator_commission - commission_paid_amount), 2)
    into v_count, v_operator_id, v_operator_name, v_amount
    from public.gas_tickets
    where id = any(p_ticket_ids)
      and commission_status = 'pending'
      and operator_commission > commission_paid_amount;

    if v_count <> 1 or v_amount is null or v_amount <= 0 then
      raise exception 'Selected tickets must have pending compensation for one operator.';
    end if;

    insert into public.gas_settlements (kind, operator_id, operator_name, amount, created_by)
    values (p_kind, v_operator_id, v_operator_name, v_amount, p_created_by)
    returning id into v_settlement_id;

    for v_ticket in
      select id, operator_commission - commission_paid_amount as pending_amount
      from public.gas_tickets
      where id = any(p_ticket_ids)
      for update
    loop
      insert into public.gas_settlement_items (settlement_id, ticket_id, kind, amount)
      values (v_settlement_id, v_ticket.id, p_kind, v_ticket.pending_amount);

      update public.gas_tickets
      set commission_status = 'paid',
          commission_paid_amount = operator_commission,
          commission_paid_at = now(),
          updated_at = now()
      where id = v_ticket.id;
    end loop;
  elsif p_kind = 'client_payment' then
    select count(*) into v_eligible_count
    from public.gas_tickets
    where id = any(p_ticket_ids)
      and client_id is not null
      and client_commission_status = 'pending'
      and client_commission > client_commission_paid_amount;

    if v_eligible_count <> cardinality(p_ticket_ids) then
      raise exception 'Every selected ticket must have pending client commission.';
    end if;

    select count(distinct client_id), (array_agg(client_id))[1],
           round(sum(client_commission - client_commission_paid_amount), 2)
    into v_count, v_client_id, v_amount
    from public.gas_tickets
    where id = any(p_ticket_ids)
      and client_id is not null
      and client_commission_status = 'pending'
      and client_commission > client_commission_paid_amount;

    if v_count <> 1 or v_amount is null or v_amount <= 0 then
      raise exception 'Selected tickets must have pending commission for one client.';
    end if;

    insert into public.gas_settlements (kind, client_id, amount, created_by)
    values (p_kind, v_client_id, v_amount, p_created_by)
    returning id into v_settlement_id;

    for v_ticket in
      select id, client_commission - client_commission_paid_amount as pending_amount
      from public.gas_tickets
      where id = any(p_ticket_ids)
      for update
    loop
      insert into public.gas_settlement_items (settlement_id, ticket_id, kind, amount)
      values (v_settlement_id, v_ticket.id, p_kind, v_ticket.pending_amount);

      update public.gas_tickets
      set client_commission_status = 'paid',
          client_commission_paid_amount = client_commission,
          client_commission_paid_at = now(),
          updated_at = now()
      where id = v_ticket.id;
    end loop;
  else
    raise exception 'Unsupported settlement kind.';
  end if;

  return v_settlement_id;
end;
$$;

revoke all on function public.record_gas_ticket_settlement(gas_settlement_kind, uuid[], text) from public;
grant execute on function public.record_gas_ticket_settlement(gas_settlement_kind, uuid[], text) to service_role;
