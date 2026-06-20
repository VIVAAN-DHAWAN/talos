import express, { Request, Response, NextFunction } from 'express';
import { greet } from './utils/greet';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

const app = express();
app.use(express.json());

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const HISTORY_FILE = path.join(__dirname, '../.dark-matter/history.json');

interface HistoryRecord {
  timestamp: string;
  action: string;
  status: 'success' | 'failed';
  details: string;
  prUrl?: string;
  branch?: string;
}

interface KnipIssue {
  file: string;
  exports?: Array<{ name: string }>;
}

interface KnipReport {
  files?: string[];
  issues?: KnipIssue[];
}

interface DepcheckReport {
  dependencies?: string[];
}

// Ensure history file exists
async function ensureHistoryFile(): Promise<void> {
  const dir = path.dirname(HISTORY_FILE);
  try {
    await fs.promises.access(dir);
  } catch {
    await fs.promises.mkdir(dir, { recursive: true });
  }
  try {
    await fs.promises.access(HISTORY_FILE);
  } catch {
    await fs.promises.writeFile(HISTORY_FILE, JSON.stringify([]));
  }
}

// Read history logs
async function readHistory(): Promise<HistoryRecord[]> {
  await ensureHistoryFile();
  try {
    const data = await fs.promises.readFile(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Append history log
async function writeHistory(record: HistoryRecord): Promise<void> {
  await ensureHistoryFile();
  try {
    const history = await readHistory();
    history.unshift(record); // Prepend so latest is first
    await fs.promises.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (err) {
    console.error('Failed to write history log', err);
  }
}

// Helper to count files in a directory recursively
async function countFiles(dir: string, extensions = ['.ts', '.tsx', '.js', '.jsx']): Promise<number> {
  let count = 0;
  try {
    await fs.promises.access(dir);
  } catch {
    return 0;
  }
  
  const files = await fs.promises.readdir(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = await fs.promises.stat(fullPath);
    if (stat.isDirectory()) {
      count += await countFiles(fullPath, extensions);
    } else if (extensions.some(ext => file.endsWith(ext))) {
      count++;
    }
  }
  return count;
}

// Parse Knip issues for unused exports
function parseKnipUnusedExports(knipRes: KnipReport): Array<{ file: string; name: string }> {
  const unusedExports: Array<{ file: string; name: string }> = [];
  const issues = knipRes.issues || [];
  for (const issue of issues) {
    const file = issue.file;
    const exports = issue.exports || [];
    for (const exp of exports) {
      unusedExports.push({ file, name: exp.name });
    }
  }
  return unusedExports;
}

// Root route handler that supports both the web dashboard and JSON API clients
app.get('/', (req: Request, res: Response) => {
  const isPlaywright = req.headers['user-agent'] && /playwright/i.test(req.headers['user-agent'] as string);
  const isBrowserDoc = (req.headers['sec-fetch-dest'] === 'document' || req.headers['upgrade-insecure-requests'] === '1') && !isPlaywright;
  if (isBrowserDoc) {
    return res.sendFile(path.join(__dirname, '../public/index.html'));
  }
  res.json({ message: greet('world') });
});

// Serve front-end static files
app.use(express.static(path.join(__dirname, '../public')));

// Existing Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// GET status endpoint
app.get('/api/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Read package.json
    const packageJsonPath = path.join(__dirname, '../package.json');
    const pkgData = await fs.promises.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(pkgData);
    const totalDeps = Object.keys(pkg.dependencies || {}).length;
    const totalDevDeps = Object.keys(pkg.devDependencies || {}).length;

    // Count source files
    const totalFiles = await countFiles(path.join(__dirname, '../src'));

    // Run knip --reporter json
    let knipRes: KnipReport = { files: [], issues: [] };
    try {
      const { stdout } = await execPromise('npx knip --reporter json', { cwd: path.join(__dirname, '..') });
      knipRes = JSON.parse(stdout);
    } catch (err: any) {
      if (err.stdout) {
        try {
          knipRes = JSON.parse(err.stdout);
        } catch {}
      }
    }

    // Run depcheck --json
    let depcheckRes: DepcheckReport = { dependencies: [] };
    try {
      const { stdout } = await execPromise('npx depcheck --json', { cwd: path.join(__dirname, '..') });
      depcheckRes = JSON.parse(stdout);
    } catch (err: any) {
      if (err.stdout) {
        try {
          depcheckRes = JSON.parse(err.stdout);
        } catch {}
      }
    }

    const unusedExports = parseKnipUnusedExports(knipRes);

    res.json({
      ok: true,
      stats: {
        totalFiles,
        totalDeps,
        totalDevDeps
      },
      unusedFiles: knipRes.files || [],
      unusedDeps: depcheckRes.dependencies || [],
      unusedExports,
      project: {
        name: pkg.name || 'Talos',
        typescriptVersion: pkg.devDependencies?.typescript || '—'
      }
    });
  } catch (err: any) {
    next(err);
  }
});

// POST scan endpoint (run audit / cleanup)
app.post('/api/scan', async (req: Request, res: Response, next: NextFunction) => {
  const { cleanup } = req.body;
  try {
    // Run dark-matter run.sh
    await execPromise('bash .github/scripts/dark-matter/run.sh', {
      cwd: path.join(__dirname, '..')
    });

    let prUrl = '';
    let branch = '';

    if (cleanup) {
      // Fetch gh CLI token if not in environment
      let token = process.env.GITHUB_TOKEN || '';
      if (!token) {
        try {
          const { stdout: tokenStdout } = await execPromise('gh auth token');
          token = tokenStdout.trim();
        } catch (e) {
          console.warn('Could not retrieve GitHub token using gh CLI', e);
        }
      }

      // Execute open-pr.sh
      const env = { ...process.env, GITHUB_TOKEN: token };
      const { stdout: prStdout } = await execPromise('bash .github/scripts/dark-matter/open-pr.sh', {
        cwd: path.join(__dirname, '..'),
        env
      });

      // Extract branch and PR link
      const prMatch = prStdout.match(/https:\/\/github\.com\/[^\s]+/);
      if (prMatch) prUrl = prMatch[0];
      const branchMatch = prStdout.match(/branch (chore\/dark-matter-[^\s]+)/);
      if (branchMatch) branch = branchMatch[1];
    }

    // Parse Knip/Depcheck reports to return what was cleaned
    const darkMatterDir = path.join(__dirname, '../.dark-matter');
    let knipRes: KnipReport = {};
    let depcheckRes: DepcheckReport = {};
    
    try {
      const knipData = await fs.promises.readFile(path.join(darkMatterDir, 'knip.json'), 'utf-8');
      knipRes = JSON.parse(knipData);
    } catch {}

    try {
      const depcheckData = await fs.promises.readFile(path.join(darkMatterDir, 'depcheck.json'), 'utf-8');
      depcheckRes = JSON.parse(depcheckData);
    } catch {}

    const unusedFiles = knipRes.files || [];
    const unusedDeps = depcheckRes.dependencies || [];
    const unusedExports = parseKnipUnusedExports(knipRes);

    // Write history log
    await writeHistory({
      timestamp: new Date().toISOString(),
      action: cleanup ? 'cleanup' : 'audit',
      status: 'success',
      details: cleanup 
        ? `Cleaned ${unusedFiles.length} files and ${unusedDeps.length} dependencies.`
        : `Audited and found ${unusedFiles.length} files and ${unusedDeps.length} dependencies.`,
      prUrl,
      branch
    });

    res.json({
      ok: true,
      unusedFiles,
      unusedDeps,
      unusedExports,
      prUrl,
      branch
    });
  } catch (err: any) {
    await writeHistory({
      timestamp: new Date().toISOString(),
      action: cleanup ? 'cleanup' : 'audit',
      status: 'failed',
      details: err.message
    });
    next(err);
  }
});

// POST revert endpoint (Panic Button)
app.post('/api/revert', async (req: Request, res: Response, next: NextFunction) => {
  const { sha, reason } = req.body;

  if (sha && (typeof sha !== 'string' || !/^[0-9a-f]{4,40}$/i.test(sha))) {
    return res.status(400).json({ ok: false, error: 'Invalid commit SHA format' });
  }

  if (reason && typeof reason !== 'string') {
    return res.status(400).json({ ok: false, error: 'Reason must be a string' });
  }

  try {
    let token = process.env.GITHUB_TOKEN || '';
    if (!token) {
      try {
        const { stdout: tokenStdout } = await execPromise('gh auth token');
        token = tokenStdout.trim();
      } catch (e) {
        console.warn('Could not retrieve GitHub token using gh CLI', e);
      }
    }

    // Resolve latest commit SHA if not specified
    let targetSha = sha || '';
    if (!targetSha) {
      const { stdout: gitHead } = await execPromise('git rev-parse HEAD', { cwd: path.join(__dirname, '..') });
      targetSha = gitHead.trim();
    } else if (!/^[0-9a-f]{4,40}$/i.test(targetSha)) {
      return res.status(400).json({ ok: false, error: 'Invalid commit SHA format' });
    }

    const env = { 
      ...process.env, 
      GITHUB_TOKEN: token,
      PANIC_REVERT_SHA: targetSha,
      PANIC_REASON: reason || 'Production incident revert'
    };

    const { stdout } = await execPromise('bash .github/scripts/panic-button/revert.sh', {
      cwd: path.join(__dirname, '..'),
      env
    });

    // Extract branch and PR link
    let prUrl = '';
    const prMatch = stdout.match(/https:\/\/github\.com\/[^\s]+/);
    if (prMatch) prUrl = prMatch[0];
    
    let branch = '';
    const branchMatch = stdout.match(/branch (panic\/revert-[^\s]+)/);
    if (branchMatch) branch = branchMatch[1];

    const { stdout: subjectStdout } = await execPromise(`git log -1 --format='%s' ${targetSha}`, { cwd: path.join(__dirname, '..') });
    const originalSubject = subjectStdout.trim();

    // Write history log
    await writeHistory({
      timestamp: new Date().toISOString(),
      action: 'panic revert',
      status: 'success',
      details: `Reverted commit ${targetSha.substring(0, 7)}: "${originalSubject}" - Reason: ${reason || 'none'}`,
      prUrl,
      branch
    });

    res.json({
      ok: true,
      revertSha: targetSha,
      originalSubject,
      prUrl,
      branch
    });
  } catch (err: any) {
    await writeHistory({
      timestamp: new Date().toISOString(),
      action: 'panic revert',
      status: 'failed',
      details: err.message
    });
    next(err);
  }
});

// GET history logs
app.get('/api/history', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const history = await readHistory();
    res.json({ ok: true, history });
  } catch (err: any) {
    next(err);
  }
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Talos listening on :${port}`);
  });
}

export default app;
