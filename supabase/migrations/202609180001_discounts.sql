-- Server-owned discount codes. Public callers may validate one code, never list codes.
create table public.discount_codes (
 code text primary key check (code = upper(trim(code)) and length(code) between 1 and 40),
 percent_off integer not null check (percent_off between 1 and 100),
 active boolean not null default true
);
alter table public.discount_codes enable row level security;
revoke all on public.discount_codes from anon, authenticated;
grant all on public.discount_codes to service_role;
insert into public.discount_codes(code,percent_off) values ('FAMILY',100);
alter table public.appointments add column original_price integer;
alter table public.appointments add column discount_code text;
alter table public.appointments add column discount_percent integer not null default 0;
update public.appointments set original_price=price;
alter table public.appointments alter column original_price set not null;
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.appointments'::regclass and contype='c' and pg_get_constraintdef(oid) like '%price%' loop
 execute format('alter table public.appointments drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.appointments add constraint appointment_discount_price check (
 original_price=case treatment when 'relaxation' then 100 when 'remedial' then 120 end
 and discount_percent between 0 and 100
 and price=round(original_price*(100-discount_percent)/100.0)::integer
 and ((discount_code is null and discount_percent=0) or (discount_code is not null and discount_percent>0))
);
create function public.quote_booking(p_treatment text,p_discount_code text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_code text:=nullif(upper(trim(coalesce(p_discount_code,''))),''); v_percent integer:=0; v_price integer;
begin
 if p_treatment is null or p_treatment not in ('relaxation','remedial') then raise exception 'Invalid treatment' using errcode='22023'; end if;
 v_price:=case p_treatment when 'relaxation' then 100 else 120 end;
 if v_code is not null then
   select percent_off into v_percent from public.discount_codes where code=v_code and active;
   if not found then raise exception 'Discount code not recognised or no longer available.' using errcode='22023'; end if;
 end if;
 return jsonb_build_object('original_price',v_price,'price',round(v_price*(100-v_percent)/100.0)::integer,'discount_code',v_code,'discount_percent',v_percent);
end $$;
revoke all on function public.quote_booking(text,text) from public;
grant execute on function public.quote_booking(text,text) to anon,authenticated,service_role;
drop function public.create_booking(uuid,text,text,text,text,text,text,boolean,uuid);
create function public.create_booking(p_slot_id uuid, p_treatment text, p_name text, p_email text, p_phone text, p_intake_notes text, p_body_parts text, p_consent boolean, p_request_id uuid, p_discount_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.slots; a public.appointments; c_id uuid; v_email text; v_phone text; q jsonb; v_code text;
begin
  if p_request_id is null or p_slot_id is null or p_treatment is null or p_treatment not in ('relaxation','remedial') or p_consent is distinct from true then raise exception 'Invalid booking details' using errcode='22023'; end if;
  if p_name is null or length(trim(p_name)) not between 2 and 100 or p_email is null or length(p_email)>254 or trim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_phone is null or length(p_phone)>30 or p_phone !~ '^[+0-9 ().-]+$' then raise exception 'Invalid contact details' using errcode='22023'; end if;
  v_email := lower(trim(p_email)); v_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  if length(v_phone) not between 8 and 15 then raise exception 'Invalid phone number' using errcode='22023'; end if;
  if length(coalesce(p_intake_notes,''))>2000 or length(coalesce(p_body_parts,''))>1000 or (p_treatment='remedial' and length(trim(coalesce(p_body_parts,'')))=0) then raise exception 'Invalid massage details' using errcode='22023'; end if;
  v_code := nullif(upper(trim(coalesce(p_discount_code,''))), '');
  -- Lock idempotent retries even when they attempt different slots concurrently.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into a from public.appointments where request_id=p_request_id;
  if found then
    if a.discount_code is distinct from v_code or a.slot_id<>p_slot_id or a.treatment<>p_treatment or not exists(select 1 from public.clients c where c.id=a.client_id and c.email=v_email and c.phone=v_phone) then raise exception 'Request already used' using errcode='22023'; end if;
    if a.status<>'confirmed' then raise exception 'This booking has been cancelled' using errcode='22023'; end if;
    select * into s from public.slots where id=a.slot_id;
  else
    q := public.quote_booking(p_treatment,v_code);
    select * into s from public.slots where id=p_slot_id for update;
    if not found or not s.active or s.starts_at<=now() or exists(select 1 from public.appointments where slot_id=p_slot_id and status='confirmed') then raise exception 'Slot unavailable' using errcode='P0002'; end if;
    insert into public.clients(name,email,phone) values(trim(p_name),v_email,v_phone)
      on conflict(email,phone) do nothing;
    select id into c_id from public.clients where email=v_email and phone=v_phone;
    -- Never overwrite an existing client's name or private notes from a public form.
    insert into public.appointments(request_id,slot_id,client_id,treatment,price,intake_notes,body_parts,original_price,discount_code,discount_percent)
      values(p_request_id,p_slot_id,c_id,p_treatment,(q->>'price')::integer,trim(coalesce(p_intake_notes,'')),case p_treatment when 'remedial' then trim(p_body_parts) else '' end,(q->>'original_price')::integer,v_code,(q->>'discount_percent')::integer)
      returning * into a;
  end if;
  return jsonb_build_object('reference',a.reference,'treatment',a.treatment,'price',a.price,'original_price',a.original_price,'discount_code',a.discount_code,'discount_percent',a.discount_percent,'starts_at',s.starts_at,'ends_at',s.ends_at);
end;
$$;
revoke all on function public.create_booking(uuid,text,text,text,text,text,text,boolean,uuid,text) from public, anon, authenticated;
grant execute on function public.create_booking(uuid,text,text,text,text,text,text,boolean,uuid,text) to service_role;

