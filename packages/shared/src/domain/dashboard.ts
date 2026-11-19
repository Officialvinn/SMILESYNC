/**
 * Sprint 3: shapes shared by the API and the web dashboard.
 * FR 6 (queue, case view), FR 7 (triage), FR 8 (users, audit log).
 *
 * Dentists never receive the patient's name: no schema here has a name field
 * (decision: dashboard shows anonymised ID, age, sex and location only).
 */
import { z } from 'zod';
import {
  KENYA_COUNTIES, PRIORITIES, ROLES, SERVER_CASE_STATUSES, SEXES, SYMPTOM_DURATIONS, VIEW_TYPES,
} from './enums.js';

// ---- FR 6.1 / 6.3 queue ------------------------------------------------------

/**
 * Default order: highest pain first, then oldest (Synced cases have no
 * priority yet; see docs/TRACEABILITY.md, open question 2).
 */
export const QUEUE_SORTS = ['pain', 'oldest', 'newest', 'priority'] as const;
export type QueueSort = (typeof QUEUE_SORTS)[number];

export const queueQuerySchema = z.object({
  status: z.enum([...SERVER_CASE_STATUSES, 'ALL']).default('SYNCED'),
  priority: z.enum(PRIORITIES).optional(),
  location: z.enum(KENYA_COUNTIES).optional(),
  /** Received on the server on or after this day (YYYY-MM-DD, UTC). */
  from: z.iso.date().optional(),
  /** Received on the server on or before this day (YYYY-MM-DD, UTC). */
  to: z.iso.date().optional(),
  sort: z.enum(QUEUE_SORTS).default('pain'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type QueueQuery = z.infer<typeof queueQuerySchema>;

export const queueItemSchema = z.object({
  id: z.uuid(),
  anonId: z.string(),
  age: z.number().int(),
  sex: z.enum(SEXES).nullable(),
  location: z.string(),
  painLevel: z.number().int().nullable(),
  duration: z.enum(SYMPTOM_DURATIONS).nullable(),
  /** When the CHW created the case on the phone. */
  createdAt: z.iso.datetime(),
  /** When the server received it. */
  syncedAt: z.iso.datetime(),
  status: z.enum(SERVER_CASE_STATUSES),
  priority: z.enum(PRIORITIES).nullable(),
  imageCount: z.number().int(),
});
export type QueueItem = z.infer<typeof queueItemSchema>;

export const queueResponseSchema = z.object({
  items: z.array(queueItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type QueueResponse = z.infer<typeof queueResponseSchema>;

// ---- FR 6.2 case view --------------------------------------------------------

export const caseNoteSchema = z.object({
  id: z.uuid(),
  noteText: z.string(),
  referralAdvice: z.string().nullable(),
  createdAt: z.iso.datetime(),
  author: z.string(),
});

export const caseDetailSchema = queueItemSchema.extend({
  consentDate: z.iso.datetime(),
  submittedBy: z.string(),
  reviewedAt: z.iso.datetime().nullable(),
  reviewedBy: z.string().nullable(),
  images: z.array(
    z.object({ id: z.uuid(), viewType: z.enum(VIEW_TYPES), sizeKB: z.number().int(), capturedAt: z.iso.datetime() }),
  ),
  notes: z.array(caseNoteSchema),
});
export type CaseDetail = z.infer<typeof caseDetailSchema>;

// ---- FR 8.1 users ------------------------------------------------------------

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export const userSummarySchema = z.object({
  id: z.uuid(),
  username: z.string(),
  role: z.enum(ROLES),
  isActive: z.boolean(),
  chwCode: z.string().nullable(),
  assignedSite: z.string().nullable(),
  licenseNumber: z.string().nullable(),
  specialty: z.string().nullable(),
  adminLevel: z.string().nullable(),
  lockedUntil: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

const optionalText = z.string().trim().min(1).max(120).optional();

/** Password for dentists and admins, 6-digit PIN for CHWs (checked per role by the API). */
export const createUserSchema = z.object({
  username: z.string().trim().toLowerCase().regex(USERNAME_PATTERN, 'Use 3-64 lowercase letters, digits, dot, dash or underscore'),
  role: z.enum(ROLES),
  secret: z.string().min(1).max(200),
  chwCode: optionalText,
  assignedSite: optionalText,
  licenseNumber: optionalText,
  specialty: optionalText,
  adminLevel: optionalText,
});
export type CreateUser = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    /** false deactivates the account and ends its sessions (FR 8.1). */
    isActive: z.boolean().optional(),
    /** New password or PIN; ends existing sessions and clears a lockout. */
    secret: z.string().min(1).max(200).optional(),
    /** Clears a lockout after too many wrong logins. */
    unlock: z.literal(true).optional(),
    assignedSite: optionalText,
    specialty: optionalText,
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export type UpdateUser = z.infer<typeof updateUserSchema>;

// ---- FR 8.2 audit log --------------------------------------------------------

export const auditQuerySchema = z.object({
  username: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
  outcome: z.enum(['ALLOWED', 'DENIED', 'NOT_FOUND']).optional(),
  resourceId: z.string().trim().min(1).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const auditEntrySchema = z.object({
  id: z.uuid(),
  timestamp: z.iso.datetime(),
  username: z.string().nullable(),
  role: z.enum(ROLES).nullable(),
  action: z.string(),
  outcome: z.string(),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
  ipAddress: z.string().nullable(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditResponseSchema = z.object({
  items: z.array(auditEntrySchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type AuditResponse = z.infer<typeof auditResponseSchema>;

