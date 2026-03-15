# SuperOffice Provisioning Web Application — Product Requirements

## 1. Background & Summary
- The current .NET console tool provisions new entities into SuperOffice Online using OpenID Connect for auth and SuperOffice.WebApi libraries.
- Operations and onboarding teams need a friendlier, auditable, multi-user experience that can be run from any browser without granting shell access.
- Build a Next.js + Tailwind web app that reproduces (and incrementally enhances) the console tool’s provisioning flow while integrating with the `SuperOffice.WebApi` **npm** package for all SuperOffice API calls.

## 2. Goals & Non-Goals
### Goals (P0 unless otherwise noted)
1. Provide a secure browser-based workflow to authenticate via SuperOffice OIDC and create entities (companies, contacts, follow-ups, etc.) in bulk.
2. Surface configuration, run-time progress, and history in a UI that non-engineering teams can operate.
3. Centralize environment settings (tenant, client ID, scopes, redirect URIs) with role-based access.
4. Reuse SuperOffice.WebApi npm client for strongly-typed API access and throttling safeguards.
5. Maintain parity with console app entity fields while enabling extensibility for future entity templates.

### Non-Goals
- Replacing or modifying SuperOffice CRM UI itself.
- Supporting offline provisioning or mobile-native clients.
- Acting as a general-purpose ETL/ import tool beyond entities currently handled by the console generator.

## 3. Personas & Use Cases
| Persona | Description | Critical Scenarios |
| --- | --- | --- |
| Implementation Engineer | Sets up new demo/customer tenants. | Configure tenant, define entity template, trigger provisioning job, monitor completion. |
| Customer Success Manager | Needs visibility but limited technical background. | Load saved template, run small batch, download status report, retry failed records. |
| Platform Admin | Owns credentials/compliance. | Manage app/client secrets, rotate certificates, view audit logs, disable user access. |

User stories (P0):
1. As an implementation engineer, I can authenticate via OIDC and have my session scoped to a SuperOffice environment.
2. As a user, I can define how many entities of each type to generate and preview payloads before execution.
3. As a user, I can start a provisioning job, watch progress in real time, and download success/error summaries.
4. As an admin, I can preconfigure environments and limit who can run jobs against production tenants.

## 4. Assumptions & Dependencies
- Next.js 14+ (App Router) with TypeScript, React Server Components where possible.
- Tailwind CSS for styling + component primitives (no heavyweight UI kits).
- Authentication handled via NextAuth (or Auth.js) with the SuperOffice OIDC provider (PKCE) and encrypted server-side session storage (e.g., signed cookies or Redis).
- All SuperOffice API calls go through the `SuperOffice.WebApi` npm package, invoked server-side within Next.js API routes/Server Actions; no direct browser calls.
- Synthetic data for entities is generated with `@faker-js/faker`, encapsulated in shared utilities that templates can reuse.
- No database dependencies: configuration, templates, and job manifests are stored as encrypted JSON files within secure object storage or customer-managed Git repositories.
- All runtime secrets (client IDs, client secrets, encryption keys, storage credentials) must be declared in the application `.env` file (or `.env.local` per environment) and never hard-coded or checked into source control.
- Deployment target: Vercel/ Azure Static Web Apps/ containerized hosting with HTTPS enforced.

## 5. Solution Overview
### 5.1 Architecture Summary
1. Browser UI (Next.js pages) invokes `/api/*` routes for privileged operations.
2. `/api/auth/*` handles OIDC login, token exchange, refresh; stores encrypted tokens in session.
3. Provisioning requests produce signed job manifests stored in encrypted object storage; a stateless worker (Next.js route handler or background queue) streams these manifests and iterates SuperOffice API calls using SuperOffice.WebApi client.
4. Job status updates are pushed via SSE/Next.js server actions or polled REST endpoints.

### 5.2 Technology Choices
- **Next.js App Router** for routing, layouts, server components, API routes.
- **Tailwind CSS** utility classes + design tokens for consistent spacing, color, typography.
- **React Query / TanStack Query** (client) for data fetching and caching.
- **SuperOffice.WebApi npm package** for OAuth token exchange, strongly typed entity creation, rate limiting helper.
- **@faker-js/faker** for deterministic/randomized sample data generation used by template previews and job payloads.
- Signed JSON artifacts stored in encrypted object storage (e.g., Azure Blob, AWS S3) for templates, job manifests, and audit bundles—no database engine required.

### 5.3 End-to-End User Journey
1. Navigate to the app, hit “Sign in with SuperOffice”, complete consent, return with authenticated session.
2. Select an environment + template (or create new template) specifying entity counts, properties, relationships.
3. Preview generated payload(s) and validation warnings.
4. Start provisioning job; UI shows queued/running/completed status, throughput, and failure reasons.
5. Download CSV/JSON summary or clone job parameters for another run.

## 6. Functional Requirements
### 6.1 Authentication & Authorization (P0)
- Use SuperOffice OIDC with PKCE; enforce HTTPS-only redirects.
- Store refresh + access tokens server-side, rotate before expiry using SuperOffice.WebApi client helpers.
- Support two roles: **Operator** (run jobs, view history) and **Admin** (manage environments/templates, view audit logs, manage roles).
- Auto-logout after 30 min idle; silent token refresh every 5 min.

### 6.2 Environment & Credential Management (P0)
- Admin UI to register environments: display name, SuperOffice tenant ID, OAuth client ID/secret, scopes, default batch size limits.
- Secrets kept in server-side config store; never rendered client-side.
- Allow toggling environment availability (e.g., disable Production temporarily).

### 6.3 Entity Template Builder (P0)
- Define template metadata: name, description, entity types (company, contact, appointments, follow-ups, custom fields).
- Specify per-entity field rules: static value, random from set, derived sequence, or faker-powered generators (e.g., company names, phone numbers) with seeding for reproducibility.
- Allow template authors to declare default batch quantities per entity type plus locale fallbacks (e.g., `en`, `nb`, `sv`) that operators can override at run time.
- Support relationship definitions (company-contact, contact-follow-up).
- Validate templates client-side & server-side; block save if required fields missing.

### 6.4 Provisioning Job Execution (P0)
- Start job by selecting template + environment + quantity per entity type, along with zero or more locales that drive faker data generation (defaulting to template settings).
- Serialize a job manifest (id, template snapshot, environment, requested counts, locales, createdBy, status, timestamps) to encrypted JSON stored in object storage so stateless workers can process it without relying on a database.
- Backend iterates through `SuperOffice.WebApi` client operations respecting concurrency + throttling caps (configurable).
- Capture response payloads, total successes, failures with error codes/messages, appending them to the manifest.
- Provide progress updates every 2 seconds (server push/poll) by streaming manifest deltas.

### 6.5 Job Monitoring & History (P0)
- “Jobs” dashboard showing sortable table (status, creator, entity counts, duration) sourced from the encrypted manifests.
- Detail view with timeline, per-entity logs, ability to retry failed rows individually or in bulk by rehydrating manifest snapshots—no centralized database needed.
- Export job summary (CSV/JSON) with entity IDs assigned by SuperOffice, generated directly from the manifest data.

### 6.6 Notifications & Audit (P1)
- Optional email/Teams webhook when job completes or fails.
- Audit trail of user logins, template edits, job launches (persisted for ≥180 days).

### 6.7 Advanced Features (P2 / stretch)
- Scheduling recurring jobs.
- Template versioning + diffing.
- Multi-language UI copy.

## 7. UX & Information Architecture
### 7.1 Screen Inventory
| Page | Purpose | Key Components |
| --- | --- | --- |
| `/` Dashboard | Overview, recent jobs, quick actions. | Stats cards, recent jobs table, CTA buttons. |
| `/environments` | Manage tenant connections. | Table list, modal form, secret masking, status badge. |
| `/templates` | CRUD templates + preview. | List with filters, template builder wizard, JSON preview. |
| `/jobs` | Job history and monitoring. | Table with status pills, filters by date/creator, bulk actions. |
| `/jobs/[id]` | Detailed progress + logs. | Progress bar, timeline, accordion per entity type, retry controls. |

### 7.2 Tailwind Guidelines
- Define design tokens in `tailwind.config.js` (SuperOffice palette, font stack, spacing scale).
- Use composable utility classes; abstract repeated patterns into small component wrappers (e.g., `<Card>`, `<StatusPill>`).
- Respect accessibility: color contrast ≥ 4.5:1, focus-visible styles on interactive elements.

## 8. API & Integration Requirements
### 8.1 OIDC & Token Handling
- `/api/auth/login` kicks off OIDC authorize request.
- `/api/auth/callback` exchanges code for tokens via SuperOffice.WebApi helper, stores in encrypted session.
- `/api/auth/logout` revokes refresh token and clears session cookies.

### 8.2 Next.js API Routes (initial set)
| Route | Method | Description | Request | Response |
| --- | --- | --- | --- | --- |
| `/api/environments` | GET | List accessible environments (role-filtered). | — | 200 + array of env metadata. |
| `/api/environments` | POST (Admin) | Create/update environment config. | JSON body with tenant/client info | 201 + saved record. |
| `/api/templates` | GET/POST/PUT | CRUD templates. | Template payload | Template DTO / validation errors. |
| `/api/templates/{id}/preview` | POST | Generate sample payloads. | Template + counts | JSON preview. |
| `/api/jobs` | GET/POST | List jobs / enqueue job. | Job request (templateId, envId, counts per entity type, optional locales[]). | Job DTO (status = queued). |
| `/api/jobs/{id}` | GET | Job status + metrics. | — | Job DTO (hydrated from manifest) with progress + errors. |
| `/api/jobs/{id}/retry` | POST | Retry failed subset. | failedItemIds[] | Job DTO updated. |
| `/api/jobs/{id}/export` | GET | Download results. | query format=csv/json | File stream. |

All above routes execute server-side logic that instantiates the `SuperOffice.WebApi` client with environment-specific credentials and the user’s delegated token from session. Never expose raw access tokens to the browser.

### 8.3 Error Handling
- Standardized error envelope `{ code, message, correlationId, details? }`.
- Map SuperOffice API faults to user-friendly messages + actionable suggestions.
- Retry transient 429/5xx errors with exponential backoff (max 3 attempts) before marking row failed.

## 9. State Artifacts (Database-Free)
- **Environment bundle:** Encrypted JSON per environment (tenant, client references, scopes, feature flags) stored in secure object storage or version-controlled secrets repository; downloaded and cached per session.
- **Template definition:** Versioned JSON files (with locale defaults and faker instructions) managed alongside environment bundles; edits occur through signed uploads/commits.
- **Job manifest:** Generated JSON document capturing template snapshot, counts, locales, creator, timestamps, progress markers, and per-entity outcomes; workers stream and update this document atomically.
- **Audit bundle:** Append-only NDJSON log written to object storage or forwarded to an external logging provider; serves as audit history without requiring a database.


## 10. Non-Functional Requirements
- **Performance:** Create at least 100 entities/minute with live progress; API latency < 500 ms for read endpoints.
- **Scalability:** Support concurrent jobs (min 3) without throttling conflicts; queue excessive jobs with clear messaging.
- **Security:** OWASP ASVS L2 compliance, CSP headers, CSRF protection on mutations, encrypted secrets at rest.
- **Reliability:** 99.5% availability target; graceful degradation if SuperOffice API unavailable (queues paused, user notified).
- **Accessibility:** WCAG 2.1 AA, keyboard navigation for all inputs/actions.

## 11. Observability & Operations
- Structured logging (requestId, jobId, entityType) using Next.js middleware, emitted to central log sink.
- Metrics: job throughput, success rate, average API latency, token refresh failures.
- Alerting: paging on consecutive job failures, repeated 401/403 from SuperOffice, queue backlog > 10 jobs for 10 minutes.
- Feature flags for releasing new entity types or UI modules.

## 12. Rollout Plan & Open Questions
1. **Milestone 1 (P0)** – Auth, environment management, template CRUD, job execution & monitoring.
2. **Milestone 2 (P1)** – Notifications, audit exports, enhanced retry UX.
3. **Milestone 3 (P2)** – Scheduling, template versioning, localization.

Open questions:
- Which storage/service should hold encrypted environment secrets (Azure Key Vault, AWS Secrets Manager, etc.)?
- Do we need SSO via corporate IdP before SuperOffice login, or is SuperOffice OIDC sufficient?
- What is the maximum acceptable job duration and is asynchronous worker infrastructure (e.g., queue + worker) required beyond Next.js route handlers?

This document should be updated as the team learns from prototypes, user interviews, and integration testing with SuperOffice sandbox tenants.
