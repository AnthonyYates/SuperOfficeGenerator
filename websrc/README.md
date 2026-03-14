# SuperOffice Provisioning Web App

Next.js 14 + Tailwind web experience that mirrors the original console generator while following the PRD in `docs/web-app-prd.md`.

## Features
- Manifest-driven provisioning jobs with no database dependencies (encrypted JSON storage under `storage/`).
- Environment + template management with faker-powered entity definitions and locale-aware data generation.
- Job dashboard, history, and detail views with downloadable manifests (coming soon via API routes).
- Uses `@superoffice/webapi` for future server-side API calls plus `@faker-js/faker` for deterministic sample data.

## Getting Started
```bash
cd websrc
cp .env.example .env.local # populate secrets
npm install
npm run dev
```

Visit `http://localhost:3000`. Update environment bundles/templates/jobs via the UI; data persists as JSON files under `storage/`.
