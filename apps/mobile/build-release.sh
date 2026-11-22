#!/usr/bin/env bash
# Build the signed Android release of the CHW app. See docs/DEPLOY.md.
#   EXPO_PUBLIC_API_URL=https://your-domain/api ./build-release.sh        # APK, to install directly
#   EXPO_PUBLIC_API_URL=https://your-domain/api ./build-release.sh aab    # bundle, for Google Play
set -euo pipefail
cd "$(dirname "$0")"

: "${EXPO_PUBLIC_API_URL:?Set EXPO_PUBLIC_API_URL to the server, e.g. https://your-domain/api}"
case "$EXPO_PUBLIC_API_URL" in https://*) ;; *) echo "EXPO_PUBLIC_API_URL must start with https://" >&2; exit 1 ;; esac
case "$EXPO_PUBLIC_API_URL" in *localhost*|*127.0.0.1*|*10.0.2.2*) echo "A release build must point at the real server, not $EXPO_PUBLIC_API_URL" >&2; exit 1 ;; esac
for v in SMILESYNC_UPLOAD_STORE_FILE SMILESYNC_UPLOAD_STORE_PASSWORD SMILESYNC_UPLOAD_KEY_ALIAS SMILESYNC_UPLOAD_KEY_PASSWORD; do
  [ -n "${!v:-}" ] || { echo "Set $v (the upload key, see docs/DEPLOY.md)" >&2; exit 1; }
done
[ -f "$SMILESYNC_UPLOAD_STORE_FILE" ] || { echo "No keystore at $SMILESYNC_UPLOAD_STORE_FILE" >&2; exit 1; }

# The local Caddy certificate must never reach a release build.
unset SMILESYNC_DEV_CA_CERT
export JAVA_HOME="${JAVA_HOME_17:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

npx expo prebuild --platform android --clean --no-install
cd android
# Phone processors only (no emulator x86): a much smaller download for CHWs on mobile data.
ARCHS=-PreactNativeArchitectures=armeabi-v7a,arm64-v8a
if [ "${1:-apk}" = "aab" ]; then
  ./gradlew app:bundleRelease "$ARCHS"
  echo "Built: $(pwd)/app/build/outputs/bundle/release/app-release.aab"
else
  ./gradlew app:assembleRelease "$ARCHS"
  echo "Built: $(pwd)/app/build/outputs/apk/release/app-release.apk"
fi
