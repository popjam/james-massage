export const ZONE = "Australia/Melbourne";
export type Treatment = "relaxation" | "remedial";
export const treatments = {
  relaxation: {
    name: "Relaxation",
    price: 100,
    description: "Slow down. Unwind. Just breathe.",
    detail: "Gentle, flowing massage to help you switch off and settle in.",
  },
  remedial: {
    name: "Remedial",
    price: 120,
    description: "A little more attention where you need it.",
    detail: "Focused massage for the areas that need some extra care.",
  },
};
export type Slot = {
  id: string;
  starts_at: string;
  ends_at: string;
  active?: boolean;
  series_id?: string | null;
};
export type Client = {
  id: string;
  name: string;
  email: string;
  phone: string;
  private_notes: string;
  created_at: string;
};
export type Appointment = {
  discount_code?: string | null;
  discount_percent?: number;
  id: string;
  reference: string;
  slot_id: string;
  client_id: string;
  treatment: Treatment;
  price: number;
  intake_notes: string;
  body_parts: string;
  session_notes: string;
  status: "confirmed" | "cancelled";
  created_at: string;
  slots: Slot;
  clients: Client;
};
export type Details = {
  name: string;
  email: string;
  phone: string;
  intake_notes: string;
  body_parts: string;
  consent: boolean;
  website: string;
};
export type Quote = { original_price: number; price: number; discount_code: string | null; discount_percent: number };
export type Receipt = {
  discount_code?: string | null;
  discount_percent?: number;
  reference: string;
  treatment: Treatment;
  price: number;
  starts_at: string;
  ends_at: string;
};
export function dayKey(date: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
export function timeLabel(date: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
}
export function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}
export function shortDate(date: string) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(date));
}
export function money(n: number) {
  return `$${n}`;
}
export function melbourneInstant(date: string, time: string): string {
  const desired = `${date}T${time}:00`;
  const base = new Date(`${desired}Z`).getTime();
  // Melbourne is UTC+10 or UTC+11. Prefer standard time in the repeated hour,
  // matching PostgreSQL; reject the skipped daylight-saving hour.
  for (const offset of [10, 11]) {
    const candidate = new Date(base - offset * 3600000);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(candidate);
    const p = Object.fromEntries(parts.map((v) => [v.type, v.value]));
    if (
      `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}` ===
      desired
    )
      return candidate.toISOString();
  }
  throw new Error(
    "That local time does not exist because of daylight saving. Choose another time.",
  );
}
export function addDays(key: string, count: number) {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
export function monthCells(month: string) {
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return [
    ...Array(offset).fill(null),
    ...Array.from(
      { length: count },
      (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
    ),
  ] as (string | null)[];
}
export function validateDetails(d: Details, treatment: Treatment) {
  const e: Record<string, string> = {};
  if (d.name.trim().length < 2) e.name = "Please enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()))
    e.email = "Please enter a valid email address.";
  if (
    !/^[+\d\s().-]+$/.test(d.phone) ||
    d.phone.replace(/\D/g, "").length < 8 ||
    d.phone.replace(/\D/g, "").length > 15
  )
    e.phone = "Please enter a valid phone number.";
  if (treatment === "remedial" && !d.body_parts.trim())
    e.body_parts = "Please tell James which areas to focus on.";
  if (!d.consent)
    e.consent =
      "Please agree so James can use these details for your appointment.";
  return e;
}
function calendarStamp(s: string) {
  return new Date(s)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z/, "Z");
}
export function googleCalendar(r: Receipt) {
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({ action: "TEMPLATE", text: `James Massage · ${treatments[r.treatment].name}`, dates: `${calendarStamp(r.starts_at)}/${calendarStamp(r.ends_at)}`, ctz: ZONE, location: "To be provided", details: `60-minute appointment. Pay $${r.price} AUD in person. Booking reference: ${r.reference}.` })}`;
}
export function calendarFile(r: Receipt) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//James Massage//Bookings//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${r.reference}@jamesmassage.com.au`,
    `DTSTAMP:${calendarStamp(new Date().toISOString())}`,
    `DTSTART:${calendarStamp(r.starts_at)}`,
    `DTEND:${calendarStamp(r.ends_at)}`,
    `SUMMARY:James Massage - ${treatments[r.treatment].name}`,
    "LOCATION:To be provided",
    `DESCRIPTION:60-minute appointment. Pay $${r.price} AUD in person. Reference: ${r.reference}.`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
