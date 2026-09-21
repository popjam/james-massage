import CopyContact from "./CopyContact";
import { useEffect, useState } from "react";
import { Check, ChevronRight, LockKeyhole, X } from "lucide-react";
import {
  dateLabel,
  shortDate,
  timeLabel,
  type Appointment,
  type Client,
} from "./domain";
import {
  newHistory,
  observations,
  profileFields,
  sessionDuration,
  type HistoryForm,
} from "./history";
import { cancelAppointment, saveRemedialHistory } from "./data";
import BodyMap from "./BodyMap";
function TextField({
  label,
  value = "",
  onChange,
  multiline = false,
  type = "text",
  hint,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  type?: string;
  hint?: string;
}) {
  return (
    <label className="field">
      {label}
      {multiline ? (
        <textarea
          rows={3}
          maxLength={5000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={type}
          maxLength={2000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}{" "}
      {hint && <span className="exam-hint">{hint}</span>}
    </label>
  );
}
export default function RemedialHistory({
  appointment: a,
  client,
  history,
  onClose,
  onSaved,
  onSelect,
}: {
  appointment: Appointment;
  client: Client;
  history: Appointment[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onSelect: (a: Appointment) => void;
}) {
  const [form, setForm] = useState<HistoryForm>(() =>
    structuredClone({
      ...(a.remedial_form || newHistory(a, client)),
      carryEssentials:
        a.remedial_form?.carryEssentials ??
        !history.some(
          (h) => h.remedial_form && h.slots.starts_at > a.slots.starts_at,
        ),
    }),
  );
  const [notes, setNotes] = useState(client.private_notes);
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify([form, client.private_notes]),
  );
  const [revision, setRevision] = useState(a.form_revision || 0);
  const [profileRevision, setProfileRevision] = useState(
    client.profile_revision || 0,
  );
  const [savedAt, setSavedAt] = useState(a.form_updated_at || "");
  const [updateProfile, setUpdateProfile] = useState(
    form.carryEssentials ??
      !history.some(
        (h) => h.remedial_form && h.slots.starts_at > a.slots.starts_at,
      ),
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [discard, setDiscard] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reopen, setReopen] = useState(false);
  const dirty = JSON.stringify([form, notes]) !== baseline;
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  function field(key: string, value: string) {
    setForm((f) => ({ ...f, fields: { ...f.fields, [key]: value } }));
    setNotice("");
  }
  function check(key: string, value: boolean) {
    setForm((f) => ({ ...f, checks: { ...f.checks, [key]: value } }));
    setNotice("");
  }
  function input(
    key: string,
    label: string,
    multiline = false,
    hint?: string,
    type = "text",
  ) {
    return (
      <TextField
        key={key}
        label={label}
        value={form.fields[key]}
        onChange={(v) => field(key, v)}
        multiline={multiline}
        hint={hint}
        type={type}
      />
    );
  }
  function choice(key: string, label: string, options: string[]) {
    return (
      <label className="field" key={key}>
        {label}
        <select
          value={form.fields[key] || ""}
          onChange={(e) => field(key, e.target.value)}
        >
          <option value="">Not recorded</option>
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
    );
  }
  function checkbox(key: string, label: string) {
    return (
      <label className="history-check" key={key}>
        <input
          type="checkbox"
          checked={!!form.checks[key]}
          onChange={(e) => check(key, e.target.checked)}
        />
        {label}
      </label>
    );
  }
  function map(key: string, label: string, signature = false) {
    return (
      <BodyMap
        key={key}
        label={label}
        signature={signature}
        value={form.drawings[key] || []}
        onChange={(v) => {
          setForm((f) => ({ ...f, drawings: { ...f.drawings, [key]: v } }));
          setNotice("");
        }}
      />
    );
  }
  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (new TextEncoder().encode(JSON.stringify(form)).length > 500000)
        throw new Error(
          "This form has too many markings. Remove some strokes before saving.",
        );
      const r = await saveRemedialHistory(
        a,
        form,
        notes,
        revision,
        profileRevision,
        updateProfile,
      );
      setRevision(r.form_revision);
      setProfileRevision(r.profile_revision);
      setSavedAt(r.form_updated_at);
      setBaseline(JSON.stringify([form, notes]));
      await onSaved();
      setNotice("History form and private notes saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await cancelAppointment(a.id, reopen);
      await onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const previous = history
    .filter((h) => h.id !== a.id && h.remedial_form)
    .sort((x, y) => y.slots.starts_at.localeCompare(x.slots.starts_at));
  return (
    <div className="modal-backdrop drawer-backdrop">
      <aside
        className="client-drawer history-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
      >
        <header className="drawer-header">
          <span className="eyebrow">PRACTITIONER RECORD · REMEDIAL</span>
          <button
            className="icon-button"
            data-dialog-close
            aria-label="Close history form"
            disabled={busy}
            onClick={() => (dirty ? setDiscard(true) : onClose())}
          >
            <X size={22} />
          </button>
        </header>
        <h2 id="history-title">{client.name}</h2>
        <p className="history-subtitle">Client history & session record</p>
        <div className="history-top">
          <div className="drawer-summary">
            <strong>{dateLabel(a.slots.starts_at)}</strong>
            <span>
              {timeLabel(a.slots.starts_at)} · 60 min · ${a.price} · {a.status}
            </span>
            <small>
              {a.reference}
              {a.discount_code
                ? ` · ${a.discount_code} · ${a.discount_percent}% off`
                : ""}
            </small>
            <CopyContact value={client.phone} label="phone number" />
            <CopyContact value={client.email} label="email address" />
          </div>
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
            />
            <small>
              Ongoing notes shared across this client’s sessions. Practitioner
              access only.
            </small>
          </label>
        </div>
        <details className="history-section previous-forms">
          <summary>
            Previous / other saved forms <span>{previous.length}</span>
          </summary>
          {previous.length ? (
            previous.map((h) => (
              <button
                className="history-link"
                key={h.id}
                disabled={dirty || busy}
                onClick={() => onSelect(h)}
              >
                <span>
                  {dateLabel(h.slots.starts_at)} ·{" "}
                  {timeLabel(h.slots.starts_at)}
                </span>
                <ChevronRight size={16} />
              </button>
            ))
          ) : (
            <p>No other saved history forms for this client yet.</p>
          )}
          {dirty && previous.length > 0 && (
            <p className="small muted">
              Save this form before opening another session.
            </p>
          )}
        </details>
        <fieldset className="history-editable" disabled={busy}>
          <details className="history-section" open>
            <summary>
              <span className="section-number">01</span> Client essentials
            </summary>
            <p className="small muted">
              Saved details are carried forward. Review allergies, medications
              and health changes with the client each visit.
            </p>
            <div className="history-grid">
              {["name", "phone", "email"].map((key) => (
                <TextField
                  key={key}
                  label={`Recorded ${key}`}
                  value={form.essentials[key]}
                  onChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      essentials: { ...f.essentials, [key]: v },
                    }))
                  }
                />
              ))}
              {profileFields.map(([key, label, ...rest]) =>
                key === "gender" ? (
                  <label className="field" key={key}>
                    {label}
                    <select
                      value={form.essentials.gender || ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          essentials: {
                            ...f.essentials,
                            gender: e.target.value,
                          },
                        }))
                      }
                    >
                      <option value="">Not recorded</option>
                      {["Male", "Female", "Other"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                      {form.essentials.gender &&
                        !["Male", "Female", "Other"].includes(
                          form.essentials.gender,
                        ) && <option>{form.essentials.gender}</option>}
                    </select>
                  </label>
                ) : (
                  <TextField
                    key={key}
                    label={label}
                    type={rest[0] || "text"}
                    value={form.essentials[key]}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        essentials: { ...f.essentials, [key]: v },
                      }))
                    }
                  />
                ),
              )}
              {input("date", "Session date", false, undefined, "date")}
              {choice("duration", "Consultation duration", [
                ...new Set([
                  "30 minutes",
                  "45 minutes",
                  "60 minutes",
                  "75 minutes",
                  "90 minutes",
                  "120 minutes",
                  sessionDuration(a),
                  ...(form.fields.duration ? [form.fields.duration] : []),
                ]),
              ])}
              {choice("visit", "Visit type", [
                "First visit",
                "Returning client",
              ])}
              {choice(
                "healthUnderstanding",
                "Client understands their overall health?",
                ["Yes", "No", "Discuss further"],
              )}
            </div>
            <div className="history-checks">
              {["Surgery", "Illness", "Medication", "Allergies", "Other"].map(
                (x) => checkbox("caution" + x, x + " caution"),
              )}
            </div>
            {input(
              "cautionDetails",
              "Session cautions / contraindication details",
              true,
            )}
            <label className="history-check">
              <input
                type="checkbox"
                checked={updateProfile}
                onChange={(e) => {
                  setUpdateProfile(e.target.checked);
                  setForm((f) => ({ ...f, carryEssentials: e.target.checked }));
                }}
              />
              Use these essentials for future forms
            </label>
            <p className="small muted">
              Carries all of section 01 into future forms, including recorded
              contact details, visit type, health understanding and cautions.
              New session dates and durations automatically use the booked
              appointment. Review the carried details each visit. This does not
              change the client’s booking contact details or earlier forms.
            </p>
          </details>
          <details className="history-section" open>
            <summary>
              <span className="section-number">02</span> Subjective examination
            </summary>
            <div className="intake history-intake">
              <strong>Client’s booking intake</strong>
              <p>{a.intake_notes || "No additional booking notes."}</p>
              <p>
                <strong>Requested focus</strong>
                {a.body_parts || "Not specified"}
              </p>
            </div>
            {input(
              "reason",
              "Reason for consultation / presenting problem",
              true,
            )}
            <div className="history-grid">
              {input("location", "Location of pain / restriction")}
              {input("spinalLevel", "Spinal level")}{" "}
              {input("onsetDate", "Onset date", false, undefined, "date")}
              {input("onsetWhen", "When did it start?")}
              {input("onsetHow", "How did it start?")}
              {input("otherSymptoms", "Other symptoms", true)}
              {input("painType", "Type of pain")}
              {input("referralPain", "Pain referral")}
              {input("aggravates", "What aggravates the pain?", true)}
              {choice(
                "painScore",
                "Degree of pain (0–10)",
                Array.from({ length: 11 }, (_, i) => String(i)),
              )}
              {choice("irritability", "Irritability", [
                "Low",
                "Moderate",
                "High",
              ])}
              {input("alleviates", "What offsets / alleviates the pain?", true)}
            </div>
            <div className="history-checks">
              {checkbox("painLeft", "Left")}
              {checkbox("painRight", "Right")}
              {checkbox("painBilateral", "Bilateral")}
            </div>
            {map("pain", "Pain, referral & restriction map")}
            {input("painMapNotes", "Body map key / location notes", true)}
            {input(
              "pastTreatment",
              "Past / current treatment and results",
              true,
            )}
            {input("specificQuestions", "Specific questions", true)}
          </details>
          <details className="history-section" open>
            <summary>
              <span className="section-number">03</span> Objective examination
            </summary>
            {choice("bodyType", "Mobility / body type", [
              "Hypomobile (0–1 on course form)",
              "Average (2–4 on course form)",
              "Hypermobile",
            ])}
            <p className="exam-hint">
              Record the mobility classification used in your course and the
              assessment method; this is not a diagnosis.
            </p>
            <h3>Posterior view & movement observations</h3>
            <p className="small muted">
              Select either or both sides to flag a finding; leaving a side
              unselected does not mean it tested normal. Record results in the
              adjacent box.
            </p>
            <div className="observation-grid">
              {observations.map(([key, label, hint]) => {
                const v = form.sides[key] || {
                  L: false,
                  R: false,
                  LNotes: "",
                  RNotes: "",
                };
                return (
                  <div className="observation" key={key}>
                    <h4>{label}</h4>
                    <p className="exam-hint">{hint}</p>
                    <div className="side-findings">
                      {(["L", "R"] as const).map((side) => (
                        <div key={side}>
                          <label className="history-check">
                            <input
                              type="checkbox"
                              aria-label={`${label} ${side}`}
                              checked={v[side]}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  sides: {
                                    ...f.sides,
                                    [key]: { ...v, [side]: e.target.checked },
                                  },
                                }))
                              }
                            />
                            {side}
                          </label>
                          <input
                            aria-label={`${label} ${side} findings`}
                            maxLength={200}
                            placeholder="e.g. 10°, finding"
                            value={v[`${side}Notes`]}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                sides: {
                                  ...f.sides,
                                  [key]: {
                                    ...v,
                                    [`${side}Notes`]: e.target.value,
                                  },
                                },
                              }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <h3>Lateral view</h3>
            <div className="history-grid">
              {input(
                "lumbar",
                "Lx · Lumbar spine",
                false,
                "Observe the lower-back curve and alignment from the side.",
              )}
              {input(
                "thoracic",
                "Tx · Thoracic spine",
                false,
                "Observe the upper-back curve and trunk alignment.",
              )}
              {input(
                "scapular",
                "Scap · Scapulae",
                false,
                "Observe shoulder-blade position relative to the rib cage.",
              )}
              {input(
                "cervical",
                "Cx · Cervical spine",
                false,
                "Observe neck curvature and head position relative to the trunk.",
              )}
            </div>
            {map("posture", "Posture & observation map")}
            {input("postureNotes", "Posture map notes", true)}
            {input(
              "functionalMovement",
              "Functional movement that reproduces pain",
              true,
              "Record the task, the client’s symptoms and where in the movement they occur.",
            )}
            <h3>Range of motion (ROM)</h3>
            <p className="exam-hint">
              Active: movement performed by the client. Passive: movement guided
              by the examiner. Resisted: muscle action against resistance.
              Record movement, side, degrees where applicable, symptoms and
              expected comparison.
            </p>
            {["Active", "Passive", "Resisted"].map((mode) => (
              <div className="rom-block" key={mode}>
                <h4>{mode}</h4>
                {[0, 1].map((i) => (
                  <div className="rom-row" key={i}>
                    {input(`${mode}${i}Movement`, `${mode} movement ${i + 1}`)}
                    {input(`${mode}${i}Left`, "L · result / °")}
                    {input(`${mode}${i}Expected`, "Expected")}
                    {input(`${mode}${i}Right`, "R · result / °")}
                  </div>
                ))}
              </div>
            ))}
            {input("romComments", "ROM comments", true)}
            {input(
              "tests",
              "Tests",
              true,
              "Document the test used, side, result and symptom response; interpret alongside the overall assessment.",
            )}
            {input(
              "palpation",
              "Visual and palpatory assessment",
              true,
              "Record observed or palpated tissue findings, tenderness and the client’s response.",
            )}
            <p className="small muted">
              Observation prompts only; use your course’s assessment methods.{" "}
              <a
                href="https://www.ncbi.nlm.nih.gov/books/NBK585755/"
                target="_blank"
                rel="noreferrer"
              >
                Examination reference
              </a>{" "}
              ·{" "}
              <a
                href="https://pubmed.ncbi.nlm.nih.gov/18246899/"
                target="_blank"
                rel="noreferrer"
              >
                Trendelenburg reference
              </a>
            </p>
          </details>
          <details className="history-section" open>
            <summary>
              <span className="section-number">04</span> Treatment & follow-up
            </summary>
            {input(
              "treatment",
              "Treatment / sequences agreed with client expectations",
              true,
            )}
            {input("reassessment", "Re-assessment", true)}
            {input("advice", "Client advice / stretches given", true)}
            {choice(
              "clientRole",
              "Client understands their role in the desired outcome?",
              ["Yes", "No", "Discuss further"],
            )}
            {input("followUp", "Follow-up plan", true)}
            {input(
              "legacyNotes",
              "Additional / existing private session notes",
              true,
            )}
          </details>
          <details className="history-section">
            <summary>
              <span className="section-number">05</span> Practitioner & client
              consent
            </summary>
            <p className="small muted">
              Record the discussion and consent for this session. Booking
              consent and consent from earlier sessions are not copied here.
            </p>
            <div className="history-grid">
              {input("practitioner", "Student practitioner name")}
              {input(
                "practitionerDate",
                "Practitioner date",
                false,
                undefined,
                "date",
              )}
            </div>
            {map("practitionerSignature", "Practitioner signature", true)}
            <h3>Discussed with the client</h3>
            <div className="history-checks">
              {checkbox(
                "conditionDiscussed",
                "Condition / concern being addressed",
              )}
              {checkbox("natureDiscussed", "Nature of the treatment")}
              {checkbox("risksBenefitsDiscussed", "Risks and benefits")}
              {checkbox("alternativesDiscussed", "Alternatives")}
            </div>
            <p className="consent-copy">
              I confirm that the information recorded for this session is
              correct to the best of my knowledge. I have discussed the proposed
              treatment, risks, benefits and alternatives with my student
              practitioner and consent to the treatment agreed for this session.
            </p>
            {checkbox(
              "clientConsent",
              "Client confirms and consents for this session",
            )}
            <div className="history-grid">
              {input("consentName", "Client / legal guardian name")}
              {choice("signerRole", "Signing as", ["Client", "Legal guardian"])}
              {input("consentDate", "Consent date", false, undefined, "date")}
            </div>
            {map("clientSignature", "Client / guardian signature", true)}
          </details>
        </fieldset>
        <div className="history-save">
          {error && (
            <div role="alert" className="error-message">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="saved-message">
              <Check size={16} />
              {notice}
            </div>
          )}
          <div>
            <span className="small muted">
              {dirty
                ? "Unsaved form changes"
                : savedAt
                  ? `Saved ${shortDate(savedAt)} at ${timeLabel(savedAt)}`
                  : "New session form"}
            </span>
            <button
              className="primary"
              disabled={busy || (!dirty && revision > 0)}
              onClick={() => void save()}
            >
              <LockKeyhole size={17} />
              {busy ? "Saving…" : "Save history form"}
            </button>
          </div>
        </div>
        <section className="client-history">
          <h3>All appointments</h3>
          {[...history]
            .sort((x, y) => y.slots.starts_at.localeCompare(x.slots.starts_at))
            .map((h) => (
              <button
                disabled={dirty || busy || h.id === a.id}
                key={h.id}
                onClick={() => onSelect(h)}
              >
                <span>
                  {shortDate(h.slots.starts_at)} · {h.treatment}
                  <small>
                    {h.remedial_form
                      ? "Saved history form"
                      : h.id === a.id
                        ? "Current session"
                        : "No history form yet"}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
        </section>
        {a.status === "confirmed" &&
          new Date(a.slots.ends_at).getTime() > Date.now() && (
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
                  <p>Cancel this appointment? No email will be sent.</p>
                  <label className="history-check">
                    <input
                      type="checkbox"
                      checked={reopen}
                      onChange={(e) => setReopen(e.target.checked)}
                    />
                    Make this slot available again
                  </label>
                  <div className="modal-actions">
                    <button
                      className="secondary"
                      onClick={() => setCancelling(false)}
                      disabled={busy}
                    >
                      Keep booking
                    </button>
                    <button
                      className="primary danger-button"
                      onClick={() => void cancel()}
                      disabled={busy}
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
            <strong>This form has unsaved changes.</strong>
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
