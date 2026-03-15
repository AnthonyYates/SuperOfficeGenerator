import "server-only";

import { SaleStatus, type ProjectMember, type ParticipantInfo } from "@superoffice/webapi";
import { buildFaker, runFakerPath } from "./faker";
import { getMetadata } from "./metadata";
import {
  createContactAgent,
  createPersonAgent,
  createProjectAgent,
  createAppointmentAgent,
  createSaleAgent,
  createDatabaseTableAgent,
  createDatabaseTableAgentWithTicket
} from "./superoffice-client";
import { getSystemUserTicket, extractEnv } from "./system-user";
import {
  ENTITY_SCHEMAS,
  ENTITY_EXECUTION_ORDER,
  type EntitySchema,
  type InsertContext,
  type SecondaryTableConfig
} from "./entity-schema";
import type {
  JobManifest,
  TemplateDefinition,
  TemplateEntitySettings,
  JobPhaseEvent
} from "./types";

const CONCURRENCY = 5;   // simultaneous API calls for entity-agent mode
const BATCH_SIZE = 500;  // rows per insertAsync call for mass-ops mode

/** Extract tenant context ID from webApiUrl, e.g. "https://sod.superoffice.com/Cust26759/api/" → "Cust26759" */
function extractContextFromWebApiUrl(webApiUrl: string): string {
  try {
    return new URL(webApiUrl).pathname.split("/").filter(Boolean)[0] ?? "";
  } catch {
    return "";
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function pickRoundRobin<T>(arr: T[], idx: number): T | undefined {
  if (!arr.length) return undefined;
  return arr[idx % arr.length];
}

function getFieldValue(
  settings: TemplateEntitySettings,
  fieldName: string,
  fakerInstance: ReturnType<typeof buildFaker>
): string | undefined {
  const rule = settings.fields.find((f) => f.field === fieldName);
  if (!rule) return undefined;
  switch (rule.strategy) {
    case "static":
      return rule.value ?? "";
    case "faker":
      return rule.fakerPath ? String(runFakerPath(fakerInstance, rule.fakerPath)) : "";
    case "list":
      return rule.list?.[Math.floor(Math.random() * (rule.list.length || 1))] ?? "";
    case "sequence":
      return fakerInstance.string.alphanumeric(8).toUpperCase();
    default:
      return "";
  }
}

// ─── Entity-agent execution path ─────────────────────────────────────────────
// Uses createDefault*EntityAsync + save*EntityAsync — works with any OIDC token

async function* executeWithEntityAgents(
  manifest: JobManifest,
  template: TemplateDefinition,
  accessToken: string,
  webApiUrl: string
): AsyncGenerator<JobPhaseEvent> {
  const metadata = await getMetadata(webApiUrl, accessToken);
  const insertedIds = new Map<string, number[]>();
  const locale = manifest.locales[0] ?? "en";

  for (const entityType of ENTITY_EXECUTION_ORDER) {
    const settings = template.entities.find((e) => e.entityType === entityType);
    if (!settings) continue;

    const companyIds = insertedIds.get("company") ?? [];
    const personIds = insertedIds.get("contact") ?? [];
    const projectIds = insertedIds.get("project") ?? [];
    const saleIds = insertedIds.get("sale") ?? [];

    // Counts are per-company for all dependent entity types.
    const baseQuantity = manifest.requestedCounts[entityType] ?? settings.quantityDefault;
    const companyCount = companyIds.length;
    const quantity = entityType === "company" || companyCount === 0
      ? baseQuantity
      : baseQuantity * companyCount;
    if (quantity <= 0) continue;

    yield { type: "phase_start", entityType, total: quantity };

    const phaseIds: number[] = [];
    let batchIndex = 0;

    for (let start = 0; start < quantity; start += CONCURRENCY) {
      const end = Math.min(start + CONCURRENCY, quantity);
      const indices = Array.from({ length: end - start }, (_, j) => start + j);

      const settled = await Promise.allSettled(
        indices.map(async (i) => {
          const f = buildFaker(locale);
          const field = (name: string) => getFieldValue(settings, name, f);

          if (entityType === "company") {
            const agent = createContactAgent(webApiUrl, accessToken);
            const entity = await agent.createDefaultContactEntityAsync();
            entity.name = field("name") ?? f.company.name();
            const dept = field("department");
            if (dept) entity.department = dept;
            const orgNr = field("orgnr");
            if (orgNr) entity.orgNr = orgNr;
            const biz = pickRoundRobin(metadata.businesses, i);
            const cat = pickRoundRobin(metadata.categories, i);
            const ctry =
              metadata.countries.find((c) => c.twoLetterISOCountry === "US") ??
              metadata.countries[0];
            if (biz) entity.business = { id: biz.id };
            if (cat) entity.category = { id: cat.id };
            if (ctry) entity.country = { countryId: ctry.id };
            const saved = await agent.saveContactEntityAsync(entity);
            return saved.contactId!;
          }

          if (entityType === "contact") {
            const contactId = pickRoundRobin(companyIds, i);
            if (!contactId) throw new Error("No company IDs available for person FK");
            const agent = createPersonAgent(webApiUrl, accessToken);
            const entity = await agent.createDefaultPersonEntityAsync();
            entity.firstname = field("firstName") ?? f.person.firstName();
            entity.lastname = field("lastName") ?? f.person.lastName();
            const title = field("title");
            if (title) entity.title = title;
            entity.contact = { contactId };
            const phone = field("phone");
            if (phone) entity.officePhones = [{ value: phone, description: "Work" }];
            const email = field("email");
            if (email) entity.emails = [{ value: email, description: "Work" }];
            const saved = await agent.savePersonEntityAsync(entity);
            return saved.personId!;
          }

          if (entityType === "project") {
            const agent = createProjectAgent(webApiUrl, accessToken);
            const entity = await agent.createDefaultProjectEntityAsync();
            entity.name = field("name") ?? f.commerce.productName();
            const pType = pickRoundRobin(metadata.projectTypes, i);
            const pStatus = pickRoundRobin(metadata.projectStatuses, i);
            if (pType) entity.projectType = { id: pType.id };
            if (pStatus) entity.projectStatus = { id: pStatus.id };
            const saved = await agent.saveProjectEntityAsync(entity);
            const projectId = saved.projectId!;

            // Add project members: persons that belong to the same company as this project
            if (companyIds.length > 0 && personIds.length > 0) {
              const companyCount = companyIds.length;
              const projectCompanyIdx = i % companyCount;
              const projectContactId = companyIds[projectCompanyIdx];
              const members: ProjectMember[] = [];
              for (let j = 0; j < personIds.length; j++) {
                if (j % companyCount === projectCompanyIdx && personIds[j]) {
                  members.push({ personId: personIds[j], contactId: projectContactId, projectId });
                }
              }
              if (members.length) {
                try {
                  await agent.addProjectMembersAsync(projectId, members);
                } catch {
                  // Non-fatal: project was saved, members just couldn't be linked
                }
              }
            }

            return projectId;
          }

          if (entityType === "followUp") {
            const contactId = pickRoundRobin(companyIds, i);
            if (!contactId) throw new Error("No company IDs available for follow-up FK");
            const agent = createAppointmentAgent(webApiUrl, accessToken);
            const entity = await agent.createDefaultAppointmentEntityAsync();
            entity.title = field("title") ?? f.lorem.words(3);
            const desc = field("description");
            if (desc) entity.description = desc;
            entity.contact = { contactId };
            const personId = pickRoundRobin(personIds, i);
            if (personId) {
              entity.person = { personId };
              // Add the contact person as a participant (creates a booking invitation slave row)
              const participant: ParticipantInfo = { personId, contactId };
              entity.participants = [participant];
            }
            const saleId = pickRoundRobin(saleIds, i);
            if (saleId) entity.sale = { saleId };
            const projectId = pickRoundRobin(projectIds, i);
            if (projectId) entity.project = { projectId };
            entity.startDate = new Date();
            entity.endDate = new Date(Date.now() + 60 * 60 * 1000);
            const saved = await agent.saveAppointmentEntityAsync(entity);
            return saved.appointmentId!;
          }

          if (entityType === "sale") {
            const contactId = pickRoundRobin(companyIds, i);
            if (!contactId) throw new Error("No company IDs available for sale FK");
            const agent = createSaleAgent(webApiUrl, accessToken);
            const entity = await agent.createDefaultSaleEntityAsync();
            entity.heading = field("heading") ?? f.commerce.productName();
            const amountStr = field("amount");
            entity.amount = amountStr
              ? parseFloat(amountStr)
              : f.number.float({ min: 1000, max: 50000 });
            entity.contact = { contactId };
            const personId = pickRoundRobin(personIds, i);
            if (personId) entity.person = { personId };
            const projectId = pickRoundRobin(projectIds, i);
            if (projectId) entity.project = { projectId };
            const saleType = pickRoundRobin(metadata.saleTypes, i);
            if (saleType) entity.saleType = { id: saleType.id };
            const source = pickRoundRobin(metadata.sources, i);
            if (source) entity.source = { id: source.id };
            entity.saledate = new Date();
            entity.status = SaleStatus.Open;
            const saved = await agent.saveSaleEntityAsync(entity);
            return saved.saleId!;
          }

          throw new Error(`Unknown entity type: ${entityType}`);
        })
      );

      let batchInserted = 0;
      for (const result of settled) {
        if (result.status === "fulfilled") {
          phaseIds.push(result.value);
          batchInserted++;
        } else {
          yield {
            type: "error",
            message: `${entityType} [${batchIndex}]: ${(result.reason as Error).message}`
          };
        }
      }

      yield { type: "batch_done", entityType, batchIndex, inserted: batchInserted };
      batchIndex++;
    }

    insertedIds.set(entityType, phaseIds);
    yield { type: "phase_done", entityType, success: phaseIds.length, failed: quantity - phaseIds.length };

    if (entityType === "company" && phaseIds.length === 0) {
      yield { type: "error", message: "Company phase produced 0 IDs — skipping dependent entity phases" };
      return;
    }
  }
}

// ─── Mass-operations execution path ──────────────────────────────────────────
// Uses DatabaseTableAgent.insertAsync for bulk inserts.
// Requires the authenticated user to have DatabaseTable / System Design access.

function generateSingleRow(
  settings: TemplateEntitySettings,
  schema: EntitySchema,
  ctx: InsertContext,
  locale: string
): Record<string, string> {
  const f = buildFaker(locale);
  const row: Record<string, string> = {};

  for (const fieldRule of settings.fields) {
    let value: unknown;
    switch (fieldRule.strategy) {
      case "static":
        value = fieldRule.value ?? "";
        break;
      case "faker":
        if (!fieldRule.fakerPath) throw new Error(`Missing fakerPath for field ${fieldRule.field}`);
        value = runFakerPath(f, fieldRule.fakerPath);
        break;
      case "list":
        value = fieldRule.list?.[Math.floor(Math.random() * (fieldRule.list.length || 1))] ?? "";
        break;
      case "sequence":
        value = f.string.alphanumeric(8).toUpperCase();
        break;
      default:
        value = "";
    }
    const dbColumn = schema.fieldMap[fieldRule.field] ?? fieldRule.field;
    if (schema.columns.includes(dbColumn)) {
      row[dbColumn] = String(value ?? "");
    }
  }

  for (const [col, factory] of Object.entries(schema.systemColumns)) {
    if (row[col] !== undefined) continue;
    row[col] = typeof factory === "function" ? factory(ctx) : factory;
  }

  return row;
}

function rowToArray(row: Record<string, string>, columns: string[]): string[] {
  return columns.map((col) => row[col] ?? "");
}

async function insertSecondaryRows(
  agent: ReturnType<typeof createDatabaseTableAgent>,
  secondaryConfigs: SecondaryTableConfig[],
  rowObjects: Record<string, string>[],
  parentIds: number[],
  metadata: ReturnType<typeof getMetadata> extends Promise<infer T> ? T : never,
  insertedIds: Map<string, number[]>,
  rowIndexOffset = 0
): Promise<void> {
  for (const config of secondaryConfigs) {
    const allData: string[][] = [];
    for (let i = 0; i < rowObjects.length; i++) {
      const parentId = parentIds[i];
      if (!parentId) continue;
      const ctx: InsertContext = { insertedIds, metadata, rowIndex: rowIndexOffset + i };
      allData.push(...config.buildRows(rowObjects[i], parentId, ctx));
    }
    if (!allData.length) continue;

    for (let i = 0; i < allData.length; i += BATCH_SIZE) {
      try {
        await agent.insertAsync(
          config.table,
          config.columns,
          allData.slice(i, i + BATCH_SIZE)
        );
      } catch {
        // Secondary table failures are non-fatal
      }
    }
  }
}

async function* executeWithMassOps(
  manifest: JobManifest,
  template: TemplateDefinition,
  accessToken: string,
  webApiUrl: string,
  systemUserToken?: string
): AsyncGenerator<JobPhaseEvent> {
  // Prefer system user ticket when available; fall back to bearer token.
  let agent: ReturnType<typeof createDatabaseTableAgent>;
  if (systemUserToken) {
    const env = extractEnv(webApiUrl);
    try {
      const ticket = await getSystemUserTicket(systemUserToken, extractContextFromWebApiUrl(webApiUrl), env);
      agent = createDatabaseTableAgentWithTicket(webApiUrl, ticket);
    } catch (err) {
      yield { type: "error", message: `System user auth failed: ${(err as Error).message}` };
      return;
    }
  } else {
    agent = createDatabaseTableAgent(webApiUrl, accessToken);
  }
  const metadata = await getMetadata(webApiUrl, accessToken);
  const insertedIds = new Map<string, number[]>();

  for (const entityType of ENTITY_EXECUTION_ORDER) {
    const settings = template.entities.find((e) => e.entityType === entityType);
    if (!settings) continue;

    // Counts are per-company for all dependent entity types.
    const companyIds = insertedIds.get("company") ?? [];
    const baseQuantity = manifest.requestedCounts[entityType] ?? settings.quantityDefault;
    const companyCount = companyIds.length;
    const quantity = entityType === "company" || companyCount === 0
      ? baseQuantity
      : baseQuantity * companyCount;
    if (quantity <= 0) continue;

    const schema = ENTITY_SCHEMAS[entityType];
    yield { type: "phase_start", entityType, total: quantity };

    const locale = manifest.locales[0] ?? "en";
    const rowObjects: Record<string, string>[] = [];
    for (let i = 0; i < quantity; i++) {
      const ctx: InsertContext = { insertedIds, metadata, rowIndex: i };
      rowObjects.push(generateSingleRow(settings, schema, ctx, locale));
    }
    const allRows = rowObjects.map((r) => rowToArray(r, schema.columns));

    const phaseIds: number[] = [];

    for (let batchStart = 0; batchStart < allRows.length; batchStart += BATCH_SIZE) {
      const batchRows = allRows.slice(batchStart, batchStart + BATCH_SIZE);
      const batchObjects = rowObjects.slice(batchStart, batchStart + BATCH_SIZE);
      const batchIndex = Math.floor(batchStart / BATCH_SIZE);

      try {
        console.log(`[mass-ops] insertAsync — table: ${schema.table}, columns: ${JSON.stringify(schema.columns)}`);
        console.log(`[mass-ops] first row sample:`, JSON.stringify(batchRows[0]));
        const result = await agent.insertAsync(schema.table, schema.columns, batchRows);

        const ids = (result.rowStatus ?? [])
          .map((r) => r.primaryKey)
          .filter((id): id is number => typeof id === "number" && id > 0);

        phaseIds.push(...ids);
        yield { type: "batch_done", entityType, batchIndex, inserted: ids.length };

        if (schema.secondaryTables?.length) {
          await insertSecondaryRows(agent, schema.secondaryTables, batchObjects, ids, metadata, insertedIds, batchStart);
        }
      } catch (err) {
        const detail = (err as { response?: { data?: unknown } }).response?.data
          ? JSON.stringify((err as { response: { data: unknown } }).response.data)
          : (err as Error).message;
        yield { type: "error", message: `${entityType} batch ${batchIndex}: ${detail}` };
      }
    }

    insertedIds.set(entityType, phaseIds);
    yield { type: "phase_done", entityType, success: phaseIds.length, failed: quantity - phaseIds.length };

    if (entityType === "company" && phaseIds.length === 0) {
      yield { type: "error", message: "Company phase produced 0 IDs — skipping dependent entity phases" };
      return;
    }
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function* executeJob(
  manifest: JobManifest,
  template: TemplateDefinition,
  accessToken: string,
  webApiUrl: string,
  systemUserToken?: string
): AsyncGenerator<JobPhaseEvent> {
  if ((manifest.apiMode ?? "entity") === "massops") {
    yield* executeWithMassOps(manifest, template, accessToken, webApiUrl, systemUserToken);
  } else {
    yield* executeWithEntityAgents(manifest, template, accessToken, webApiUrl);
  }
}
