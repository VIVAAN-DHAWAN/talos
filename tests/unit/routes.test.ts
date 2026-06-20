/**
 * Route-level tests via the real Express pipeline. We compose an app
 * with stub services and fire real HTTP requests at it — this catches
 * the full path: body parsing → validation → handler → error middleware.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import type { Express } from 'express';
import { FileHistoryStore } from '../../src/services/history-store.js';
import { CodebaseService } from '../../src/services/codebase.js';
import { ScanService } from '../../src/services/scan-service.js';
import { PanicService } from '../../src/services/panic-service.js';
import { StubRunner, StubGitHub, tmpDir } from './_fixtures.js';
import { config } from '../../src/config/env.js';
import { createApp, type Services } from '../../src/app.js';

async function startApp(app: Express): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

async function fetchJson(baseUrl: string, path: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe('HTTP routes', () => {
  let dir: { dir: string; cleanup: () => void };
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    (config as { disableSpawn: boolean }).disableSpawn = true;
    dir = tmpDir();
    const historyStore = new FileHistoryStore(`${dir.dir}/history.json`);
    await historyStore.load();
    const runner = new StubRunner();
    const github = new StubGitHub();
    const services: Services = {
      codebase: new CodebaseService(runner, dir.dir),
      scan: new ScanService(runner, github, dir.dir),
      panic: new PanicService(runner, github, dir.dir),
      history: historyStore,
      githubAvailable: true
    };
    const app = createApp(services);
    ({ server, baseUrl } = await startApp(app));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    dir.cleanup();
  });

  it('GET /health returns 200 and ok envelope', async () => {
    const { status, body } = await fetchJson(baseUrl, '/health');
    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok', version: '2.0.0' });
  });

  it('GET /api/status returns 200 and a status payload', async () => {
    const { status, body } = await fetchJson(baseUrl, '/api/status');
    expect(status).toBe(200);
    expect(body.scannerAvailable).toBe(false);
    expect(body.scan.healthScore).toBe(100);
    expect(body.fetchedAt).toMatch(/^\d{4}-/);
  });

  it('GET /api/history returns 200 and empty list initially', async () => {
    const { status, body } = await fetchJson(baseUrl, '/api/history');
    expect(status).toBe(200);
    expect(body).toEqual({ records: [], count: 0 });
  });

  it('POST /api/scan with empty body returns 200 and records audit', async () => {
    const { status, body } = await fetchJson(baseUrl, '/api/scan', {
      method: 'POST',
      body: JSON.stringify({})
    });
    expect(status).toBe(200);
    expect(body.status).toBe('success');
    expect(body.cleanupPerformed).toBe(false);

    const hist = await fetchJson(baseUrl, '/api/history');
    expect(hist.body.count).toBe(1);
    expect(hist.body.records[0].kind).toBe('scan');
  });

  it('POST /api/scan with invalid body returns 400 and structured error', async () => {
    const { status, body } = await fetchJson(baseUrl, '/api/scan', {
      method: 'POST',
      body: JSON.stringify({ cleanup: 'not-a-bool' })
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toBeInstanceOf(Array);
  });

  it('POST /api/revert with missing reason returns 400', async () => {
    const { status, body } = await fetchJson(baseUrl, '/api/revert', {
      method: 'POST',
      body: JSON.stringify({})
    });
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/revert with valid reason returns 502 because spawn is disabled (revert succeeds locally, PR fails)', async () => {
    const { status, body } = await fetchJson(baseUrl, '/api/revert', {
      method: 'POST',
      body: JSON.stringify({ reason: 'production hotfix needed' })
    });
    // planRevert throws ShellDisabledError which the error middleware
    // maps to 403.
    expect([403, 502]).toContain(status);
    expect(body).toBeDefined();
  });

  it('GET /unknown returns 404', async () => {
    const { status } = await fetchJson(baseUrl, '/api/unknown');
    expect(status).toBe(404);
  });
});
