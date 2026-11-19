/**
 * FR 5.1: sync starts by itself when the phone gets a connection, when the app
 * comes back to the front, and after a case is saved. The CHW can also tap
 * "Send now". Results come back on the same runs (FR 7.3, pull on sync).
 */
import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { AutoSync, HttpSyncTransport, SyncEngine, type SyncReport } from '@smilesync/shared';
import type { AuthService } from '../core/offlineAuth';
import type { SqlDb } from '../core/ports';
import { SyncService } from '../core/syncService';
import { SqliteSyncStore } from '../core/syncStore';
import { refreshToken, syncHttpClient } from './api';

export interface SyncState {
  online: boolean;
  running: boolean;
  last: SyncReport | null;
  lastRunAt: Date | null;
  /** Bumped after every run, so screens reload their cases. */
  version: number;
}

export function useSync(db: SqlDb | null, auth: AuthService, chwId: string | null) {
  const [state, setState] = useState<SyncState>({ online: false, running: false, last: null, lastRunAt: null, version: 0 });
  const auto = useRef<AutoSync | null>(null);

  useEffect(() => {
    if (!db || !chwId) return;
    const engine = new SyncEngine({
      store: new SqliteSyncStore(db, chwId),
      transport: new HttpSyncTransport(syncHttpClient(async () => (await auth.getToken())?.token ?? null)),
    });
    const service = new SyncService({
      engine,
      tokens: { get: () => auth.getToken(), save: (t) => auth.saveToken(t) },
      refresh: refreshToken,
    });
    const a = new AutoSync(service, {
      onReport: (report) => setState((s) => ({ ...s, running: false, last: report, lastRunAt: new Date(), version: s.version + 1 })),
      onError: () => setState((s) => ({ ...s, running: false, version: s.version + 1 })),
    });
    auto.current = a;

    const netSub = NetInfo.addEventListener((n) => {
      // isInternetReachable is null while unknown: treat as online and let the request decide.
      const online = n.isConnected === true && n.isInternetReachable !== false;
      setState((s) => ({ ...s, online }));
      a.setOnline(online);
    });
    const appSub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void a.trigger();
    });
    return () => {
      netSub();
      appSub.remove();
      a.stop();
      auto.current = null;
    };
  }, [db, auth, chwId]);

  /** "Send now", or after saving a case. Force ignores the retry schedule. */
  const syncNow = useCallback(async (force = true) => {
    if (!auto.current) return;
    setState((s) => ({ ...s, running: true }));
    await auto.current.trigger(force);
    setState((s) => ({ ...s, running: false }));
  }, []);

  return { ...state, syncNow };
}
