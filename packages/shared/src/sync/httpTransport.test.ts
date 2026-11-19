/**
 * FR 5.2: the upload protocol. The case JSON goes first; the server answers
 * 409 with the image ids it still needs; only those images are uploaded; then
 * the case is posted again. A retry never re-sends an image the server has.
 */
import { describe, expect, it } from 'vitest';
import { syntheticPayload } from '../testing/fixtures.js';
import { HttpSyncTransport, SHA256_HEADER, type HttpClient, type HttpRequest, type HttpResponse } from './httpTransport.js';
import { NetworkError } from './types.js';

function client(handler: (req: HttpRequest, log: HttpRequest[]) => HttpResponse | 'network') {
  const log: HttpRequest[] = [];
  const http: HttpClient = async (req) => {
    log.push(req);
    const r = handler(req, log);
    if (r === 'network') throw new NetworkError();
    return r;
  };
  return { http, log };
}

const payload = syntheticPayload();
const caseId = payload.submission.id;
const imageIds = payload.images.map((i) => i.id);

describe('HttpSyncTransport.uploadCase', () => {
  it('posts JSON without image bytes, uploads only the missing images, then posts again', async () => {
    const stored = new Set<string>([imageIds[0]!]);
    const { http, log } = client((req) => {
      if (req.method === 'POST') {
        const missing = imageIds.filter((id) => !stored.has(id));
        return missing.length ? { status: 409, body: { error: 'Missing images', missingImageIds: missing } } : { status: 201, body: {} };
      }
      stored.add(req.path.split('/').pop()!);
      return { status: 201, body: {} };
    });
    const t = new HttpSyncTransport(http);
    expect(await t.uploadCase(payload)).toEqual({ kind: 'created' });

    expect(log.map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /cases',
      ...imageIds.slice(1).map((id) => `PUT /cases/${caseId}/images/${id}`),
      'POST /cases',
    ]);
    expect(JSON.stringify(log[0]!.json)).not.toContain('bytes');
    const put = log[1]!;
    const img = payload.images[1]!;
    expect(put.bytes).toEqual(img.bytes);
    expect(put.headers?.[SHA256_HEADER]).toBe(payload.submission.images.find((m) => m.id === img.id)!.sha256);
  });

  it('200 on the first post means an earlier attempt already stored the case', async () => {
    const { http, log } = client(() => ({ status: 200, body: {} }));
    expect(await new HttpSyncTransport(http).uploadCase(payload)).toEqual({ kind: 'alreadyStored' });
    expect(log).toHaveLength(1);
  });

  it.each([
    [401, { kind: 'unauthorized' }],
    [400, { kind: 'rejected', status: 400, message: 'bad' }],
    [413, { kind: 'rejected', status: 413, message: 'bad' }],
    [429, { kind: 'serverError', status: 429, message: 'bad' }],
    [503, { kind: 'serverError', status: 503, message: 'bad' }],
  ])('maps HTTP %i on the case post', async (status, expected) => {
    const { http } = client(() => ({ status, body: { error: 'bad' } }));
    expect(await new HttpSyncTransport(http).uploadCase(payload)).toEqual(expected);
  });

  it('maps a failed image upload the same way', async () => {
    const { http } = client((req) =>
      req.method === 'POST' ? { status: 409, body: { missingImageIds: imageIds } } : { status: 401, body: {} },
    );
    expect(await new HttpSyncTransport(http).uploadCase(payload)).toEqual({ kind: 'unauthorized' });
  });

  it('a dropped connection during an image upload is a NetworkError, so the engine retries later', async () => {
    const { http } = client((req) => (req.method === 'POST' ? { status: 409, body: { missingImageIds: imageIds } } : 'network'));
    await expect(new HttpSyncTransport(http).uploadCase(payload)).rejects.toBeInstanceOf(NetworkError);
  });

  it('a 409 naming an image the phone does not have is rejected, not looped', async () => {
    const { http, log } = client(() => ({ status: 409, body: { missingImageIds: ['00000000-0000-4000-8000-00000000dead'] } }));
    const r = await new HttpSyncTransport(http).uploadCase(payload);
    expect(r).toMatchObject({ kind: 'rejected', status: 409 });
    expect(log).toHaveLength(1);
  });

  it('gives up after a few rounds if the server keeps asking for images', async () => {
    const { http, log } = client((req) => (req.method === 'POST' ? { status: 409, body: { missingImageIds: [imageIds[0]] } } : { status: 201, body: {} }));
    const r = await new HttpSyncTransport(http).uploadCase(payload);
    expect(r).toMatchObject({ kind: 'serverError' });
    expect(log.filter((x) => x.method === 'POST').length).toBeLessThanOrEqual(3);
  });
});

describe('HttpSyncTransport.fetchTriage (FR 7.3 pull)', () => {
  const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
  const result = (caseId: string) => ({ caseId, status: 'REVIEWED', priority: 'URGENT', reviewedAt: '2026-10-29T10:00:00.000Z', notes: [] });

  it('returns results for known cases and skips unknown ones', async () => {
    const { http } = client((req) => (req.path.includes(ids[0]!) ? { status: 200, body: result(ids[0]!) } : { status: 404, body: {} }));
    expect(await new HttpSyncTransport(http).fetchTriage(ids)).toEqual([result(ids[0]!)]);
  });

  it('401 means the CHW must log in again', async () => {
    const { http } = client(() => ({ status: 401, body: {} }));
    expect(await new HttpSyncTransport(http).fetchTriage(ids)).toEqual({ kind: 'unauthorized' });
  });

  it('ignores a malformed result rather than storing it', async () => {
    const { http } = client(() => ({ status: 200, body: { caseId: 'nope' } }));
    expect(await new HttpSyncTransport(http).fetchTriage(ids)).toEqual([]);
  });
});
