/**
 * NFR 2: the dashboard loads the initial case queue in under 3 seconds on a
 * standard broadband connection. Measured with an empty cache, from opening
 * the page to the first case row on screen. Chromium only (network throttling
 * uses the Chrome DevTools Protocol).
 */
import { expect, test, type Browser } from '@playwright/test';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? '';

/** Mbit/s down, Mbit/s up, round-trip latency in ms. */
const PROFILES = {
  broadband: { down: 10, up: 2, latency: 40 },
  rural3g: { down: 1.6, up: 0.75, latency: 300 },
} as const;

async function timeQueue(browser: Browser, baseURL: string, session: unknown, p: (typeof PROFILES)[keyof typeof PROFILES]) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, baseURL });
  await context.addInitScript((s) => sessionStorage.setItem('smilesync.session', JSON.stringify(s)), session);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: p.latency,
    downloadThroughput: (p.down * 1_000_000) / 8,
    uploadThroughput: (p.up * 1_000_000) / 8,
  });
  const start = Date.now();
  await page.goto('/#/queue');
  await expect(page.locator('table.queue tbody tr').first()).toBeVisible({ timeout: 30_000 });
  const ms = Date.now() - start;
  await context.close();
  return ms;
}

test('NFR 2: the case queue loads in under 3 s on broadband with an empty cache', async ({ browser, request, baseURL }, info) => {
  test.skip(info.project.name !== 'chromium', 'Throttling needs Chromium');
  test.skip(!SEED_PASSWORD, 'Set SEED_PASSWORD (load .env)');
  const res = await request.post('/api/auth/login', { data: { username: 'dentist1', password: SEED_PASSWORD } });
  const session = await res.json();

  const broadband = await timeQueue(browser, baseURL!, session, PROFILES.broadband);
  const rural = await timeQueue(browser, baseURL!, session, PROFILES.rural3g);
  info.annotations.push({ type: 'NFR 2 broadband (10 Mbit/s, 40 ms)', description: `${broadband} ms` });
  info.annotations.push({ type: 'Rural 3G, for information (1.6 Mbit/s, 300 ms)', description: `${rural} ms` });
  console.log(`NFR 2 queue load: broadband ${broadband} ms, rural 3G ${rural} ms`);
  expect(broadband).toBeLessThan(3000);
});
