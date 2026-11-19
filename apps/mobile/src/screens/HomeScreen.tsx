/** The CHW's cases on this phone. Drafts can be resumed. */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CaseListItem, CaseRepo } from '../core/caseRepo';
import type { Session } from '../core/offlineAuth';
import type { SyncState } from '../platform/sync';
import { Actions, Banner, BigButton, Body, Screen, TextButton, Title } from '../ui/components';
import { PRIORITY_COLOR, statusLine } from '../ui/labels';
import { colors, size } from '../ui/theme';

export function HomeScreen(props: {
  session: Session;
  repo: CaseRepo;
  sync: SyncState;
  onSendNow: () => void;
  onLoginAgain: () => void;
  onNewPatient: () => void;
  onOpenCase: (c: CaseListItem) => void;
  onLogout: () => void;
}) {
  const { session, repo, sync, onSendNow, onLoginAgain, onNewPatient, onOpenCase, onLogout } = props;
  const [cases, setCases] = useState<CaseListItem[] | null>(null);

  const load = useCallback(async () => setCases(await repo.listCases(session.user.id)), [repo, session.user.id]);
  useEffect(() => {
    void load();
  }, [load, sync.version]);

  const waiting = cases?.filter((c) => !c.isDraft && c.status === 'PENDING' && !c.needsAttention).length ?? 0;
  const sent = cases?.filter((c) => c.status === 'SYNCED').length ?? 0;
  const replied = cases?.filter((c) => c.status === 'REVIEWED').length ?? 0;
  const empty = cases?.length === 0;
  const newPatient = <BigButton label="New patient" onPress={onNewPatient} hint="Starts consent, then patient details and photos" />;

  return (
    <Screen footer={empty ? undefined : <Actions>{newPatient}</Actions>}>
      <View style={s.top}>
        <Title>Hello, {session.user.username}</Title>
        <TextButton label="Log out" onPress={onLogout} />
      </View>
      {sync.last?.authRequired ? (
        <View style={{ gap: 10 }}>
          <Banner kind="error">Your login has expired. Log in again with internet to send cases. Nothing is lost.</Banner>
          <BigButton label="Log in again" kind="secondary" onPress={onLoginAgain} />
        </View>
      ) : !sync.online ? (
        <Banner kind="warn">
          No internet.{' '}
          {waiting > 0
            ? `${waiting} saved ${waiting === 1 ? 'case' : 'cases'} will be sent automatically when you are back online.`
            : 'You can keep working; cases are sent when you are back online.'}
        </Banner>
      ) : null}
      {waiting > 0 && sync.online ? (
        <BigButton
          label={sync.running ? 'Sending…' : `Send now (${waiting} waiting)`}
          kind="secondary"
          busy={sync.running}
          onPress={onSendNow}
        />
      ) : null}

      {cases && !empty ? (
        <View style={s.stats} accessibilityRole="summary">
          <Stat value={waiting} label="Waiting to send" />
          <Stat value={sent} label="With dentist" />
          <Stat value={replied} label="Dentist replied" />
        </View>
      ) : null}
      {cases === null ? <Body muted>Loading…</Body> : null}
      {empty ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No cases on this phone yet</Text>
          <Body muted>Start with consent, then the patient's details, three photos and two symptom questions. It takes about 5 minutes.</Body>
          <View style={s.emptyAction}>{newPatient}</View>
        </View>
      ) : null}
      {cases && !empty ? <Text style={s.heading}>Cases on this phone</Text> : null}
      {cases?.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => onOpenCase(c)}
          accessibilityRole="button"
          accessibilityLabel={`${c.patientName}, ${c.anonId}, ${statusLine(c)}`}
          style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}
        >
          <Text style={s.name}>{c.patientName}</Text>
          <Text style={s.meta}>
            {c.anonId} · {new Date(c.createdAt).toLocaleDateString()}
          </Text>
          <View
            style={[
              s.chip,
              c.isDraft || c.status === 'PENDING' ? s.chipDraft : s.chipSaved,
              c.needsAttention && { backgroundColor: colors.errorBg },
              c.priority && { backgroundColor: PRIORITY_COLOR[c.priority] },
            ]}
          >
            <Text style={[s.chipText, c.priority && { color: '#fff' }]}>{statusLine(c)}</Text>
          </View>
        </Pressable>
      ))}

    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: size.radius, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, paddingHorizontal: 10 },
  statValue: { fontSize: size.title, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: size.small - 1, color: colors.muted },
  empty: { marginTop: 40, gap: 10, backgroundColor: colors.surface, borderRadius: size.radius, borderWidth: 1, borderColor: colors.border, padding: 16 },
  emptyTitle: { fontSize: size.text + 2, fontWeight: '700', color: colors.text },
  emptyAction: { flexDirection: 'row', marginTop: 4 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { fontSize: size.text + 1, fontWeight: '700', color: colors.text, marginTop: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: size.radius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 4,
    minHeight: size.touch,
  },
  name: { fontSize: size.text + 1, fontWeight: '700', color: colors.text },
  meta: { fontSize: size.small, color: colors.muted },
  chip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipDraft: { backgroundColor: colors.warnBg },
  chipSaved: { backgroundColor: colors.okBg },
  chipText: { fontSize: size.small, fontWeight: '600', color: colors.text },
});
