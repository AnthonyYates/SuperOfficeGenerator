# Web App PRD Gap Checklist

This checklist compares the implemented Next.js application in `websrc` with the target behavior described in `docs/web-app-prd.md`.

Status legend:

- `[x]` implemented
- `[~]` partially implemented
- `[ ]` not implemented

## 1. Authentication and Authorization

- [x] SuperOffice OIDC sign-in flow exists.
- [x] Protected application routes redirect unauthenticated users to `/login`.
- [x] Session contains tenant-specific details such as `webApiUrl`, `ctx`, and `companyName`.
- [~] System-user token support exists for mass operations when the `system_token` claim is available.
- [ ] Admin and Operator roles are not implemented.
- [ ] Role-based authorization is not enforced on any route or mutation.
- [ ] Idle timeout and silent refresh policies described in the PRD are not explicitly implemented by app code.

## 2. Environment and Credential Management

- [ ] Environment management UI does not exist.
- [ ] Environment bundle CRUD APIs do not exist.
- [ ] Multiple tenant/environment configuration inside the app is not implemented.
- [ ] Environment availability toggles are not implemented.
- [~] Secrets are server-side environment variables, but the app does not provide a dedicated secret management layer.

## 3. Template Builder

- [x] Template create, update, delete, and list flows exist.
- [x] Templates support entity definitions with quantity defaults, locales, and field rules.
- [x] Supported field strategies include `static`, `faker`, `list`, and `sequence`.
- [x] Templates are validated server-side with Zod before saving.
- [~] Locale fallbacks are stored, but runtime locale-aware faker generation is not fully implemented.
- [~] Relationship behavior exists implicitly in execution code, but there is no explicit relationship builder in the UI.
- [ ] Template preview API and preview UI are not implemented.
- [ ] Template versioning and diffing are not implemented.
- [ ] The template experience is raw JSON editing, not a guided builder workflow.

## 4. Job Execution

- [x] Jobs can be created from a selected template.
- [x] Jobs persist as JSON manifests.
- [x] Jobs track status and summary metrics.
- [x] Jobs support two execution modes: entity agents and mass operations.
- [x] Execution order handles entity dependencies.
- [x] Progress events are streamed through SSE.
- [~] Jobs are stateless from a server-process perspective, but execution is tied to the SSE request instead of a true background worker.
- [~] Errors are surfaced in-stream, but detailed per-item failure persistence is missing.
- [ ] Queue-based background processing is not implemented.
- [ ] Retry individual failed rows or subsets is not implemented.
- [ ] Export endpoints for CSV/JSON results are not implemented.

## 5. Job Monitoring and History

- [x] Jobs dashboard/history view exists.
- [x] Job detail page exists.
- [x] Job detail page shows requested counts, status, API mode, and live progress.
- [x] Completed jobs persist final metrics and per-phase totals.
- [ ] Per-entity timeline/log detail from the PRD is not implemented.
- [ ] Detailed audit/history bundles are not implemented.
- [ ] Retry controls on the job detail page are not implemented.
- [ ] Downloadable success/error summaries are not implemented.

## 6. Notifications and Audit

- [ ] Email notifications are not implemented.
- [ ] Teams/webhook notifications are not implemented.
- [ ] Audit log retention and export workflows are not implemented.
- [ ] User login/template edit/job launch audit bundles are not implemented.

## 7. UX and Information Architecture

- [x] Dashboard page exists.
- [x] Templates page exists.
- [x] Jobs page exists.
- [x] Job detail page exists.
- [ ] Environments page does not exist.
- [~] Tailwind styling and shared classes exist, but there is no richer component system or design token structure beyond a small brand palette.
- [ ] Accessibility guarantees from the PRD are not validated in the codebase.
- [ ] Multi-language UI copy is not implemented.

## 8. API Surface

- [x] Auth route exists through NextAuth.
- [x] Job stream route exists.
- [ ] `/api/environments` routes do not exist.
- [ ] `/api/templates/{id}/preview` does not exist.
- [ ] `/api/jobs` REST endpoints do not exist as standalone route handlers.
- [ ] `/api/jobs/{id}` status endpoint does not exist as a route handler.
- [ ] `/api/jobs/{id}/retry` does not exist.
- [ ] `/api/jobs/{id}/export` does not exist.

## 9. Storage and Security Model

- [x] No database is required.
- [x] Templates and jobs are persisted as JSON artifacts.
- [~] The code and UI talk about encrypted/object storage, but the actual implementation uses plain local files in `websrc/storage`.
- [~] Secrets are not hard-coded and are read from environment variables, but there is no external secret store integration.
- [ ] Encrypted artifact storage is not implemented.
- [ ] Audit bundle persistence is not implemented.
- [ ] CSP, CSRF, and ASVS-level security controls are not comprehensively implemented in code.

## 10. Observability and Operations

- [~] There are ad hoc console logs, especially around mass operations and system-user auth.
- [ ] Structured logging is not implemented.
- [ ] Metrics collection is not implemented.
- [ ] Alerting is not implemented.
- [ ] Feature flags are not implemented.

## 11. Highest-Priority Gaps

The biggest gaps between the implemented app and the PRD are:

1. environment management and role-based authorization are absent
2. job execution is coupled to the browser SSE connection instead of a background worker
3. persistence is plain local JSON, not encrypted object storage
4. exports, retries, and audit trails are missing because detailed per-item results are not persisted
5. locale-aware generation exists in the model but not in the faker runtime implementation

## 12. Recommended Implementation Order

1. Introduce secure durable storage for templates, jobs, and audits.
2. Move job execution to a worker or queue-backed background process.
3. Add environment management and authorization roles.
4. Persist row-level execution results to enable retries and exports.
5. Implement preview, export, and retry APIs.
6. Complete locale-aware faker generation and improve the template authoring UX.