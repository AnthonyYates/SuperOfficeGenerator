import "server-only";

import { buildFaker, runFakerPath, buildLocalePool } from "./faker";
import { getMetadata, prefetchMdoListItems } from "./metadata";
import {
  createDatabaseTableAgent,
  createDatabaseTableAgentWithTicket
} from "./superoffice-client";
import { getSystemUserTicket, extractEnv } from "./system-user";
import {
  resolveSchema,
  topoSort,
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
    case "mdolist": {
      const items = ctx.metadata.listItems.get(rule.listId ?? 0) ?? [];
      if (!items.length) return "0";
      return String(items[Math.floor(Math.random() * items.length)].id);
    }
    default:
      return "";
  }
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

// ─── MDO list prefetch ────────────────────────────────────────────────────────

/** Collects all unique mdolist rule descriptors from a template and prefetches their items. */
async function prefetchTemplateMdoLists(
  template: import("./types").TemplateDefinition,
  webApiUrl: string,
  accessToken: string
): Promise<void> {
  const rules: Array<{ listId: number; listType: string }> = [];
  for (const entity of template.entities) {
    for (const field of [...entity.fields, ...(entity.secondaryTables?.flatMap((st) => st.fields) ?? [])]) {
      if (field.strategy === "mdolist" && field.listId) {
        rules.push({ listId: field.listId, listType: field.listType ?? "" });
      }
    }
  }
  if (rules.length) {
    await prefetchMdoListItems(webApiUrl, accessToken, rules);
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
  await prefetchTemplateMdoLists(template, webApiUrl, accessToken);
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
  yield* executeWithMassOps(manifest, template, accessToken, webApiUrl, systemUserToken);
}
