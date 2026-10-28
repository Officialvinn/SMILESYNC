/**
 * Summary of a case on the phone. Step 4 (symptom questions, FR 4.1) and
 * sending (FR 5) arrive in Sprint 2; until then a finished draft waits here.
 */
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import type { CaseDetail, CaseRepo } from '../core/caseRepo';
import { VIEW_GUIDANCE } from '../core/capturePlan';
import { Banner, BigButton, Body, Screen, StepHeader, Title } from '../ui/components';
import { Thumbnail } from '../ui/Thumbnail';
import { colors, size } from '../ui/theme';
import { TOTAL_STEPS } from './ConsentScreen';

export function CaseScreen(props: {
  caseId: string;
  chwId: string;
  repo: CaseRepo;
  onEditPhotos: () => void;
  onHome: () => void;
}) {
  const { caseId, chwId, repo, onEditPhotos, onHome } = props;
  const [c, setCase] = useState<CaseDetail | null | undefined>(undefined);

  useEffect(() => {
    void repo.getCase(caseId, chwId).then(setCase);
  }, [repo, caseId, chwId]);

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
  return (
    <Screen>
      {c.isDraft ? <StepHeader step={4} total={TOTAL_STEPS} title="Symptoms" /> : <Title>Case</Title>}
      <View style={s.card}>
        <Text style={s.name}>{p.name}</Text>
        <Text style={s.meta}>
          {p.anonId} · {p.age} years{p.sex ? ` · ${p.sex.toLowerCase()}` : ''} · {p.location}
        </Text>
        <Text style={s.meta}>Consent: {new Date(p.consentDate).toLocaleString()}</Text>
      </View>
      {c.isDraft ? (
        <Banner kind="warn">Saved on this phone. Symptom questions and sending to the dentist come in the next app update.</Banner>
      ) : null}
      <View style={s.grid}>
        {c.images.map((img) => (
          <View key={img.id} style={s.cell}>
            <Thumbnail repo={repo} imageId={img.id} />
            <Text style={s.caption}>{img.viewType === 'EXTRA' ? 'Extra' : VIEW_GUIDANCE[img.viewType].title.split(',')[0]}</Text>
          </View>
        ))}
      </View>
      {c.isDraft ? <BigButton label="Change photos" kind="secondary" onPress={onEditPhotos} /> : null}
      <BigButton label="Home" onPress={onHome} />
      {c.isDraft ? <BigButton label="Delete case (consent withdrawn)" kind="danger" onPress={confirmDiscard} /> : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: size.radius, padding: 14, gap: 4, borderWidth: 1, borderColor: colors.border },
  name: { fontSize: size.title - 2, fontWeight: '700', color: colors.text },
  meta: { fontSize: size.small, color: colors.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { alignItems: 'center', gap: 4, width: 96 },
  caption: { fontSize: size.small - 2, color: colors.text, textAlign: 'center' },
});
