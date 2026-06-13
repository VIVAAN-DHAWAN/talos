import { test, expect, request } from '@playwright/test';

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000';

/**
 * Pre-Flight smoke tests.
 *
 * These boot the real app (via playwright.config.ts webServer) and assert the
 * core routes respond. If they fail in CI, the MR is blocked - which is the
 * cue to trigger the GitLab "Fix Pipeline" agent to self-heal.
 */

test('GET /health returns ok', async () => {
  const ctx = await request.newContext();
  const res = await ctx.get(`${BASE_URL}/health`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe('ok');
  await ctx.dispose();
});

test('GET / returns a greeting message', async () => {
  const ctx = await request.newContext();
  const res = await ctx.get(`${BASE_URL}/`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('message');
  expect(typeof body.message).toBe('string');
  await ctx.dispose();
});
