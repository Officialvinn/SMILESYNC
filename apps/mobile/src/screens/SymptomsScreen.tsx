/** FR 4.1: pain level 1-10 and duration, then save the case (FR 4.2: Pending). */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SYMPTOM_DURATIONS, type SymptomDuration } from '@smilesync/shared';
import type { CaseRepo } from '../core/caseRepo';
import { Actions, Banner, BigButton, Choices, Screen, StepHeader, styles as ui } from '../ui/components';
import { DURATION_LABEL } from '../ui/labels';
import { colors, size } from '../ui/theme';
import { TOTAL_STEPS } from './ConsentScreen';

const PAIN_WORDS: Record<number, string> = { 1: 'No pain', 5: 'Moderate', 10: 'Worst pain' };

export function SymptomsScreen(props: { caseId: string; chwId: string; repo: CaseRepo; onSaved: () => void; onBack: () => void }) {
  const { caseId, chwId, repo, onSaved, onBack } = props;
  const [pain, setPain] = useState<number | null>(null);
  const [duration, setDuration] = useState<SymptomDuration | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resume an earlier answer on this draft.
  useEffect(() => {
    void repo.getCase(caseId, chwId).then((c) => {
      if (c?.assessment) {
        setPain(c.assessment.painLevel);
        setDuration(c.assessment.duration);
      }
    });
  }, [repo, caseId, chwId]);

  async function save() {
    if (pain === null || !duration) return setError(pain === null ? 'Choose a pain level from 1 to 10.' : 'Choose how long it has lasted.');
    setBusy(true);
    setError(null);
    try {
      await repo.saveAssessment(caseId, { painLevel: pain, duration });
      await repo.submitCase(caseId, chwId);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
      setBusy(false);
    }
  }

  return (
    <Screen
      header={<StepHeader step={4} total={TOTAL_STEPS} title="Symptoms" />}
      footer={
        <Actions hint="After saving, the case cannot be changed. It is sent when the phone has internet.">
          <BigButton label="Back" kind="secondary" onPress={onBack} flex={1} />
          <BigButton label="Save case" onPress={save} busy={busy} flex={2} />
        </Actions>
      }
    >
      {error ? <Banner kind="error">{error}</Banner> : null}
      <View style={ui.field}>
        <Text style={ui.label}>How bad is the pain? Ask the patient to choose 1 to 10.</Text>
        <View style={s.grid} accessibilityRole="radiogroup">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const on = pain === n;
            return (
              <Pressable
                key={n}
                onPress={() => setPain(n)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Pain ${n}${PAIN_WORDS[n] ? `, ${PAIN_WORDS[n]}` : ''}`}
                style={[s.cell, on && s.cellOn]}
              >
                <Text style={[s.cellText, on && { color: colors.primaryText }]}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={s.scale}>
          <Text style={s.scaleText}>1 = no pain</Text>
          <Text style={s.scaleText}>10 = worst pain</Text>
        </View>
      </View>
      <Choices
        label="How long has it lasted?"
        options={SYMPTOM_DURATIONS.map((d) => ({ value: d, label: DURATION_LABEL[d] }))}
        value={duration}
        onChange={setDuration}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  cell: {
    width: '17.5%',
    aspectRatio: 1,
    minHeight: size.touch,
    borderRadius: size.radius,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellOn: { backgroundColor: colors.primary },
  cellText: { fontSize: size.title, fontWeight: '700', color: colors.primary },
  scale: { flexDirection: 'row', justifyContent: 'space-between' },
  scaleText: { fontSize: size.small, color: colors.muted },
});
