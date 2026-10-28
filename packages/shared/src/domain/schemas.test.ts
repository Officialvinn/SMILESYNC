/** Shared validation: FR 2.1, 2.3, 3.2, 4.1, 7.1. */
import { describe, expect, it } from 'vitest';
import { syntheticPayload } from '../testing/fixtures.js';
import { caseSubmissionSchema, pinSchema, triageRequestSchema } from './schemas.js';

const valid = () => structuredClone(syntheticPayload().submission);

describe('case submission schema', () => {
  it('accepts a complete synthetic case', () => {
    expect(caseSubmissionSchema.safeParse(valid()).success).toBe(true);
  });

  it('FR 2.3 rejects a case without consent', () => {
    const c = valid() as unknown as { patient: { consentGiven: boolean } };
    c.patient.consentGiven = false;
    expect(caseSubmissionSchema.safeParse(c).success).toBe(false);
  });

  it('FR 3.2 rejects a case missing a required view', () => {
    const c = valid();
    c.images = c.images.filter((i) => i.viewType !== 'LOWER_ARCH');
    c.images.push({ ...c.images[0]!, id: crypto.randomUUID(), viewType: 'EXTRA' });
    const r = caseSubmissionSchema.safeParse(c);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('LOWER_ARCH');
  });

  it('FR 3.2 accepts optional extra photos', () => {
    const c = structuredClone(syntheticPayload({ extraImages: 2 }).submission);
    expect(caseSubmissionSchema.safeParse(c).success).toBe(true);
  });

  it('FR 4.1 pain level must be 1 to 10', () => {
    for (const painLevel of [0, 11, 5.5]) {
      const c = valid();
      c.assessment.painLevel = painLevel;
      expect(caseSubmissionSchema.safeParse(c).success).toBe(false);
    }
  });

  it('FR 2.1 location must be a Kenyan county', () => {
    const c = valid() as unknown as { patient: { location: string } };
    c.patient.location = 'Atlantis';
    expect(caseSubmissionSchema.safeParse(c).success).toBe(false);
  });

  it('rejects duplicate image ids', () => {
    const c = valid();
    c.images[1] = { ...c.images[1]!, id: c.images[0]!.id };
    expect(caseSubmissionSchema.safeParse(c).success).toBe(false);
  });
});

describe('FR 1.1 PIN', () => {
  it('must be exactly 6 digits', () => {
    expect(pinSchema.safeParse('482913').success).toBe(true);
    for (const bad of ['1234', '12345a', '1234567']) expect(pinSchema.safeParse(bad).success).toBe(false);
  });
});

describe('FR 7.1 triage request', () => {
  it('accepts only Routine, Urgent or Emergency', () => {
    expect(triageRequestSchema.safeParse({ priority: 'URGENT' }).success).toBe(true);
    expect(triageRequestSchema.safeParse({ priority: 'LOW' }).success).toBe(false);
  });
});
