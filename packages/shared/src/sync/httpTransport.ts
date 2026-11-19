/**
 * FR 5.1, 5.2, 7.3: the sync engine's transport over HTTPS.
 *
 * Upload protocol, built for weak connections:
 *   1. POST /cases with the case JSON (no image bytes).
 *      201 = stored now; 200 = an earlier attempt already stored it.
 *      409 { missingImageIds } = the server still needs those images.
 *   2. PUT /cases/{caseId}/images/{imageId} for each missing image: raw JPEG
 *      bytes plus their SHA-256. One image per request, so a dropped
 *      connection loses at most one image and a retry skips the rest.
 *   3. POST /cases again. The server stores the whole case in one transaction,
 *      so a dentist never sees a case with photos missing.
 *
 * The HttpClient is injected: fetch on the phone, supertest in the API tests.
 */
import { triageResultSchema, type TriageResult } from '../domain/schemas.js';
import { NetworkError, type SyncTransport, type UploadOutcome, type UploadPayload } from './types.js';

export const SHA256_HEADER = 'x-content-sha256';
/** Image rounds per upload before giving up until the next scheduled retry. */
const MAX_ROUNDS = 3;

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT';
  /** Path below the API base, e.g. "/cases". */
  path: string;
  json?: unknown;
  /** Sent as application/octet-stream. */
  bytes?: Uint8Array;
  headers?: Record<string, string>;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

/** Sends one request with the current token. Throws NetworkError when there is no HTTP response. */
export type HttpClient = (req: HttpRequest) => Promise<HttpResponse>;

function errorMessage(body: unknown, status: number): string {
  const msg = (body as { error?: unknown } | null)?.error;
  return typeof msg === 'string' ? msg : `HTTP ${status}`;
}

/** Maps an HTTP error status to the engine's outcome. */
function failure(res: HttpResponse): UploadOutcome {
  const message = errorMessage(res.body, res.status);
  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status === 429 || res.status >= 500) return { kind: 'serverError', status: res.status, message };
  return { kind: 'rejected', status: res.status, message };
}

export class HttpSyncTransport implements SyncTransport {
  constructor(private readonly http: HttpClient) {}

  async uploadCase(payload: UploadPayload): Promise<UploadOutcome> {
    const { submission } = payload;
    const bytesById = new Map(payload.images.map((i) => [i.id, i.bytes]));
    const shaById = new Map(submission.images.map((m) => [m.id, m.sha256]));

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const res = await this.http({ method: 'POST', path: '/cases', json: submission });
      if (res.status === 201) return { kind: 'created' };
      if (res.status === 200) return { kind: 'alreadyStored' };

      const missing = (res.body as { missingImageIds?: unknown } | null)?.missingImageIds;
      if (res.status !== 409 || !Array.isArray(missing)) return failure(res);
      if (!missing.every((id) => typeof id === 'string' && bytesById.has(id))) {
        return { kind: 'rejected', status: 409, message: 'The server asked for a photo this case does not have' };
      }

      for (const id of missing as string[]) {
        const put = await this.http({
          method: 'PUT',
          path: `/cases/${submission.id}/images/${id}`,
          bytes: bytesById.get(id)!,
          headers: { [SHA256_HEADER]: shaById.get(id)! },
        });
        if (put.status !== 200 && put.status !== 201) return failure(put);
      }
    }
    return { kind: 'serverError', status: 409, message: 'Photos did not arrive. Will try again.' };
  }

  async fetchTriage(caseIds: string[]): Promise<TriageResult[] | { kind: 'unauthorized' }> {
    const results: TriageResult[] = [];
    // One request per case, as in the sequence diagram (B.3 step 31).
    for (const id of caseIds) {
      const res = await this.http({ method: 'GET', path: `/cases/${id}/triage` });
      if (res.status === 401) return { kind: 'unauthorized' };
      if (res.status !== 200) continue; // 404 unknown, 403, 5xx: try again on the next sync
      const parsed = triageResultSchema.safeParse(res.body);
      if (parsed.success) results.push(parsed.data);
    }
    return results;
  }
}

