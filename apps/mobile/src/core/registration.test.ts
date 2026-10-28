/** FR 2.1 registration, FR 2.2 anonymised ID, FR 2.3 consent before capture. */
import { describe, expect, it } from 'vitest';
import { ANON_ID_PATTERN, patientSchema } from '@smilesync/shared';
import { seqRandom, testUuid } from '../../test/nodeSqlite';
import { CONSENT_POINTS, buildPatient, recordConsent } from './registration';

const deps = { uuid: testUuid, randomBytes: seqRandom() };
const consent = recordConsent(new Date('2026-10-28T09:00:00.000Z'));

describe('consent (FR 2.3)', () => {
  it('records consent with the time it was given', () => {
    expect(consent).toEqual({ consentGiven: true, consentDate: '2026-10-28T09:00:00.000Z' });
  });

  it('the script covers purpose, who sees the data, and the right to refuse', () => {
    const text = CONSENT_POINTS.join(' ').toLowerCase();
    for (const word of ['photos', 'dentist', 'name', 'refuse', 'encrypted']) expect(text).toContain(word);
  });
});

describe('buildPatient (FR 2.1, FR 2.2)', () => {
  const form = { name: '  Amina Test  ', age: '34', location: 'Narok', sex: 'FEMALE' };

  it('builds a valid patient with a fresh UUID and anonymised ID', () => {
    const r = buildPatient(form, consent, deps);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(patientSchema.parse(r.patient)).toEqual(r.patient);
    expect(r.patient.anonId).toMatch(ANON_ID_PATTERN);
    expect(r.patient.name).toBe('Amina Test');
    expect(r.patient.age).toBe(34);
    expect(r.patient.consentDate).toBe(consent.consentDate);
  });

  it('the anonymised ID never contains the name', () => {
    const r = buildPatient({ ...form, name: 'SS' }, consent, deps);
    if (!r.ok) throw new Error('expected ok');
    expect(r.patient.anonId.replace(/^SS-/, '')).not.toContain('SS');
  });

  it('sex is optional', () => {
    const r = buildPatient({ ...form, sex: '' }, consent, deps);
    expect(r.ok && r.patient.sex).toBe(undefined);
  });

  it('gives a plain message for each bad field', () => {
    const r = buildPatient({ name: ' ', age: '1x', location: 'Atlantis', sex: '' }, consent, deps);
    expect(r).toEqual({
      ok: false,
      errors: {
        name: "Enter the patient's name",
        age: 'Enter age in years, 0 to 120',
        location: 'Choose a county',
      },
    });
  });

  it.each(['-1', '121', '3.5', ''])('rejects age %j', (age) => {
    const r = buildPatient({ ...form, age }, consent, deps);
    expect(r.ok).toBe(false);
  });

  it('cannot build a patient without consent', () => {
    // @ts-expect-error consentGiven must be the literal true
    const r = buildPatient(form, { consentGiven: false, consentDate: consent.consentDate }, deps);
    expect(r).toEqual({ ok: false, errors: { consent: 'Record consent first' } });
  });
});
