/**
 * Sync engine tests: FR 4.2, FR 5.1, FR 5.2, FR 5.3, FR 7.3, FR 3.3.
 * Written before the engine. The core promise under test: retries never
 * duplicate a case on the server and never lose a case on the phone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeServer, type Fault } from '../testing/fakeServer.js';
import { syntheticPayload } from '../testing/fixtures.js';
import { MemorySyncStore } from './memoryStore.js';
import { AutoSync, SyncEngine, backoffDelayMs } from './engine.js';

const T0 = new Date('2026-10-01T09:00:00.000Z');

function setup(opts: { cases?: number } = {}) {
  const store = new MemorySyncStore();
  const server = new FakeServer();
  let now = new Date(T0);
  const clock = {
    now: () => new Date(now),
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
  // random = 1 removes jitter so delays are exact in tests.
  const engine = new SyncEngine({ store, transport: server, now: clock.now, random: () => 1 });
  const ids = Array.from({ length: opts.cases ?? 1 }, () => store.addPending(syntheticPayload()).id);
  return { store, server, engine, clock, ids };
}

describe('FR 5.1 automatic upload', () => {
  it('uploads every pending case and marks it Synced', async () => {
    const { store, server, engine, ids } = setup({ cases: 3 });
    const report = await engine.runOnce();
    expect(report.uploaded).toEqual(ids);
    expect(server.cases.size).toBe(3);
    for (const id of ids) {
      expect(store.get(id).status).toBe('SYNCED');
      expect(store.get(id).syncedAt).toBe(T0.toISOString());
    }
  });

  it('uploads oldest cases first', async () => {
    const store = new MemorySyncStore();
    const server = new FakeServer();
    const newer = store.addPending(syntheticPayload({ createdAt: '2026-10-02T00:00:00.000Z' })).id;
    const older = store.addPending(syntheticPayload({ createdAt: '2026-09-30T00:00:00.000Z' })).id;
    const report = await new SyncEngine({ store, transport: server }).runOnce();
    expect(report.uploaded).toEqual([older, newer]);
  });

  it('does nothing when there is nothing to sync', async () => {
    const store = new MemorySyncStore();
    const server = new FakeServer();
    const report = await new SyncEngine({ store, transport: server }).runOnce();
    expect(report.uploaded).toEqual([]);
    expect(server.uploadRequests).toBe(0);
  });
});

describe('FR 4.2 offline save', () => {
  it('keeps cases Pending when offline and reports offline', async () => {
    const { store, server, engine, ids } = setup({ cases: 3 });
    server.setOffline(true);
    const report = await engine.runOnce();
    expect(report.offline).toBe(true);
    expect(report.uploaded).toEqual([]);
    for (const id of ids) expect(store.get(id).status).toBe('PENDING');
  });

  it('stops after the first network error instead of trying every case', async () => {
    const { store, server, engine, ids } = setup({ cases: 3 });
    server.setOffline(true);
    await engine.runOnce();
    expect(store.get(ids[0]!).attempts).toBe(1);
    expect(store.get(ids[1]!).attempts).toBe(0);
    expect(store.get(ids[2]!).attempts).toBe(0);
  });

  it('records an actionable message for the CHW', async () => {
    const { store, server, engine, ids } = setup();
    server.setOffline(true);
    await engine.runOnce();
    expect(store.get(ids[0]!).lastError).toMatch(/saved on this phone/i);
  });
});

describe('FR 5.2 retry without duplicates or loss', () => {
  it('a response lost after the server stored the case does not create a duplicate', async () => {
    const { store, server, engine, clock, ids } = setup();
    server.failNext('dropAfterCommit');
    const first = await engine.runOnce();
    expect(first.offline).toBe(true);
    expect(store.get(ids[0]!).status).toBe('PENDING'); // the phone cannot know it arrived

    clock.advance(60_000);
    const second = await engine.runOnce();
    expect(second.uploaded).toEqual(ids);
    expect(store.get(ids[0]!).status).toBe('SYNCED');
    expect(server.cases.size).toBe(1);
    expect(server.uploadRequests).toBe(2);
  });

  it('re-uploads safely if the phone crashed before saving the Synced status', async () => {
    const { store, server, engine, ids } = setup();
    const original = store.markSynced.bind(store);
    let failOnce = true;
    store.markSynced = async (id, at) => {
      if (failOnce) {
        failOnce = false;
        throw new Error('App killed');
      }
      return original(id, at);
    };
    await expect(engine.runOnce()).rejects.toThrow('App killed');
    expect(store.get(ids[0]!).status).toBe('PENDING');

    const report = await engine.runOnce({ force: true });
    expect(report.uploaded).toEqual(ids);
    expect(server.cases.size).toBe(1);
  });

  it('retries server errors later and keeps the case Pending', async () => {
    const { store, server, engine, ids } = setup();
    server.failNext('serverError');
    const report = await engine.runOnce();
    expect(report.failed).toEqual(ids);
    expect(store.get(ids[0]!).status).toBe('PENDING');
    expect(store.get(ids[0]!).needsAttention).toBe(false);
    expect(store.get(ids[0]!).nextAttemptAt).not.toBeNull();
  });

  it('survives a long run of random faults: every case arrives exactly once', async () => {
    // Seeded pseudo-random faults so the test is repeatable.
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const faults: Fault[] = ['offline', 'dropAfterCommit', 'serverError'];
    const { store, server, engine, clock, ids } = setup({ cases: 25 });

    for (let round = 0; round < 200; round++) {
      for (let i = 0; i < 5; i++) if (rand() < 0.5) server.failNext(faults[Math.floor(rand() * faults.length)]!);
      await engine.runOnce();
      clock.advance(20 * 60_000); // past the longest backoff
      if (ids.every((id) => store.get(id).status === 'SYNCED')) break;
    }

    expect(ids.every((id) => store.get(id).status === 'SYNCED')).toBe(true);
    expect([...server.cases.keys()].sort()).toEqual([...ids].sort());
    expect(store.cases.size).toBe(25);
  });
});

describe('FR 5.2 retry schedule', () => {
  it('backs off exponentially and caps the delay', () => {
    const noJitter = () => 1;
    expect(backoffDelayMs(1, noJitter)).toBe(5_000);
    expect(backoffDelayMs(2, noJitter)).toBe(10_000);
    expect(backoffDelayMs(3, noJitter)).toBe(20_000);
    expect(backoffDelayMs(20, noJitter)).toBe(15 * 60_000);
  });

  it('adds jitter so many phones do not retry at the same moment', () => {
    expect(backoffDelayMs(3, () => 0)).toBe(10_000);
    expect(backoffDelayMs(3, () => 0.5)).toBe(15_000);
  });

  it('skips cases that are not yet due, unless the CHW taps Sync now', async () => {
    const { server, engine, clock, ids } = setup();
    server.failNext('serverError');
    await engine.runOnce();

    clock.advance(1_000); // backoff is 5 s
    const early = await engine.runOnce();
    expect(early.uploaded).toEqual([]);
    expect(server.cases.size).toBe(0);

    const manual = await engine.runOnce({ force: true });
    expect(manual.uploaded).toEqual(ids);
  });

  it('reports when the next automatic retry is due', async () => {
    const { server, engine } = setup();
    expect(await engine.nextDueAt()).toEqual(T0);
    server.failNext('serverError');
    await engine.runOnce();
    expect(await engine.nextDueAt()).toEqual(new Date(T0.getTime() + 5_000));
  });
});

describe('cases the server rejects', () => {
  it('a submission over 2 MB is never sent and is flagged (FR 3.3)', async () => {
    const store = new MemorySyncStore();
    const server = new FakeServer();
    const id = store.addPending(syntheticPayload({ imageBytes: 800 * 1024 })).id; // 3 x 800 KB
    const report = await new SyncEngine({ store, transport: server }).runOnce();
    expect(server.uploadRequests).toBe(0);
    expect(report.needsAttention).toEqual([id]);
    expect(store.get(id).status).toBe('PENDING');
    expect(store.get(id).needsAttention).toBe(true);
  });

  it('a 4xx rejection keeps the case Pending, flags it, and stops automatic retries', async () => {
    const { store, ids } = setup();
    const server = new FakeServer();
    server.uploadCase = async () => ({ kind: 'rejected', status: 422, message: 'Missing required view FRONT' });
    const e2 = new SyncEngine({ store, transport: server });
    const report = await e2.runOnce();
    expect(report.needsAttention).toEqual(ids);
    expect(store.get(ids[0]!).status).toBe('PENDING');
    expect(store.get(ids[0]!).lastError).toContain('Missing required view FRONT');
    expect(await e2.nextDueAt()).toBeNull();
  });

  it('a flagged case does not block the cases behind it', async () => {
    const store = new MemorySyncStore();
    const server = new FakeServer();
    const bad = store.addPending(syntheticPayload({ imageBytes: 800 * 1024 })).id;
    const good = store.addPending(syntheticPayload()).id;
    const report = await new SyncEngine({ store, transport: server }).runOnce();
    expect(report.needsAttention).toEqual([bad]);
    expect(report.uploaded).toEqual([good]);
  });
});

describe('FR 1.1 expired or revoked login', () => {
  it('stops the run, asks for login, and does not count it as a failed attempt', async () => {
    const { store, server, engine, ids } = setup({ cases: 2 });
    server.failNext('unauthorized');
    const report = await engine.runOnce();
    expect(report.authRequired).toBe(true);
    expect(server.cases.size).toBe(0);
    expect(store.get(ids[0]!).attempts).toBe(0);
    expect(store.get(ids[0]!).status).toBe('PENDING');
  });
});

describe('single run at a time', () => {
  it('concurrent triggers share one run and upload each case once', async () => {
    const { server, engine } = setup({ cases: 3 });
    const [a, b] = await Promise.all([engine.runOnce(), engine.runOnce()]);
    expect(a).toBe(b);
    expect(server.uploadRequests).toBe(3);
  });
});

describe('FR 7.3 / FR 5.3 pulling triage results', () => {
  it('marks a case Reviewed with the priority and notes when a dentist has triaged it', async () => {
    const { store, server, engine, ids } = setup({ cases: 2 });
    await engine.runOnce();
    server.triage(ids[0]!, 'EMERGENCY', 'Suspected abscess. Refer today.', '2026-10-01T10:00:00.000Z');

    const report = await engine.runOnce();
    expect(report.reviewed).toEqual([ids[0]]);
    expect(store.get(ids[0]!)).toMatchObject({ status: 'REVIEWED', priority: 'EMERGENCY' });
    expect(store.get(ids[0]!).notes[0]!.noteText).toContain('abscess');
    expect(store.get(ids[1]!).status).toBe('SYNCED');
  });

  it("the server's review always wins over local data", async () => {
    const { store, server, engine, ids } = setup();
    await engine.runOnce();
    Object.assign(store.get(ids[0]!), { priority: 'ROUTINE' }); // stale local value
    server.triage(ids[0]!, 'URGENT', 'See within a week.', '2026-10-01T10:00:00.000Z');
    await engine.runOnce();
    expect(store.get(ids[0]!).priority).toBe('URGENT');
  });

  it('a failed pull leaves synced cases untouched', async () => {
    const { store, server, engine, ids } = setup();
    await engine.runOnce();
    server.setOffline(true);
    const report = await engine.runOnce();
    expect(report.offline).toBe(true);
    expect(store.get(ids[0]!).status).toBe('SYNCED');
  });

  it('a 401 on the pull asks the CHW to log in again', async () => {
    const { server, engine } = setup();
    await engine.runOnce();
    server.failNext('unauthorized');
    expect((await engine.runOnce()).authRequired).toBe(true);
  });
});

describe('FR 5.1 AutoSync: sync when connectivity returns', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs as soon as the phone comes online', async () => {
    const { store, server, engine, ids } = setup();
    const auto = new AutoSync(engine);
    auto.setOnline(true);
    await vi.waitFor(() => expect(store.get(ids[0]!).status).toBe('SYNCED'));
    expect(server.cases.size).toBe(1);
    auto.stop();
  });

  it('does nothing while offline', async () => {
    const { server, engine } = setup();
    const auto = new AutoSync(engine);
    auto.setOnline(false);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(server.uploadRequests).toBe(0);
    auto.stop();
  });

  it('schedules a retry after a failure and stops retrying when offline', async () => {
    const store = new MemorySyncStore();
    const server = new FakeServer();
    const engine = new SyncEngine({ store, transport: server, random: () => 1 });
    const id = store.addPending(syntheticPayload()).id;
    const auto = new AutoSync(engine);

    server.failNext('serverError');
    auto.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.get(id).status).toBe('PENDING');

    await vi.advanceTimersByTimeAsync(5_000); // backoff for attempt 1
    expect(store.get(id).status).toBe('SYNCED');
    auto.stop();
  });

  it('cancels the scheduled retry when the phone goes offline', async () => {
    const store = new MemorySyncStore();
    const server = new FakeServer();
    const engine = new SyncEngine({ store, transport: server, random: () => 1 });
    store.addPending(syntheticPayload());
    const auto = new AutoSync(engine);

    server.failNext('serverError');
    auto.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    auto.setOnline(false);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(server.uploadRequests).toBe(0);
    auto.stop();
  });
});
