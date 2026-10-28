# SmileSync mobile app (CHW)

Not started. Built in **Sprint 1** (login, registration, consent, capture,
encrypted local storage) and **Sprint 2** (questionnaire, sync).

Planned stack (approved): React Native + Expo **development build** (not Expo
Go), TypeScript, expo-sqlite with SQLCipher (key in expo-secure-store),
expo-camera, expo-image-manipulator.

The sync logic already exists and is tested in `packages/shared/src/sync`.
This app will supply a SQLite-backed `SyncStore` and an HTTPS `SyncTransport`.
