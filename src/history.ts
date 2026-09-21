import { dayKey, type Appointment, type Client } from "./domain.ts";
export type Stroke = { points: [number, number][] };
export type SideFinding = {
  L: boolean;
  R: boolean;
  LNotes: string;
  RNotes: string;
};
export type HistoryForm = {
  version: 1;
  carryEssentials?: boolean;
  essentials: Record<string, string>;
  fields: Record<string, string>;
  checks: Record<string, boolean>;
  sides: Record<string, SideFinding>;
  drawings: Record<string, Stroke[]>;
};
export const profileFields = [
  ["dob", "Date of birth", "date"],
  ["gender", "Gender (optional)"],
  ["address", "Street address"],
  ["suburb", "Suburb"],
  ["postcode", "Postcode"],
  ["referral", "Referred by"],
  ["clinic", "Clinic"],
  ["emergencyName", "Emergency contact"],
  ["emergencyRelationship", "Relationship"],
  ["emergencyPhone", "Emergency phone", "tel"],
  ["allergies", "Allergies"],
  ["medication", "Medication"],
  ["surgery", "Surgery history"],
  ["illness", "Illness / health conditions"],
  ["otherCautions", "Other cautions / contraindications"],
  ["occupation", "Occupation"],
  ["duties", "Work duties"],
  ["hobbies", "Sports / hobbies"],
] as const;
export const essentialSessionFields = [
  "date",
  "duration",
  "visit",
  "healthUnderstanding",
  "cautionDetails",
] as const;
export const essentialChecks = [
  "cautionSurgery",
  "cautionIllness",
  "cautionMedication",
  "cautionAllergies",
  "cautionOther",
] as const;
export function sessionDuration(a: Appointment) {
  const minutes = Math.round(
    (new Date(a.slots.ends_at).getTime() -
      new Date(a.slots.starts_at).getTime()) /
      60000,
  );
  return `${Number.isFinite(minutes) && minutes > 0 ? minutes : 60} minutes`;
}
export function newHistory(a: Appointment, c: Client): HistoryForm {
  return {
    version: 1,
    essentials: {
      name: c.name,
      phone: c.phone,
      email: c.email,
      ...c.history_profile,
    },
    fields: {
      ...Object.fromEntries(
        essentialSessionFields.map((key) => [
          key,
          c.history_profile?.[key] || "",
        ]),
      ),
      date: dayKey(a.slots.starts_at),
      duration: sessionDuration(a),
      location: a.body_parts,
      bookingNotes: a.intake_notes,
      legacyNotes: a.session_notes,
      practitioner: "James",
    },
    checks: Object.fromEntries(
      essentialChecks.map((key) => [key, c.history_profile?.[key] === "true"]),
    ),
    sides: {},
    drawings: {},
  };
}
export function profileFromHistory(form: HistoryForm) {
  return Object.fromEntries([
    ...["name", "phone", "email", ...profileFields.map(([key]) => key)].map(
      (key) => [key, form.essentials[key] || ""],
    ),
    ...essentialSessionFields.map((key) => [key, form.fields[key] || ""]),
    ...essentialChecks.map((key) => [key, String(!!form.checks[key])]),
  ]);
}
export const observations = [
  [
    "acromion",
    "Acromion",
    "Compare the height and position of the outer shoulder landmarks. Note any asymmetry.",
  ],
  [
    "inferiorAngles",
    "Inferior angles of scapulae",
    "Compare the lower tips of the shoulder blades for height, position and winging.",
  ],
  [
    "iliacCrest",
    "Iliac crest",
    "Compare the height of the upper pelvic rims from behind. Record the observed difference.",
  ],
  [
    "trendelenburg",
    "Trendelenburg",
    "Observe pelvic control during single-leg stance. Record the stance side and any opposite-side pelvic drop or trunk compensation.",
  ],
  [
    "thoracicRotation",
    "Thoracic rotation",
    "Observe rotation of the upper trunk to each side; record range, asymmetry and symptoms.",
  ],
  [
    "gait",
    "Angle of gait",
    "Observe the angle of each foot relative to the direction of walking (toe-in or toe-out). Record degrees if measured.",
  ],
  [
    "pelvicTilt",
    "Pelvic tilt",
    "Observe pelvic orientation. Record anterior/posterior tilt and any side-to-side difference; include the measurement method.",
  ],
] as const;
