/**
 * One case: patient, photos, answers, send status (FR 5.3) and, once the
 * dentist has replied, the priority and notes (FR 7.3).
 */
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import type { CaseDetail, CaseRepo } from '../core/caseRepo';
import { VIEW_GUIDANCE } from '../core/capturePlan';
import { Actions, Banner, BigButton, Body, Screen, TextButton, Title } from '../ui/components';
import { DURATION_LABEL, PRIORITY_COLOR, PRIORITY_LABEL } from '../ui/labels';
import { Thumbnail } from '../ui/Thumbnail';
import { colors, size } from '../ui/theme';

export function CaseScreen(props: {
  caseId: string;
  chwId: string;
  repo: CaseRepo;
  /** Bumped by sync, so the status here stays current. */
  version: number;
  onEditPhotos: () => void;
  onSymptoms: () => void;
  onSendNow: () => void;
  onHome: () => void;
}) {
  const { caseId, chwId, repo, version, onEditPhotos, onSymptoms, onSendNow, onHome } = props;
  const [c, setCase] = useState<CaseDetail | null | undefined>(undefined);

  useEffect(() => {
    void repo.getCase(caseId, chwId).then(setCase);
  }, [repo, caseId, chwId, version]);

  if (c === undefined) return <Screen><Body muted>Loading…</Body></Screen>;
  if (c === null) return <Screen><Body>Case not found.</Body><BigButton label="Home" onPress={onHome} /></Screen>;

  function confirmDiscard() {
    Alert.alert(
      'Delete this case?',
      'Use this if the patient withdraws consent. The details and photos are deleted from this phone.',
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void repo.discardDraft(caseId, chwId).then(onHome) },
      ],
    );
  }

  const p = c.patient;
  const footer = (
    <Actions>
      {c.isDraft ? (
        <BigButton label={c.assessment ? 'Review symptoms and save' : 'Next: symptoms'} onPress={onSymptoms} />
      ) : (
        <BigButton label="Back to cases" onPress={onHome} />
      )}
    </Actions>
  );
  return (
    <Screen footer={footer}>
      <Title>Case {p.anonId}</Title>
      <View style={s.card}>
        <Text style={s.name}>{p.name}</Text>
        <Text style={s.meta}>
          {p.age} years{p.sex ? ` · ${p.sex.toLowerCase()}` : ''} · {p.location}
        </Text>
        <Text style={s.meta}>Consent: {new Date(p.consentDate).toLocaleString()}</Text>
        {c.assessment ? (
          <Text style={s.meta}>
            Pain {c.assessment.painLevel}/10 · {DURATION_LABEL[c.assessment.duration]}
          </Text>
        ) : null}
      </View>

      <StatusPanel c={c} onSendNow={onSendNow} />

      <View style={s.grid}>
        {c.images.map((img) => (
          <View key={img.id} style={s.cell}>
            <Thumbnail repo={repo} imageId={img.id} />
            <Text style={s.caption}>{img.viewType === 'EXTRA' ? 'Extra' : VIEW_GUIDANCE[img.viewType].title.split(',')[0]}</Text>
          </View>
        ))}
      </View>

      {c.isDraft ? (
        <View style={s.links}>
          <TextButton label="Change photos" onPress={onEditPhotos} />
          <TextButton label="Back to cases" onPress={onHome} />
          <TextButton label="Delete case (consent withdrawn)" onPress={confirmDiscard} danger />
        </View>
      ) : null}
    </Screen>
  );
}

function StatusPanel({ c, onSendNow }: { c: CaseDetail; onSendNow: () => void }) {
  if (c.isDraft) return <Banner kind="warn">Not saved as a case yet. Finish the steps, then tap Save case.</Banner>;

  if (c.status === 'PENDING') {
    return (
      <View style={{ gap: 10 }}>
        {c.sync.needsAttention ? (
          <Banner kind="error">{c.sync.lastError ?? 'This case could not be sent.'}</Banner>
        ) : (
          <Banner kind="warn">
            Saved on this phone, waiting to send.
            {c.sync.lastError ? ` ${c.sync.lastError}` : ''}
            {c.sync.nextAttemptAt ? ` Next try: ${new Date(c.sync.nextAttemptAt).toLocaleTimeString()}.` : ''}
          </Banner>
        )}
        {!c.sync.needsAttention ? <BigButton label="Send now" kind="secondary" onPress={onSendNow} /> : null}
      </View>
    );
  }

  if (c.status === 'SYNCED') {
    return <Banner kind="ok">Sent{c.sync.syncedAt ? ` on ${new Date(c.sync.syncedAt).toLocaleString()}` : ''}. Waiting for the dentist.</Banner>;
  }

  // REVIEWED: the server's result (FR 7.1, 7.2, 7.3).
  const pr = c.triage.priority;
  return (
    <View style={[s.result, pr ? { borderColor: PRIORITY_COLOR[pr] } : null]} accessibilityLiveRegion="polite">
      <Text style={s.resultLabel}>Dentist's priority</Text>
      <Text style={[s.priority, pr ? { color: PRIORITY_COLOR[pr] } : null]}>{pr ? PRIORITY_LABEL[pr] : 'Reviewed'}</Text>
      {c.triage.notes.map((n) => (
        <View key={n.id} style={{ gap: 4 }}>
          <Text style={s.note}>{n.noteText}</Text>
          {n.referralAdvice ? <Text style={s.note}>Referral: {n.referralAdvice}</Text> : null}
        </View>
      ))}
      {c.triage.reviewedAt ? <Text style={s.meta}>Reviewed {new Date(c.triage.reviewedAt).toLocaleString()}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  links: { gap: 0 },
  card: { backgroundColor: colors.surface, borderRadius: size.radius, padding: 12, gap: 2, borderWidth: 1, borderColor: colors.border },
  name: { fontSize: size.title - 2, fontWeight: '700', color: colors.text },
  meta: { fontSize: size.small, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { alignItems: 'center', gap: 4, width: 96 },
  caption: { fontSize: size.small - 2, color: colors.text, textAlign: 'center' },
  result: { backgroundColor: colors.surface, borderRadius: size.radius, borderWidth: 3, borderColor: colors.border, padding: 14, gap: 8 },
  resultLabel: { fontSize: size.small, color: colors.muted, fontWeight: '600' },
  priority: { fontSize: size.title + 4, fontWeight: '800', color: colors.text },
  note: { fontSize: size.text, lineHeight: 26, color: colors.text },
});
