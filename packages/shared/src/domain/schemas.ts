/**
 * Zod schemas shared by the mobile app, API and dashboard, so all three
 * validate the same shapes. Field names follow the class diagram (B.2).
 */
import { z } from 'zod';
import {
  KENYA_COUNTIES, PRIORITIES, ROLES, SERVER_CASE_STATUSES, SEXES,
  SYMPTOM_DURATIONS, VIEW_TYPES, REQUIRED_VIEWS,
} from './enums.js';
import { ANON_ID_PATTERN } from './anonId.js';

export const uuid = z.uuid();

// ---- FR 1.1 authentication ------------------------------------------------

/** CHW PIN: exactly 6 digits (FR 1.1, "PIN on mobile"). */
export const pinSchema = z.string().regex(/^\d{6}$/, 'PIN must be 6 digits');
/** Dentist / admin password. */
export const passwordSchema = z.string().min(10, 'Password must be at least 10 characters').max(200);

export const loginRequestSchema = z.object({
  /** Usernames are stored lowercase (createUserSchema), so "Dr.Alvin" logs in as dr.alvin. */
  username: z.string().trim().toLowerCase().min(3).max(64),
  /** Password, or the CHW's PIN. Strength is checked when the credential is set, not at login. */
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authUserSchema = z.object({
  id: uuid,
  username: z.string(),
  role: z.enum(ROLES),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const loginResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.iso.datetime(),
  user: authUserSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

// ---- FR 2 patient registration -------------------------------------------

export const patientSchema = z.object({
  /** Client-generated UUID (idempotency key, FR 5.2). */
  id: uuid,
  /** FR 2.2: anonymised ID shown to dentists. */
  anonId: z.string().regex(ANON_ID_PATTERN),
  /** FR 2.1. Encrypted at rest; never shown on the dentist dashboard. */
  name: z.string().trim().min(1).max(120),
  age: z.number().int().min(0).max(120),
  location: z.enum(KENYA_COUNTIES),
  sex: z.enum(SEXES).optional(),
  /** FR 2.3: consent must be true before any capture. */
  consentGiven: z.literal(true),
  consentDate: z.iso.datetime(),
});
export type PatientInput = z.infer<typeof patientSchema>;

// ---- FR 3 / FR 4 case submission ------------------------------------------

export const oralImageMetaSchema = z.object({
  id: uuid,
  viewType: z.enum(VIEW_TYPES),
  sizeKB: z.number().int().positive(),
  capturedAt: z.iso.datetime(),
  /** Hex SHA-256 of the uploaded (compressed) bytes, for integrity checks (FR 5.2). */
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type OralImageMeta = z.infer<typeof oralImageMetaSchema>;

export const symptomAssessmentSchema = z.object({
  id: uuid,
  painLevel: z.number().int().min(1).max(10),
  duration: z.enum(SYMPTOM_DURATIONS),
});
export type SymptomAssessmentInput = z.infer<typeof symptomAssessmentSchema>;

/** Body of POST /cases (sequence diagram step 12). Image bytes travel alongside. */
export const caseSubmissionSchema = z
  .object({
    id: uuid,
    createdAt: z.iso.datetime(),
    patient: patientSchema,
    images: z.array(oralImageMetaSchema).min(3),
    assessment: symptomAssessmentSchema,
  })
  .superRefine((c, ctx) => {
    // FR 3.2: at least the 3 standard views.
    for (const view of REQUIRED_VIEWS) {
      if (!c.images.some((i) => i.viewType === view)) {
        ctx.addIssue({ code: 'custom', path: ['images'], message: `Missing required view ${view}` });
      }
    }
    const ids = new Set(c.images.map((i) => i.id));
    if (ids.size !== c.images.length) {
      ctx.addIssue({ code: 'custom', path: ['images'], message: 'Duplicate image id' });
    }
  });
export type CaseSubmission = z.infer<typeof caseSubmissionSchema>;

// ---- FR 7 triage ------------------------------------------------------------

/** Body of PUT /cases/{id}/triage (sequence diagram step 27). */
export const triageRequestSchema = z.object({
  priority: z.enum(PRIORITIES),
  note: z
    .object({
      /** Client-generated so a retried PUT does not add the note twice. */
      id: uuid,
      noteText: z.string().trim().min(1).max(5000),
      referralAdvice: z.string().trim().max(2000).optional(),
    })
    .optional(),
});
export type TriageRequest = z.infer<typeof triageRequestSchema>;

/** Response of GET /cases/{id}/triage (sequence diagram steps 31-32). */
export const triageResultSchema = z.object({
  caseId: uuid,
  status: z.enum(SERVER_CASE_STATUSES),
  priority: z.enum(PRIORITIES).nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  notes: z.array(
    z.object({
      id: uuid,
      noteText: z.string(),
      referralAdvice: z.string().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
});
export type TriageResult = z.infer<typeof triageResultSchema>;
