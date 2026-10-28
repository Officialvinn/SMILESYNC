/** FR 1.1: username and 6-digit PIN. Works offline after the first online login. */
import { useState } from 'react';
import { Banner, BigButton, Body, Field, Screen, Title } from '../ui/components';
import type { AuthService, Session } from '../core/offlineAuth';

export function LoginScreen({ auth, onLoggedIn }: { auth: AuthService; onLoggedIn: (s: Session) => void }) {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
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
    <Screen>
      <Title>SmileSync</Title>
      <Body muted>Log in with your username and 6-digit PIN. The first login on this phone needs internet.</Body>
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
        label="PIN"
        value={pin}
        onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        textContentType="password"
        onSubmitEditing={submit}
      />
      <BigButton label="Log in" onPress={submit} busy={busy} disabled={!username.trim() || pin.length !== 6} />
    </Screen>
  );
}
