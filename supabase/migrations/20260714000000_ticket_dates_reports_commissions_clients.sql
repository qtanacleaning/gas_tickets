do $$
begin
  create type gas_commission_status as enum ('pending', 'paid');
exception
  when duplicate_object then null;
end $$;

alter table public.gas_tickets
  add column if not exists ticket_date date;

update public.gas_tickets
set ticket_date = coalesce(submitted_at, created_at)::date
where ticket_date is null;

alter table public.gas_tickets
  alter column ticket_date set default current_date;

alter table public.gas_tickets
  alter column ticket_date set not null;

alter table public.gas_tickets
  add column if not exists commission_status gas_commission_status not null default 'pending';

alter table public.gas_tickets
  add column if not exists commission_paid_amount numeric(12, 2) not null default 0;

alter table public.gas_tickets
  add column if not exists commission_paid_at timestamptz;

update public.gas_tickets
set commission_status = 'paid',
    commission_paid_amount = operator_commission
where operator_commission <= 0;

alter table public.gas_clients
  add column if not exists password_hash text;

alter table public.gas_clients
  add column if not exists active boolean not null default true;

create table if not exists public.gas_commission_payments (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid references public.gas_operators(id) on delete set null,
  operator_name text not null,
  amount numeric(12, 2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.gas_commission_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.gas_commission_payments(id) on delete cascade,
  ticket_id uuid not null references public.gas_tickets(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  constraint gas_commission_payment_ticket_unique unique (payment_id, ticket_id)
);

create index if not exists gas_tickets_ticket_date_idx
  on public.gas_tickets (ticket_date desc);

create index if not exists gas_tickets_commission_idx
  on public.gas_tickets (operator_id, commission_status, submitted_at);

create index if not exists gas_commission_payments_operator_idx
  on public.gas_commission_payments (operator_id, paid_at desc);

alter table public.gas_commission_payments enable row level security;
alter table public.gas_commission_payment_allocations enable row level security;

create or replace function public.record_gas_commission_payment(
  p_operator_id uuid,
  p_operator_name text,
  p_amount numeric,
  p_created_by text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_remaining numeric(12, 2) := round(p_amount, 2);
  v_available numeric(12, 2);
  v_allocation numeric(12, 2);
  v_ticket record;
begin
  if v_remaining is null or v_remaining <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  select coalesce(sum(operator_commission - commission_paid_amount), 0)
  into v_available
  from public.gas_tickets
  where status in ('submitted', 'already_invoiced')
    and operator_commission > commission_paid_amount
    and (
      (p_operator_id is not null and operator_id = p_operator_id)
      or (p_operator_id is null and lower(operator_name) = lower(trim(p_operator_name)))
    );

  if v_remaining > v_available then
    raise exception 'Payment amount % exceeds pending commission %.', v_remaining, v_available;
  end if;

  insert into public.gas_commission_payments (operator_id, operator_name, amount, created_by)
  values (p_operator_id, trim(p_operator_name), v_remaining, p_created_by)
  returning id into v_payment_id;

  for v_ticket in
    select id, operator_commission, commission_paid_amount
    from public.gas_tickets
    where status in ('submitted', 'already_invoiced')
      and operator_commission > commission_paid_amount
      and (
        (p_operator_id is not null and operator_id = p_operator_id)
        or (p_operator_id is null and lower(operator_name) = lower(trim(p_operator_name)))
      )
    order by submitted_at nulls last, created_at, id
    for update
  loop
    exit when v_remaining <= 0;
    v_allocation := least(v_remaining, v_ticket.operator_commission - v_ticket.commission_paid_amount);

    insert into public.gas_commission_payment_allocations (payment_id, ticket_id, amount)
    values (v_payment_id, v_ticket.id, v_allocation);

    update public.gas_tickets
    set commission_paid_amount = commission_paid_amount + v_allocation,
        commission_status = case
          when commission_paid_amount + v_allocation >= operator_commission then 'paid'::gas_commission_status
          else 'pending'::gas_commission_status
        end,
        commission_paid_at = case
          when commission_paid_amount + v_allocation >= operator_commission then now()
          else null
        end,
        updated_at = now()
    where id = v_ticket.id;

    v_remaining := v_remaining - v_allocation;
  end loop;

  if v_remaining <> 0 then
    raise exception 'Could not allocate the complete commission payment.';
  end if;

  return v_payment_id;
end;
$$;

revoke all on function public.record_gas_commission_payment(uuid, text, numeric, text) from public;
grant execute on function public.record_gas_commission_payment(uuid, text, numeric, text) to service_role;
