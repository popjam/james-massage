-- Carry every field in section 01. Appointment defaults override the previous date/duration in new forms.
create or replace function public.save_remedial_history(p_appointment uuid, p_form jsonb, p_private_notes text,
 p_form_revision integer, p_profile_revision integer, p_update_profile boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments; c public.clients; profile jsonb; k text;
begin
 if not public.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_form is null or jsonb_typeof(p_form)<>'object' or p_form->>'version' is distinct from '1'
 or jsonb_typeof(p_form->'essentials') is distinct from 'object'
 or jsonb_typeof(p_form->'fields') is distinct from 'object'
 or jsonb_typeof(p_form->'checks') is distinct from 'object'
 or jsonb_typeof(p_form->'sides') is distinct from 'object'
 or jsonb_typeof(p_form->'drawings') is distinct from 'object'
 or octet_length(p_form::text)>600000 or p_private_notes is null or length(p_private_notes)>20000 then
 raise exception 'Invalid history form' using errcode='22023'; end if;
 select * into a from public.appointments where id=p_appointment for update;
 if not found or a.treatment<>'remedial' then raise exception 'Remedial appointment required' using errcode='22023'; end if;
 select * into c from public.clients where id=a.client_id for update;
 if p_form_revision is distinct from a.form_revision or p_profile_revision is distinct from c.profile_revision then
 raise exception 'This record changed in another window. Reopen the appointment before saving.' using errcode='40001'; end if;
 profile:=c.history_profile;
 if p_update_profile is true then
  profile:='{}'::jsonb;
  foreach k in array array['name','phone','email','dob','gender','address','suburb','postcode','referral','clinic','emergencyName','emergencyRelationship','emergencyPhone','allergies','medication','surgery','illness','otherCautions','occupation','duties','hobbies'] loop
   if jsonb_typeof(p_form->'essentials'->k) not in ('string','null') then raise exception 'Invalid client details' using errcode='22023'; end if;
   profile:=profile || jsonb_build_object(k,coalesce(p_form->'essentials'->>k,''));
  end loop;
  foreach k in array array['date','duration','visit','healthUnderstanding','cautionDetails'] loop
   if jsonb_typeof(p_form->'fields'->k) not in ('string','null') then raise exception 'Invalid client essentials' using errcode='22023'; end if;
   profile:=profile || jsonb_build_object(k,coalesce(p_form->'fields'->>k,''));
  end loop;
  foreach k in array array['cautionSurgery','cautionIllness','cautionMedication','cautionAllergies','cautionOther'] loop
   if jsonb_typeof(p_form->'checks'->k) not in ('boolean','null') then raise exception 'Invalid caution selection' using errcode='22023'; end if;
   profile:=profile || jsonb_build_object(k,coalesce(p_form->'checks'->>k,'false'));
  end loop;
 end if;
 update public.clients set history_profile=profile,private_notes=p_private_notes,profile_revision=profile_revision+1 where id=c.id;
 update public.appointments set remedial_form=p_form,form_revision=form_revision+1,form_updated_at=now() where id=a.id;
 return jsonb_build_object('form_revision',a.form_revision+1,'profile_revision',c.profile_revision+1,'form_updated_at',now());
end;
$$;
revoke all on function public.save_remedial_history(uuid,jsonb,text,integer,integer,boolean) from public,anon;
grant execute on function public.save_remedial_history(uuid,jsonb,text,integer,integer,boolean) to authenticated;
