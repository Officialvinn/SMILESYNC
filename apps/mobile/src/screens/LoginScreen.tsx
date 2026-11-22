/** FR 1.1: username and 6-digit PIN. Works offline after the first online login. */
import { useState } from 'react';
import { Image, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AuthService, Session } from '../core/offlineAuth';
import { Banner, BigButton, Field } from '../ui/components';
import { colors, size } from '../ui/theme';

const LOCKUP = require('../../assets/logo-lockup.png') as number;

export function LoginScreen({ auth, onLoggedIn }: { auth: AuthService; onLoggedIn: (s: Session) => void }) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!username.trim() || pin.length !== 6) {
      setError(!username.trim() ? 'Enter your username.' : 'Enter your 6-digit PIN.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await auth.login(username, pin);
      if (r.ok) onLoggedIn(r.session);
      else setError(r.message);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setPin('');
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.screen}>
      {/* The keyboard must never hide the Log in button. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.block}>
            <Image source={LOCKUP} style={s.lockup} resizeMode="contain" accessibilityLabel="SmileSync" />
            <Text style={s.tagline}>Dental triage for community health workers</Text>
            {error ? <Banner kind="error">{error}</Banner> : null}
            <Field
              onNavy
              label="Username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              returnKeyType="next"
            />
            <Field
              onNavy
              label="6-digit PIN"
              value={pin}
              onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
              textContentType="password"
              onSubmitEditing={submit}
            />
            <View style={{ flexDirection: 'row' }}>
              <BigButton label="Log in" onPress={submit} busy={busy} />
            </View>
            <Text style={s.note}>The first login on this phone needs internet. After that you can log in without it.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.navy },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  block: { paddingHorizontal: size.gutter + 6, gap: 14, width: '100%', maxWidth: size.column, alignSelf: 'center' },
  lockup: { width: '78%', height: 150, alignSelf: 'center' },
  tagline: { fontSize: size.text, color: colors.onNavyMuted, textAlign: 'center', marginBottom: 10 },
  note: { fontSize: size.small, color: colors.onNavyMuted, textAlign: 'center' },
});
