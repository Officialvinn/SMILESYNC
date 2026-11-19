/** FR 8.2, NFR 4: who accessed what and when. Read-only, newest first. */
import { useEffect, useState } from 'react';
import type { AuditResponse } from '@smilesync/shared';
import { ApiError, api } from '../api';
import { toQueryString } from '../lib/query';

const empty = { username: '', action: '', outcome: '', resourceId: '', from: '', to: '' };

export function AuditPage({ resourceId }: { resourceId?: string | undefined }) {
  const [filters, setFilters] = useState({ ...empty, resourceId: resourceId ?? '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .get<AuditResponse>(`/admin/audit-log${toQueryString({ ...applied, page, pageSize: 50 })}`)
      .then((d) => live && (setData(d), setError(null)))
      .catch((e: unknown) => live && setError(e instanceof ApiError ? e.message : 'Could not load the audit log.'));
    return () => {
      live = false;
    };
  }, [applied, page]);

  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section aria-labelledby="audit-title">
      <div className="page-head">
        <h1 id="audit-title">Audit log</h1>
        <p className="muted">{data ? `${data.total} entries` : ''}</p>
      </div>
      <p className="muted small">Entries cannot be edited or deleted, and are kept for at least 12 months.</p>
      <form className="filters" onSubmit={(e) => (e.preventDefault(), setPage(1), setApplied(filters))} aria-label="Search the audit log">
        <label>
          Username
          <input value={filters.username} onChange={set('username')} />
        </label>
        <label>
          Action
          <input value={filters.action} onChange={set('action')} placeholder="e.g. case:read" />
        </label>
        <label>
          Outcome
          <select value={filters.outcome} onChange={set('outcome')}>
            <option value="">Any</option>
            <option value="ALLOWED">Allowed</option>
            <option value="DENIED">Denied</option>
            <option value="NOT_FOUND">Not found</option>
          </select>
        </label>
        <label>
          Resource id
          <input value={filters.resourceId} onChange={set('resourceId')} />
        </label>
        <label>
          From
          <input type="date" value={filters.from} onChange={set('from')} />
        </label>
        <label>
          To
          <input type="date" value={filters.to} onChange={set('to')} />
        </label>
        <button type="submit">Search</button>
        <button type="button" className="secondary" onClick={() => (setFilters(empty), setApplied(empty), setPage(1))}>
          Reset
        </button>
      </form>
      {error ? <p className="banner error" role="alert">{error}</p> : null}
      <table className="audit">
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">User</th>
            <th scope="col">Action</th>
            <th scope="col">Outcome</th>
            <th scope="col">Resource</th>
            <th scope="col">IP</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((e) => (
            <tr key={e.id}>
              <td>{new Date(e.timestamp).toLocaleString()}</td>
              <td>{e.username ?? <span className="muted">unknown</span>}</td>
              <td>
                <code>{e.action}</code>
              </td>
              <td>
                <span className={`badge ${e.outcome === 'ALLOWED' ? 'routine' : 'urgent'}`}>{e.outcome.toLowerCase().replace('_', ' ')}</span>
              </td>
              <td className="small">
                {e.resourceType ?? ''} <code>{e.resourceId ?? ''}</code>
              </td>
              <td className="small">{e.ipAddress ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pages > 1 ? (
        <nav className="pager" aria-label="Pages">
          <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Newer
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button type="button" className="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Older
          </button>
        </nav>
      ) : null}
    </section>
  );
}
