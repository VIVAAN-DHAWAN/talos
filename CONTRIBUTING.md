# Contributing to Talos

First off, thank you for taking the time to contribute! Contributions from the community help make Talos a robust tool for everyone.

## Development Workflow

We follow the standard GitHub Fork, Branch, and Pull Request (PR) workflow:

1. **Fork** the repository to your own GitHub account.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/talos.git
   cd talos
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Create a branch** for your work:
   ```bash
   git checkout -b feat/my-new-feature
   ```
5. **Implement your changes** and write tests.
6. **Verify** your changes (see Verification below).
7. **Commit** your changes using semantic commit messages.
8. **Push** your branch to your fork and **open a Pull Request** against our `main` branch.

## Commit Message Guidelines

We use semantic commit prefixes to keep the history clean and readable:

- `feat:` for new features (e.g., `feat: add docker support`)
- `fix:` for bug fixes (e.g., `fix: command injection vulnerability`)
- `docs:` for documentation updates (e.g., `docs: update README with API details`)
- `style:` for code formatting changes (no functional impact)
- `refactor:` for code changes that neither fix bugs nor add features
- `test:` for adding or modifying tests
- `chore:` for updating build tasks, package manager configs, etc.

## Verification Checklist

Before submitting a Pull Request, please ensure the following pass:

```bash
npm run lint         # Check code style and lint rules
npm run build        # Compile TypeScript successfully
npm run test:e2e     # Run Playwright E2E tests
```

## Dark Matter Scanner Details

If you are working on the scanner or clean up functionality, please read the [Dark Matter Cleaner README](.github/scripts/dark-matter/README.md) to understand how the cleanup and automation scripts work.

Thank you again for contributing!
