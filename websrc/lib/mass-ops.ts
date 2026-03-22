import "server-only";

import { SaleStatus, type ProjectMember, type ParticipantInfo } from "@superoffice/webapi";
import { buildFaker, runFakerPath, buildLocalePool } from "./faker";
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
  resolveSchema,
  topoSort,
  countryIdFromLocale,
  type EntitySchema,
  type InsertContext,
  type SecondaryTableConfig
} from "./entity-schema";
import type {
  EntityDefinition,
  JobManifest,
  TemplateDefinition,
  JobPhaseEvent,
  TemplateFieldRule
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


/** Resolves a single field rule to a string value using the faker instance and insert context. */
function applyFieldRule(
  rule: TemplateFieldRule,
  f: ReturnType<typeof buildFaker>,
  ctx: InsertContext
): string {
  switch (rule.strategy) {
    case "static":
      return rule.value ?? "";
    case "faker":
      return rule.fakerPath ? String(runFakerPath(f, rule.fakerPath)) : "";
    case "list":
      return rule.list?.[Math.floor(Math.random() * (rule.list.length || 1))] ?? "";
    case "sequence":
      return f.string.alphanumeric(8).toUpperCase();
    case "fk": {
      if (!rule.fkEntity) return "0";
      const ids = ctx.insertedIds.get(rule.fkEntity) ?? [];
      if (!ids.length) return "0";
      return rule.fkSelect === "random"
        ? String(ids[Math.floor(Math.random() * ids.length)])
        : String(ids[ctx.rowIndex % ids.length]);
    }
    default:
      return "";
  }
}

/** Looks up a named field on an entity and applies its rule. Returns undefined when the field has no rule. */
function getFieldValue(
  entity: EntityDefinition,
  fieldName: string,
  f: ReturnType<typeof buildFaker>,
  ctx: InsertContext
): string | undefined {
  const rule = entity.fields.find((r) => r.field === fieldName);
  return rule ? applyFieldRule(rule, f, ctx) : undefined;
}

/** Inserts allData into a secondary table in BATCH_SIZE chunks. Failures are non-fatal. */
async function batchInsert(
  agent: ReturnType<typeof createDatabaseTableAgent>,
  table: string,
  columns: string[],
  allData: string[][]
): Promise<void> {
  for (let i = 0; i < allData.length; i += BATCH_SIZE) {
    try {
      await agent.insertAsync(table, columns, allData.slice(i, i + BATCH_SIZE));
    } catch {
      // Secondary table failures are non-fatal
    }
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
  const sortedEntities = topoSort(template.entities);

  for (const entityDef of sortedEntities) {
    // Entity-agent path only supports builtin types
    if (!entityDef.builtinType) {
      yield { type: "error", message: `Skipping custom entity "${entityDef.name}" — entity-agent mode only supports builtin types` };
      continue;
    }
    const entityType = entityDef.builtinType;

    const localePool = buildLocalePool(manifest.locales, entityDef.localeFallbacks);

    const companyIds = insertedIds.get("company") ?? [];
    const personIds = insertedIds.get("contact") ?? [];
    const projectIds = insertedIds.get("project") ?? [];
    const saleIds = insertedIds.get("sale") ?? [];

    // Counts are per-company for all dependent entity types.
    const baseQuantity = manifest.requestedCounts[entityDef.name] ?? entityDef.quantityDefault;
    const companyCount = companyIds.length;
    const quantity = entityType === "company" || companyCount === 0
      ? baseQuantity
      : baseQuantity * companyCount;
    if (quantity <= 0) continue;

    yield { type: "phase_start", entityType: entityDef.name, total: quantity };

    const phaseIds: number[] = [];
    let batchIndex = 0;

    for (let start = 0; start < quantity; start += CONCURRENCY) {
      const end = Math.min(start + CONCURRENCY, quantity);
      const indices = Array.from({ length: end - start }, (_, j) => start + j);

      const settled = await Promise.allSettled(
        indices.map(async (i) => {
          const locale = localePool[Math.floor(Math.random() * localePool.length)];
          const f = buildFaker(locale);
          const ctx: InsertContext = { insertedIds, metadata, rowIndex: i, locale };
          const field = (name: string) => getFieldValue(entityDef, name, f, ctx);

          if (entityType === "company") {
            const agent = createContactAgent(webApiUrl, accessToken);
            const entity = await agent.createDefaultContactEntityAsync();
            entity.name = field("name") ?? f.company.name();
            const dept = field("department");
            if (dept) entity.department = dept;
            const orgNr = field("orgnr");
            if (orgNr) entity.orgNr = orgNr;
            const phone = field("phone");
            if (phone) entity.phones = [{ value: phone, description: "Work" }];
            const email = field("email");
            if (email) entity.emails = [{ value: email, description: "Work" }];
            const biz = pickRoundRobin(metadata.businesses, i);
            const cat = pickRoundRobin(metadata.categories, i);
            const countryId = Number(countryIdFromLocale(locale, metadata.countries));
            if (biz) entity.business = { id: biz.id };
            if (cat) entity.category = { id: cat.id };
            if (countryId) entity.country = { countryId };
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
              const projectCompanyIdx = i % companyIds.length;
              const projectContactId = companyIds[projectCompanyIdx];
              const members: ProjectMember[] = [];
              for (let j = 0; j < personIds.length; j++) {
                if (j % companyIds.length === projectCompanyIdx && personIds[j]) {
                  members.push({ personId: personIds[j], contactId: projectContactId, projectId });
                }
              }
              if (members.length) {
                try {
                  await agent.addProjectMembersAsync(projectId, members);
                } catch {
                  // Non-fatal
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

          throw new Error(`Unknown builtin entity type: ${entityType}`);
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
            message: `${entityDef.name} [${batchIndex}]: ${(result.reason as Error).message}`
          };
        }
      }

      yield { type: "batch_done", entityType: entityDef.name, batchIndex, inserted: batchInserted };
      batchIndex++;
    }

    // Store under entity name for FK references, and also under builtinType for system column lookups
    insertedIds.set(entityDef.name, phaseIds);
    if (entityDef.builtinType && entityDef.builtinType !== entityDef.name) {
      insertedIds.set(entityDef.builtinType, phaseIds);
    }
    yield { type: "phase_done", entityType: entityDef.name, success: phaseIds.length, failed: quantity - phaseIds.length };

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
  entity: EntityDefinition,
  schema: EntitySchema,
  ctx: InsertContext
): Record<string, string> {
  const f = buildFaker(ctx.locale);
  const row: Record<string, string> = {};

  for (const fieldRule of entity.fields) {
    const dbColumn = schema.fieldMap[fieldRule.field] ?? fieldRule.field;
    if (schema.columns.includes(dbColumn)) {
      row[dbColumn] = applyFieldRule(fieldRule, f, ctx);
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
  locale: string,
  rowIndexOffset = 0
): Promise<void> {
  for (const config of secondaryConfigs) {
    const allData: string[][] = [];
    for (let i = 0; i < rowObjects.length; i++) {
      const parentId = parentIds[i];
      if (!parentId) continue;
      const ctx: InsertContext = { insertedIds, metadata, rowIndex: rowIndexOffset + i, locale };
      allData.push(...config.buildRows(rowObjects[i], parentId, ctx));
    }
    if (!allData.length) continue;

    await batchInsert(agent, config.table, config.columns, allData);
  }
}

/**
 * Handles declarative SecondaryTableDef entries from an EntityDefinition.
 * Generates rows for each secondary table using its own field rules,
 * injecting the parent FK automatically.
 */
async function insertDeclarativeSecondaryRows(
  agent: ReturnType<typeof createDatabaseTableAgent>,
  entity: EntityDefinition,
  parentIds: number[],
  insertedIds: Map<string, number[]>,
  metadata: ReturnType<typeof getMetadata> extends Promise<infer T> ? T : never,
  locale: string,
  rowIndexOffset = 0
): Promise<void> {
  for (const stDef of entity.secondaryTables ?? []) {
    // do not insert primary key column; it will be auto-generated. parent FK column must be included and is expected to be named "ParentId" or similar.
    const columns = [stDef.parentFkColumn, ...stDef.fields.map((f) => f.field)];
    const allData: string[][] = [];

    for (let i = 0; i < parentIds.length; i++) {
      const parentId = parentIds[i];
      if (!parentId) continue;
      const ctx: InsertContext = { insertedIds, metadata, rowIndex: rowIndexOffset + i, locale };
      const f = buildFaker(locale);
      const rowValues: string[] = [
        // do not insert primary key column; it will be auto-generated. 
        // "0",               // primary key — triggers INSERT
        String(parentId)   // parent FK
      ];
      for (const fieldRule of stDef.fields) {
        rowValues.push(applyFieldRule(fieldRule, f, ctx));
      }
      allData.push(rowValues);
    }

    if (!allData.length) continue;
    await batchInsert(agent, stDef.tableName, columns, allData);
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
  const sortedEntities = topoSort(template.entities);

  for (const entityDef of sortedEntities) {
    const schema = resolveSchema(entityDef);
    const localePool = buildLocalePool(manifest.locales, entityDef.localeFallbacks);

    // Counts are per-company for all dependent entity types.
    const companyIds = insertedIds.get("company") ?? [];
    const baseQuantity = manifest.requestedCounts[entityDef.name] ?? entityDef.quantityDefault;
    const companyCount = companyIds.length;
    const isCompany = entityDef.builtinType === "company";
    const quantity = isCompany || companyCount === 0
      ? baseQuantity
      : baseQuantity * companyCount;
    if (quantity <= 0) continue;

    yield { type: "phase_start", entityType: entityDef.name, total: quantity };

    const rowObjects: Record<string, string>[] = [];
    for (let i = 0; i < quantity; i++) {
      const locale = localePool[Math.floor(Math.random() * localePool.length)];
      const ctx: InsertContext = { insertedIds, metadata, rowIndex: i, locale };
      rowObjects.push(generateSingleRow(entityDef, schema, ctx));
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
        yield { type: "batch_done", entityType: entityDef.name, batchIndex, inserted: ids.length };

        // Imperative secondary tables (from EntitySchema — builtin entities)
        if (schema.secondaryTables?.length) {
          const batchLocale = localePool[Math.floor(Math.random() * localePool.length)];
          await insertSecondaryRows(agent, schema.secondaryTables, batchObjects, ids, metadata, insertedIds, batchLocale, batchStart);
        }

        // Declarative secondary tables (from EntityDefinition — custom + template-defined)
        if (entityDef.secondaryTables?.length) {
          const batchLocale = localePool[Math.floor(Math.random() * localePool.length)];
          await insertDeclarativeSecondaryRows(agent, entityDef, ids, insertedIds, metadata, batchLocale, batchStart);
        }
      } catch (err) {
        const detail = (err as { response?: { data?: unknown } }).response?.data
          ? JSON.stringify((err as { response: { data: unknown } }).response.data)
          : (err as Error).message;
        yield { type: "error", message: `${entityDef.name} batch ${batchIndex}: ${detail}` };
      }
    }

    // Store under entity name for FK references; also under builtinType for system column lookups
    insertedIds.set(entityDef.name, phaseIds);
    if (entityDef.builtinType && entityDef.builtinType !== entityDef.name) {
      insertedIds.set(entityDef.builtinType, phaseIds);
    }
    yield { type: "phase_done", entityType: entityDef.name, success: phaseIds.length, failed: quantity - phaseIds.length };

    if (isCompany && phaseIds.length === 0) {
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
