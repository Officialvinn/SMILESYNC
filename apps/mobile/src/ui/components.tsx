import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, size } from './theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/** NFR 3: "Step 2 of 4" so the CHW always knows how far along they are. */
export function StepHeader({ step, total, title }: { step: number; total: number; title: string }) {
  return (
    <View style={styles.stepHeader} accessibilityRole="header">
      <Text style={styles.stepCount}>
        Step {step} of {total}
      </Text>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.title} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && { color: colors.muted }]}>{children}</Text>;
}

type ButtonKind = 'primary' | 'secondary' | 'danger';

export function BigButton(props: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  busy?: boolean;
  hint?: string;
}) {
  const { label, onPress, kind = 'primary', disabled, busy, hint } = props;
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={({ pressed }) => [styles.button, buttonStyle[kind], off && styles.buttonOff, pressed && { opacity: 0.8 }]}
    >
      {busy ? (
        <ActivityIndicator color={kind === 'primary' ? colors.primaryText : colors.primary} />
      ) : (
        <Text style={[styles.buttonText, kind !== 'primary' && { color: kind === 'danger' ? colors.danger : colors.primary }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string; error?: string }) {
  const { label, error, ...input } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? { borderColor: colors.danger } : null]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Banner({ kind, children }: { kind: 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const bg = kind === 'warn' ? colors.warnBg : kind === 'error' ? colors.errorBg : colors.okBg;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityLiveRegion="polite">
      <Text style={[styles.body, kind === 'warn' && { color: colors.warnText }]}>{children}</Text>
    </View>
  );
}

/** A row of large toggle buttons for short choice lists (sex, symptom duration). */
export function Choices<T extends string>(props: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | '';
  onChange: (v: T | '') => void;
  allowClear?: boolean;
}) {
  const { label, options, value, onChange, allowClear } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choiceRow} accessibilityRole="radiogroup">
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(selected && allowClear ? '' : o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.choice, selected && styles.choiceOn]}
            >
              <Text style={[styles.choiceText, selected && { color: colors.primaryText }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: size.gutter, gap: 14 },
  stepHeader: { gap: 4, marginBottom: 4 },
  stepCount: { fontSize: size.small, color: colors.muted, fontWeight: '600' },
  title: { fontSize: size.title, fontWeight: '700', color: colors.text },
  body: { fontSize: size.text, lineHeight: 26, color: colors.text },
  button: {
    minHeight: size.touch,
    borderRadius: size.radius,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderWidth: 2,
  },
  buttonOff: { opacity: 0.45 },
  buttonText: { fontSize: size.text, fontWeight: '700', color: colors.primaryText },
  field: { gap: 6 },
  label: { fontSize: size.text, fontWeight: '600', color: colors.text },
  input: {
    minHeight: size.touch,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: size.radius,
    paddingHorizontal: 14,
    fontSize: size.text + 2,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  error: { fontSize: size.small, color: colors.danger, fontWeight: '600' },
  banner: { padding: 14, borderRadius: size.radius },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choice: {
    minHeight: size.touch - 8,
    minWidth: 96,
    paddingHorizontal: 16,
    borderRadius: size.radius,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  choiceOn: { backgroundColor: colors.primary },
  choiceText: { fontSize: size.text, fontWeight: '600', color: colors.primary },
});

const buttonStyle = StyleSheet.create({
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderColor: colors.primary },
  danger: { backgroundColor: colors.surface, borderColor: colors.danger },
});
