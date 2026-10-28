/**
 * Enumerations from the class diagram (SRS Appendix B.2).
 */

/** FR 1.2: the three user roles. */
export const ROLES = ['CHW', 'DENTIST', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

/**
 * FR 5.3: case status.
 * PENDING  = saved on the device, not uploaded. Exists only on the phone.
 * SYNCED   = on the server, waiting for a dentist (the dentist queue).
 * REVIEWED = a dentist has triaged it.
 */
export const CASE_STATUSES = ['PENDING', 'SYNCED', 'REVIEWED'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** Statuses the server may hold. The server never stores a PENDING case. */
export const SERVER_CASE_STATUSES = ['SYNCED', 'REVIEWED'] as const;
export type ServerCaseStatus = (typeof SERVER_CASE_STATUSES)[number];

/** FR 7.1: triage priority. */
export const PRIORITIES = ['ROUTINE', 'URGENT', 'EMERGENCY'] as const;
export type Priority = (typeof PRIORITIES)[number];

/**
 * FR 3.2: standard oral views. At least one of each required view per case,
 * plus any number of optional EXTRA photos.
 */
export const VIEW_TYPES = ['FRONT', 'UPPER_ARCH', 'LOWER_ARCH', 'EXTRA'] as const;
export type ViewType = (typeof VIEW_TYPES)[number];
export const REQUIRED_VIEWS: readonly ViewType[] = ['FRONT', 'UPPER_ARCH', 'LOWER_ARCH'];

/** FR 4.1: symptom duration as fixed buckets, quick to tap (NFR 3). */
export const SYMPTOM_DURATIONS = [
  'LESS_THAN_1_DAY',
  'DAYS_1_TO_7',
  'WEEKS_1_TO_4',
  'MORE_THAN_1_MONTH',
] as const;
export type SymptomDuration = (typeof SYMPTOM_DURATIONS)[number];

/**
 * Optional patient sex. Not listed in FR 2.1; kept optional and pending
 * confirmation (see docs/TRACEABILITY.md, open questions).
 */
export const SEXES = ['FEMALE', 'MALE', 'OTHER', 'NOT_STATED'] as const;
export type Sex = (typeof SEXES)[number];

/** FR 2.1 location: Kenya's 47 counties, so the dashboard can filter by location (FR 6.3). */
export const KENYA_COUNTIES = [
  'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu', 'Garissa',
  'Homa Bay', 'Isiolo', 'Kajiado', 'Kakamega', 'Kericho', 'Kiambu', 'Kilifi',
  'Kirinyaga', 'Kisii', 'Kisumu', 'Kitui', 'Kwale', 'Laikipia', 'Lamu',
  'Machakos', 'Makueni', 'Mandera', 'Marsabit', 'Meru', 'Migori', 'Mombasa',
  "Murang'a", 'Nairobi', 'Nakuru', 'Nandi', 'Narok', 'Nyamira', 'Nyandarua',
  'Nyeri', 'Samburu', 'Siaya', 'Taita-Taveta', 'Tana River', 'Tharaka-Nithi',
  'Trans Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga', 'Wajir', 'West Pokot',
] as const;
export type County = (typeof KENYA_COUNTIES)[number];

/** FR 3.3 / SRS 2.6: hard limit for one whole submission (images + text). */
export const MAX_SUBMISSION_BYTES = 2 * 1024 * 1024;
