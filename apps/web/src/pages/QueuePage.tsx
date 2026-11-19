/**
 * FR 6.1 case queue and FR 6.3 filter and sort. Shows the anonymised ID, age,
 * sex and county; never the patient's name. Default: waiting cases, highest
 * pain first, then oldest.
 */
import { useEffect, useState } from 'react';
import { KENYA_COUNTIES, PRIORITIES, QUEUE_SORTS, type QueueResponse, type QueueSort } from '@smilesync/shared';
import { ApiError, api } from '../api';
import { DURATION, PRIORITY, SEX, painClass, relativeAge } from '../lib/format';
import { toQueryString } from '../lib/query';
import { href } from '../router';

const SORT_LABEL: Record<QueueSort, string> = {
  pain: 'Highest pain first',
  oldest: 'Oldest first',
  newest: 'Newest first',
  priority: 'Priority',
};

const FILTER_KEY = 'smilesync.queueFilters';
const defaults = { status: 'SYNCED', priority: '', location: '', from: '', to: '', sort: 'pain' };

function loadFilters(): typeof defaults {
  try {
    return { ...defaults, ...JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

export function QueuePage() {
  const [filters, setFilters] = useState(loadFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<QueueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTER_KEY, JSON.stringify(filters));
    } catch {
      /* not essential */
    }
    let live = true;
    setLoading(true);
    api
      .get<QueueResponse>(`/cases${toQueryString({ ...filters, page, pageSize: 25 })}`)
      .then((d) => live && (setData(d), setError(null)))
      .catch((e: unknown) => live && setError(e instanceof ApiError ? e.message : 'Could not load the queue.'))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [filters, page]);

  const set = (k: keyof typeof defaults) => (e: { target: { value: string } }) => {
    setFilters((f) => ({ ...f, [k]: e.target.value }));
    setPage(1);
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section aria-labelledby="queue-title">
      <div className="page-head">
        <h1 id="queue-title">Case queue</h1>
        <p className="muted" aria-live="polite">
          {loading ? 'Loading…' : data ? `${data.total} ${data.total === 1 ? 'case' : 'cases'}` : ''}
        </p>
      </div>

      <form className="filters" onSubmit={(e) => e.preventDefault()} aria-label="Filter cases">
        <label>
          Status
          <select value={filters.status} onChange={set('status')}>
            <option value="SYNCED">Waiting for review</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="ALL">All</option>
          </select>
        </label>
        <label>
          Priority
          <select value={filters.priority} onChange={set('priority')}>
            <option value="">Any</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY[p]}
              </option>
            ))}
          </select>
        </label>
        <label>
          County
          <select value={filters.location} onChange={set('location')}>
            <option value="">All counties</option>
            {KENYA_COUNTIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Received from
          <input type="date" value={filters.from} onChange={set('from')} />
        </label>
        <label>
          to
          <input type="date" value={filters.to} onChange={set('to')} />
        </label>
        <label>
          Sort
          <select value={filters.sort} onChange={set('sort')}>
            {QUEUE_SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="secondary" onClick={() => (setFilters(defaults), setPage(1))}>
          Reset
        </button>
      </form>

      {error ? <p className="banner error" role="alert">{error}</p> : null}

      <table className="queue">
        <thead>
          <tr>
            <th scope="col">Patient ID</th>
            <th scope="col">Age / sex</th>
            <th scope="col">County</th>
            <th scope="col">Pain</th>
            <th scope="col">Duration</th>
            <th scope="col">Received</th>
            <th scope="col">Photos</th>
            <th scope="col">Priority</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((c) => (
            <tr key={c.id}>
              <td>
                <a href={href({ page: 'case', id: c.id })} className="case-link">
                  {c.anonId}
                </a>
              </td>
              <td>
                {c.age} / {c.sex ? SEX[c.sex] : '-'}
              </td>
              <td>{c.location}</td>
              <td>
                <span className={`pain ${painClass(c.painLevel)}`}>{c.painLevel ?? '-'}</span>
              </td>
              <td>{c.duration ? DURATION[c.duration] : '-'}</td>
              <td title={new Date(c.syncedAt).toLocaleString()}>{relativeAge(c.syncedAt)}</td>
              <td>{c.imageCount}</td>
              <td>{c.priority ? <span className={`badge ${c.priority.toLowerCase()}`}>{PRIORITY[c.priority]}</span> : <span className="muted">Not set</span>}</td>
            </tr>
          ))}
          {data && data.items.length === 0 ? (
            <tr>
              <td colSpan={8} className="empty">
                No cases match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {pages > 1 ? (
        <nav className="pager" aria-label="Pages">
          <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button type="button" className="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </nav>
      ) : null}
    </section>
  );
}
