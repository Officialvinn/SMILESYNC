/** FR 1.1: username and 6-digit PIN. Works offline after the first online login. */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, BigButton, Field } from '../ui/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, size } from '../ui/theme';
import type { AuthService, Session } from '../core/offlineAuth';

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
      <View style={s.block}>
        <View style={s.brand}>
          <View style={s.mark}>
            <Text style={s.markText}>S</Text>
          </View>
          <View>
            <Text style={s.name}>SmileSync</Text>
            <Text style={s.tagline}>Community dental triage</Text>
          </View>
        </View>
        {error ? <Banner kind="error">{error}</Banner> : null}
        <Field
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
          label="6-digit PIN"
          value={pin}
          onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          textContentType="password"
          onSubmitEditing={submit}
        />
        <BigButton label="Log in" onPress={submit} busy={busy} />
        <Text style={s.note}>The first login on this phone needs internet. After that you can log in without it.</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center' },
  block: { paddingHorizontal: size.gutter, gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  mark: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  markText: { color: colors.primaryText, fontSize: 28, fontWeight: '800' },
  name: { fontSize: size.title + 2, fontWeight: '800', color: colors.text },
  tagline: { fontSize: size.small, color: colors.muted },
  note: { fontSize: size.small, color: colors.muted, textAlign: 'center' },
});
