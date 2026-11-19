/** Hash routes, so a reload keeps the page and the static server needs no rewrites. */
import { useEffect, useState } from 'react';

export type Route =
  | { page: 'queue' }
  | { page: 'case'; id: string }
  | { page: 'users' }
  | { page: 'audit'; resourceId?: string };

export function parse(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'cases' && parts[1]) return { page: 'case', id: parts[1] };
  if (parts[0] === 'admin' && parts[1] === 'users') return { page: 'users' };
  if (parts[0] === 'admin' && parts[1] === 'audit') {
    const resourceId = new URLSearchParams(query).get('resourceId') ?? undefined;
    return { page: 'audit', ...(resourceId ? { resourceId } : {}) };
  }
  return { page: 'queue' };
}

export function href(r: Route): string {
  switch (r.page) {
    case 'case':
      return `#/cases/${r.id}`;
    case 'users':
      return '#/admin/users';
    case 'audit':
      return r.resourceId ? `#/admin/audit?resourceId=${encodeURIComponent(r.resourceId)}` : '#/admin/audit';
    default:
      return '#/queue';
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (r: Route) => {
  window.location.hash = href(r);
};
