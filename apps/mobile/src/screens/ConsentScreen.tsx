/**
 * FR 2.3: consent comes before any patient data is entered. If the patient
 * refuses, nothing is stored.
 */
import { StyleSheet, Text, View } from 'react-native';
import { CONSENT_POINTS } from '../core/registration';
import { BigButton, Body, Screen, StepHeader } from '../ui/components';
import { colors, size } from '../ui/theme';

export const TOTAL_STEPS = 4;

export function ConsentScreen({ onAgree, onRefuse }: { onAgree: () => void; onRefuse: () => void }) {
  return (
    <Screen>
      <StepHeader step={1} total={TOTAL_STEPS} title="Ask for consent" />
      <Body>Read this to the patient. For a child under 18, ask the parent or guardian.</Body>
      <View style={s.box}>
        {CONSENT_POINTS.map((p) => (
          <View key={p} style={s.point}>
            <Text style={s.bullet}>•</Text>
            <Text style={s.text}>{p}</Text>
          </View>
        ))}
      </View>
      <Body>Does the patient agree?</Body>
      <BigButton label="Yes, the patient agrees" onPress={onAgree} />
      <BigButton label="No, the patient does not agree" kind="danger" onPress={onRefuse} hint="Nothing is saved" />
    </Screen>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: colors.surface, borderRadius: size.radius, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 },
  point: { flexDirection: 'row', gap: 8 },
  bullet: { fontSize: size.text, lineHeight: 26, color: colors.text },
  text: { flex: 1, fontSize: size.text, lineHeight: 26, color: colors.text },
});
