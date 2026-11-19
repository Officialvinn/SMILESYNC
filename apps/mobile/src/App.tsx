/**
 * Screen flow. A small state machine instead of a navigation library: the
 * CHW flow is linear (NFR 3), and fewer dependencies is easier to maintain.
 *
 *   boot -> login -> home -> consent -> patient -> capture -> symptoms -> home
 *                         \-> case (status, dentist result)
 */
import { randomUUID } from 'expo-crypto';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CaseRepo } from './core/caseRepo';
import { AuthService, bcryptPinHasher, type Session } from './core/offlineAuth';
import { recordConsent, type Consent } from './core/registration';
import { authApi } from './platform/api';
import { openDatabase } from './platform/database';
import type { SqlDb } from './core/ports';
import { useSync } from './platform/sync';
import { cleanUpTemporaryPhotos } from './platform/photos';
import { secureKV } from './platform/secureKV';
import { CaptureScreen } from './screens/CaptureScreen';
import { CaseScreen } from './screens/CaseScreen';
import { ConsentScreen } from './screens/ConsentScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { PatientScreen } from './screens/PatientScreen';
import { SymptomsScreen } from './screens/SymptomsScreen';
import { Banner, BigButton, Body, Screen, Title } from './ui/components';

type Route =
  | { name: 'home' }
  | { name: 'consent' }
  | { name: 'patient'; consent: Consent }
  | { name: 'capture'; caseId: string }
  | { name: 'symptoms'; caseId: string }
  | { name: 'case'; caseId: string };

export default function App() {
  const auth = useMemo(() => new AuthService({ api: authApi, kv: secureKV, hasher: bcryptPinHasher() }), []);
  const [db, setDb] = useState<SqlDb | null>(null);
  const [repo, setRepo] = useState<CaseRepo | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [lastCounty, setLastCounty] = useState('');

  useEffect(() => {
    cleanUpTemporaryPhotos();
    openDatabase()
      .then((opened) => {
        setDb(opened);
        setRepo(new CaseRepo(opened, { uuid: randomUUID, now: () => new Date().toISOString() }));
      })
      .catch((e: unknown) => setFatal(e instanceof Error ? e.message : String(e)));
  }, []);

  // FR 5.1: automatic sync while a CHW is logged in.
  const sync = useSync(db, auth, session?.user.id ?? null);

  // Android back button: one step back, never out of the app mid-case.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!session || route.name === 'home') return false;
      if (route.name === 'case') setRoute({ name: 'home' });
      else if (route.name === 'patient') setRoute({ name: 'consent' });
      else if (route.name === 'symptoms') setRoute({ name: 'capture', caseId: route.caseId });
      else if (route.name !== 'capture') setRoute({ name: 'home' });
      return true;
    });
    return () => sub.remove();
  }, [session, route]);

  let screen;
  if (fatal) {
    screen = (
      <Screen>
        <Title>Cannot open saved data</Title>
        <Banner kind="error">{fatal}</Banner>
        <Body>Do not uninstall the app: saved cases may still be recoverable. Contact your supervisor.</Body>
      </Screen>
    );
  } else if (!repo) {
    screen = <Screen><Body muted>Opening…</Body></Screen>;
  } else if (!session) {
    screen = (
      <LoginScreen
        auth={auth}
        onLoggedIn={(s) => {
          setSession(s);
          setRoute({ name: 'home' });
        }}
      />
    );
  } else if (route.name === 'consent') {
    screen = (
      <ConsentScreen
        onAgree={() => setRoute({ name: 'patient', consent: recordConsent(new Date()) })}
        onRefuse={() => setRoute({ name: 'home' })}
      />
    );
  } else if (route.name === 'patient') {
    screen = (
      <PatientScreen
        consent={route.consent}
        chwId={session.user.id}
        repo={repo}
        defaultCounty={lastCounty}
        onSaved={(caseId, county) => {
          setLastCounty(county);
          setRoute({ name: 'capture', caseId });
        }}
        onCancel={() => setRoute({ name: 'home' })}
      />
    );
  } else if (route.name === 'capture') {
    screen = (
      <CaptureScreen
        caseId={route.caseId}
        repo={repo}
        onDone={() => setRoute({ name: 'symptoms', caseId: route.caseId })}
        onExit={() => setRoute({ name: 'home' })}
      />
    );
  } else if (route.name === 'symptoms') {
    screen = (
      <SymptomsScreen
        caseId={route.caseId}
        chwId={session.user.id}
        repo={repo}
        onSaved={() => {
          setRoute({ name: 'home' });
          void sync.syncNow(false);
        }}
        onBack={() => setRoute({ name: 'capture', caseId: route.caseId })}
      />
    );
  } else if (route.name === 'case') {
    screen = (
      <CaseScreen
        caseId={route.caseId}
        chwId={session.user.id}
        repo={repo}
        version={sync.version}
        onEditPhotos={() => setRoute({ name: 'capture', caseId: route.caseId })}
        onSymptoms={() => setRoute({ name: 'symptoms', caseId: route.caseId })}
        onSendNow={() => void sync.syncNow()}
        onHome={() => setRoute({ name: 'home' })}
      />
    );
  } else {
    screen = (
      <HomeScreen
        session={session}
        repo={repo}
        sync={sync}
        onSendNow={() => void sync.syncNow()}
        onLoginAgain={() => setSession(null)}
        onNewPatient={() => setRoute({ name: 'consent' })}
        onOpenCase={(c) =>
          setRoute(
            c.isDraft && !c.canFinish
              ? { name: 'capture', caseId: c.id }
              : c.isDraft && !c.hasAssessment
                ? { name: 'symptoms', caseId: c.id }
                : { name: 'case', caseId: c.id },
          )
        }
        onLogout={() => setSession(null)}
      />
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {screen}
    </SafeAreaProvider>
  );
}
