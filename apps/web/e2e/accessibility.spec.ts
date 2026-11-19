/**
 * Accessibility: every dashboard page passes the automated WCAG 2.1 A and AA
 * checks from axe-core (contrast, labels, roles, landmarks). Automated checks
 * find many but not all problems; a manual keyboard and screen-reader pass is
 * in docs/FIELD_TEST.md.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? '';

async function check(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const problems = results.violations.map((v) => `${name}: ${v.id} (${v.impact}) ${v.help} x${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`);
  expect(problems, problems.join('\n')).toEqual([]);
}

async function login(page: Page, username: string) {
  await page.goto('/');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
}

test('dashboard pages pass automated WCAG 2.1 AA checks', async ({ page }, info) => {
  test.skip(info.project.name !== 'chromium', 'One browser is enough for axe');
  test.skip(!SEED_PASSWORD, 'Set SEED_PASSWORD (load .env)');

  await page.goto('/');
  await page.getByLabel('Username').waitFor();
  await check(page, 'login');

  await login(page, 'dentist1');
  await expect(page.locator('table.queue tbody tr').first()).toBeVisible();
  await check(page, 'queue');

  await page.locator('table.queue tbody tr').first().click();
  await expect(page.getByRole('heading', { name: /^Case / })).toBeVisible();
  await expect(page.locator('.photo img').first()).toBeVisible();
  await check(page, 'case');

  await page.locator('.photo').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await check(page, 'photo viewer');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Log out' }).click();
  await login(page, 'admin1');
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await check(page, 'users');
  await page.getByRole('button', { name: '+ Add user' }).click();
  await check(page, 'add user');

  await page.getByRole('link', { name: 'Audit log' }).click();
  await expect(page.locator('table.audit tbody tr').first()).toBeVisible();
  await check(page, 'audit log');
});
