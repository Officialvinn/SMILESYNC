import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, size } from './theme';

/**
 * A screen: content, then its actions straight after it (NFR 3: the next step
 * is where the eye ends, with no empty gap between the question and the answer).
 */
export function Screen({ children, footer, scroll = true }: { children: ReactNode; footer?: ReactNode; scroll?: boolean }) {
  const body = (
    <>
      {children}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </>
  );
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* The keyboard must never hide a field or the next button. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {scroll ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {body}
          </ScrollView>
        ) : (
          <View style={[styles.content, { flex: 1 }]}>{body}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Footer content: an optional hint above one or two buttons side by side. */
export function Actions({ hint, children }: { hint?: string | null; children: ReactNode }) {
  return (
    <View style={styles.actions}>
      {hint ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {hint}
        </Text>
      ) : null}
      <View style={styles.actionRow}>{children}</View>
    </View>
  );
}

/** NFR 3: "Step 2 of 4" plus a progress bar, so the CHW always knows how far along they are. */
export function StepHeader({ step, total, title }: { step: number; total: number; title: string }) {
  return (
    <View style={styles.stepHeader} accessibilityRole="header">
      <View style={styles.progress} accessibilityLabel={`Step ${step} of ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.progressSeg, i < step && styles.progressOn]} />
        ))}
      </View>
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
  /** Share the row with another button. */
  flex?: number;
}) {
  const { label, onPress, kind = 'primary', disabled, busy, hint, flex } = props;
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={({ pressed }) => [
        styles.button,
        buttonStyle[kind],
        disabled && !busy && styles.buttonOff,
        flex !== undefined && { flex },
        pressed && { opacity: 0.85 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={kind === 'primary' ? colors.primaryText : colors.primary} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            kind !== 'primary' && { color: kind === 'danger' ? colors.danger : colors.primary },
            disabled && styles.buttonTextOff,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** A small, clearly secondary action (log out, cancel, delete). Still at least 44 dp tall. */
export function TextButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.textButton} hitSlop={8}>
      <Text style={[styles.textButtonText, danger && { color: colors.danger }]}>{label}</Text>
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
      <Text style={[styles.bannerText, kind === 'warn' && { color: colors.warnText }]}>{children}</Text>
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
  content: { paddingHorizontal: size.gutter, paddingTop: 12, paddingBottom: 20, gap: 12 },
  footer: { marginTop: 4 },
  actions: { gap: 6 },
  actionRow: { flexDirection: 'row', gap: 10 },
  hint: { fontSize: size.small, color: colors.muted, textAlign: 'center' },
  stepHeader: { gap: 4 },
  progress: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  progressSeg: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.border },
  progressOn: { backgroundColor: colors.primary },
  stepCount: { fontSize: size.small, color: colors.muted, fontWeight: '600' },
  title: { fontSize: size.title, fontWeight: '700', color: colors.text },
  body: { fontSize: size.text, lineHeight: 24, color: colors.text },
  button: {
    flex: 1,
    minHeight: size.touch,
    borderRadius: size.radius,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 2,
  },
  buttonOff: { backgroundColor: colors.border, borderColor: colors.border },
  buttonText: { fontSize: size.text, fontWeight: '700', color: colors.primaryText, textAlign: 'center' },
  buttonTextOff: { color: colors.muted },
  textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  textButtonText: { fontSize: size.text, fontWeight: '600', color: colors.primary, textDecorationLine: 'underline' },
  field: { gap: 4 },
  label: { fontSize: size.text, fontWeight: '600', color: colors.text },
  input: {
    minHeight: size.touch,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: size.radius,
    paddingHorizontal: 14,
    fontSize: size.text + 1,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  error: { fontSize: size.small, color: colors.danger, fontWeight: '600' },
  banner: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: size.radius },
  bannerText: { fontSize: size.small + 1, lineHeight: 21, color: colors.text },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    minHeight: size.touch - 8,
    minWidth: 88,
    paddingHorizontal: 14,
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
