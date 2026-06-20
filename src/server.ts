/**
 * Talos server entry — composition only, no logic.
 */

import { config } from './config/env.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const app = await buildApp();
  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[talos] listening on http://127.0.0.1:${config.port} (${config.env})`);
  });

  const shutdown = (signal: string): void => {
    // eslint-disable-next-line no-console
    console.log(`[talos] received ${signal}, shutting down`);
    server.close(() => process.exit(0));
    // Hard exit if graceful close hangs for >5s.
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[talos] fatal startup error', err);
  process.exit(1);
});
