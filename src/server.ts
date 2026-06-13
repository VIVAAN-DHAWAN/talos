import express, { Request, Response } from 'express';
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

// Ensure history file exists
function ensureHistoryFile() {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));
  }
}

// Read history logs
function readHistory(): any[] {
  ensureHistoryFile();
  try {
    const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Append history log
function writeHistory(record: any) {
  ensureHistoryFile();
  try {
    const history = readHistory();
    history.unshift(record); // Prepend so latest is first
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch (err) {
    console.error('Failed to write history log', err);
  }
}

// Helper to count files in a directory recursively
function countFiles(dir: string, extension = '.ts'): number {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      count += countFiles(fullPath, extension);
    } else if (file.endsWith(extension)) {
      count++;
    }
  }
  return count;
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
app.get('/api/status', async (_req: Request, res: Response) => {
  try {
    // Read package.json
    const packageJsonPath = path.join(__dirname, '../package.json');
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const totalDeps = Object.keys(pkg.dependencies || {}).length;
    const totalDevDeps = Object.keys(pkg.devDependencies || {}).length;

    // Count source files
    const totalFiles = countFiles(path.join(__dirname, '../src'));

    // Run knip --reporter json
    let knipRes: any = { files: [], issues: [] };
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
    let depcheckRes: any = { dependencies: [] };
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

    // Parse Knip issues for unused exports
    const unusedExports: any[] = [];
    const issues = knipRes.issues || [];
    for (const issue of issues) {
      const file = issue.file;
      const exports = issue.exports || [];
      for (const exp of exports) {
        unusedExports.push({ file, name: exp.name });
      }
    }

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
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST scan endpoint (run audit / cleanup)
app.post('/api/scan', async (req: Request, res: Response) => {
  const { cleanup } = req.body;
  try {
    // Run dark-matter run.sh
    const { stdout: runStdout } = await execPromise('bash .github/scripts/dark-matter/run.sh', {
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
    let knipRes: any = {};
    let depcheckRes: any = {};
    
    if (fs.existsSync(path.join(darkMatterDir, 'knip.json'))) {
      knipRes = JSON.parse(fs.readFileSync(path.join(darkMatterDir, 'knip.json'), 'utf-8'));
    }
    if (fs.existsSync(path.join(darkMatterDir, 'depcheck.json'))) {
      depcheckRes = JSON.parse(fs.readFileSync(path.join(darkMatterDir, 'depcheck.json'), 'utf-8'));
    }

    const unusedFiles = knipRes.files || [];
    const unusedDeps = depcheckRes.dependencies || [];
    const unusedExports: any[] = [];
    const issues = knipRes.issues || [];
    for (const issue of issues) {
      const file = issue.file;
      const exports = issue.exports || [];
      for (const exp of exports) {
        unusedExports.push({ file, name: exp.name });
      }
    }

    // Write history log
    writeHistory({
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
    writeHistory({
      timestamp: new Date().toISOString(),
      action: cleanup ? 'cleanup' : 'audit',
      status: 'failed',
      details: err.message
    });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST revert endpoint (Panic Button)
app.post('/api/revert', async (req: Request, res: Response) => {
  const { sha, reason } = req.body;
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
    writeHistory({
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
    writeHistory({
      timestamp: new Date().toISOString(),
      action: 'panic revert',
      status: 'failed',
      details: err.message
    });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET history logs
app.get('/api/history', (_req: Request, res: Response) => {
  try {
    const history = readHistory();
    res.json({ ok: true, history });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});



if (require.main === module) {
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Aegis listening on :${port}`);
  });
}

export default app;
