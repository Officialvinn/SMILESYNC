/**
 * FR 2.3 consent, then FR 2.1 registration and FR 2.2 anonymised ID.
 *
 * Consent comes first: the details form only opens after the CHW records that
 * the patient agreed, and nothing is stored if the patient refuses. This
 * follows FR 2.3 where the sequence and activity diagrams show details first
 * (see docs/TRACEABILITY.md).
 */
import { z } from 'zod';
import { KENYA_COUNTIES, SEXES, generateAnonId, patientSchema, type PatientInput } from '@smilesync/shared';
import type { RandomBytes } from './ports';

/** Read aloud by the CHW before anything is recorded (Kenya DPA 2019: informed consent). */
export const CONSENT_POINTS = [
  'I will take photos of your teeth and ask about pain, so a dentist can advise you.',
  'Your name stays on this phone. The dentist sees a code number, your age, sex and county, not your name.',
  'The photos and answers are encrypted on this phone and when they are sent.',
  'You can refuse, and you will still be treated with respect. You can also stop at any time before the case is sent.',
] as const;

export interface Consent {
  consentGiven: true;
  consentDate: string;
}

export function recordConsent(at: Date): Consent {
  return { consentGiven: true, consentDate: at.toISOString() };
}

/** What the details form collects, as typed. */
export interface PatientForm {
  name: string;
  age: string;
  location: string;
  sex: string;
}

export type FormErrors = Partial<Record<keyof PatientForm | 'consent', string>>;

const formSchema = z.object({
  name: z.string().trim().min(1, "Enter the patient's name").max(120, 'Name is too long'),
  age: z
    .string()
    .trim()
    .regex(/^\d{1,3}$/, 'Enter age in years, 0 to 120')
    .transform(Number)
    .pipe(z.number().int().min(0, 'Enter age in years, 0 to 120').max(120, 'Enter age in years, 0 to 120')),
  location: z.enum(KENYA_COUNTIES, 'Choose a county'),
  sex: z.union([z.literal('').transform(() => undefined), z.enum(SEXES)]),
});

export function buildPatient(
  form: PatientForm,
  consent: Consent,
  deps: { uuid: () => string; randomBytes: RandomBytes },
): { ok: true; patient: PatientInput } | { ok: false; errors: FormErrors } {
  if (consent.consentGiven !== true) return { ok: false, errors: { consent: 'Record consent first' } };

  const parsed = formSchema.safeParse(form);
  if (!parsed.success) {
    const errors: FormErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof PatientForm;
      errors[field] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const { sex, ...rest } = parsed.data;
  const patient = patientSchema.parse({
    id: deps.uuid(),
    anonId: generateAnonId(deps.randomBytes),
    ...rest,
    ...(sex ? { sex } : {}),
    consentGiven: true,
    consentDate: consent.consentDate,
  });
  return { ok: true, patient };
}
