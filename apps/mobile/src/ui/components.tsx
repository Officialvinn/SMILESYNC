import type { ReactNode } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, size } from './theme';

const MARK = require('../../assets/logo-mark.png') as number;

/** The logo mark. It has the brand navy background, so it only goes on navy. */
export function LogoMark({ width = 84 }: { width?: number }) {
  return <Image source={MARK} style={{ width, height: width * 0.54 }} resizeMode="contain" accessibilityLabel="SmileSync" />;
}

/**
 * Every screen: a navy brand band with the logo centred and the screen's
 * header (title, step), then a light sheet holding a centred column of content
 * with its actions straight after it (NFR 3: the next step is where the eye ends).
 */
export function Screen({
  header,
  children,
  footer,
  scroll = true,
}: {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const sheet = (
    <View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }, !scroll && { flex: 1 }]}>
      <View style={styles.column}>
        {children}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </View>
  );
  const band = (
    <View style={styles.band}>
      <LogoMark />
      {header}
    </View>
  );
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* The keyboard must never hide a field or the next button. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {scroll ? (
          <ScrollView style={styles.scroll} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            {band}
            {sheet}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>
            {band}
            {sheet}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Actions: an optional hint above one or two buttons side by side. */
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

/** In the band. NFR 3: "Step 2 of 4" plus a progress bar, so the CHW always knows how far along they are. */
export function StepHeader({ step, total, title }: { step: number; total: number; title: string }) {
  return (
    <View style={styles.bandText} accessibilityRole="header">
      <Text style={styles.stepCount}>
        Step {step} of {total}
      </Text>
      <Text style={styles.bandTitle}>{title}</Text>
      <View style={styles.progress} accessibilityLabel={`Step ${step} of ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.progressSeg, i < step && styles.progressOn]} />
        ))}
      </View>
    </View>
  );
}

/** In the band: a screen title with an optional line under it. */
export function Title({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <View style={styles.bandText}>
      <Text style={styles.bandTitle} accessibilityRole="header">
        {children}
      </Text>
      {subtitle ? <Text style={styles.bandSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

/** A section heading inside the sheet. */
export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.heading} accessibilityRole="header">
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
        <ActivityIndicator color={kind === 'primary' ? colors.actionText : colors.primary} />
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
export function TextButton({ label, onPress, danger, onNavy }: { label: string; onPress: () => void; danger?: boolean; onNavy?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.textButton} hitSlop={8}>
      <Text style={[styles.textButtonText, danger && { color: colors.danger }, onNavy && { color: colors.onNavy }]}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string; error?: string; onNavy?: boolean }) {
  const { label, error, onNavy, ...input } = props;
  return (
    <View style={styles.field}>
      <Text style={[styles.label, onNavy && { color: colors.onNavy }]}>{label}</Text>
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
  screen: { flex: 1, backgroundColor: colors.navy },
  scroll: { flex: 1, backgroundColor: colors.navy },
  band: { alignItems: 'center', paddingTop: 14, paddingBottom: 34, paddingHorizontal: size.gutter, gap: 10, backgroundColor: colors.navy },
  bandText: { alignItems: 'center', gap: 4, width: '100%', maxWidth: size.column },
  bandTitle: { fontSize: size.title + 2, fontWeight: '800', color: colors.onNavy, textAlign: 'center' },
  bandSubtitle: { fontSize: size.small + 1, color: colors.onNavyMuted, textAlign: 'center' },
  stepCount: { fontSize: size.small, color: colors.accent, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  progress: { flexDirection: 'row', gap: 6, marginTop: 8, width: '70%' },
  progressSeg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.navySoft },
  progressOn: { backgroundColor: colors.action },
  sheet: {
    flexGrow: 1,
    marginTop: -18,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: colors.bg,
    paddingHorizontal: size.gutter,
    paddingTop: 22,
  },
  /** Centred both ways: content sits in the middle of the sheet when it is shorter than the screen. */
  column: { width: '100%', maxWidth: size.column, alignSelf: 'center', gap: 14, flexGrow: 1, justifyContent: 'center' },
  footer: { marginTop: 4 },
  actions: { gap: 6 },
  actionRow: { flexDirection: 'row', gap: 10 },
  hint: { fontSize: size.small, color: colors.muted, textAlign: 'center' },
  heading: { fontSize: size.text + 2, fontWeight: '800', color: colors.text, textAlign: 'center' },
  body: { fontSize: size.text, lineHeight: 24, color: colors.text, textAlign: 'center' },
  button: {
    flex: 1,
    minHeight: size.touch,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderWidth: 2,
  },
  buttonOff: { backgroundColor: colors.disabledBg, borderColor: colors.disabledBg },
  buttonText: { fontSize: size.text, fontWeight: '800', color: colors.actionText, textAlign: 'center' },
  buttonTextOff: { color: colors.muted },
  textButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, alignSelf: 'center' },
  textButtonText: { fontSize: size.text, fontWeight: '700', color: colors.primary, textDecorationLine: 'underline', textAlign: 'center' },
  field: { gap: 6, alignItems: 'stretch' },
  label: { fontSize: size.text, fontWeight: '700', color: colors.text, textAlign: 'center' },
  input: {
    minHeight: size.touch,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: size.radius,
    paddingHorizontal: 14,
    fontSize: size.text + 1,
    backgroundColor: colors.surface,
    color: colors.text,
    textAlign: 'center',
  },
  error: { fontSize: size.small, color: colors.danger, fontWeight: '700', textAlign: 'center' },
  banner: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: size.radius },
  bannerText: { fontSize: size.small + 1, lineHeight: 21, color: colors.text, textAlign: 'center' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  choice: {
    minHeight: size.touch - 8,
    minWidth: 92,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  choiceOn: { backgroundColor: colors.primary },
  choiceText: { fontSize: size.text, fontWeight: '700', color: colors.primary },
});

const buttonStyle = StyleSheet.create({
  primary: { backgroundColor: colors.action, borderColor: colors.action },
  secondary: { backgroundColor: colors.surface, borderColor: colors.primary },
  danger: { backgroundColor: colors.surface, borderColor: colors.danger },
});
