/**
 * Android network rules (NFR 1).
 *
 * Release builds: trust system certificate authorities only, no plain http.
 * Debug builds (a debug resource overrides the main one) also trust
 * user-installed certificates, so a development build can reach the local Caddy
 * stack and its own authority, and allow plain http to localhost only, which is
 * how a debug build loads JavaScript from Metro (through adb reverse on a phone).
 * The app itself refuses non-https API URLs in src/platform/config.ts.
 *
 * Local development: set SMILESYNC_DEV_CA_CERT to the exported Caddy root
 * certificate and debug builds trust it directly, with no manual install on the
 * device. The certificate never reaches a release build.
 */
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const RELEASE = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

const debugXml = (withDevCa) => `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />${withDevCa ? '\n      <certificates src="@raw/dev_ca" />' : ''}
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
    <domain includeSubdomains="false">10.0.2.2</domain>
  </domain-config>
</network-security-config>
`;

function write(root, variant, xml) {
  const dir = path.join(root, `app/src/${variant}/res/xml`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'network_security_config.xml'), xml);
}

module.exports = function withNetworkSecurity(config) {
  config = withDangerousMod(config, [
    'android',
    async (c) => {
      write(c.modRequest.platformProjectRoot, 'main', RELEASE);
      const root = c.modRequest.platformProjectRoot;
      const ca = process.env.SMILESYNC_DEV_CA_CERT;
      const withDevCa = Boolean(ca && fs.existsSync(ca));
      if (withDevCa) {
        const raw = path.join(root, 'app/src/debug/res/raw');
        fs.mkdirSync(raw, { recursive: true });
        fs.copyFileSync(ca, path.join(raw, 'dev_ca.crt'));
      }
      write(root, 'debug', debugXml(withDevCa));
      return c;
    },
  ]);
  return withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application?.[0];
    if (app) app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return c;
  });
};
