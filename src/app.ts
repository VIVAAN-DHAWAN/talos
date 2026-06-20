/**
 * Express app composition root.
 *
 * Wires concrete implementations of every service and attaches routes.
 * Tests import `createApp(services)` to inject mocks; production uses
 * `buildApp()` which constructs real services from the loaded config.
 */

import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config/env.js';
import { ShellRunner } from './infra/shell.js';
import { GhCliClient } from './infra/github.js';
import { CodebaseService } from './services/codebase.js';
import { ScanService } from './services/scan-service.js';
import { PanicService } from './services/panic-service.js';
import { FileHistoryStore } from './services/history-store.js';
import {
  asyncHandler,
  health,
  history,
  revert,
  root,
  scan,
  sendError,
  status,
  type Services
} from './routes/index.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');

export interface AppDeps {
  services?: Services;
}

export function createApp(services: Services): Application {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  // Root route is registered BEFORE static middleware so the Accept
  // header is honoured: API clients get JSON, browsers get the SPA.
  // Without this ordering, express.static would serve index.html for
  // every GET / regardless of Accept.
  app.get('/', root(services));

  // Static assets — explicit extensions only, no `extensions: ['html']`
  // fallback, so GET / never matches a static file.
  app.use(express.static(PUBLIC_DIR, { fallthrough: true }));

  app.get('/health', health());
  app.get('/api/status', status(services));
  app.post('/api/scan', scan(services));
  app.post('/api/revert', revert(services));
  app.get('/api/history', history(services));

  // 404 — JSON for API clients, plain text for browsers.
  app.use((req, res) => {
    if (req.path.startsWith('/api/') || req.path === '/health') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
      return;
    }
    res.status(404).send('Not found');
  });

  // Central error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    sendError(res, err);
  });

  return app;
}

export async function buildApp(): Promise<Application> {
  const runner = new ShellRunner();
  const github = new GhCliClient(runner);
  const codebase = new CodebaseService(runner);
  const scanService = new ScanService(runner, github);
  const panic = new PanicService(runner, github);

  const historyStore = new FileHistoryStore(config.historyPath);
  await historyStore.load();

  let githubAvailable = false;
  try {
    githubAvailable = await github.isAvailable();
  } catch {
    githubAvailable = false;
  }

  const services: Services = {
    codebase,
    scan: scanService,
    panic,
    history: historyStore,
    githubAvailable
  };
  return createApp(services);
}

// `asyncHandler` re-exported for tests that want to wrap their own handlers.
export { asyncHandler };
