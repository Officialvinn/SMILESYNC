/**
 * FR 2.3: consent comes before any patient data is entered. If the patient
 * refuses, nothing is stored.
 */
import { StyleSheet, Text, View } from 'react-native';
import { CONSENT_POINTS } from '../core/registration';
import { Actions, BigButton, Body, Screen, StepHeader } from '../ui/components';
import { colors, size } from '../ui/theme';

export const TOTAL_STEPS = 4;

export function ConsentScreen({ onAgree, onRefuse }: { onAgree: () => void; onRefuse: () => void }) {
  return (
    <Screen
      header={<StepHeader step={1} total={TOTAL_STEPS} title="Ask for consent" />}
      footer={
        <Actions hint="Does the patient agree?">
          <BigButton label="No" kind="danger" onPress={onRefuse} hint="Nothing is saved" flex={1} />
          <BigButton label="Yes, agrees" onPress={onAgree} flex={2} />
        </Actions>
      }
    >
      <Body muted>Read this to the patient. For a child under 18, ask the parent or guardian.</Body>
      <View style={s.box}>
        {CONSENT_POINTS.map((p, i) => (
          <View key={p} style={[s.point, i > 0 && s.divider]}>
            <Text style={s.text}>{p}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: colors.surface, borderRadius: size.radius + 6, paddingHorizontal: 16, paddingVertical: 6 },
  point: { paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  text: { fontSize: size.text, lineHeight: 25, color: colors.text, textAlign: 'center' },
});
