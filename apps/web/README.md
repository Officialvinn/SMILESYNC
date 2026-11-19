# SmileSync dashboard

React 19 + Vite + TypeScript. Dentists triage cases (FR 6, FR 7); administrators
manage users and read the audit log (FR 8). Built into the Caddy image by
`infra/caddy/Dockerfile` and served at `https://<site>/`, with the API at `/api`.

```
src/pages/        Queue, case view, users, audit log
src/components/   Photo viewer (zoom and pan)
src/lib/          Pure helpers, unit-tested (npm test)
e2e/              Playwright happy path against the running stack (npm run e2e)
```

- Dentists never receive patient names from the API.
- Photos are fetched with the login token and shown from blob URLs, which are
  revoked when the case closes. The API sends them with `Cache-Control: no-store`.
- The session lives in `sessionStorage` and ends when the tab closes.
- No router library: hash routes (`#/queue`, `#/cases/<id>`, `#/admin/users`,
  `#/admin/audit`).

Run it: see "Run the local stack" in the root README.
