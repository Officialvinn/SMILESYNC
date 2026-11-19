/**
 * Dashboard shell: login, then pages by role (FR 1.2).
 * Dentists: case queue and case view. Administrators: users and audit log.
 * CHWs use the mobile app and are refused here.
 */
import { useEffect, useState, type FormEvent } from 'react';
import type { LoginResponse } from '@smilesync/shared';
import { ApiError, api, setToken, setUnauthorizedHandler } from './api';
import { AuditPage } from './pages/AuditPage';
import { CasePage } from './pages/CasePage';
import { QueuePage } from './pages/QueuePage';
import { UsersPage } from './pages/UsersPage';
import { go, href, useRoute } from './router';
import { loadSession, saveSession } from './session';

export function App() {
  const [session, setSession] = useState<LoginResponse | null>(() => {
    const s = loadSession();
    setToken(s?.token ?? null);
    return s;
  });
  const [notice, setNotice] = useState<string | null>(null);
  const route = useRoute();

  const logout = (message?: string) => {
    saveSession(null);
    setToken(null);
    setSession(null);
    setNotice(message ?? null);
  };

  useEffect(() => {
    setUnauthorizedHandler(() => logout('Your session has ended. Please log in again.'));
  }, []);

  // Send each role to a page it may use.
  const role = session?.user.role;
  useEffect(() => {
    if (role === 'ADMIN' && (route.page === 'queue' || route.page === 'case')) go({ page: 'users' });
    if (role === 'DENTIST' && (route.page === 'users' || route.page === 'audit')) go({ page: 'queue' });
  }, [role, route.page]);

  if (!session) {
    return (
      <Login
        notice={notice}
        onLogin={(s) => {
          saveSession(s);
          setToken(s.token);
          setSession(s);
          setNotice(null);
        }}
      />
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href={href(role === 'ADMIN' ? { page: 'users' } : { page: 'queue' })}>
          SmileSync
        </a>
        <nav aria-label="Main">
          {role === 'DENTIST' ? (
            <a href={href({ page: 'queue' })} aria-current={route.page === 'queue' ? 'page' : undefined}>
              Case queue
            </a>
          ) : (
            <>
              <a href={href({ page: 'users' })} aria-current={route.page === 'users' ? 'page' : undefined}>
                Users
              </a>
              <a href={href({ page: 'audit' })} aria-current={route.page === 'audit' ? 'page' : undefined}>
                Audit log
              </a>
            </>
          )}
        </nav>
        <span className="who">
          {session.user.username} · {role === 'DENTIST' ? 'Dentist' : 'Administrator'}
        </span>
        <button type="button" className="link" onClick={() => logout()}>
          Log out
        </button>
      </header>
      <main>
        {role === 'DENTIST' && route.page === 'case' ? <CasePage id={route.id} /> : null}
        {role === 'DENTIST' && route.page === 'queue' ? <QueuePage /> : null}
        {role === 'ADMIN' && route.page === 'users' ? <UsersPage me={session.user.id} /> : null}
        {role === 'ADMIN' && route.page === 'audit' ? <AuditPage resourceId={route.resourceId} /> : null}
      </main>
    </div>
  );
}

function Login({ notice, onLogin }: { notice: string | null; onLogin: (s: LoginResponse) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await api.login(username.trim(), password);
      if (s.user.role === 'CHW') setError('Community health workers use the SmileSync mobile app.');
      else onLogin(s);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed. Try again.');
    } finally {
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form onSubmit={submit} className="card" aria-labelledby="login-title">
        <h1 id="login-title">SmileSync</h1>
        <p className="muted">Dentist and administrator dashboard</p>
        {notice ? <p className="banner warn">{notice}</p> : null}
        {error ? (
          <p className="banner error" role="alert">
            {error}
          </p>
        ) : null}
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <button type="submit" disabled={busy || !username || !password}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </main>
  );
}
