# Remove Entity Provisioning — Mass-Ops Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip out all entity-agent provisioning code and lock the application to mass-ops (DatabaseTableAgent) only, eliminating dead code and simplifying the execution surface.

**Architecture:** Remove the `executeWithEntityAgents()` path and all five individual agent factories (Contact/Person/Appointment/Project/Sale). The dispatcher `executeJob()` becomes a thin passthrough to `executeWithMassOps()`. All "mode" UI and type concepts collapse to the single value `"massops"`. Historical job records in the database may store `apiMode: "entity"` — these are left as-is since they represent historical runs and their field no longer drives execution.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma/SQLite, SuperOffice.WebApi (`DatabaseTableAgent`), NextAuth.js

---

## Files Map

| Action | File | Change |
|--------|------|--------|
| Modify | `websrc/lib/types.ts` | Remove `TemplateMode`, `JobApiMode` union types; replace with literal `"massops"` |
| Modify | `websrc/lib/storage.ts` | Remove `TemplateMode` import; fix `"entity"` fallback/cast to `"massops"`; fix seed template mode |
| Modify | `websrc/lib/superoffice-client.ts` | Delete 5 entity-agent factory functions; keep `createDatabaseTableAgent` + `createDatabaseTableAgentWithTicket` |
| Modify | `websrc/lib/mass-ops.ts` | Delete `executeWithEntityAgents()` + `CONCURRENCY` constant; collapse `executeJob()` to always call `executeWithMassOps()` |
| Modify | `websrc/lib/services.ts` | Hardcode `apiMode: "massops"` when creating jobs; hardcode `mode: "massops"` when creating templates |
| Modify | `websrc/prisma/schema.prisma` | Change `@default("entity")` to `@default("massops")` on `Template.mode` |
| Modify | `websrc/app/actions.ts` | Remove `checkSystemColumnConflicts()` entity-only guard; remove `mode` field from template creation schema |
| Modify | `websrc/components/forms/template-form.tsx` | Remove mode selector, `entityFieldMap` fetch, `EntityFieldInfo` import, entity-agent conditional UI blocks, and `mode` prop from `EntityEditorProps` |
| Modify | `websrc/components/forms/job-form.tsx` | Remove mode display line |
| Modify | `websrc/app/templates/page.tsx` | Remove entity/massops badge rendering |
| Modify | `websrc/app/jobs/[id]/page.tsx` | Remove or simplify `apiMode` display row (dead conditional) |
| Delete | `websrc/app/api/metadata/entity-fields/route.ts` | Unused after template-form changes |
| Keep | `websrc/lib/entity-schema.ts` | Fully retained — used only by mass-ops |
| Keep | `websrc/lib/system-user.ts` | Fully retained — mass-ops auth |
| Keep | `websrc/lib/metadata.ts` | Fully retained |
| Keep | `websrc/app/api/metadata/db-model/route.ts` | Fully retained |
| Keep | `websrc/app/api/jobs/[id]/stream/route.ts` | No change needed |

---

## Task 1: Remove `TemplateMode` and `JobApiMode` union types, update storage.ts

**Files:**
- Modify: `websrc/lib/types.ts`
- Modify: `websrc/lib/storage.ts`

- [ ] **Step 1: Read both files**

  Read `websrc/lib/types.ts` and `websrc/lib/storage.ts` to understand current usage before editing.

- [ ] **Step 2: Update types.ts — remove union types, narrow fields**

  - Delete: `type TemplateMode = "entity" | "massops"`
  - Delete: `type JobApiMode = "entity" | "massops"`
  - In `TemplateDefinition`: change `mode: TemplateMode` → `mode: "massops"`
  - In `JobManifest`: change `apiMode: JobApiMode` → `apiMode: "massops"`

- [ ] **Step 3: Update storage.ts — fix import, cast, fallback, and seed**

  - Remove `TemplateMode` from the import on line 7
  - Change `mode: (row.mode as TemplateMode) ?? "entity"` → `mode: (row.mode as "massops") ?? "massops"`
  - In the seed template object, change `mode: "entity"` → `mode: "massops"`

- [ ] **Step 4: Run typecheck to see remaining cascading errors**

  ```bash
  cd websrc && npm run typecheck 2>&1 | head -60
  ```
  Expected: Errors in mass-ops.ts, services.ts, actions.ts, template-form.tsx — these are handled in later tasks.

- [ ] **Step 5: Commit**

  ```bash
  cd websrc && git add lib/types.ts lib/storage.ts
  git commit -m "refactor: collapse TemplateMode/JobApiMode to massops literal"
  ```

---

## Task 2: Delete entity-agent factory functions

**Files:**
- Modify: `websrc/lib/superoffice-client.ts`

- [ ] **Step 1: Read superoffice-client.ts**

  Identify the five entity-agent factory functions and their line ranges.

- [ ] **Step 2: Delete entity-agent factories**

  Remove these five functions entirely:
  - `createContactAgent()`
  - `createPersonAgent()`
  - `createAppointmentAgent()`
  - `createProjectAgent()`
  - `createSaleAgent()`

  Keep only:
  - `createDatabaseTableAgent()`
  - `createDatabaseTableAgentWithTicket()`

- [ ] **Step 3: Run typecheck**

  ```bash
  cd websrc && npm run typecheck 2>&1 | grep superoffice-client
  ```
  Expected: No new errors from this file. Pre-existing errors in mass-ops.ts are expected (next task).

- [ ] **Step 4: Commit**

  ```bash
  cd websrc && git add lib/superoffice-client.ts
  git commit -m "refactor: remove entity-agent factory functions"
  ```

---

## Task 3: Delete `executeWithEntityAgents` and collapse `executeJob`

**Files:**
- Modify: `websrc/lib/mass-ops.ts`

This is the largest deletion. The entity-agent execution path is ~250 lines.

- [ ] **Step 1: Read mass-ops.ts**

  Locate:
  - `CONCURRENCY` constant (line ~32)
  - Start/end of `executeWithEntityAgents()` function (lines ~136–389)
  - The `executeJob()` dispatcher at the bottom

- [ ] **Step 2: Delete `CONCURRENCY` constant**

  Remove the line: `const CONCURRENCY = 5;`

- [ ] **Step 3: Delete `executeWithEntityAgents()` function**

  Delete the entire function body. This includes all per-entity-type branches calling `createDefault*EntityAsync` and `save*EntityAsync`.

- [ ] **Step 4: Simplify `executeJob()` dispatcher**

  Replace the conditional dispatcher:
  ```typescript
  // BEFORE
  export async function* executeJob(...): AsyncGenerator<JobPhaseEvent> {
    if ((manifest.apiMode ?? "entity") === "massops") {
      yield* executeWithMassOps(manifest, template, accessToken, webApiUrl, systemUserToken);
    } else {
      yield* executeWithEntityAgents(manifest, template, accessToken, webApiUrl);
    }
  }
  ```

  With the simplified version:
  ```typescript
  // AFTER
  export async function* executeJob(
    manifest: JobManifest,
    template: TemplateDefinition,
    accessToken: string,
    webApiUrl: string,
    systemUserToken?: string
  ): AsyncGenerator<JobPhaseEvent> {
    yield* executeWithMassOps(manifest, template, accessToken, webApiUrl, systemUserToken);
  }
  ```

- [ ] **Step 5: Run typecheck**

  ```bash
  cd websrc && npm run typecheck 2>&1 | head -40
  ```

- [ ] **Step 6: Commit**

  ```bash
  cd websrc && git add lib/mass-ops.ts
  git commit -m "refactor: remove entity-agent execution path, collapse executeJob to massops"
  ```

---

## Task 4: Hardcode `apiMode` and `mode` in services

**Files:**
- Modify: `websrc/lib/services.ts`

- [ ] **Step 1: Read services.ts**

  Locate job creation (find `apiMode: template.mode`) and template creation (find where `mode` is written from input).

- [ ] **Step 2: Hardcode apiMode in job creation**

  Change:
  ```typescript
  apiMode: template.mode,
  ```
  To:
  ```typescript
  apiMode: "massops",
  ```

- [ ] **Step 3: Hardcode mode in template creation**

  Change any `mode: input.mode` → `mode: "massops"` in the template creation path.

- [ ] **Step 4: Run typecheck**

  ```bash
  cd websrc && npm run typecheck 2>&1 | head -40
  ```

- [ ] **Step 5: Commit**

  ```bash
  cd websrc && git add lib/services.ts
  git commit -m "refactor: hardcode apiMode and mode to massops in services"
  ```

---

## Task 5: Update Prisma schema default

**Files:**
- Modify: `websrc/prisma/schema.prisma`

- [ ] **Step 1: Read schema.prisma**

  Locate the `Template` model and the `mode String @default("entity")` field.

- [ ] **Step 2: Update the default and comment**

  Change:
  ```prisma
  mode          String   @default("entity")  // "entity" | "massops"
  ```
  To:
  ```prisma
  mode          String   @default("massops")
  ```

- [ ] **Step 3: Run Prisma migration**

  ```bash
  cd websrc && npx prisma migrate dev --name remove-entity-mode-default
  ```
  Expected: Migration created and applied. SQLite column default updated.

- [ ] **Step 4: Commit**

  ```bash
  cd websrc && git add prisma/schema.prisma prisma/migrations/
  git commit -m "refactor: update Template.mode Prisma default to massops"
  ```

---

## Task 6: Remove entity-mode guard from server actions

**Files:**
- Modify: `websrc/app/actions.ts`

- [ ] **Step 1: Read actions.ts**

  Locate `checkSystemColumnConflicts()` (lines ~18–31) and the Zod schema for template creation.

- [ ] **Step 2: Delete `checkSystemColumnConflicts()`**

  This guard only blocked entity-agent mode from using reserved system column names. Remove the function and its call site.

- [ ] **Step 3: Remove `mode` from Zod template schema**

  If the input schema has `mode: z.enum(["entity", "massops"])`, remove the field entirely (services.ts now always writes `"massops"` regardless).

- [ ] **Step 4: Run typecheck**

  ```bash
  cd websrc && npm run typecheck 2>&1 | head -40
  ```

- [ ] **Step 5: Commit**

  ```bash
  cd websrc && git add app/actions.ts
  git commit -m "refactor: remove entity-mode system column guard and mode field from actions"
  ```

---

## Task 7: Remove all entity-agent UI from forms and pages

**Files:**
- Modify: `websrc/components/forms/template-form.tsx`
- Modify: `websrc/components/forms/job-form.tsx`
- Modify: `websrc/app/templates/page.tsx`
- Modify: `websrc/app/jobs/[id]/page.tsx`

This is the most expansive UI task. `template-form.tsx` has significantly more entity-agent surface than just a mode radio.

- [ ] **Step 1: Read all four files**

  Before editing anything, read all four files to understand the full scope.

- [ ] **Step 2: Update template-form.tsx**

  Remove all of the following:
  - `import type { TemplateMode }` from types (line ~7)
  - `import { EntityFieldInfo }` from metadata (line ~8) — only used for entity-agent field picker
  - `useState` for `mode` field
  - `entityFieldMap` state and the `useEffect`/fetch that loads from `/api/metadata/entity-fields`
  - The mode radio/dropdown form element
  - Conditional UI blocks that render entity-agent specific content when `mode === "entity"` (lines ~628–637)
  - The `mode` prop from `EntityEditorProps` interface (lines ~739, ~762)
  - The `mode` prop passed to `<EntityEditor>` (line ~675–679)
  - Any `onChange` handler for mode

  After removal, the form always submits with the hardcoded implicit `mode: "massops"` (no field needed since actions.ts no longer reads it).

- [ ] **Step 3: Update job-form.tsx**

  Delete the mode display line:
  ```tsx
  Mode: {selectedTemplate.mode === "massops" ? "mass operations" : "entity agents"}
  ```

- [ ] **Step 4: Update templates/page.tsx**

  Remove the conditional badge block that renders violet/sky badges for `"massops"` vs `"entity"`. Remove the badge entirely or replace with a static label if the UI layout requires it.

- [ ] **Step 5: Update jobs/[id]/page.tsx**

  Locate the `apiMode` display row:
  ```tsx
  <dd className={`pill ${(job.apiMode ?? "entity") === "massops" ? ... : ...}`}>
    {(job.apiMode ?? "entity") === "massops" ? "Mass operations" : "Entity agents"}
  </dd>
  ```
  Either remove the entire `<dt>`/`<dd>` row, or replace the conditional with a static `"Mass operations"` label. Prefer removal to keep the job detail page clean.

- [ ] **Step 6: Run typecheck**

  ```bash
  cd websrc && npm run typecheck 2>&1 | head -40
  ```
  Expected: Errors only from missing unused imports — fix those now.

- [ ] **Step 7: Run lint**

  ```bash
  cd websrc && npm run lint 2>&1 | head -40
  ```
  Fix any unused import warnings.

- [ ] **Step 8: Commit**

  ```bash
  cd websrc && git add components/forms/template-form.tsx components/forms/job-form.tsx app/templates/page.tsx app/jobs/[id]/page.tsx
  git commit -m "refactor: remove entity-agent mode UI from forms and pages"
  ```

---

## Task 8: Delete unused entity-fields metadata endpoint

**Files:**
- Delete: `websrc/app/api/metadata/entity-fields/route.ts`

Note: `template-form.tsx` was the only file calling this route. Task 7 must be complete before this task.

- [ ] **Step 1: Confirm no remaining references**

  ```bash
  cd websrc && grep -r "entity-fields" . --include="*.ts" --include="*.tsx" -l
  ```
  Expected: Only the route file itself. If any other file appears, investigate before deleting.

- [ ] **Step 2: Delete the file and empty directory**

  ```bash
  cd websrc && rm app/api/metadata/entity-fields/route.ts
  rmdir app/api/metadata/entity-fields 2>/dev/null || true
  ```

- [ ] **Step 3: Run typecheck and lint**

  ```bash
  cd websrc && npm run typecheck 2>&1 && npm run lint 2>&1 | head -20
  ```
  Expected: Clean.

- [ ] **Step 4: Commit**

  ```bash
  cd websrc && git add -A
  git commit -m "refactor: delete entity-fields metadata endpoint (entity-agent mode removed)"
  ```

---

## Task 9: Final typecheck, lint, and build verification

- [ ] **Step 1: Full typecheck**

  ```bash
  cd websrc && npm run typecheck 2>&1
  ```
  Expected: Zero errors.

- [ ] **Step 2: Lint**

  ```bash
  cd websrc && npm run lint 2>&1
  ```
  Expected: Zero errors. Fix any remaining unused-import warnings.

- [ ] **Step 3: Production build**

  ```bash
  cd websrc && npm run build 2>&1
  ```
  Expected: Build succeeds. Note: build may warn about missing env vars — that is expected in CI.

- [ ] **Step 4: Smoke-test manually (optional but recommended)**

  ```bash
  cd websrc && npm run dev
  ```
  - `/templates` — no mode badges visible
  - Create a new template — no mode selector visible
  - Create a job — no mode display
  - Open job detail page — SSE stream executes via mass-ops path; no "Entity agents" text visible anywhere

- [ ] **Step 5: Final commit if lint fixes were needed**

  ```bash
  cd websrc && git add -A
  git commit -m "chore: remove unused imports after entity provisioning removal"
  ```

---

## Checklist Summary

| Task | Description |
|------|-------------|
| 1 | Remove `TemplateMode`/`JobApiMode` union types; fix `storage.ts` import/cast/seed |
| 2 | Delete 5 entity-agent factory functions |
| 3 | Delete `executeWithEntityAgents()`, collapse `executeJob()` |
| 4 | Hardcode `apiMode`/`mode` to `"massops"` in services |
| 5 | Update Prisma schema default, run migration |
| 6 | Remove entity-mode guard from server actions |
| 7 | Remove all entity-agent UI from template-form, job-form, templates page, job detail page |
| 8 | Delete entity-fields metadata API route |
| 9 | Final typecheck, lint, build, smoke-test |
