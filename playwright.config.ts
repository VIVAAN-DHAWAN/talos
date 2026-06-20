import { defineConfig } from '@playwright/test';
import * as os from 'node:os';
import * as path from 'node:path';

const PORT = Number(process.env.PORT ?? 3000);
// Per-run tmp history file so e2e tests start from a clean state
// regardless of any .dark-matter/history.json left over from manual
// curl testing.
const HISTORY_PATH = path.join(os.tmpdir(), `talos-e2e-history-${process.pid}.json`);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'node dist/server.js',
    port: PORT,
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NODE_ENV: 'test',
      PORT: String(PORT),
      TALOS_DISABLE_SPAWN: '1',
      TALOS_HISTORY_PATH: HISTORY_PATH
    }
  }
});
