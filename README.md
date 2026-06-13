# Aegis-project

Minimal Node/TypeScript Express starter, plus a scheduled **Dark Matter**
cleanup pipeline that removes unused code and dependencies automatically.

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

## Build

```bash
npm run build && npm start
```

## Dark Matter cleaner

See [`.gitlab/dark-matter/README.md`](.gitlab/dark-matter/README.md) for setup
(project access token + pipeline schedule).
