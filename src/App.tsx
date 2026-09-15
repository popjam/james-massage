import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flower2,
  Heart,
  Leaf,
  LockKeyhole,
  MapPin,
  MoveUpRight,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { availableSlots, book, configured, demo } from "./data";
import {
  calendarFile,
  dateLabel,
  dayKey,
  googleCalendar,
  money,
  monthCells,
  shortDate,
  timeLabel,
  treatments,
  validateDetails,
  type Details,
  type Receipt,
  type Slot,
  type Treatment,
} from "./domain";
import Admin from "./Admin";
import { useDialogFocus } from "./useDialogFocus";
const emptyDetails: Details = {
  name: "",
  email: "",
  phone: "",
  intake_notes: "",
  body_parts: "",
  consent: false,
  website: "",
};
const stepNames = ["Massage", "Duration", "When", "Your details"];
export default function App() {
  useDialogFocus();
  const [admin, setAdmin] = useState(location.hash === "#admin");
  const [privacy, setPrivacy] = useState(false);
  useEffect(() => {
    const change = () => setAdmin(location.hash === "#admin");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  return (
    <div className={`site ${admin ? "admin-site" : ""}`}>
      {demo && (
        <div className="demo-banner">
          <Sparkles size={14} /> Local preview · sample data only · no real
          bookings or emails
        </div>
      )}
      <header className="site-header">
        <a className="brand" href="#" aria-label="James Massage home">
          <Flower2 size={25} strokeWidth={1.5} />
          <span>
            james massage<span className="brand-dot">.</span>
          </span>
        </a>
        <span className="header-note">A little time for you.</span>
      </header>
      {admin ? (
        <Admin />
      ) : (
        <main className="booking-main">
          <div className="intro">
            <img
              className="intro-art"
              src="./massage-illustration.png"
              alt=""
            />
            <div>
              <p className="eyebrow">
                TAKE A BREATH. YOU’RE IN THE RIGHT PLACE.
              </p>
              <h1>Want a massage?</h1>
              <p className="intro-subtitle">
                Let’s find a little space for you to unwind.
              </p>
            </div>
          </div>
          <Booking />
          <div className="reassurance">
            <span>
              <Heart size={16} /> Care that’s all about you
            </span>
            <span>
              <Wallet size={16} /> Pay in person
            </span>
          </div>
        </main>
      )}
      <footer className="site-footer">
        <span>© {new Date().getFullYear()} James Massage</span>
        <nav>
          <button className="text-button" onClick={() => setPrivacy(true)}>
            Your privacy
          </button>
          <a href={admin ? "#" : "#admin"}>
            {admin ? (
              "Back to booking"
            ) : (
              <>
                <LockKeyhole size={13} /> James’ login
              </>
            )}
          </a>
        </nav>
      </footer>
      {privacy && (
        <div className="modal-backdrop" onClick={() => setPrivacy(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-title"
            onClick={(e) => e.stopPropagation()}
          >
            <ShieldCheck size={30} />
            <h2 id="privacy-title">Your details, kept private.</h2>
            <p>
              James uses your name and contact details to manage your
              appointment, and any information you choose to share to prepare
              for your massage.
            </p>
            <p>
              Client information and James’ notes are restricted to his admin
              account. They are not published on this website or stored in its
              code repository. Health details are not added to calendar files.
            </p>
            <p>
              You can ask James to correct or remove your information, subject
              to any record-keeping requirements. No marketing emails are sent.
            </p>
            {demo && (
              <p>
                <strong>
                  This local preview uses temporary sample data. Please don’t
                  enter real health information.
                </strong>
              </p>
            )}
            <button
              data-dialog-close
              className="primary"
              onClick={() => setPrivacy(false)}
            >
              Got it
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
function Booking() {
  const [step, setStep] = useState(0);
  const [treatment, setTreatment] = useState<Treatment | null>(null);
  const [duration, setDuration] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [day, setDay] = useState("");
  const [month, setMonth] = useState(dayKey(new Date()).slice(0, 7));
  const [details, setDetails] = useState<Details>(emptyDetails);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const result = await availableSlots();
      setSlots(result);
      if (result[0] && !result.some((s) => dayKey(s.starts_at) === day)) {
        setMonth(dayKey(result[0].starts_at).slice(0, 7));
        setDay(dayKey(result[0].starts_at));
      }
      if (slot && !result.some((s) => s.id === slot.id)) setSlot(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (step === 2) void refresh();
  }, [step]);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
  }, [step, receipt]);
  const chosen = treatment ? treatments[treatment] : null;
  function next() {
    setError("");
    setStep((s) => s + 1);
  }
  function changeDetails(name: keyof Details, value: string | boolean) {
    setDetails((d) => ({ ...d, [name]: value }));
    setErrors((e) => ({ ...e, [name]: "" }));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !slot || !treatment) return;
    const validation = validateDetails(details, treatment);
    setErrors(validation);
    if (Object.keys(validation).length) {
      document.getElementById(Object.keys(validation)[0])?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      setReceipt(await book(slot, treatment, details, requestId.current));
      setDetails(emptyDetails);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!receipt) return;
    const url = URL.createObjectURL(
      new Blob([calendarFile(receipt)], {
        type: "text/calendar;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `james-massage-${receipt.reference}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const activeDays = new Set(slots.map((s) => dayKey(s.starts_at)));
  function moveMonth(direction: number) {
    const d = new Date(`${month}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + direction);
    setMonth(d.toISOString().slice(0, 7));
  }
  return (
    <section
      className={`booking-card ${receipt ? "success-card" : ""}`}
      aria-label="Book a massage"
    >
      {receipt ? (
        <div className="confirmation">
          <div className="success-icon">
            <Check size={32} />
          </div>
          <p className="eyebrow">
            {demo ? "PREVIEW COMPLETE" : "A LITTLE TIME, JUST FOR YOU"}
          </p>
          <h2 ref={heading} tabIndex={-1}>
            {demo ? "That’s how easy it is." : "You’re booked in."}
          </h2>
          <p className="muted">
            {demo
              ? "This is a sample booking, not a real appointment."
              : "Your appointment is confirmed. Save these details for later."}
          </p>
          <div className="receipt">
            <div>
              <Leaf size={19} />
              <strong>{treatments[receipt.treatment].name} massage</strong>
            </div>
            <div>
              <CalendarDays size={19} />
              <span>{dateLabel(receipt.starts_at)}</span>
            </div>
            <div>
              <Clock3 size={19} />
              <span>
                {timeLabel(receipt.starts_at)} – {timeLabel(receipt.ends_at)} ·
                Melbourne time
              </span>
            </div>
            <div>
              <MapPin size={19} />
              <span>Location: to be provided</span>
            </div>
            <div>
              <Wallet size={19} />
              <span>{money(receipt.price)} AUD · pay in person</span>
            </div>
            <div className="reference">
              Booking reference <strong>{receipt.reference}</strong>
            </div>
          </div>
          <p className="small muted">
            No confirmation email is sent. Your calendar is optional.
          </p>
          <a
            className="primary"
            href={googleCalendar(receipt)}
            target="_blank"
            rel="noreferrer"
          >
            Add to Google Calendar <MoveUpRight size={17} />
          </a>
          <button className="secondary" onClick={download}>
            Apple / Outlook calendar <CalendarDays size={17} />
          </button>
          <button
            className="text-button another"
            onClick={() => {
              setStep(0);
              setTreatment(null);
              setDuration(false);
              setSlot(null);
              setReceipt(null);
              requestId.current = crypto.randomUUID();
              void refresh();
            }}
          >
            Book another massage
          </button>
        </div>
      ) : (
        <>
          <ol className="steps" aria-label="Booking progress">
            {stepNames.map((name, i) => (
              <li
                key={name}
                className={i === step ? "current" : i < step ? "complete" : ""}
                aria-current={i === step ? "step" : undefined}
              >
                <button
                  disabled={i >= step || busy}
                  onClick={() => {
                    setStep(i);
                    setError("");
                  }}
                  aria-label={`${name}${i < step ? ", go back" : ""}`}
                >
                  <span className="step-number">
                    {i < step ? <Check size={13} /> : i + 1}
                  </span>
                  <span>{name}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="card-body" key={step}>
            <div className="step-heading">
              <p className="eyebrow">STEP {step + 1} OF 4</p>
              <h2 ref={heading} tabIndex={-1}>
                {
                  [
                    "What feels right today?",
                    "Make some time for you.",
                    "Find your moment.",
                    "A few details, then relax.",
                  ][step]
                }
              </h2>
              <p className="muted">
                {
                  [
                    "Choose the massage your body’s asking for.",
                    "One unrushed hour. All yours.",
                    "Pick an available day and time.",
                    "So James can prepare for your visit.",
                  ][step]
                }
              </p>
            </div>
            {step === 0 && (
              <>
                <div
                  className="treatment-options"
                  role="radiogroup"
                  aria-label="Massage type"
                >
                  {(Object.keys(treatments) as Treatment[]).map((t) => (
                    <button
                      key={t}
                      role="radio"
                      aria-checked={treatment === t}
                      className={`treatment-option ${treatment === t ? "selected" : ""}`}
                      onClick={() => {
                        setTreatment(t);
                        setDuration(false);
                      }}
                    >
                      <span className={`treatment-icon ${t}`}>
                        {t === "relaxation" ? (
                          <Leaf size={30} strokeWidth={1.3} />
                        ) : (
                          <Sparkles size={30} strokeWidth={1.3} />
                        )}
                      </span>
                      <span className="treatment-copy">
                        <strong>{treatments[t].name}</strong>
                        <span>{treatments[t].description}</span>
                        <small>
                          60 minutes <span>·</span> {money(treatments[t].price)}
                        </small>
                      </span>
                      <span className="radio-mark">
                        {treatment === t && <Check size={14} />}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={false}
                    disabled
                    className="treatment-option coming-soon"
                  >
                    <span className="treatment-icon scratch">
                      <svg width="34" height="34" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 32V18a4 4 0 0 1 8 0v14M16 32V11a4 4 0 0 1 8 0v21M27 32V16a4 4 0 0 1 8 0v16" />
                        <path d="M7 18v5h4v-5a2 2 0 0 0-4 0ZM18 11v6h4v-6a2 2 0 0 0-4 0ZM29 16v5h4v-5a2 2 0 0 0-4 0Z" fill="currentColor" fillOpacity=".12" />
                        <path d="m30 4 1 2m5 1-2 1M4 8l2 1" />
                      </svg>
                    </span>
                    <span className="treatment-copy">
                      <strong>Scratch therapy</strong>
                      <span>A satisfying and gentle scratching experience</span>
                      <small>60 minutes <span>·</span> {money(300)}</small>
                      <span className="coming-soon-label">Coming soon</span>
                    </span>
                  </button>
                </div>
                <p className="soft-note">
                  <Heart size={16} /> A little less tension. A little more you.
                </p>
              </>
            )}
            {step === 1 && chosen && (
              <>
                <button
                  className={`duration-option ${duration ? "selected" : ""}`}
                  role="radio"
                  aria-checked={duration}
                  onClick={() => setDuration(true)}
                >
                  <span className="duration-icon">
                    <Clock3 size={28} />
                  </span>
                  <span>
                    <strong>60 minutes</strong>
                    <span>{chosen.name} massage</span>
                  </span>
                  <strong className="price">
                    {money(chosen.price)}
                    <small>AUD</small>
                  </strong>
                  <span className="radio-mark">
                    {duration && <Check size={14} />}
                  </span>
                </button>
                <div className="info-note">
                  <Wallet size={20} />
                  <p>
                    <strong>Nothing to pay today.</strong>
                    <span>Payment is taken in person at your appointment.</span>
                  </p>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                {loading ? (
                  <div className="empty-state" role="status">
                    <span className="spinner" />
                    Finding available moments…
                  </div>
                ) : slots.length === 0 ? (
                  <div className="empty-state">
                    <CalendarDays size={34} />
                    <h3>
                      {!configured && !demo
                        ? "Bookings are opening soon."
                        : "A little pause in the calendar."}
                    </h3>
                    <p>
                      {!configured && !demo
                        ? "Online booking is not open yet. Please check back soon."
                        : "There are no available times right now. Please check back for new slots."}
                    </p>
                    <button
                      className="secondary"
                      onClick={() => void refresh()}
                    >
                      Check again
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="calendar">
                      <div className="calendar-heading">
                        <button
                          className="icon-button"
                          aria-label="Previous month"
                          disabled={month <= dayKey(new Date()).slice(0, 7)}
                          onClick={() => moveMonth(-1)}
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <strong>
                          {new Intl.DateTimeFormat("en-AU", {
                            month: "long",
                            year: "numeric",
                            timeZone: "UTC",
                          }).format(new Date(`${month}-01T12:00:00Z`))}
                        </strong>
                        <button
                          className="icon-button"
                          aria-label="Next month"
                          disabled={
                            month >=
                            dayKey(slots[slots.length - 1].starts_at).slice(
                              0,
                              7,
                            )
                          }
                          onClick={() => moveMonth(1)}
                        >
                          <ChevronRight size={20} />
                        </button>
                      </div>
                      <div className="calendar-grid">
                        <div className="weekdays">
                          {["M", "T", "W", "T", "F", "S", "S"].map((v, i) => (
                            <span key={i}>{v}</span>
                          ))}
                        </div>
                        <div className="calendar-days">
                          {monthCells(month).map((date, i) =>
                            date ? (
                              <button
                                key={date}
                                className={`${activeDays.has(date) ? "available" : ""} ${day === date ? "selected-day" : ""}`}
                                disabled={!activeDays.has(date)}
                                aria-label={`${dateLabel(`${date}T12:00:00Z`)}${activeDays.has(date) ? ", available" : ", unavailable"}`}
                                aria-pressed={day === date}
                                onClick={() => {
                                  setDay(date);
                                  setSlot(null);
                                }}
                              >
                                {Number(date.slice(-2))}
                                {activeDays.has(date) && (
                                  <span className="availability-dot" />
                                )}
                              </button>
                            ) : (
                              <span key={`blank-${i}`} />
                            ),
                          )}
                        </div>
                      </div>
                      <p className="calendar-legend">
                        <span /> Available days
                      </p>
                    </div>
                    <div className="time-picker">
                      <div className="time-picker-heading">
                        <strong>
                          {day ? shortDate(`${day}T12:00:00Z`) : "Choose a day"}
                        </strong>
                        <span>Melbourne time</span>
                      </div>
                      <div className="time-options">
                        {slots
                          .filter((s) => dayKey(s.starts_at) === day)
                          .map((s) => (
                            <button
                              key={s.id}
                              className={slot?.id === s.id ? "selected" : ""}
                              aria-pressed={slot?.id === s.id}
                              onClick={() => {
                                setSlot(s);
                                requestId.current = crypto.randomUUID();
                              }}
                            >
                              {timeLabel(s.starts_at)}
                            </button>
                          ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
            {step === 3 && slot && chosen && (
              <form id="details-form" onSubmit={submit} noValidate>
                <div className="booking-summary">
                  <span>
                    <Leaf size={17} />
                    {chosen.name} · 60 min
                  </span>
                  <strong>{money(chosen.price)}</strong>
                  <span>
                    <CalendarDays size={17} />
                    {shortDate(slot.starts_at)} · {timeLabel(slot.starts_at)}
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setStep(2)}
                  >
                    Change
                  </button>
                </div>
                <div className="form-fields">
                  <Field
                    name="name"
                    label="Your name"
                    value={details.name}
                    error={errors.name}
                    onChange={(v) => changeDetails("name", v)}
                    autoComplete="name"
                    maxLength={100}
                  />
                  <div className="field-pair">
                    <Field
                      name="email"
                      label="Email"
                      type="email"
                      value={details.email}
                      error={errors.email}
                      onChange={(v) => changeDetails("email", v)}
                      autoComplete="email"
                      maxLength={254}
                    />
                    <Field
                      name="phone"
                      label="Phone number"
                      type="tel"
                      value={details.phone}
                      error={errors.phone}
                      onChange={(v) => changeDetails("phone", v)}
                      autoComplete="tel"
                      maxLength={30}
                    />
                  </div>
                  {treatment === "remedial" && (
                    <Field
                      name="body_parts"
                      label="Which areas would you like James to focus on?"
                      value={details.body_parts}
                      error={errors.body_parts}
                      onChange={(v) => changeDetails("body_parts", v)}
                      placeholder="e.g. shoulders, lower back, legs"
                      multiline
                      maxLength={1000}
                    />
                  )}
                  <Field
                    name="intake_notes"
                    label="Anything James should know?"
                    optional
                    value={details.intake_notes}
                    onChange={(v) => changeDetails("intake_notes", v)}
                    placeholder="Allergies, injuries, preferences…"
                    multiline
                    maxLength={2000}
                  />
                  <div className="honeypot" aria-hidden="true">
                    <label>
                      Website
                      <input
                        tabIndex={-1}
                        autoComplete="off"
                        value={details.website}
                        onChange={(e) =>
                          changeDetails("website", e.target.value)
                        }
                      />
                    </label>
                  </div>
                  <label className="consent">
                    <input
                      id="consent"
                      type="checkbox"
                      checked={details.consent}
                      onChange={(e) =>
                        changeDetails("consent", e.target.checked)
                      }
                    />
                    <span>
                      I agree to James using these details to arrange and
                      prepare for my massage.
                    </span>
                  </label>
                  {errors.consent && (
                    <span className="field-error">{errors.consent}</span>
                  )}
                  <p className="small muted">
                    <LockKeyhole size={13} /> Kept private. No account needed.
                  </p>
                </div>
              </form>
            )}
            {error && (
              <div className="error-message" role="alert">
                {error}
                {step === 2 && (
                  <button
                    className="text-button"
                    onClick={() => void refresh()}
                  >
                    Try again
                  </button>
                )}
              </div>
            )}
            <div className={`card-actions ${step ? "with-back" : ""}`}>
              {step > 0 && (
                <button
                  className="back-button"
                  disabled={busy}
                  onClick={() => {
                    setStep((s) => s - 1);
                    setError("");
                  }}
                >
                  <ArrowLeft size={17} /> Back
                </button>
              )}
              {step === 3 ? (
                <button
                  className="primary"
                  type="submit"
                  form="details-form"
                  disabled={busy}
                >
                  {busy
                    ? "Confirming…"
                    : demo
                      ? "Try sample booking"
                      : "Confirm my booking"}
                  {busy ? (
                    <span className="spinner" />
                  ) : (
                    <CheckCircle2 size={18} />
                  )}
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={
                    step === 0
                      ? !treatment
                      : step === 1
                        ? !duration
                        : !slot || loading
                  }
                  onClick={next}
                >
                  Continue <ArrowRight size={18} />
                </button>
              )}
            </div>
            <p className="card-bottom-note">
              {step === 3 ? (
                "Location: to be provided · All prices in AUD"
              ) : (
                <>
                  <Clock3 size={13} /> A few easy steps. A whole hour to switch
                  off.
                </>
              )}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
export function Field({
  name,
  label,
  value,
  onChange,
  error,
  optional,
  multiline,
  type = "text",
  ...rest
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  optional?: boolean;
  multiline?: boolean;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  maxLength?: number;
}) {
  const props = {
    id: name,
    name,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `${name}-error` : undefined,
    required: !optional,
    ...rest,
  };
  return (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {optional && <span>optional</span>}
      </label>
      {multiline ? (
        <textarea {...props} rows={2} />
      ) : (
        <input {...props} type={type} />
      )}{" "}
      {error && (
        <span className="field-error" id={`${name}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}
