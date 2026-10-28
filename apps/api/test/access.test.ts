/**
 * FR 1.2 role-based access over HTTP, and FR 8.2 auditing of every attempt.
 * 501 means "allowed, handler arrives in a later sprint"; 403 means denied.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Role } from '@smilesync/shared';
import { auditFor, createCase, loginAs, makeHarness } from './helpers.js';

const h = makeHarness();
const tokens = {} as Record<Role, string>;
const users = {} as Record<Role, { id: string }>;
let ownCaseId: string;

beforeAll(async () => {
  for (const role of ['CHW', 'DENTIST', 'ADMIN'] as const) {
    const { user, token } = await loginAs(h, role);
    tokens[role] = token;
    users[role] = user;
  }
  ownCaseId = (await createCase(h.db, users.CHW.id)).id;
});
afterAll(() => h.db.$disconnect());

type Method = 'get' | 'post' | 'put' | 'patch';
const ENDPOINTS: { method: Method; path: () => string; allowed: Role[] }[] = [
  { method: 'post', path: () => '/cases', allowed: ['CHW'] },
  { method: 'get', path: () => `/cases/${ownCaseId}/triage`, allowed: ['CHW'] },
  { method: 'get', path: () => '/cases', allowed: ['DENTIST'] },
  { method: 'get', path: () => `/cases/${ownCaseId}`, allowed: ['DENTIST'] },
  { method: 'get', path: () => `/cases/${ownCaseId}/images/${randomUUID()}`, allowed: ['DENTIST'] },
  { method: 'put', path: () => `/cases/${ownCaseId}/triage`, allowed: ['DENTIST'] },
  { method: 'get', path: () => '/admin/users', allowed: ['ADMIN'] },
  { method: 'post', path: () => '/admin/users', allowed: ['ADMIN'] },
  { method: 'patch', path: () => `/admin/users/${randomUUID()}`, allowed: ['ADMIN'] },
  { method: 'get', path: () => '/admin/audit-log', allowed: ['ADMIN'] },
];

describe('FR 1.2 role matrix over HTTP', () => {
  for (const ep of ENDPOINTS) {
    it(`${ep.method.toUpperCase()} ${ep.path().replace(/[0-9a-f-]{36}/g, ':id')} needs a login`, async () => {
      const res = await h.http()[ep.method](ep.path()).send({});
      expect(res.status).toBe(401);
    });

    for (const role of ['CHW', 'DENTIST', 'ADMIN'] as const) {
      const allowed = ep.allowed.includes(role);
      it(`${role} ${allowed ? 'may' : 'may not'} ${ep.method.toUpperCase()} ${ep.path().replace(/[0-9a-f-]{36}/g, ':id')}`, async () => {
        const res = await h.http()[ep.method](ep.path()).set('Authorization', `Bearer ${tokens[role]}`).send({});
        expect(res.status).toBe(allowed ? 501 : 403);
      });
    }
  }
});

describe('FR 1.2 ownership', () => {
  it("a CHW cannot fetch another CHW's triage result", async () => {
    const other = await loginAs(h, 'CHW');
    const res = await h.http().get(`/cases/${ownCaseId}/triage`).set('Authorization', `Bearer ${other.token}`);
    expect(res.status).toBe(403);
  });

  it('an unknown case is 404 for a role that may read cases', async () => {
    const res = await h.http().get(`/cases/${randomUUID()}/triage`).set('Authorization', `Bearer ${tokens.CHW}`);
    expect(res.status).toBe(404);
  });

  it('a role that may never read a case gets 403 even for an unknown id, so existence is not revealed', async () => {
    const res = await h.http().get(`/cases/${randomUUID()}`).set('Authorization', `Bearer ${tokens.ADMIN}`);
    expect(res.status).toBe(403);
  });

  it('a malformed case id is 400', async () => {
    const res = await h.http().get('/cases/not-a-uuid/triage').set('Authorization', `Bearer ${tokens.CHW}`);
    expect(res.status).toBe(400);
  });
});

describe('FR 8.2 every access attempt is audited', () => {
  it('records allowed access with user, time, action and resource', async () => {
    const { user, token } = await loginAs(h, 'DENTIST');
    await h.http().get(`/cases/${ownCaseId}`).set('Authorization', `Bearer ${token}`);
    const [entry] = await auditFor(h.db, user.id, 'case:read');
    expect(entry).toMatchObject({ outcome: 'ALLOWED', resourceType: 'case', resourceId: ownCaseId });
    expect(entry!.timestamp).toBeInstanceOf(Date);
  });

  it('records denied attempts too', async () => {
    const { user, token } = await loginAs(h, 'ADMIN');
    await h.http().get(`/cases/${ownCaseId}`).set('Authorization', `Bearer ${token}`);
    const [entry] = await auditFor(h.db, user.id, 'case:read');
    expect(entry).toMatchObject({ outcome: 'DENIED', resourceId: ownCaseId });
  });

  it('records lookups of cases that do not exist', async () => {
    const { user, token } = await loginAs(h, 'DENTIST');
    const missing = randomUUID();
    await h.http().get(`/cases/${missing}`).set('Authorization', `Bearer ${token}`);
    const [entry] = await auditFor(h.db, user.id, 'case:read');
    expect(entry).toMatchObject({ outcome: 'NOT_FOUND', resourceId: missing });
  });
});

describe('unknown routes', () => {
  it('return 404 JSON', async () => {
    const res = await h.http().get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});
