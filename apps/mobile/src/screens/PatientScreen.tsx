/** FR 2.1 patient details and FR 2.2 anonymised ID. Shown only after consent (FR 2.3). */
import { getRandomBytes, randomUUID } from 'expo-crypto';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KENYA_COUNTIES, type Sex } from '@smilesync/shared';
import type { CaseRepo } from '../core/caseRepo';
import { buildPatient, type Consent, type FormErrors, type PatientForm } from '../core/registration';
import { Actions, Banner, BigButton, Choices, Field, Screen, StepHeader, styles as ui } from '../ui/components';
import { colors, size } from '../ui/theme';
import { TOTAL_STEPS } from './ConsentScreen';

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' },
  { value: 'OTHER', label: 'Other' },
];

export function PatientScreen(props: {
  consent: Consent;
  chwId: string;
  repo: CaseRepo;
  defaultCounty: string;
  onSaved: (caseId: string, county: string) => void;
  onCancel: () => void;
}) {
  const { consent, chwId, repo, defaultCounty, onSaved, onCancel } = props;
  const [form, setForm] = useState<PatientForm>({ name: '', age: '', location: defaultCounty, sex: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const set = (k: keyof PatientForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    const r = buildPatient(form, consent, { uuid: randomUUID, randomBytes: getRandomBytes });
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    setBusy(true);
    try {
      const caseId = await repo.startCase(r.patient, chwId);
      onSaved(caseId, r.patient.location);
    } catch {
      setFailure('Could not save on this phone. Try again.');
      setBusy(false);
    }
  }

  return (
    <Screen
      header={<StepHeader step={2} total={TOTAL_STEPS} title="Patient details" />}
      footer={
        <Actions>
          <BigButton label="Cancel" kind="secondary" onPress={onCancel} hint="Nothing is saved" flex={1} />
          <BigButton label="Next: photos" onPress={save} busy={busy} flex={2} />
        </Actions>
      }
    >
      <Text style={s.consent}>Consent recorded at {new Date(consent.consentDate).toLocaleTimeString()}</Text>
      {failure ? <Banner kind="error">{failure}</Banner> : null}
      <Field label="Full name" value={form.name} onChangeText={set('name')} error={errors.name} autoCapitalize="words" autoCorrect={false} />
      <Field
        label="Age in years"
        value={form.age}
        onChangeText={(t) => set('age')(t.replace(/\D/g, '').slice(0, 3))}
        error={errors.age}
        keyboardType="number-pad"
        maxLength={3}
      />
      <View style={ui.field}>
        <Text style={ui.label}>County</Text>
        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel={`County: ${form.location || 'not chosen'}. Tap to change.`}
          style={[ui.input, s.picker, errors.location ? { borderColor: colors.danger } : null]}
        >
          <Text style={[s.pickerText, !form.location && { color: colors.muted }]}>{form.location || 'Choose county'}</Text>
        </Pressable>
        {errors.location ? <Text style={ui.error}>{errors.location}</Text> : null}
      </View>
      <Choices label="Sex (optional)" options={SEX_OPTIONS} value={form.sex as Sex | ''} onChange={set('sex')} allowClear />
      <CountyPicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(c) => {
          set('location')(c);
          setPicking(false);
        }}
      />
    </Screen>
  );
}

function CountyPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (c: string) => void }) {
  const [query, setQuery] = useState('');
  const list = useMemo(
    () => KENYA_COUNTIES.filter((c) => c.toLowerCase().includes(query.trim().toLowerCase())),
    [query],
  );
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, padding: size.gutter, gap: 12 }}>
        <Field label="Search county" value={query} onChangeText={setQuery} autoCorrect={false} autoFocus />
        <FlatList
          data={list}
          keyExtractor={(c) => c}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable onPress={() => onPick(item)} accessibilityRole="button" style={s.row}>
              <Text style={s.pickerText}>{item}</Text>
            </Pressable>
          )}
        />
        <BigButton label="Close" kind="secondary" onPress={onClose} />
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  consent: { fontSize: size.small, color: colors.primary, fontWeight: '700', textAlign: 'center' },
  picker: { justifyContent: 'center', alignItems: 'center' },
  pickerText: { fontSize: size.text + 2, color: colors.text, textAlign: 'center' },
  row: { minHeight: size.touch, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
});
