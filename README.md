# Owllowance

Budget & Expense Tracker. A local-first React Native + Expo + TypeScript app for Android, iOS and web.

The initial build includes one PHP cash wallet, an explicit opening balance, expense entry, Home totals and paginated Activity. It does not yet include the complete Release 1 feature set or backup/restore.

Use Node.js 24 LTS and npm. Dependencies are locked in `package-lock.json`.

```powershell
npm ci
npm start
```

For browser development, run `npm run web`. To test offline reopening, use the production build:

```powershell
npm run export:web
npm run serve:web
```

Open http://localhost:4173. The preview server provides the response headers required by SQLite/WASM. Browser records belong to that origin; a different host or port has a separate dataset.

```powershell
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:web
```

Browser tests use isolated synthetic records. Run `npm run export:web` before browser tests after changing application code.

See [setup and platform limits](docs/SETUP.md), [verified status](docs/STATUS.md) and the [documentation map](docs/README.md). The original [project pack](Owllowance-Project-Pack.md) is preserved as the baseline; maintained instructions live in `AGENTS.md`, `docs/` and `.agents/skills/owllowance/SKILL.md`.
