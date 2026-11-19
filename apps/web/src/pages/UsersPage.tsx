/** FR 8.1: create, deactivate and reset users. CHWs get a 6-digit PIN, others a password. */
import { useEffect, useState, type FormEvent } from 'react';
import { ROLES, type Role, type UserSummary } from '@smilesync/shared';
import { ApiError, api } from '../api';
import { dateTime } from '../lib/format';
import { href } from '../router';

const ROLE_LABEL: Record<Role, string> = { CHW: 'Community health worker', DENTIST: 'Dentist', ADMIN: 'Administrator' };

export function UsersPage({ me }: { me: string }) {
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = () =>
    api
      .get<{ users: UserSummary[] }>('/admin/users')
      .then((d) => setUsers(d.users))
      .catch(() => setMessage({ kind: 'error', text: 'Could not load users.' }));
  useEffect(() => {
    void load();
  }, []);

  async function change(u: UserSummary, body: object, done: string) {
    setMessage(null);
    try {
      await api.send('PATCH', `/admin/users/${u.id}`, body);
      setMessage({ kind: 'ok', text: done });
      void load();
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof ApiError ? e.message : 'Could not save.' });
    }
  }

  function reset(u: UserSummary) {
    const label = u.role === 'CHW' ? 'new 6-digit PIN' : 'new password (at least 10 characters)';
    const secret = window.prompt(`Enter a ${label} for ${u.username}. Give it to them in person.`);
    if (secret) void change(u, { secret }, `${u.username}: credential reset. Their old sessions have ended.`);
  }

  return (
    <section aria-labelledby="users-title">
      <div className="page-head">
        <h1 id="users-title">Users</h1>
      </div>
      {message ? (
        <p className={`banner ${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      ) : null}
      <CreateUser onCreated={(u) => (setMessage({ kind: 'ok', text: `Created ${u.username}.` }), void load())} />
      <table>
        <thead>
          <tr>
            <th scope="col">Username</th>
            <th scope="col">Role</th>
            <th scope="col">Details</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users?.map((u) => {
            const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
            return (
              <tr key={u.id} className={u.isActive ? '' : 'inactive'}>
                <td>{u.username}</td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td className="small">{[u.chwCode, u.assignedSite, u.licenseNumber, u.specialty, u.adminLevel].filter(Boolean).join(' · ')}</td>
                <td>
                  {u.isActive ? 'Active' : 'Deactivated'}
                  {locked ? <span className="badge urgent">Locked until {dateTime(u.lockedUntil!)}</span> : null}
                </td>
                <td>
                  <div className="actions">
                  {u.isActive ? (
                    <button type="button" className="secondary" disabled={u.id === me} title={u.id === me ? 'You cannot deactivate yourself' : undefined}
                      onClick={() => window.confirm(`Deactivate ${u.username}? They are logged out everywhere.`) && void change(u, { isActive: false }, `${u.username} deactivated.`)}>
                      Deactivate
                    </button>
                  ) : (
                    <button type="button" className="secondary" onClick={() => void change(u, { isActive: true }, `${u.username} reactivated.`)}>
                      Reactivate
                    </button>
                  )}
                  <button type="button" className="secondary" onClick={() => reset(u)}>
                    Reset {u.role === 'CHW' ? 'PIN' : 'password'}
                  </button>
                  {locked ? (
                    <button type="button" className="secondary" onClick={() => void change(u, { unlock: true }, `${u.username} unlocked.`)}>
                      Unlock
                    </button>
                  ) : null}
                  <a href={href({ page: 'audit', resourceId: u.id })} className="small">
                    Changes to this user
                  </a>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function CreateUser({ onCreated }: { onCreated: (u: UserSummary) => void }) {
  const empty = { username: '', role: 'CHW' as Role, secret: '', chwCode: '', assignedSite: '', licenseNumber: '', specialty: '', adminLevel: '' };
  const [f, setF] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setF((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const extra = Object.fromEntries(
      Object.entries(f).filter(([k, v]) => !['username', 'role', 'secret'].includes(k) && v.trim()),
    );
    try {
      const u = await api.send<UserSummary>('POST', '/admin/users', { username: f.username, role: f.role, secret: f.secret, ...extra });
      setF(empty);
      onCreated(u);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the user.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="card create-user">
      <summary>Add a user</summary>
      <form onSubmit={submit}>
        {error ? <p className="banner error" role="alert">{error}</p> : null}
        <div className="form-row">
          <label>
            Role
            <select value={f.role} onChange={set('role')}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Username
            <input value={f.username} onChange={set('username')} required autoComplete="off" placeholder="e.g. chw.kajiado1" />
          </label>
          <label>
            {f.role === 'CHW' ? 'PIN (6 digits)' : 'Password (10+ characters)'}
            <input type="password" value={f.secret} onChange={set('secret')} required autoComplete="new-password" inputMode={f.role === 'CHW' ? 'numeric' : undefined} />
          </label>
        </div>
        <div className="form-row">
          {f.role === 'CHW' ? (
            <>
              <label>
                CHW code
                <input value={f.chwCode} onChange={set('chwCode')} />
              </label>
              <label>
                Assigned site
                <input value={f.assignedSite} onChange={set('assignedSite')} />
              </label>
            </>
          ) : null}
          {f.role === 'DENTIST' ? (
            <>
              <label>
                Licence number
                <input value={f.licenseNumber} onChange={set('licenseNumber')} />
              </label>
              <label>
                Specialty
                <input value={f.specialty} onChange={set('specialty')} />
              </label>
            </>
          ) : null}
          {f.role === 'ADMIN' ? (
            <label>
              Admin level
              <input value={f.adminLevel} onChange={set('adminLevel')} />
            </label>
          ) : null}
        </div>
        <button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create user'}
        </button>
      </form>
    </details>
  );
}
