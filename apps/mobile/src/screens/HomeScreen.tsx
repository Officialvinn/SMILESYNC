/** The CHW's cases on this phone. Drafts can be resumed. */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CaseListItem, CaseRepo } from '../core/caseRepo';
import type { Session } from '../core/offlineAuth';
import type { SyncState } from '../platform/sync';
import { Banner, BigButton, Body, Screen, Title } from '../ui/components';
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

  return (
    <Screen>
      <Title>Hello, {session.user.username}</Title>
      {sync.last?.authRequired ? (
        <View style={{ gap: 10 }}>
          <Banner kind="error">Your login has expired. Log in again with internet to send cases. Nothing is lost.</Banner>
          <BigButton label="Log in again" kind="secondary" onPress={onLoginAgain} />
        </View>
      ) : !sync.online ? (
        <Banner kind="warn">No internet. You can keep working; cases are sent automatically when you are back online.</Banner>
      ) : null}
      {waiting > 0 ? (
        <BigButton
          label={sync.running ? 'Sending…' : `Send now (${waiting} waiting)`}
          kind="secondary"
          busy={sync.running}
          disabled={!sync.online}
          onPress={onSendNow}
        />
      ) : null}
      <BigButton label="New patient" onPress={onNewPatient} hint="Starts consent, then patient details and photos" />

      <Text style={s.heading}>Cases on this phone</Text>
      {cases === null ? <Body muted>Loading…</Body> : null}
      {cases?.length === 0 ? <Body muted>No cases yet.</Body> : null}
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

      <View style={{ height: 12 }} />
      <BigButton label="Log out" kind="secondary" onPress={onLogout} />
    </Screen>
  );
}

const s = StyleSheet.create({
  heading: { fontSize: size.text + 2, fontWeight: '700', color: colors.text, marginTop: 8 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: size.radius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
    minHeight: size.touch,
  },
  name: { fontSize: size.text + 1, fontWeight: '700', color: colors.text },
  meta: { fontSize: size.small, color: colors.muted },
  chip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipDraft: { backgroundColor: colors.warnBg },
  chipSaved: { backgroundColor: colors.okBg },
  chipText: { fontSize: size.small, fontWeight: '600', color: colors.text },
});
