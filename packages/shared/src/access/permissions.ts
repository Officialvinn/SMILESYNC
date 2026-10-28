/**
 * FR 1.2 role-based access and NFR 6 access control.
 *
 * One table decides who may do what. The API checks it on every route, and
 * the mobile app and dashboard use it to hide features a role cannot use.
 * Anything not listed is denied (fail closed).
 */
import type { Role } from '../domain/enums.js';

export const ACTIONS = [
  'auth:refresh',
  'case:submit', // FR 5.1: CHW uploads a case
  'case:readTriage', // FR 7.3: CHW pulls the result of their own case
  'case:listQueue', // FR 6.1, 6.3
  'case:read', // FR 6.1: case detail without the patient's name
  'case:readImages', // FR 6.2
  'case:triage', // FR 7.1, 7.2
  'patient:readName', // FR 2.1 + NFR 6: only the registering CHW
  'user:manage', // FR 8.1
  'audit:read', // FR 8.2
] as const;
export type Action = (typeof ACTIONS)[number];

export interface Actor {
  id: string;
  role: Role;
  isActive: boolean;
}

/** Ownership facts about the resource being accessed, when relevant. */
export interface ResourceContext {
  /** The CHW who submitted the case. */
  submittedById?: string;
  /** The CHW who registered the patient. */
  registeredById?: string;
}

type Rule = (actor: Actor, resource: ResourceContext) => boolean;

const always: Rule = () => true;
const ownsCase: Rule = (a, r) => r.submittedById !== undefined && r.submittedById === a.id;
const registeredPatient: Rule = (a, r) => r.registeredById !== undefined && r.registeredById === a.id;

const RULES: Record<Role, Partial<Record<Action, Rule>>> = {
  CHW: {
    'auth:refresh': always,
    'case:submit': always,
    'case:readTriage': ownsCase,
    'patient:readName': registeredPatient,
  },
  DENTIST: {
    'auth:refresh': always,
    'case:listQueue': always,
    'case:read': always,
    'case:readImages': always,
    'case:triage': always,
  },
  ADMIN: {
    'auth:refresh': always,
    'user:manage': always,
    'audit:read': always,
  },
};

export function can(actor: Actor, action: Action, resource: ResourceContext = {}): boolean {
  if (!actor.isActive) return false;
  const rules = Object.hasOwn(RULES, actor.role) ? RULES[actor.role] : undefined;
  const rule = rules && Object.hasOwn(rules, action) ? rules[action] : undefined;
  return rule ? rule(actor, resource) : false;
}
