import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  newHistory,
  profileFromHistory,
  type HistoryForm,
  essentialChecks,
  essentialSessionFields,
  profileFields,
} from "../src/history.ts";
import type { Appointment, Client } from "../src/domain.ts";

test("new session carries essentials and intake, not previous examination or consent", () => {
  const c = {
    name: "Example",
    phone: "0400000000",
    email: "example@example.com",
    history_profile: {
      address: "Example street",
      allergies: "Example allergy",
      occupation: "Example work",
    },
  } as Client;
  const a = {
    slots: { starts_at: "2030-10-01T00:00Z", ends_at: "2030-10-01T01:30Z" },
    body_parts: "Shoulder",
    intake_notes: "Client note",
    session_notes: "Older notes",
  } as Appointment;
  const form = newHistory(a, c);
  assert.equal(form.essentials.allergies, "Example allergy");
  assert.equal(form.essentials.phone, c.phone);
  assert.equal(form.fields.location, "Shoulder");
  assert.equal(form.fields.bookingNotes, "Client note");
  assert.equal(form.fields.legacyNotes, "Older notes");
  assert.equal(form.checks.clientConsent, undefined);
  assert.ok(Object.values(form.checks).every((v) => v === false));
  assert.equal(form.fields.date, "2030-10-01");
  assert.equal(form.fields.duration, "90 minutes");
  assert.deepEqual(form.drawings, {});
  assert.deepEqual(form.sides, {});
  assert.equal(profileFromHistory(form).occupation, "Example work");
  assert.equal(profileFromHistory(form).phone, c.phone);
  for (const [key] of profileFields) form.essentials[key] = "Saved " + key;
  form.essentials.name = "Recorded name";
  form.essentials.phone = "0411111111";
  form.essentials.email = "new@example.com";
  for (const key of essentialSessionFields) form.fields[key] = "Saved " + key;
  for (const key of essentialChecks) form.checks[key] = true;
  const next = newHistory(a, {
    ...c,
    history_profile: profileFromHistory(form),
  });
  for (const key of [
    "name",
    "phone",
    "email",
    ...profileFields.map(([key]) => key),
  ])
    assert.equal(next.essentials[key], form.essentials[key]);
  for (const key of essentialSessionFields.filter(
    (key) => key !== "date" && key !== "duration",
  ))
    assert.equal(next.fields[key], form.fields[key]);
  for (const key of essentialChecks) assert.equal(next.checks[key], true);
  assert.equal(next.fields.date, "2030-10-01");
  assert.equal(next.fields.duration, "90 minutes");
  assert.equal(next.checks.clientConsent, undefined);
});

test("history is admin-only, atomic, per session, and rejects stale saves", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;`,
    );
    for (const f of [
      "202609150001_bookings.sql",
      "202609180001_discounts.sql",
      "202609180002_client_phone.sql",
      "202609210001_remedial_history.sql",
      "202609210002_all_essentials.sql",
    ])
      await db.exec(
        await readFile(
          new URL("../supabase/migrations/" + f, import.meta.url),
          "utf8",
        ),
      );
    const admin = "11111111-1111-4111-8111-111111111111";
    await db.query("insert into auth.users values($1)", [admin]);
    await db.query("insert into public.admins values($1)", [admin]);
    const { rows: s } = await db.query<{ id: string }>(
      "insert into public.slots(starts_at,ends_at) values('2030-01-01T00:00Z','2030-01-01T01:00Z'),('2030-01-02T00:00Z','2030-01-02T01:00Z') returning id",
    );
    for (const slot of s)
      await db.query(
        "select public.create_booking($1,'remedial','Example','example@example.com','0400000000','','Shoulder',true,gen_random_uuid(),null)",
        [slot.id],
      );
    const { rows: a } = await db.query<{ id: string }>(
      "select id from public.appointments order by created_at,id",
    );
    const form: HistoryForm = {
      version: 1,
      essentials: {
        name: "Recorded Example",
        phone: "0411111111",
        email: "recorded@example.com",
        address: "Example street",
        allergies: "Example allergy",
        gender: "Other",
      },
      fields: {
        reason: "Example symptoms",
        date: "2030-01-01",
        duration: "60 minutes",
        visit: "Returning client",
        healthUnderstanding: "Yes",
        cautionDetails: "Example caution",
      },
      checks: {
        clientConsent: true,
        cautionAllergies: true,
        cautionSurgery: false,
      },
      sides: { acromion: { L: true, R: true, LNotes: "5°", RNotes: "10°" } },
      drawings: {
        pain: [
          {
            points: [
              [12, 30],
              [20, 40],
            ],
          },
        ],
      },
    };
    const sql =
      "select public.save_remedial_history($1,$2,$3,$4,$5,$6) as result";
    const args = [
      a[0].id,
      JSON.stringify(form),
      "Preserve private notes",
      0,
      0,
      true,
    ];
    await db.exec("set role anon");
    await assert.rejects(db.query(sql, args), /permission denied/);
    await assert.rejects(
      db.query("select remedial_form from public.appointments"),
      /permission denied/,
    );
    await db.exec("set role authenticated");
    await assert.rejects(db.query(sql, args), /Admin access required/);
    assert.equal(
      (await db.query("select * from public.clients")).rows.length,
      0,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      admin,
    ]);
    await assert.rejects(
      db.query("update public.appointments set remedial_form='{}'"),
      /permission denied/,
    );
    await db.query(sql, args);
    const profile = await db.query<{ history_profile: Record<string, string> }>(
      "select history_profile from public.clients",
    );
    assert.deepEqual(profile.rows[0].history_profile, profileFromHistory(form));
    const saved = await db.query<{ remedial_form: HistoryForm }>(
      "select remedial_form from public.appointments where id=$1",
      [a[0].id],
    );
    assert.deepEqual(saved.rows[0].remedial_form, form);
    await assert.rejects(db.query(sql, args), /changed in another window/);
    const second = {
      ...form,
      fields: { reason: "Second session" },
      checks: {},
      drawings: {},
    };
    await db.query(sql, [
      a[1].id,
      JSON.stringify(second),
      "Preserve private notes",
      0,
      1,
      true,
    ]);
    assert.deepEqual(
      (
        await db.query<{ remedial_form: HistoryForm }>(
          "select remedial_form from public.appointments where id=$1",
          [a[0].id],
        )
      ).rows[0].remedial_form,
      form,
    );
    await db.query(sql, [
      a[0].id,
      JSON.stringify({ ...form, essentials: { address: "Old snapshot" } }),
      "Updated private note",
      1,
      2,
      false,
    ]);
    const c = await db.query<{
      history_profile: { address: string };
      private_notes: string;
    }>("select history_profile,private_notes from public.clients");
    assert.equal(c.rows[0].history_profile.address, "Example street");
    assert.equal(c.rows[0].private_notes, "Updated private note");
    await db.exec(
      "update public.clients set private_notes='Changed elsewhere'",
    );
    await assert.rejects(
      db.query(sql, [a[0].id, JSON.stringify(form), "Stale", 2, 3, true]),
      /changed in another window/,
    );
    assert.equal(
      (
        await db.query<{ private_notes: string }>(
          "select private_notes from public.clients",
        )
      ).rows[0].private_notes,
      "Changed elsewhere",
    );
    await assert.rejects(
      db.query(sql, [a[0].id, "{}", "Invalid", 2, 4, true]),
      /Invalid history form/,
    );
  } finally {
    await db.close();
  }
});
