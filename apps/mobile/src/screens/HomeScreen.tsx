/** The CHW's cases on this phone. Drafts can be resumed. */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CaseListItem, CaseRepo } from '../core/caseRepo';
import type { Session } from '../core/offlineAuth';
import { Banner, BigButton, Body, Screen, Title } from '../ui/components';
import { colors, size } from '../ui/theme';

const STATUS_LABEL = { PENDING: 'Saved on phone', SYNCED: 'Sent, waiting for dentist', REVIEWED: 'Dentist replied' } as const;

export function HomeScreen(props: {
  session: Session;
  repo: CaseRepo;
  onNewPatient: () => void;
  onOpenCase: (c: CaseListItem) => void;
  onLogout: () => void;
}) {
  const { session, repo, onNewPatient, onOpenCase, onLogout } = props;
  const [cases, setCases] = useState<CaseListItem[] | null>(null);

  const load = useCallback(async () => setCases(await repo.listCases(session.user.id)), [repo, session.user.id]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen>
      <Title>Hello, {session.user.username}</Title>
      {session.offline ? (
        <Banner kind="warn">You logged in without internet. You can register patients and take photos.</Banner>
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
          accessibilityLabel={`${c.patientName}, ${c.anonId}, ${c.isDraft ? 'in progress' : STATUS_LABEL[c.status]}`}
          style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}
        >
          <Text style={s.name}>{c.patientName}</Text>
          <Text style={s.meta}>
            {c.anonId} · {new Date(c.createdAt).toLocaleDateString()}
          </Text>
          <View style={[s.chip, c.isDraft ? s.chipDraft : s.chipSaved]}>
            <Text style={s.chipText}>
              {c.isDraft ? (c.canFinish ? 'Photos done, symptoms next' : `In progress: ${c.imageCount} photos`) : STATUS_LABEL[c.status]}
            </Text>
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
