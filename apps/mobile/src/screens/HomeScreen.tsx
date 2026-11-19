/**
 * Home: the next thing to do first, then where the CHW's cases stand.
 * An unfinished case comes first ("Continue"), otherwise "New patient".
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CaseListItem, CaseRepo } from '../core/caseRepo';
import type { Session } from '../core/offlineAuth';
import type { SyncState } from '../platform/sync';
import { Banner, BigButton, Body, Screen, TextButton, Title } from '../ui/components';
import { PRIORITY_COLOR, statusLine } from '../ui/labels';
import { colors, size } from '../ui/theme';

/** Shown while the phone has only a few cases, so the space helps instead of sitting empty. */
const PHOTO_TIPS = [
  'Use daylight from a door or window, or turn on the light.',
  'Ask the patient to open wide and hold still for two seconds.',
  'Fill the box with teeth and gums; get closer rather than zooming.',
];

/** Where an unfinished case stands, out of the 4 steps. */
function draftStep(c: CaseListItem): { done: number; label: string } {
  if (!c.canFinish) return { done: 2, label: `Photos: ${Math.min(c.imageCount, 3)} of 3 taken` };
  if (!c.hasAssessment) return { done: 3, label: 'Photos done. Symptoms next' };
  return { done: 3, label: 'Ready to save' };
}

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
  const draft = cases?.find((c) => c.isDraft) ?? null; // newest first
  const others = cases?.filter((c) => c.id !== draft?.id) ?? [];

  const connection = !sync.online
    ? 'Offline · cases stay safe on this phone'
    : sync.lastRunAt
      ? `Online · checked ${sync.lastRunAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'Online';

  return (
    <Screen>
      <View style={s.top}>
        <View style={{ flex: 1 }}>
          <Title>Hello, {session.user.username}</Title>
          <View style={s.connection}>
            <View style={[s.dot, { backgroundColor: sync.online ? colors.primary : colors.warnText }]} />
            <Text style={s.connectionText}>{connection}</Text>
          </View>
        </View>
        <TextButton label="Log out" onPress={onLogout} />
      </View>

      {sync.last?.authRequired ? (
        <View style={{ gap: 8 }}>
          <Banner kind="error">Your login has expired. Log in again with internet to send cases. Nothing is lost.</Banner>
          <BigButton label="Log in again" kind="secondary" onPress={onLoginAgain} />
        </View>
      ) : !sync.online && waiting > 0 ? (
        <Banner kind="warn">{`${waiting} saved ${waiting === 1 ? 'case' : 'cases'} will be sent automatically when you are back online.`}</Banner>
      ) : null}

      {cases === null ? <Body muted>Loading…</Body> : null}

      {/* The next thing to do. */}
      {draft ? (
        <View style={s.hero}>
          <Text style={s.heroEyebrow}>Continue where you left off</Text>
          <Text style={s.heroTitle}>{draft.patientName}</Text>
          <View style={s.steps} accessibilityLabel={`Step ${draftStep(draft).done + 1} of 4`}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[s.stepSeg, i < draftStep(draft).done && s.stepOn]} />
            ))}
          </View>
          <Text style={s.heroMeta}>{draftStep(draft).label}</Text>
          <BigButton label="Continue" onPress={() => onOpenCase(draft)} />
          <BigButton label="New patient instead" kind="secondary" onPress={onNewPatient} />
        </View>
      ) : cases ? (
        <View style={s.hero}>
          <Text style={s.heroTitle}>Register a patient</Text>
          <Text style={s.heroMeta}>Consent, details, 3 photos and 2 questions. About 5 minutes, works without internet.</Text>
          <BigButton label="New patient" onPress={onNewPatient} />
        </View>
      ) : null}

      {waiting > 0 && sync.online ? (
        <BigButton label={sync.running ? 'Sending…' : `Send now (${waiting} waiting)`} kind="secondary" busy={sync.running} onPress={onSendNow} />
      ) : null}

      {cases && cases.length > 0 ? (
        <View style={s.stats} accessibilityRole="summary">
          <Stat value={waiting} label="Waiting to send" />
          <Stat value={sent} label="With dentist" />
          <Stat value={replied} label="Dentist replied" tone={replied > 0 ? 'good' : undefined} />
        </View>
      ) : null}

      {others.length > 0 ? <Text style={s.heading}>Your cases</Text> : null}
      {others.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => onOpenCase(c)}
          accessibilityRole="button"
          accessibilityLabel={`${c.patientName}, ${c.anonId}, ${statusLine(c)}`}
          style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.name}>{c.patientName}</Text>
            <Text style={s.meta}>
              {c.anonId} · {new Date(c.createdAt).toLocaleDateString()}
            </Text>
          </View>
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

      {cases && cases.length < 3 ? (
        <View style={s.tips}>
          <Text style={s.tipsTitle}>Tips for clear photos</Text>
          {PHOTO_TIPS.map((t) => (
            <View key={t} style={s.tipRow}>
              <Text style={s.tipBullet}>•</Text>
              <Text style={s.tipText}>{t}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'good' }) {
  return (
    <View style={[s.stat, tone === 'good' && { borderColor: colors.primary, backgroundColor: colors.okBg }]}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  connectionText: { fontSize: size.small, color: colors.muted },
  hero: {
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: size.radius + 4,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: 16,
  },
  heroEyebrow: { fontSize: size.small, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroTitle: { fontSize: size.title, fontWeight: '800', color: colors.text },
  heroMeta: { fontSize: size.text - 1, lineHeight: 22, color: colors.muted },
  steps: { flexDirection: 'row', gap: 4 },
  stepSeg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border },
  stepOn: { backgroundColor: colors.primary },
  stats: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: size.radius,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 2,
  },
  statValue: { fontSize: size.title + 6, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: size.small - 1, color: colors.muted },
  heading: { fontSize: size.text + 1, fontWeight: '700', color: colors.text, marginTop: 2 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: size.radius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    minHeight: size.touch,
  },
  name: { fontSize: size.text, fontWeight: '700', color: colors.text },
  meta: { fontSize: size.small, color: colors.muted },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, maxWidth: '50%' },
  chipDraft: { backgroundColor: colors.warnBg },
  chipSaved: { backgroundColor: colors.okBg },
  chipText: { fontSize: size.small - 1, fontWeight: '600', color: colors.text },
  tips: { gap: 6, backgroundColor: colors.okBg, borderRadius: size.radius, padding: 14 },
  tipsTitle: { fontSize: size.text, fontWeight: '700', color: colors.text },
  tipRow: { flexDirection: 'row', gap: 8 },
  tipBullet: { fontSize: size.text, color: colors.text, lineHeight: 22 },
  tipText: { flex: 1, fontSize: size.text - 1, lineHeight: 22, color: colors.text },
});
