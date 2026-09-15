import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarFile,
  dayKey,
  googleCalendar,
  melbourneInstant,
  validateDetails,
} from "../src/domain.ts";

test("Melbourne daylight saving changes UTC without changing the chosen local time", () => {
  assert.equal(
    melbourneInstant("2030-07-10", "09:00"),
    "2030-07-09T23:00:00.000Z",
  );
  assert.equal(
    melbourneInstant("2030-12-10", "09:00"),
    "2030-12-09T22:00:00.000Z",
  );
  assert.equal(dayKey("2030-12-09T22:00:00Z"), "2030-12-10");
  assert.throws(
    () => melbourneInstant("2030-10-06", "02:30"),
    /daylight saving/,
  );
  assert.equal(
    melbourneInstant("2030-04-07", "02:30"),
    "2030-04-06T16:30:00.000Z",
  );
});
test("remedial requires focus areas and booking requires consent and valid contact details", () => {
  const details = {
    name: "Test Client",
    email: "test@example.com",
    phone: "0400 000 000",
    intake_notes: "",
    body_parts: "",
    consent: true,
    website: "",
  };
  assert.deepEqual(validateDetails(details, "relaxation"), {});
  assert.ok(validateDetails(details, "remedial").body_parts);
  assert.ok(
    validateDetails({ ...details, consent: false }, "relaxation").consent,
  );
  assert.ok(
    validateDetails({ ...details, phone: "aaaaaaaaaa" }, "relaxation").phone,
  );
});
test("calendar exports contain the correct instant and no client or health details", () => {
  const receipt = {
    reference: "JM-TEST",
    treatment: "remedial" as const,
    price: 120,
    starts_at: "2030-12-09T22:00:00Z",
    ends_at: "2030-12-09T23:00:00Z",
  };
  const ics = calendarFile(receipt);
  assert.match(ics, /DTSTART:20301209T220000Z/);
  assert.match(ics, /DTEND:20301209T230000Z/);
  assert.ok(ics.endsWith("\r\n"));
  assert.match(ics, /LOCATION:To be provided/);
  const url = new URL(googleCalendar(receipt));
  assert.equal(url.searchParams.get("ctz"), "Australia/Melbourne");
  assert.equal(
    url.searchParams.get("dates"),
    "20301209T220000Z/20301209T230000Z",
  );
  assert.ok(!ics.includes("intake_notes") && !ics.includes("email"));
});
