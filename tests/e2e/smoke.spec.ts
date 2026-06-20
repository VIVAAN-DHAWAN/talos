/**
 * End-to-end smoke tests via Playwright.
 *
 * Run with: npx playwright test
 *
 * The playwright.config.ts starts `node dist/server.js` with
 * TALOS_DISABLE_SPAWN=1 so no real scanners run; we are asserting the
 * UI boots, responds, and stays accessible.
 */

import { test, expect } from '@playwright/test';

test.describe('Talos smoke', () => {
  test('GET /health returns ok', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toEqual({ status: 'ok', version: '2.0.0' });
  });

  test('GET /api/status returns 200 with a scan payload', async ({ request }) => {
    const res = await request.get('/api/status');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.scannerAvailable).toBe(false);
    expect(body.scan.healthScore).toBe(100);
    expect(body.fetchedAt).toMatch(/^\d{4}-/);
  });

  test('GET /api/history returns empty list initially', async ({ request }) => {
    const res = await request.get('/api/history');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toEqual({ records: [], count: 0 });
  });

  test('dashboard renders and shows health ring', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#health-score')).toBeVisible();
    await expect(page.locator('#btn-tab-scanner')).toBeVisible();
    await expect(page.locator('#btn-tab-panic')).toBeVisible();
    await expect(page.locator('#btn-tab-history')).toBeVisible();
  });

  test('tab navigation via keyboard arrows', async ({ page }) => {
    await page.goto('/');
    const dashboard = page.locator('#btn-tab-dashboard');
    const scanner = page.locator('#btn-tab-scanner');
    await dashboard.focus();
    await page.keyboard.press('ArrowRight');
    await expect(scanner).toBeFocused();
    await expect(scanner).toHaveAttribute('aria-selected', 'true');
  });

  test('scanner panel is hidden until activated', async ({ page }) => {
    await page.goto('/');
    const panel = page.locator('#panel-scanner');
    await expect(panel).toHaveAttribute('hidden', '');
    await page.click('#btn-tab-scanner');
    await expect(panel).not.toHaveAttribute('hidden', '');
  });

  test('panic submit is disabled until reason + checkbox are filled', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-tab-panic');
    const submit = page.locator('#btn-trigger-panic');
    await expect(submit).toBeDisabled();
    await page.fill('#panic-reason', 'production hotfix needed');
    await page.check('#panic-confirm');
    await expect(submit).toBeEnabled();
  });

  test('panic modal opens on submit and closes on cancel', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-tab-panic');
    await page.fill('#panic-reason', 'production hotfix needed');
    await page.check('#panic-confirm');
    await page.click('#btn-trigger-panic');
    const modal = page.locator('#panic-modal');
    await expect(modal).toBeVisible();
    // Click the explicit Cancel button rather than the backdrop, which
    // is occluded by the dialog and would have its click intercepted.
    await page.click('.modal-footer button[data-modal-close]');
    await expect(modal).toBeHidden();
  });

  test('history panel shows empty state initially', async ({ page }) => {
    await page.goto('/');
    await page.click('#btn-tab-history');
    await expect(page.locator('#history-log-rows')).toContainText(/No audit entries yet/);
  });
});
