import { createClient } from 'npm:@supabase/supabase-js@2';

const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(v=>v.trim()).filter(Boolean);
const salt = Deno.env.get('BOOKING_RATE_SALT') || '';
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth:{persistSession:false,autoRefreshToken:false}});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function hash(text: string) { const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${salt}:${text}`));return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join(''); }

Deno.serve(async req => {
  const origin=req.headers.get('Origin')||'';
  const headers={ 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin', 'Access-Control-Allow-Origin':allowed.includes(origin)?origin:'null', 'Access-Control-Allow-Headers':'apikey, content-type, authorization, x-client-info', 'Access-Control-Allow-Methods':'POST, OPTIONS' };
  const respond=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
  if (!allowed.length || !salt) return respond(503,{error:'Online booking is not open yet.'});
  if (!allowed.includes(origin)) return respond(403,{error:'This booking page is not authorised.'});
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers});
  if (req.method!=='POST') return respond(405,{error:'Method not allowed.'});
  if (!req.headers.get('Content-Type')?.startsWith('application/json')) return respond(415,{error:'Invalid request format.'});
  try {
    // Bound the stream, including requests with no Content-Length header.
    const reader=req.body?.getReader();if(!reader)return respond(400,{error:'Missing booking details.'});
    const chunks:Uint8Array[]=[];let total=0;
    while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>16384){await reader.cancel();return respond(413,{error:'Booking details are too long.'});}chunks.push(value);}
    const bytes=new Uint8Array(total);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
    let payload;try{payload=JSON.parse(new TextDecoder().decode(bytes));}catch{return respond(400,{error:'Invalid booking details.'});}
    const {slot_id,treatment,details:d,request_id}=payload||{};
    if(!uuid.test(slot_id||'')||!uuid.test(request_id||'')||!['relaxation','remedial'].includes(treatment)||!d||d.consent!==true||['name','email','phone','intake_notes','body_parts','website'].some(k=>typeof d[k]!=='string'))return respond(400,{error:'Please check your booking details.'});
    if(d.website)return respond(400,{error:'Booking could not be submitted.'});
    if(d.name.length>100||d.email.length>254||d.phone.length>30||d.intake_notes.length>2000||d.body_parts.length>1000)return respond(400,{error:'Please shorten your booking details.'});
    // Header-based limits supplement, rather than replace, per-contact throttling.
    const ip=req.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown';
    const buckets=[{key:`ip:${await hash(ip)}`,limit:20},{key:`contact:${await hash(d.email.trim().toLowerCase())}`,limit:6}];
    for(const b of buckets){const {data,error}=await supabase.rpc('consume_booking_attempt',{p_key:b.key,p_limit:b.limit});if(error)return respond(503,{error:'Booking is temporarily unavailable. Please try again shortly.'});if(!data)return respond(429,{error:'Too many attempts. Please try again in an hour.'});}
    const {data,error}=await supabase.rpc('create_booking',{p_slot_id:slot_id,p_treatment:treatment,p_name:d.name,p_email:d.email,p_phone:d.phone,p_intake_notes:d.intake_notes,p_body_parts:d.body_parts,p_consent:d.consent,p_request_id:request_id});
    if(error){if(error.code==='P0002'||error.code==='23505')return respond(409,{error:'That time has just been booked. Please go back and choose another time.'});if(error.code==='22023'||error.code==='23514')return respond(400,{error:'Please check your contact details and focus areas.'});return respond(503,{error:'We couldn’t confirm your booking. Please try again.'});}
    return respond(200,data);
  }catch{return respond(503,{error:'Booking is temporarily unavailable. Please try again.'});}
});
