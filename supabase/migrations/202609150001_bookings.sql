-- Apply once in a new Supabase project. No real client data or credentials here.
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.slots (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true,
  series_id uuid,
  created_at timestamptz not null default now(),
  check (ends_at = starts_at + interval '1 hour'),
  exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&) where (active)
);
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 100),
  email text not null check (length(email) <= 254),
  phone text not null check (length(phone) between 8 and 30),
  private_notes text not null default '' check (length(private_notes) <= 20000),
  created_at timestamptz not null default now(),
  unique (email, phone)
);
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('JM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  request_id uuid not null unique,
  slot_id uuid not null references public.slots(id),
  client_id uuid not null references public.clients(id),
  treatment text not null check (treatment in ('relaxation','remedial')),
  price integer not null,
  intake_notes text not null default '' check (length(intake_notes) <= 2000),
  body_parts text not null default '' check (length(body_parts) <= 1000),
  session_notes text not null default '' check (length(session_notes) <= 20000),
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  consent_version text not null default '2026-09-15',
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check ((treatment='relaxation' and price=100) or (treatment='remedial' and price=120)),
  check (treatment <> 'remedial' or length(trim(body_parts)) > 0)
);
create unique index one_confirmed_booking_per_slot on public.appointments(slot_id) where status='confirmed';
create index appointment_client_history on public.appointments(client_id, created_at desc);
create index slots_chronological on public.slots(starts_at);
create table public.booking_attempts (
  bucket_key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 1
);

alter table public.admins enable row level security;
alter table public.slots enable row level security;
alter table public.clients enable row level security;
alter table public.appointments enable row level security;
alter table public.booking_attempts enable row level security;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.admins where user_id = auth.uid()); $$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Browser clients cannot write appointments, identity details or slot state directly.
revoke all on public.admins, public.slots, public.clients, public.appointments, public.booking_attempts from anon, authenticated;
grant select on public.slots, public.clients, public.appointments to authenticated;
grant update(private_notes) on public.clients to authenticated;
grant update(session_notes) on public.appointments to authenticated;
grant all on public.admins, public.slots, public.clients, public.appointments, public.booking_attempts to service_role;
create policy admin_slots_read on public.slots for select to authenticated using ((select public.is_admin()));
create policy admin_clients_read on public.clients for select to authenticated using ((select public.is_admin()));
create policy admin_clients_notes on public.clients for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy admin_appointments_read on public.appointments for select to authenticated using ((select public.is_admin()));
create policy admin_session_notes on public.appointments for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- The only public read exposes time slots, never client or appointment data.
create function public.available_slots()
returns table(id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.starts_at, s.ends_at from public.slots s
  where s.active and s.starts_at > now()
    and not exists(select 1 from public.appointments a where a.slot_id=s.id and a.status='confirmed')
  order by s.starts_at;
$$;
revoke all on function public.available_slots() from public;
grant execute on function public.available_slots() to anon, authenticated;

-- Rate limits are consumed in their own committed RPC, even if booking fails.
create function public.consume_booking_attempt(p_key text, p_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if length(p_key) > 100 or p_limit not between 1 and 100 then raise exception 'Invalid rate limit'; end if;
  delete from public.booking_attempts where window_start < now() - interval '2 days';
  insert into public.booking_attempts(bucket_key, count) values(p_key, 1)
  on conflict(bucket_key) do update set
    count = case when public.booking_attempts.window_start < now() - interval '1 hour' then 1 else public.booking_attempts.count+1 end,
    window_start = case when public.booking_attempts.window_start < now() - interval '1 hour' then now() else public.booking_attempts.window_start end
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;
revoke all on function public.consume_booking_attempt(text, integer) from public, anon, authenticated;
grant execute on function public.consume_booking_attempt(text, integer) to service_role;

-- Callable only by the server-side booking function with service credentials.
-- Row lock + unique index make simultaneous submissions safe. Retries reuse a request UUID.
create function public.create_booking(p_slot_id uuid, p_treatment text, p_name text, p_email text, p_phone text, p_intake_notes text, p_body_parts text, p_consent boolean, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.slots; a public.appointments; c_id uuid; v_email text; v_phone text;
begin
  if p_request_id is null or p_slot_id is null or p_treatment is null or p_treatment not in ('relaxation','remedial') or p_consent is distinct from true then raise exception 'Invalid booking details' using errcode='22023'; end if;
  if p_name is null or length(trim(p_name)) not between 2 and 100 or p_email is null or length(p_email)>254 or trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_phone is null or length(p_phone)>30 or p_phone !~ '^[+0-9 ().-]+$' then raise exception 'Invalid contact details' using errcode='22023'; end if;
  v_email := lower(trim(p_email)); v_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  if length(v_phone) not between 8 and 15 then raise exception 'Invalid phone number' using errcode='22023'; end if;
  if length(coalesce(p_intake_notes,''))>2000 or length(coalesce(p_body_parts,''))>1000 or (p_treatment='remedial' and length(trim(coalesce(p_body_parts,'')))=0) then raise exception 'Invalid massage details' using errcode='22023'; end if;
  -- Lock idempotent retries even when they attempt different slots concurrently.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into a from public.appointments where request_id=p_request_id;
  if found then
    if a.slot_id<>p_slot_id or a.treatment<>p_treatment or not exists(select 1 from public.clients c where c.id=a.client_id and c.email=v_email and c.phone=v_phone) then raise exception 'Request already used' using errcode='22023'; end if;
    if a.status<>'confirmed' then raise exception 'This booking has been cancelled' using errcode='22023'; end if;
    select * into s from public.slots where id=a.slot_id;
  else
    select * into s from public.slots where id=p_slot_id for update;
    if not found or not s.active or s.starts_at<=now() or exists(select 1 from public.appointments where slot_id=p_slot_id and status='confirmed') then raise exception 'Slot unavailable' using errcode='P0002'; end if;
    insert into public.clients(name,email,phone) values(trim(p_name),v_email,v_phone)
      on conflict(email,phone) do nothing;
    select id into c_id from public.clients where email=v_email and phone=v_phone;
    -- Never overwrite an existing client's name or private notes from a public form.
    insert into public.appointments(request_id,slot_id,client_id,treatment,price,intake_notes,body_parts)
      values(p_request_id,p_slot_id,c_id,p_treatment,case p_treatment when 'relaxation' then 100 else 120 end,trim(coalesce(p_intake_notes,'')),case p_treatment when 'remedial' then trim(p_body_parts) else '' end)
      returning * into a;
  end if;
  return jsonb_build_object('reference',a.reference,'treatment',a.treatment,'price',a.price,'starts_at',s.starts_at,'ends_at',s.ends_at);
end;
$$;
revoke all on function public.create_booking(uuid,text,text,text,text,text,text,boolean,uuid) from public, anon, authenticated;
grant execute on function public.create_booking(uuid,text,text,text,text,text,text,boolean,uuid) to service_role;

create function public.add_slots(p_date date, p_time time, p_weeks integer default 1)
returns void language plpgsql security definer set search_path = '' as $$
declare v_series uuid; v_start timestamptz; v_local timestamp; i integer;
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode='42501'; end if;
  if p_date is null or p_time is null or p_weeks is null or p_weeks not between 1 and 104 then raise exception 'Invalid availability' using errcode='22023'; end if;
  if p_weeks>1 then v_series:=gen_random_uuid(); end if;
  for i in 0..p_weeks-1 loop
    v_local := (p_date + i*7) + p_time;
    v_start := v_local at time zone 'Australia/Melbourne';
    if v_start<=now() or (v_start at time zone 'Australia/Melbourne')<>v_local then raise exception 'Invalid local time' using errcode='22023'; end if;
    insert into public.slots(starts_at,ends_at,series_id) values(v_start,v_start+interval '1 hour',v_series);
  end loop;
end;
$$;
create function public.remove_slots(p_slot_id uuid, p_series boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.slots; candidate public.slots;
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode='42501'; end if;
  select * into target from public.slots where id=p_slot_id;
  if not found then raise exception 'Slot not found'; end if;
  -- Lock each candidate before checking bookings to avoid racing a public submission.
  for candidate in select * from public.slots where id=p_slot_id or (p_series and target.series_id is not null and series_id=target.series_id and starts_at>=target.starts_at) order by starts_at for update loop
    if not exists(select 1 from public.appointments where slot_id=candidate.id and status='confirmed') then
      update public.slots set active=false where id=candidate.id;
    elsif not p_series then raise exception 'Slot has an appointment';
    end if;
  end loop;
end;
$$;
create function public.cancel_appointment(p_id uuid, p_reopen boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.appointments;
begin
  if not public.is_admin() then raise exception 'Not authorised' using errcode='42501'; end if;
  select * into a from public.appointments where id=p_id;
  if not found then raise exception 'Appointment not found'; end if;
  perform 1 from public.slots where id=a.slot_id for update;
  select * into a from public.appointments where id=p_id;
  if a.status='confirmed' then
    update public.appointments set status='cancelled' where id=p_id;
    update public.slots set active=coalesce(p_reopen,false) where id=a.slot_id;
  end if;
end;
$$;
revoke all on function public.add_slots(date,time,integer), public.remove_slots(uuid,boolean), public.cancel_appointment(uuid,boolean) from public, anon;
grant execute on function public.add_slots(date,time,integer), public.remove_slots(uuid,boolean), public.cancel_appointment(uuid,boolean) to authenticated;
