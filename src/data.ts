import { createClient } from "@supabase/supabase-js";
import {
  addDays,
  dayKey,
  melbourneInstant,
  treatments,
  type Appointment,
  type Client,
  type Details,
  type Receipt,
  type Quote,
  type Slot,
  type Treatment,
} from "./domain";
const url = import.meta.env.VITE_SUPABASE_URL || "";
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
export const configured = Boolean(url && key);
export const demo =
  !configured &&
  ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
export const db = configured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        storage: sessionStorage,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
const today = dayKey(new Date());
const sampleSlots: Slot[] = [
  1, 2, 4, 5, 7, 8, 9, 11, 14, 18, 22, 29, 35, 42,
].flatMap((n, i) =>
  (i % 2 ? ["10:00", "11:30", "15:00"] : ["09:00", "12:00", "16:30"]).map(
    (t) => {
      const start = melbourneInstant(addDays(today, n), t);
      return {
        id: crypto.randomUUID(),
        starts_at: start,
        ends_at: new Date(new Date(start).getTime() + 3600000).toISOString(),
        active: true,
      };
    },
  ),
);
const sampleClient: Client = {
  id: crypto.randomUUID(),
  name: "Alex Example",
  email: "alex@example.com",
  phone: "0400 000 000",
  private_notes: "Sample client only. Prefers a quiet session.",
  created_at: new Date().toISOString(),
};
let clients: Client[] = [sampleClient];
const pastSlot: Slot = {
  id: crypto.randomUUID(),
  starts_at: melbourneInstant(addDays(today, -7), "10:00"),
  ends_at: melbourneInstant(addDays(today, -7), "11:00"),
  active: true,
};
let slots = [...sampleSlots, pastSlot];
let appointments: Appointment[] = [sampleSlots[0], pastSlot].map((slot, i) => ({
  id: crypto.randomUUID(),
  reference: `DEMO-EXAMPLE${i}`,
  slot_id: slot.id,
  client_id: sampleClient.id,
  treatment: i ? "relaxation" : "remedial",
  price: i ? 100 : 120,
  intake_notes: "Example intake note. No real client information.",
  body_parts: i ? "" : "Shoulders and upper back",
  session_notes: i
    ? "Example session note. Client reported feeling more relaxed."
    : "",
  status: "confirmed",
  created_at: new Date().toISOString(),
  slots: slot,
  clients: sampleClient,
}));
function requireDB() {
  if (!db)
    throw new Error(
      "Online bookings are not open yet. Please check back soon.",
    );
  return db;
}
export async function availableSlots(): Promise<Slot[]> {
  if (demo)
    return slots
      .filter(
        (s) =>
          s.active &&
          new Date(s.starts_at).getTime() > Date.now() &&
          !appointments.some(
            (a) => a.slot_id === s.id && a.status === "confirmed",
          ),
      )
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  if (!db) return [];
  const fetchedSlots: Slot[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .rpc("available_slots")
      .range(offset, offset + 499);
    if (error)
      throw new Error("We couldn’t load available times. Please try again.");
    fetchedSlots.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  return fetchedSlots;
}
export async function book(
  slot: Slot,
  treatment: Treatment,
  details: Details,
  requestId: string,
  discountCode = "",
): Promise<Receipt> {
  if (demo) {
    if (!(await availableSlots()).some((s) => s.id === slot.id))
      throw new Error("That time has just been booked. Please choose another.");
    const quote = await quoteBooking(treatment, discountCode);
    const c: Client = {
      id: crypto.randomUUID(),
      name: details.name.trim(),
      email: details.email.trim(),
      phone: details.phone.trim(),
      private_notes: "",
      created_at: new Date().toISOString(),
    };
    clients = [...clients, c];
    const r = {
      reference: `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      treatment,
      price: quote.price,
      discount_code: quote.discount_code,
      discount_percent: quote.discount_percent,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
    };
    appointments.push({
      id: crypto.randomUUID(),
      ...r,
      slot_id: slot.id,
      client_id: c.id,
      intake_notes: details.intake_notes,
      body_parts: treatment === "remedial" ? details.body_parts : "",
      session_notes: "",
      status: "confirmed",
      created_at: new Date().toISOString(),
      slots: slot,
      clients: c,
    });
    return r;
  }
  requireDB();
  const response = await fetch(`${url}/functions/v1/book`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({
      slot_id: slot.id,
      treatment,
      details,
      request_id: requestId,
      discount_code: discountCode,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      result.error || "We couldn’t confirm your booking. Please try again.",
    );
  return result;
}
export async function adminData(): Promise<{
  appointments: Appointment[];
  clients: Client[];
  slots: Slot[];
}> {
  if (demo)
    return {
      appointments: appointments.map((a) => ({
        ...a,
        clients: clients.find((c) => c.id === a.client_id)!,
      })),
      clients: [...clients],
      slots: [...slots],
    };
  const supabase = requireDB();
  async function all<T>(
    table: string,
    select: string,
    order: string,
  ): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .order(order)
        .order("id")
        .range(offset, offset + 499);
      if (error)
        throw new Error("Couldn’t load your appointments. Please retry.");
      rows.push(...((data || []) as T[]));
      if (!data || data.length < 500) break;
    }
    return rows;
  }
  const [a, c, s] = await Promise.all([
    all<Appointment>("appointments", "*, slots(*), clients(*)", "created_at"),
    all<Client>("clients", "*", "name"),
    all<Slot>("slots", "*", "starts_at"),
  ]);
  return { appointments: a, clients: c, slots: s };
}
export async function saveNotes(
  id: string,
  value: string,
  kind: "client" | "session",
) {
  if (demo) {
    if (kind === "client")
      clients = clients.map((c) =>
        c.id === id ? { ...c, private_notes: value } : c,
      );
    else
      appointments = appointments.map((a) =>
        a.id === id ? { ...a, session_notes: value } : a,
      );
    return;
  }
  const { error } = await requireDB()
    .from(kind === "client" ? "clients" : "appointments")
    .update(
      kind === "client" ? { private_notes: value } : { session_notes: value },
    )
    .eq("id", id);
  if (error) throw new Error("Your notes weren’t saved. Please retry.");
}
export async function addSlots(date: string, time: string, weeks: number) {
  const series = weeks > 1 ? crypto.randomUUID() : null;
  const proposed = Array.from({ length: weeks }, (_, i) => {
    const starts_at = melbourneInstant(addDays(date, i * 7), time);
    return {
      id: crypto.randomUUID(),
      starts_at,
      ends_at: new Date(new Date(starts_at).getTime() + 3600000).toISOString(),
      active: true,
      series_id: series,
    };
  });
  if (proposed.some((s) => new Date(s.starts_at).getTime() <= Date.now()))
    throw new Error("Choose a time in the future.");
  if (demo) {
    if (
      proposed.some((p) =>
        slots.some(
          (s) => s.active && p.starts_at < s.ends_at && p.ends_at > s.starts_at,
        ),
      )
    )
      throw new Error(
        "A slot overlaps an existing appointment or available time. Nothing was added.",
      );
    slots.push(...proposed);
    return;
  }
  const { error } = await requireDB().rpc("add_slots", {
    p_date: date,
    p_time: time,
    p_weeks: weeks,
  });
  if (error)
    throw new Error(
      error.code === "23P01"
        ? "A slot overlaps an existing time. Nothing was added."
        : "Couldn’t add these slots. Check the times and try again.",
    );
}
export async function removeSlot(id: string, series = false) {
  if (demo) {
    const slot = slots.find((s) => s.id === id)!;
    slots = slots.map((s) =>
      (s.id === id ||
        (series &&
          slot.series_id &&
          s.series_id === slot.series_id &&
          s.starts_at >= slot.starts_at)) &&
      !appointments.some((a) => a.slot_id === s.id && a.status === "confirmed")
        ? { ...s, active: false }
        : s,
    );
    return;
  }
  const { error } = await requireDB().rpc("remove_slots", {
    p_slot_id: id,
    p_series: series,
  });
  if (error)
    throw new Error("Couldn’t remove that slot. It may now have a booking.");
}
export async function cancelAppointment(id: string, reopen: boolean) {
  if (demo) {
    const a = appointments.find((a) => a.id === id)!;
    appointments = appointments.map((a) =>
      a.id === id ? { ...a, status: "cancelled" } : a,
    );
    slots = slots.map((s) =>
      s.id === a.slot_id ? { ...s, active: reopen } : s,
    );
    return;
  }
  const { error } = await requireDB().rpc("cancel_appointment", {
    p_id: id,
    p_reopen: reopen,
  });
  if (error) throw new Error("Couldn’t cancel this appointment. Please retry.");
}

export async function quoteBooking(treatment: Treatment, code: string): Promise<Quote> {
 const normalized = code.trim().toUpperCase();
 if (demo) {
   if (normalized && normalized !== 'FAMILY') throw new Error('Discount code not recognised.');
   return {original_price:treatments[treatment].price,price:normalized?0:treatments[treatment].price,discount_code:normalized||null,discount_percent:normalized?100:0};
 }
 const {data,error}=await requireDB().rpc('quote_booking',{p_treatment:treatment,p_discount_code:normalized||null});
 if(error) throw new Error(error.code==='22023'?'Discount code not recognised or no longer available.':'Couldn’t check the code. Please try again.');
 return data as Quote;
}
