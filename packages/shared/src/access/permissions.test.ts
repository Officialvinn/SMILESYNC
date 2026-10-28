/**
 * FR 1.2 role-based access, NFR 6 access control and data minimisation.
 * Written before the implementation: these tests are the access contract.
 */
import { describe, expect, it } from 'vitest';
import { ACTIONS, can, type Action, type Actor } from './permissions.js';

const chw: Actor = { id: 'chw-1', role: 'CHW', isActive: true };
const otherChw: Actor = { id: 'chw-2', role: 'CHW', isActive: true };
const dentist: Actor = { id: 'den-1', role: 'DENTIST', isActive: true };
const admin: Actor = { id: 'adm-1', role: 'ADMIN', isActive: true };

/** Expected matrix for actions that do not depend on who owns the resource. */
const MATRIX: Record<Action, { CHW: boolean; DENTIST: boolean; ADMIN: boolean }> = {
  'auth:refresh': { CHW: true, DENTIST: true, ADMIN: true },
  'case:submit': { CHW: true, DENTIST: false, ADMIN: false },
  'case:readTriage': { CHW: true, DENTIST: false, ADMIN: false }, // ownership checked below
  'case:listQueue': { CHW: false, DENTIST: true, ADMIN: false },
  'case:read': { CHW: false, DENTIST: true, ADMIN: false },
  'case:readImages': { CHW: false, DENTIST: true, ADMIN: false },
  'case:triage': { CHW: false, DENTIST: true, ADMIN: false },
  'patient:readName': { CHW: true, DENTIST: false, ADMIN: false }, // ownership checked below
  'user:manage': { CHW: false, DENTIST: false, ADMIN: true },
  'audit:read': { CHW: false, DENTIST: false, ADMIN: true },
};

describe('FR 1.2 role matrix', () => {
  it('covers every action', () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...ACTIONS].sort());
  });

  for (const action of ACTIONS) {
    for (const actor of [chw, dentist, admin]) {
      const expected = MATRIX[action][actor.role];
      it(`${actor.role} ${expected ? 'may' : 'may not'} ${action}`, () => {
        // Use a resource the CHW owns so only the role decides.
        expect(can(actor, action, { submittedById: chw.id, registeredById: chw.id })).toBe(expected);
      });
    }
  }
});

describe('FR 1.2 ownership', () => {
  it('a CHW may read the triage result of a case they submitted', () => {
    expect(can(chw, 'case:readTriage', { submittedById: chw.id })).toBe(true);
  });

  it("a CHW may not read another CHW's triage result", () => {
    expect(can(otherChw, 'case:readTriage', { submittedById: chw.id })).toBe(false);
  });

  it('a CHW may not read a triage result when the owner is unknown', () => {
    expect(can(chw, 'case:readTriage')).toBe(false);
  });

  it('a CHW may see the name only of patients they registered', () => {
    expect(can(chw, 'patient:readName', { registeredById: chw.id })).toBe(true);
    expect(can(otherChw, 'patient:readName', { registeredById: chw.id })).toBe(false);
  });
});

describe('NFR 6 data minimisation', () => {
  it('dentists never see patient names by default', () => {
    expect(can(dentist, 'patient:readName', { registeredById: dentist.id })).toBe(false);
  });

  it('administrators manage accounts but cannot open patient data', () => {
    for (const a of ['case:read', 'case:readImages', 'case:listQueue', 'patient:readName'] as const) {
      expect(can(admin, a, { submittedById: admin.id, registeredById: admin.id })).toBe(false);
    }
  });
});

describe('FR 8.1 deactivated accounts', () => {
  it('a deactivated user can do nothing', () => {
    for (const actor of [chw, dentist, admin]) {
      const inactive = { ...actor, isActive: false };
      for (const action of ACTIONS) {
        expect(can(inactive, action, { submittedById: actor.id, registeredById: actor.id })).toBe(false);
      }
    }
  });
});

describe('fails closed', () => {
  it('denies an unknown role', () => {
    const odd = { id: 'x', role: 'SUPERUSER', isActive: true } as unknown as Actor;
    expect(can(odd, 'audit:read')).toBe(false);
  });

  it('denies an unknown action', () => {
    expect(can(admin, 'audit:delete' as Action)).toBe(false);
  });
});

describe('roleMayEver', () => {
  it('matches the role matrix, ignoring ownership', async () => {
    const { roleMayEver } = await import('./permissions.js');
    for (const action of ACTIONS) {
      for (const role of ['CHW', 'DENTIST', 'ADMIN'] as const) {
        expect(roleMayEver(role, action)).toBe(MATRIX[action][role]);
      }
    }
  });
});
