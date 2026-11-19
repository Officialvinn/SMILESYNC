/**
 * MVP, dentist side: a case sent from the field appears in the queue; the
 * dentist opens it, zooms a photo, assigns a priority and adds notes; the CHW's
 * app can then pull the result; an admin sees it all in the audit log.
 * FR 6.1-6.3, FR 7.1-7.3, FR 8.2. Synthetic data only.
 */
import { createHash, randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { encodePng } from '../../api/prisma/syntheticImage';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? '';
const SEED_CHW_PIN = process.env.SEED_CHW_PIN ?? '';
const NAME = `Synthetic E2E ${randomUUID().slice(0, 8)}`;

async function token(request: APIRequestContext, username: string, password: string) {
  const res = await request.post('/api/auth/login', { data: { username, password } });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

/** Sends a case the way the phone does (photos first, then the case). Returns its anonymised ID. */
async function sendCaseFromTheField(request: APIRequestContext) {
  const chw = await token(request, 'chw.narok1', SEED_CHW_PIN);
  const now = new Date().toISOString();
  const anonId = `SS-${randomUUID().replace(/[^0-9A-F]/gi, '').toUpperCase().replace(/[ILOU]/g, '0').slice(0, 4)}-E2E0`;
  const images = (['FRONT', 'UPPER_ARCH', 'LOWER_ARCH'] as const).map((viewType, i) => {
    const bytes = encodePng(160, 120, (x, y) => [180 + i * 20, (x * 2) & 255, (y * 2) & 255]);
    return { id: randomUUID(), viewType, bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
  const caseId = randomUUID();
  for (const img of images) {
    const r = await request.put(`/api/cases/${caseId}/images/${img.id}`, {
      headers: { authorization: `Bearer ${chw}`, 'content-type': 'application/octet-stream', 'x-content-sha256': img.sha256 },
      data: img.bytes,
    });
    expect(r.status()).toBe(201);
  }
  const res = await request.post('/api/cases', {
    headers: { authorization: `Bearer ${chw}` },
    data: {
      id: caseId,
      createdAt: now,
      patient: { id: randomUUID(), anonId, name: NAME, age: 52, location: 'Lamu', sex: 'FEMALE', consentGiven: true, consentDate: now },
      images: images.map((i) => ({ id: i.id, viewType: i.viewType, sizeKB: Math.ceil(i.bytes.length / 1024), capturedAt: now, sha256: i.sha256 })),
      assessment: { id: randomUUID(), painLevel: 9, duration: 'LESS_THAN_1_DAY' },
    },
  });
  expect(res.status()).toBe(201);
  return { caseId, anonId, chw };
}

test('dentist triages a case from the queue; the CHW gets the result; admin sees the audit trail', async ({ page, request }) => {
  test.skip(!SEED_PASSWORD || !SEED_CHW_PIN, 'Set SEED_PASSWORD and SEED_CHW_PIN (load .env)');
  const { caseId, anonId, chw } = await sendCaseFromTheField(request);

  // Log in as a dentist.
  await page.goto('/');
  await page.getByLabel('Username').fill('dentist1');
  await page.getByLabel('Password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Case queue' })).toBeVisible();

  // FR 6.3: filter by county; the new case is there, without the patient's name.
  await page.getByLabel('County').selectOption('Lamu');
  const row = page.getByRole('row', { name: new RegExp(anonId) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('52 / F');
  await expect(page.getByText(NAME)).toHaveCount(0);

  // FR 6.2: open the case and zoom a photo.
  await row.getByRole('link', { name: anonId }).click();
  await expect(page.getByRole('heading', { name: `Case ${anonId}` })).toBeVisible();
  await expect(page.getByText(NAME)).toHaveCount(0);
  const front = page.getByRole('button', { name: 'Open Front, teeth together photo' });
  await expect(front).toBeEnabled();
  await expect(front.locator('img')).toHaveAttribute('src', /^blob:/);
  await front.click();
  const viewer = page.getByRole('dialog');
  await expect(viewer).toHaveAccessibleName(/Photo: Front/);
  await viewer.getByRole('button', { name: 'Zoom in' }).click();
  await expect(viewer.getByLabel('Zoom level')).toHaveText('150%');
  await viewer.getByRole('button', { name: 'Next photo' }).click();
  await expect(viewer).toHaveAccessibleName(/Upper arch/);
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();

  // FR 7.1, 7.2: assign a priority and add notes.
  await page.getByRole('radio', { name: /^Urgent/ }).check();
  await page.getByLabel('Clinical notes for the CHW').fill('Synthetic note: deep decay on upper molar.');
  await page.getByLabel('Referral advice (optional)').fill('Synthetic referral: dental clinic within 3 days.');
  await page.getByRole('button', { name: 'Save triage' }).click();
  await expect(page.getByRole('status')).toContainText('Saved');
  await expect(page.getByText('Synthetic note: deep decay on upper molar.')).toBeVisible();

  // It left the waiting queue and shows under Reviewed.
  await page.getByRole('link', { name: '← Back to queue' }).click();
  await expect(page.getByRole('row', { name: new RegExp(anonId) })).toHaveCount(0);
  await page.getByLabel('Status').selectOption('REVIEWED');
  await expect(page.getByRole('row', { name: new RegExp(anonId) })).toContainText('Urgent');

  // FR 7.3: the CHW's app pulls the result on its next sync.
  const pulled = await request.get(`/api/cases/${caseId}/triage`, { headers: { authorization: `Bearer ${chw}` } });
  expect(await pulled.json()).toMatchObject({ status: 'REVIEWED', priority: 'URGENT', notes: [{ referralAdvice: 'Synthetic referral: dental clinic within 3 days.' }] });

  // FR 8.2: an administrator sees who opened and triaged the case.
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.getByLabel('Username').fill('admin1');
  await page.getByLabel('Password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.getByRole('link', { name: 'Audit log' }).click();
  await page.getByLabel('Resource id').fill(caseId);
  await page.getByRole('button', { name: 'Search' }).click();
  for (const action of ['case:triage', 'case:readImages', 'case:read', 'case:submit']) {
    await expect(page.getByRole('cell', { name: action, exact: true }).first()).toBeVisible();
  }
});
