import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  LockKeyhole,
  LogOut,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Repeat2,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  addSlots,
  adminData,
  cancelAppointment,
  configured,
  db,
  demo,
  removeSlot,
  saveNotes,
} from "./data";
import {
  dateLabel,
  dayKey,
  shortDate,
  timeLabel,
  treatments,
  type Appointment,
  type Client,
  type Slot,
} from "./domain";
type Data = { appointments: Appointment[]; clients: Client[]; slots: Slot[] };
export default function Admin() {
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(Boolean(db));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!db) return;
    const verify = async () => {
      const { data, error } = await db!.rpc("is_admin");
      setAllowed(!error && data === true);
      setChecking(false);
    };
    void verify();
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAllowed(false);
        setChecking(false);
      } else {
        setTimeout(() => void verify(), 0);
      }
    });
    return () => subscription.unsubscribe();
  }, []);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error } = await db!.auth.signInWithPassword({ email, password });
      if (error)
        throw new Error("Email or password not recognised. Please try again.");
      const { data } = await db!.rpc("is_admin");
      if (!data) {
        await db!.auth.signOut();
        throw new Error(
          "This account does not have access to James’ appointments.",
        );
      }
      setAllowed(true);
      setPassword("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (checking)
    return (
      <main className="admin-login">
        <div className="empty-state">
          <span className="spinner" />
          Checking your session…
        </div>
      </main>
    );
  if (!allowed)
    return (
      <main className="admin-login">
        <section className="login-card">
          <div className="login-icon">
            <LockKeyhole size={30} />
          </div>
          <p className="eyebrow">JUST FOR JAMES</p>
          <h1>Your quiet corner.</h1>
          <p className="muted">Appointments, availability and client notes.</p>
          {demo ? (
            <>
              <div className="info-note">
                Explore the admin view with fictional clients. Changes last only
                until this page is refreshed.
              </div>
              <button className="primary" onClick={() => setAllowed(true)}>
                Explore sample admin <ChevronRight size={18} />
              </button>
            </>
          ) : configured ? (
            <form onSubmit={login}>
              <label className="field">
                Email
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="field">
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && (
                <div className="error-message" role="alert">
                  {error}
                </div>
              )}
              <button className="primary" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
                <ChevronRight size={18} />
              </button>
            </form>
          ) : (
            <div className="info-note">Admin access is not set up yet.</div>
          )}
          <a className="back-link" href="#">
            <ArrowLeft size={16} />
            Back to booking
          </a>
        </section>
      </main>
    );
  return (
    <Dashboard
      onLogout={async () => {
        if (db) await db.auth.signOut();
        setAllowed(false);
      }}
    />
  );
}
function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<Data>({
    appointments: [],
    clients: [],
    slots: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"appointments" | "availability" | "clients">(
    "appointments",
  );
  const [past, setPast] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [date, setDate] = useState(dayKey(new Date()));
  const [time, setTime] = useState("09:00");
  const [recurring, setRecurring] = useState(false);
  const [weeks, setWeeks] = useState(8);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [remove, setRemove] = useState<Slot | null>(null);
  const [removeSeries, setRemoveSeries] = useState(false);
  async function refresh() {
    setError("");
    try {
      setData(await adminData());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const upcoming = data.appointments
    .filter(
      (a) =>
        a.status === "confirmed" &&
        new Date(a.slots.ends_at).getTime() > Date.now(),
    )
    .sort((a, b) => a.slots.starts_at.localeCompare(b.slots.starts_at));
  const visible = data.appointments
    .filter((a) =>
      past
        ? a.status === "cancelled" ||
          new Date(a.slots.ends_at).getTime() <= Date.now()
        : a.status === "confirmed" &&
          new Date(a.slots.ends_at).getTime() > Date.now(),
    )
    .filter((a) =>
      `${a.clients.name} ${a.clients.email} ${a.clients.phone}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      past
        ? b.slots.starts_at.localeCompare(a.slots.starts_at)
        : a.slots.starts_at.localeCompare(b.slots.starts_at),
    );
  const open = data.slots
    .filter(
      (s) =>
        s.active &&
        new Date(s.starts_at).getTime() > Date.now() &&
        !data.appointments.some(
          (a) => a.slot_id === s.id && a.status === "confirmed",
        ),
    )
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await addSlots(date, time, recurring ? weeks : 1);
      setNotice(
        recurring ? `${weeks} weekly slots added.` : "Available slot added.",
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirmRemove() {
    if (!remove) return;
    setBusy(true);
    setError("");
    try {
      await removeSlot(remove.id, removeSeries);
      setRemove(null);
      setRemoveSeries(false);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="dashboard">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">YOUR PRACTICE, AT A GLANCE</p>
          <h1>Hello, James.</h1>
          <p>Make a little space for a good day.</p>
        </div>
        <button className="secondary compact" onClick={onLogout}>
          <LogOut size={16} /> Sign out
        </button>
      </div>
      <div className="stats">
        <div>
          <CalendarDays size={23} />
          <span>
            <strong>{upcoming.length}</strong>Upcoming appointments
          </span>
        </div>
        <div>
          <Clock3 size={23} />
          <span>
            <strong>{open.length}</strong>Available slots
          </span>
        </div>
        <div>
          <Users size={23} />
          <span>
            <strong>{data.clients.length}</strong>Clients
          </span>
        </div>
      </div>
      {upcoming[0] && (
        <button
          className="next-appointment"
          onClick={() => setSelected(upcoming[0])}
        >
          <span className="next-label">UP NEXT</span>
          <strong>{upcoming[0].clients.name}</strong>
          <span>
            {shortDate(upcoming[0].slots.starts_at)} ·{" "}
            {timeLabel(upcoming[0].slots.starts_at)}
          </span>
          <span>{treatments[upcoming[0].treatment].name}</span>
          <ChevronRight size={20} />
        </button>
      )}
      <section className="admin-panel">
        <div
          className="admin-tabs"
          role="tablist"
          aria-label="Practice management"
        >
          {(["appointments", "availability", "clients"] as const).map((t) => (
            <button
              role="tab"
              aria-selected={tab === t}
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => {
                setTab(t);
                setSearch("");
                setNotice("");
              }}
            >
              {t === "appointments" ? (
                <CalendarDays size={18} />
              ) : t === "availability" ? (
                <Clock3 size={18} />
              ) : (
                <Users size={18} />
              )}
              <span>{t[0].toUpperCase() + t.slice(1)}</span>
            </button>
          ))}
          <button
            className="icon-button refresh"
            onClick={() => void refresh()}
            aria-label="Refresh appointments"
          >
            <RefreshCw size={17} />
          </button>
        </div>
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="saved-message" role="status">
            <Check size={16} />
            {notice}
          </div>
        )}
        {loading ? (
          <div className="empty-state">
            <span className="spinner" />
            Loading your practice…
          </div>
        ) : tab === "appointments" ? (
          <>
            <div className="panel-toolbar">
              <div className="segmented">
                <button
                  className={!past ? "active" : ""}
                  onClick={() => setPast(false)}
                >
                  Upcoming
                </button>
                <button
                  className={past ? "active" : ""}
                  onClick={() => setPast(true)}
                >
                  Past & cancelled
                </button>
              </div>
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="Search appointments"
                  placeholder="Find a client…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            <div className="appointment-list">
              {visible.length ? (
                visible.map((a) => (
                  <button
                    key={a.id}
                    className="appointment-row"
                    onClick={() => setSelected(a)}
                  >
                    <div className="date-tile">
                      <strong>
                        {new Intl.DateTimeFormat("en-AU", {
                          day: "numeric",
                          timeZone: "Australia/Melbourne",
                        }).format(new Date(a.slots.starts_at))}
                      </strong>
                      <span>
                        {new Intl.DateTimeFormat("en-AU", {
                          month: "short",
                          timeZone: "Australia/Melbourne",
                        }).format(new Date(a.slots.starts_at))}
                      </span>
                    </div>
                    <span className="appointment-client">
                      <strong>{a.clients.name}</strong>
                      <span>
                        {treatments[a.treatment].name} · 60 min · ${a.price}
                      </span>
                    </span>
                    <span className="appointment-time">
                      {timeLabel(a.slots.starts_at)}
                      <small>
                        {a.status === "cancelled"
                          ? "Cancelled"
                          : a.body_parts || "Relaxation massage"}
                      </small>
                    </span>
                    <ChevronRight size={19} />
                  </button>
                ))
              ) : (
                <Empty
                  label={
                    search
                      ? "No matching appointments."
                      : past
                        ? "No past appointments yet."
                        : "A little breathing room. No upcoming appointments."
                  }
                />
              )}
            </div>
          </>
        ) : tab === "availability" ? (
          <div className="availability-layout">
            <form className="add-slot" onSubmit={create}>
              <h2>Make a little space.</h2>
              <p className="muted">
                Add the exact times you’d like to offer. Every slot lasts one
                hour.
              </p>
              <label className="field">
                Date
                <input
                  type="date"
                  required
                  value={date}
                  min={dayKey(new Date())}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="field">
                Start time · Melbourne
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                />
                <span>
                  <Repeat2 size={15} /> Repeat weekly
                </span>
              </label>
              {recurring && (
                <label className="field">
                  Number of weeks
                  <input
                    type="number"
                    min={2}
                    max={104}
                    required
                    value={weeks}
                    onChange={(e) => setWeeks(Number(e.target.value))}
                  />
                  <small>
                    Includes the first slot. You can remove individual weeks
                    later.
                  </small>
                </label>
              )}
              <button className="primary" disabled={busy}>
                {busy ? "Adding…" : "Add availability"}
                <Plus size={18} />
              </button>
              <p className="small muted">
                Leave as much time between slots as you like. Overlapping slots
                are prevented.
              </p>
            </form>
            <div className="available-list">
              <h3>
                Available to book <span>{open.length}</span>
              </h3>
              {open.length ? (
                open.map((s) => (
                  <div className="slot-row" key={s.id}>
                    <CalendarDays size={19} />
                    <span>
                      <strong>{shortDate(s.starts_at)}</strong>
                      <small>
                        {timeLabel(s.starts_at)} – {timeLabel(s.ends_at)}
                        {s.series_id && <Repeat2 size={13} />}
                      </small>
                    </span>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${shortDate(s.starts_at)} ${timeLabel(s.starts_at)}`}
                      onClick={() => {
                        setRemove(s);
                        setRemoveSeries(false);
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))
              ) : (
                <Empty label="No open slots. Add a time to get started." />
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="panel-toolbar">
              <h2>Your clients</h2>
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="Search clients"
                  placeholder="Name, email or phone…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            <div className="client-list">
              {data.clients
                .filter((c) =>
                  `${c.name} ${c.email} ${c.phone}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((c) => (
                  <button
                    className="client-row"
                    key={c.id}
                    onClick={() => setSelectedClient(c)}
                  >
                    <span className="avatar">{c.name[0]}</span>
                    <span>
                      <strong>{c.name}</strong>
                      <small>{c.email}</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                ))}
            </div>
          </>
        )}
      </section>
      <p className="admin-footnote">
        <ShieldCheck size={15} /> Your private practice space · All times shown
        in Melbourne time
      </p>
      {(selected || selectedClient) && (
        <ClientPanel
          key={selected?.id || selectedClient?.id}
          appointment={selected}
          client={selected?.clients || selectedClient!}
          history={data.appointments.filter(
            (a) => a.client_id === (selected?.client_id || selectedClient?.id),
          )}
          onClose={() => {
            setSelected(null);
            setSelectedClient(null);
          }}
          onSaved={refresh}
          onSelect={(a) => {
            setSelectedClient(null);
            setSelected(a);
          }}
        />
      )}
      {remove && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-title"
          >
            <h2 id="remove-title">Remove this available time?</h2>
            <p>
              {dateLabel(remove.starts_at)} at {timeLabel(remove.starts_at)}
            </p>
            {remove.series_id && (
              <label className="consent">
                <input
                  type="checkbox"
                  checked={removeSeries}
                  onChange={(e) => setRemoveSeries(e.target.checked)}
                />
                <span>
                  Also remove later available slots in this weekly series.
                  Existing appointments will stay.
                </span>
              </label>
            )}
            <div className="modal-actions">
              <button
                data-dialog-close
                className="secondary"
                onClick={() => setRemove(null)}
                disabled={busy}
              >
                Keep slot
              </button>
              <button
                className="primary"
                onClick={() => void confirmRemove()}
                disabled={busy}
              >
                Remove
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
function Empty({ label }: { label: string }) {
  return (
    <div className="empty-state">
      <CalendarDays size={28} />
      <p>{label}</p>
    </div>
  );
}
function ClientPanel({
  appointment,
  client,
  history,
  onClose,
  onSaved,
  onSelect,
}: {
  appointment: Appointment | null;
  client: Client;
  history: Appointment[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onSelect: (a: Appointment) => void;
}) {
  const [session, setSession] = useState(appointment?.session_notes || "");
  const [notes, setNotes] = useState(client.private_notes);
  const [savedSession, setSavedSession] = useState(session);
  const [savedNotes, setSavedNotes] = useState(notes);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reopen, setReopen] = useState(false);
  const [discard, setDiscard] = useState(false);
  const dirty = session !== savedSession || notes !== savedNotes;
  async function save() {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await saveNotes(client.id, notes, "client");
      setSavedNotes(notes);
      if (appointment) {
        await saveNotes(appointment.id, session, "session");
        setSavedSession(session);
      }
      await onSaved();
      setNotice("Notes saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (!appointment) return;
    setBusy(true);
    setError("");
    try {
      await cancelAppointment(appointment.id, reopen);
      await onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  return (
    <div className="modal-backdrop drawer-backdrop">
      <aside
        className="client-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-name"
      >
        <div className="drawer-header">
          <span className="eyebrow">
            {appointment ? "APPOINTMENT & CLIENT" : "CLIENT PROFILE"}
          </span>
          <button
            className="icon-button"
            aria-label="Close client details"
            disabled={busy}
            onClick={() => (dirty ? setDiscard(true) : onClose())}
          >
            <X size={22} />
          </button>
        </div>
        <h2 id="client-name">{client.name}</h2>
        <div className="client-contact">
          <a href={`tel:${client.phone}`}>
            <Phone size={16} />
            {client.phone}
          </a>
          <a href={`mailto:${client.email}`}>
            <Mail size={16} />
            {client.email}
          </a>
        </div>
        {appointment && (
          <>
            <div className="drawer-summary">
              <strong>
                {treatments[appointment.treatment].name} · ${appointment.price}
              </strong>
              <span>{dateLabel(appointment.slots.starts_at)}</span>
              <span>
                {timeLabel(appointment.slots.starts_at)} –{" "}
                {timeLabel(appointment.slots.ends_at)} · Melbourne
              </span>
              <small>
                {appointment.reference} · {appointment.status}
              </small>
            </div>
            <section className="intake">
              <h3>From your client</h3>
              {appointment.body_parts && (
                <p>
                  <strong>Focus areas</strong>
                  {appointment.body_parts}
                </p>
              )}
              <p>
                <strong>Before the session</strong>
                {appointment.intake_notes || "No additional notes shared."}
              </p>
            </section>
            <label className="field">
              Private session notes
              <textarea
                rows={5}
                maxLength={20000}
                value={session}
                onChange={(e) => {
                  setSession(e.target.value);
                  setNotice("");
                }}
                placeholder="Treatment, observations and follow-up…"
              />
              <small>
                Only for this appointment. Never visible to the client.
              </small>
            </label>
          </>
        )}
        <label className="field">
          Private client notes
          <textarea
            rows={4}
            maxLength={20000}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setNotice("");
            }}
            placeholder="Ongoing preferences and things to remember…"
          />
          <small>Stay with this client across appointments.</small>
        </label>
        {notice && (
          <p className="saved-message" role="status">
            <Check size={15} />
            {notice}
          </p>
        )}
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
        <button
          className="primary"
          disabled={busy || !dirty}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save private notes"}
          <LockKeyhole size={16} />
        </button>
        <section className="client-history">
          <h3>Appointment history</h3>
          {[...history]
            .sort((a, b) => b.slots.starts_at.localeCompare(a.slots.starts_at))
            .map((a) => (
              <button
                disabled={dirty || busy}
                key={a.id}
                className={appointment?.id === a.id ? "active" : ""}
                onClick={() => onSelect(a)}
              >
                <span>
                  {shortDate(a.slots.starts_at)}
                  <small>
                    {treatments[a.treatment].name} · {a.status}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          {dirty && (
            <p className="small muted">
              Save your notes before opening another session.
            </p>
          )}
        </section>
        {appointment?.status === "confirmed" &&
          new Date(appointment.slots.ends_at).getTime() > Date.now() && (
            <div className="cancel-area">
              {!cancelling ? (
                <button
                  className="text-button danger"
                  disabled={dirty || busy}
                  onClick={() => setCancelling(true)}
                >
                  Cancel appointment
                </button>
              ) : (
                <>
                  <h3>Cancel this appointment?</h3>
                  <p className="small">
                    No email will be sent. Please contact the client yourself.
                  </p>
                  <label className="consent">
                    <input
                      type="checkbox"
                      checked={reopen}
                      onChange={(e) => setReopen(e.target.checked)}
                    />
                    <span>Make this time available to book again.</span>
                  </label>
                  <div className="modal-actions">
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => setCancelling(false)}
                    >
                      Keep booking
                    </button>
                    <button
                      className="primary danger-button"
                      disabled={busy}
                      onClick={() => void cancel()}
                    >
                      Cancel booking
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        {discard && (
          <div className="discard-notice" role="alert">
            <strong>You have unsaved notes.</strong>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setDiscard(false)}>
                Keep editing
              </button>
              <button className="secondary danger" onClick={onClose}>
                Discard changes
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
