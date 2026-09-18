import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('phone identity links changed emails and Australian formats without overwriting notes',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;`);
 for(const f of ['202609150001_bookings.sql','202609180001_discounts.sql','202609180002_client_phone.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 await db.exec('set role anon');
 for(const treatment of ['relaxation','remedial']) {
 const {rows}=await db.query<{q:{price:number,discount_percent:number}}>("select public.quote_booking($1,' family ') as q",[treatment]);
 assert.equal(rows[0].q.price,0);assert.equal(rows[0].q.discount_percent,100);
 }
 await assert.rejects(db.query('select * from public.discount_codes'),/permission denied/);
 await assert.rejects(db.query("select public.quote_booking('relaxation','INVALID')"),/not recognised/);
 await db.exec('reset role');
 const {rows:slots}=await db.query<{id:string}>("insert into public.slots(starts_at,ends_at) values('2030-10-01T00:00Z','2030-10-01T01:00Z'),('2030-10-02T00:00Z','2030-10-02T01:00Z') returning id");
 await db.exec('set role service_role');
 const sql='select public.create_booking($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as r';
 const args=[slots[0].id,'remedial','Test Client','discount@example.com','0400000000','','Shoulders',true,'33333333-3333-4333-8333-333333333333','family'];
 const {rows}=await db.query<{r:{price:number,discount_code:string}}>(sql,args);assert.equal(rows[0].r.price,0);assert.equal(rows[0].r.discount_code,'FAMILY');
 assert.deepEqual((await db.query(sql,args)).rows,rows);
 await assert.rejects(db.query(sql,[...args.slice(0,9),'']),/Request already used/);
 await db.exec("update public.clients set private_notes='Keep these notes' where email='discount@example.com'");
 const paid=await db.query<{r:{price:number}}>(sql,[slots[1].id,'remedial','Changed Name','different@example.com','+61 400 000 000','','Shoulders',true,'44444444-4444-4444-8444-444444444444',null]);assert.equal(paid.rows[0].r.price,120);
 const clients=await db.query<{name:string,private_notes:string}>("select name,private_notes from public.clients");assert.equal(clients.rows.length,1);assert.equal(clients.rows[0].name,'Test Client');assert.equal(clients.rows[0].private_notes,'Keep these notes');
 const ids=await db.query<{n:number}>("select count(distinct client_id)::int as n from public.appointments");assert.equal(ids.rows[0].n,1);
 assert.deepEqual((await db.query(sql,[slots[1].id,'remedial','Changed Name','different@example.com','0400 000 000','','Shoulders',true,'44444444-4444-4444-8444-444444444444',null])).rows,paid.rows);
 await db.exec('reset role');await db.exec("update public.discount_codes set active=false where code='FAMILY'");
 await assert.rejects(db.query("select public.quote_booking('remedial','FAMILY')"),/not recognised/);
 } finally { await db.close(); }
});
