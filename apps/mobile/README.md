# SmileSync CHW app

React Native + Expo SDK 57, run as a **development build** (not Expo Go: Expo Go
cannot load SQLCipher). Sprint 1 covers login, consent, registration, guided photo
capture and encrypted storage on the phone. Sprint 2 adds the symptom questions and
sending cases to the server.

## Layout

```
src/core/       Plain TypeScript, tested in Node (npm test). No Expo imports.
src/platform/   Expo adapters: Keychain/Keystore, SQLCipher, API, camera files.
src/screens/    One file per screen. src/App.tsx moves between them.
src/ui/         Large-target components and theme (NFR 3).
test/           Node stand-ins for SQLite and secure storage.
```

## Test without a phone

```sh
npm test -w @smilesync/mobile        # core logic, against Node's built-in SQLite
npm run typecheck -w @smilesync/mobile
```

## Run on a phone or simulator

You need one of:

- **Android:** Android Studio with an emulator, or an Android phone with USB debugging on.
- **iOS:** Xcode, CocoaPods (`brew install cocoapods`) and an iOS simulator runtime
  (Xcode > Settings > Components). iOS 16.4 or newer.

Then, from the repo root:

```sh
docker compose up -d                   # the API behind Caddy
npm run android -w @smilesync/mobile   # or: npm run ios -w @smilesync/mobile
```

The first build takes several minutes. After that, `npm run dev:mobile` starts the
bundler and the installed app reloads on code changes.

Log in as a seeded CHW (`chw.narok1`) with the `SEED_CHW_PIN` from your `.env`.

### Pointing the app at the API

The app only talks https (NFR 1). It uses `https://localhost/api` unless you set
`EXPO_PUBLIC_API_URL` when building, for example
`EXPO_PUBLIC_API_URL=https://192.168.1.20/api` for a phone on your Wi-Fi.

Caddy signs the local site with its own certificate authority, which phones do not
trust by default. Export it with:

```sh
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```

- **iOS simulator:** `xcrun simctl keychain booted add-root-cert caddy-root.crt`
- **Android emulator or phone:** install it under Settings > Security > Encryption &
  credentials > Install a certificate, then run `adb reverse tcp:443 tcp:443` so
  `https://localhost/api` on the device reaches your Mac. Only debug builds trust
  user certificates (`plugins/withNetworkSecurity.js`); release builds do not.

Do not commit `caddy-root.crt`.

### Field login without internet

The first login on a phone needs internet. After that the CHW can log in offline
with the same PIN. Five wrong PINs offline mean the next login must be online.
