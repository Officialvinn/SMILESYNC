/**
 * Android release signing (NFR 1: only we can publish updates to CHW phones).
 *
 * Expo's generated project signs release builds with the public debug key.
 * This replaces that with the SmileSync upload key, read from environment
 * variables at build time so the key and its passwords never enter the repo:
 *
 *   SMILESYNC_UPLOAD_STORE_FILE   absolute path to the .jks keystore
 *   SMILESYNC_UPLOAD_STORE_PASSWORD
 *   SMILESYNC_UPLOAD_KEY_ALIAS
 *   SMILESYNC_UPLOAD_KEY_PASSWORD
 *
 * Without them a release build comes out unsigned (app-release-unsigned.apk),
 * which phones refuse to install, rather than silently debug-signed.
 * Debug builds are unchanged.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIG = `
        release {
            def storePath = System.getenv('SMILESYNC_UPLOAD_STORE_FILE')
            if (storePath) {
                storeFile file(storePath)
                storePassword System.getenv('SMILESYNC_UPLOAD_STORE_PASSWORD')
                keyAlias System.getenv('SMILESYNC_UPLOAD_KEY_ALIAS')
                keyPassword System.getenv('SMILESYNC_UPLOAD_KEY_PASSWORD')
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (c) => {
    let g = c.modResults.contents;
    if (g.includes('SMILESYNC_UPLOAD_STORE_FILE')) return c;
    // Add a release signing config next to the debug one.
    g = g.replace(/(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/, `$1${RELEASE_CONFIG}`);
    // Point the release build type at it (only when a keystore was given).
    g = g.replace(
      /(release\s*\{\s*(?:\/\/[^\n]*\n\s*)*)signingConfig signingConfigs\.debug/,
      "$1signingConfig System.getenv('SMILESYNC_UPLOAD_STORE_FILE') ? signingConfigs.release : null",
    );
    if (!g.includes("signingConfigs.release : null")) {
      throw new Error('withReleaseSigning: could not find the release build type in app/build.gradle');
    }
    c.modResults.contents = g;
    return c;
  });
};
