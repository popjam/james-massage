import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("database privacy, atomic bookings, notes, cancellation and availability rules", async (t) => {
  const db = new PGlite();
  const admin = "11111111-1111-4111-8111-111111111111";
  const stranger = "22222222-2222-4222-8222-222222222222";
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`,
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202609150001_bookings.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.query("insert into auth.users(id) values($1),($2)", [
    admin,
    stranger,
  ]);
  await db.query("insert into public.admins(user_id) values($1)", [admin]);
  async function role(name: string, id = "") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec(`set role ${name}`);
  }
  await role("authenticated", admin);
  await db.query("select public.add_slots('2030-10-01','09:00',2)");
  const { rows: initial } = await db.query<{ id: string; starts_at: Date }>(
    "select id, starts_at from public.slots order by starts_at",
  );
  const slot = initial[0].id;
  const request = "33333333-3333-4333-8333-333333333333";
  const args = [
    slot,
    "remedial",
    "Sample Client",
    "sample@example.com",
    "0400 000 000",
    "Example only",
    "Shoulders",
    true,
    request,
  ];
  const bookingSQL =
    "select public.create_booking($1,$2,$3,$4,$5,$6,$7,$8,$9) as receipt";
  await t.test(
    "recurrence keeps 9am Melbourne across daylight saving",
    async () => {
      const { rows } = await db.query<{ local_time: string }>(
        "select to_char(starts_at at time zone 'Australia/Melbourne','HH24:MI') as local_time from public.slots",
      );
      assert.deepEqual(
        rows.map((r) => r.local_time),
        ["09:00", "09:00"],
      );
      assert.equal(new Date(initial[0].starts_at).getUTCHours(), 23);
      assert.equal(new Date(initial[1].starts_at).getUTCHours(), 22);
      await assert.rejects(
        db.query("select public.add_slots('2030-10-06','02:30',1)"),
        /Invalid local time/,
      );
    },
  );
  await t.test(
    "anonymous can read availability but no client or appointment tables",
    async () => {
      await role("anon");
      assert.equal(
        (await db.query("select * from public.available_slots()")).rows.length,
        2,
      );
      await assert.rejects(
        db.query("select * from public.clients"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select * from public.appointments"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select * from public.admins"),
        /permission denied/,
      );
      await assert.rejects(db.query(bookingSQL, args), /permission denied/);
      await assert.rejects(
        db.query("select public.add_slots('2030-12-01','10:00',1)"),
        /permission denied/,
      );
    },
  );
  let appointmentId = "";
  let clientId = "";
  await t.test(
    "server booking charges the server price, hides booked slots and is idempotent",
    async () => {
      await role("service_role");
      const first = await db.query<{
        receipt: { price: number; reference: string };
      }>(bookingSQL, args);
      assert.equal(first.rows[0].receipt.price, 120);
      const retry = await db.query(bookingSQL, args);
      assert.deepEqual(first.rows, retry.rows);
      await assert.rejects(
        db.query(bookingSQL, [
          ...args.slice(0, 8),
          "44444444-4444-4444-8444-444444444444",
        ]),
        /Slot unavailable/,
      );
      const { rows } = await db.query<{ id: string; client_id: string }>(
        "select id,client_id from public.appointments",
      );
      assert.equal(rows.length, 1);
      appointmentId = rows[0].id;
      clientId = rows[0].client_id;
      await role("anon");
      assert.equal(
        (await db.query("select * from public.available_slots()")).rows.length,
        1,
      );
    },
  );
  await t.test(
    "unapproved signed-in users cannot read records or mutate availability",
    async () => {
      await role("authenticated", stranger);
      assert.equal(
        (await db.query("select * from public.clients")).rows.length,
        0,
      );
      assert.equal(
        (await db.query("select * from public.appointments")).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "update public.clients set private_notes='forbidden' returning id",
          )
        ).rows.length,
        0,
      );
      await assert.rejects(
        db.query("select public.add_slots('2030-12-01','10:00',1)"),
        /Not authorised/,
      );
      await assert.rejects(
        db.query("select public.cancel_appointment($1,true)", [appointmentId]),
        /Not authorised/,
      );
    },
  );
  await t.test(
    "admin can save separate notes but cannot override booking prices directly",
    async () => {
      await role("authenticated", admin);
      await db.query(
        "update public.clients set private_notes='Private ongoing note' where id=$1",
        [clientId],
      );
      await db.query(
        "update public.appointments set session_notes='Private session note' where id=$1",
        [appointmentId],
      );
      assert.equal(
        (
          await db.query<{ private_notes: string }>(
            "select private_notes from public.clients",
          )
        ).rows[0].private_notes,
        "Private ongoing note",
      );
      assert.equal(
        (
          await db.query<{ session_notes: string }>(
            "select session_notes from public.appointments",
          )
        ).rows[0].session_notes,
        "Private session note",
      );
      await assert.rejects(
        db.query("update public.appointments set price=1"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select public.remove_slots($1,false)", [slot]),
        /Slot has an appointment/,
      );
    },
  );
  await t.test(
    "overlapping availability is rejected atomically; adjacent slots are allowed",
    async () => {
      await assert.rejects(
        db.query("select public.add_slots('2030-10-01','09:30',1)"),
        /conflicting key/,
      );
      await db.query("select public.add_slots('2030-10-01','10:00',1)");
      assert.equal(
        (await db.query("select * from public.slots")).rows.length,
        3,
      );
      // First slot in series is clear, second collides: the first must also roll back.
      await assert.rejects(
        db.query("select public.add_slots('2030-09-24','09:00',2)"),
        /conflicting key/,
      );
      assert.equal(
        (await db.query("select * from public.slots")).rows.length,
        3,
      );
    },
  );
  await t.test(
    "removing a weekly series preserves existing appointments",
    async () => {
      await db.query("select public.remove_slots($1,true)", [slot]);
      const { rows } = await db.query<{ id: string; active: boolean }>(
        "select id,active from public.slots where series_id is not null order by starts_at",
      );
      assert.equal(rows[0].active, true);
      assert.equal(rows[1].active, false);
    },
  );
  await t.test(
    "cancellation can reopen a slot while retaining client history",
    async () => {
      await db.query("select public.cancel_appointment($1,true)", [
        appointmentId,
      ]);
      assert.equal(
        (
          await db.query<{ status: string }>(
            "select status from public.appointments",
          )
        ).rows[0].status,
        "cancelled",
      );
      await role("anon");
      assert.ok(
        (
          await db.query<{ id: string }>(
            "select * from public.available_slots()",
          )
        ).rows.some((s) => s.id === slot),
      );
      await role("service_role");
      await db.query(bookingSQL, [
        ...args.slice(0, 8),
        "55555555-5555-4555-8555-555555555555",
      ]);
      assert.equal(
        (await db.query("select * from public.clients")).rows.length,
        1,
      );
      assert.equal(
        (await db.query("select * from public.appointments")).rows.length,
        2,
      );
      assert.equal(
        (
          await db.query<{ private_notes: string }>(
            "select private_notes from public.clients",
          )
        ).rows[0].private_notes,
        "Private ongoing note",
      );
    },
  );
  await t.test("rate limiting persists across repeated attempts", async () => {
    const attempt = () =>
      db.query<{ allowed: boolean }>(
        "select public.consume_booking_attempt('test:hash',2) as allowed",
      );
    assert.equal((await attempt()).rows[0].allowed, true);
    assert.equal((await attempt()).rows[0].allowed, true);
    assert.equal((await attempt()).rows[0].allowed, false);
  });
  await db.close();
});
