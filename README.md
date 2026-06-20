# ⚡ Talos — Dark Matter Engine

[![CI](https://github.com/VIVAAN-DHAWAN/talos/actions/workflows/smoke-tests.yml/badge.svg)](https://github.com/VIVAAN-DHAWAN/talos/actions/workflows/smoke-tests.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js)](https://nodejs.org/)

**Automated dead code detection, unused dependency cleanup, and one-click production panic recovery — with a premium web dashboard.**

> Your codebase accumulates "dark matter" — dead files, unused exports, phantom dependencies. Talos finds them, cleans them, and opens PRs automatically.

## ✨ Features

- 📊 **Health Dashboard** — Real-time codebase health score, stat cards, active/dead code metrics
- 🔍 **Dark Matter Scanner** — Powered by [Knip](https://knip.dev) + [Depcheck](https://github.com/depcheck/depcheck) to detect unused files, exports, and dependencies
- 🧹 **Automated Cleanup** — One-click safe removal with automatic PR creation via GitHub CLI
- 🚨 **Panic Button** — Instant production recovery: revert any commit and open a recovery PR in seconds
- 📜 **Audit Log** — Complete history of scans, cleanups, and panic reverts
- ⏰ **Scheduled Scans** — GitHub Actions workflow runs weekly automated Dark Matter scans
- 🎨 **Glassmorphism UI** — Premium dark theme with CSS animations, health ring visualization, and responsive layout

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- GitHub CLI (`gh`) authenticated — for PR creation features
- npm

### Install & Run

```bash
git clone https://github.com/VIVAAN-DHAWAN/talos.git
cd talos
npm install
npm run dev          # http://localhost:3000
```

### Build for Production

```bash
npm run build && npm start
```

## 🏗️ Architecture

```
talos/
├── src/
│   ├── server.ts              # Express API server (status, scan, revert, history)
│   └── utils/                 # Utility functions + demo dark matter files
├── public/
│   ├── index.html             # Dashboard UI (glassmorphism dark theme)
│   ├── app.js                 # Frontend logic (tabs, health ring, API calls)
│   └── style.css              # 900-line premium CSS design system
├── .github/
│   ├── scripts/
│   │   ├── dark-matter/       # Automated cleanup scripts (run.sh, open-pr.sh)
│   │   └── panic-button/      # Production revert scripts (revert.sh)
│   └── workflows/             # CI: smoke tests, scheduled scans, panic dispatch
└── tests/
    └── smoke.spec.ts          # Playwright E2E API tests
```

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Dashboard UI (browser) or JSON greeting (API) |
| `GET` | `/health` | Health check |
| `GET` | `/api/status` | Codebase stats: files, deps, unused items, health score |
| `POST` | `/api/scan` | Run dark matter audit or cleanup + PR |
| `POST` | `/api/revert` | Panic button: revert a commit and open recovery PR |
| `GET` | `/api/history` | Audit log of all past operations |

## 🔧 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with ts-node |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run production build |
| `npm run test:e2e` | Run Playwright smoke tests |
| `npm run knip` | Run dead code detection |
| `npm run depcheck` | Run unused dependency detection |

## ⚙️ GitHub Actions Workflows

- **Smoke Tests** (`smoke-tests.yml`) — Runs on every push/PR to main
- **Dark Matter Scanner** (`dark-matter.yml`) — Weekly scheduled cleanup (Mondays 03:00 UTC) + manual dispatch
- **Panic Button** (`panic-button.yml`) — Triggered via `repository_dispatch` for instant production recovery

## 🙏 Acknowledgments

Talos was built with inspiration and tooling support from [**nexu-io/looper**](https://github.com/nexu-io/looper) — an autonomous AI dev team framework for GitHub repos. Looper's agent-loop architecture (planner → reviewer → fixer → worker) influenced Talos's approach to automated codebase management. The looper scripts in this project's workspace were instrumental during development.

## 📄 License

[MIT](LICENSE) © [VIVAAN-DHAWAN](https://github.com/VIVAAN-DHAWAN)
