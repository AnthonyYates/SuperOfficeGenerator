/**
 * SuperOffice database dictionary model types and helpers.
 *
 * The API returns a deflate-raw compressed, base64-encoded JSON payload.
 * The JSON uses Newtonsoft.Json $id/$ref reference tracking to handle
 * circular references. Use buildRefMap + resolve to dereference.
 *
 * Promoted from research/query-database-model/DataModels.ts + test.ts.
 */

// ── Reference tracking ────────────────────────────────────────────────────────

export interface JsonReference {
  "$ref": string;
}

export type Ref<T> = T | JsonReference;

export function isRef(value: unknown): value is JsonReference {
  return typeof value === "object" && value !== null && "$ref" in value;
}

export function buildRefMap(root: unknown, map = new Map<string, unknown>()): Map<string, unknown> {
  if (!root || typeof root !== "object") return map;
  if (Array.isArray(root)) {
    for (const item of root) buildRefMap(item, map);
    return map;
  }
  const obj = root as Record<string, unknown>;
  if (typeof obj["$id"] === "string") map.set(obj["$id"], obj);
  for (const value of Object.values(obj)) buildRefMap(value, map);
  return map;
}

export function resolve<T>(ref: Ref<T>, map: Map<string, unknown>): T | undefined {
  return isRef(ref) ? (map.get(ref["$ref"]) as T | undefined) : ref;
}

// ── Shared ────────────────────────────────────────────────────────────────────

export interface AdditionalValues {
  "$id": string;
  [key: string]: unknown;
}

// ── DictionaryStep ────────────────────────────────────────────────────────────

export interface DictionaryStep {
  "$id": string;
  Name: string;
  StepNumber: number;
  Description: string | null;
  State: number;
}

// ── FieldRelation ─────────────────────────────────────────────────────────────

export interface FieldRelation {
  "$id": string;
  FromForeignKey: Ref<Field>;
  ToPrimaryKey: Ref<Field>;
}

// ── Field ─────────────────────────────────────────────────────────────────────

export interface Field {
  "$id": string;
  Table: Ref<Table>;
  Name: string;
  Description: string | null;
  CppName: string;
  NsName: string;
  /**
   * Data type discriminator.
   * Common values: 0 = Int, 1 = Id (FK/PK), 4 = UInt, 6 = Short,
   * 9 = UShort, 11 = String, 14 = DateTime
   */
  Type: number;
  Search: number;
  Hash: number;
  Sentry: number;
  NotNull: boolean;
  MaxLength: number;
  DefaultValue: string | null;
  EnumName: string | null;
  IsCsVirtual: boolean;
  CsLangHide: boolean;
  CsLangName: string | null;
  CsLangArray: string | null;
  CsMetaIndexName: string | null;
  CsMetaIsFulltext: boolean;
  CsMetaSubFields: string | null;
  Relation: Ref<FieldRelation> | null;
  OwnedBySuperOffice: boolean;
  Privacy: string;
  TimeZoneInterpretation: number;
  Created: Ref<DictionaryStep>;
  Updated: Ref<DictionaryStep> | null;
  AdditionalValues: AdditionalValues;
}

// ── TableIndex ────────────────────────────────────────────────────────────────

export interface TableIndex {
  "$id": string;
  Fields: Ref<Field>[];
  IsUnique: boolean;
  IsClustered: boolean;
  IsFulltext: boolean;
  Created: Ref<DictionaryStep>;
  Updated: Ref<DictionaryStep> | null;
  AdditionalValues: AdditionalValues;
}

// ── Table ─────────────────────────────────────────────────────────────────────

export interface Table {
  "$id": string;
  Database: Ref<Database>;
  Name: string;
  Description: string | null;
  CppName: string;
  NsName: string;
  MDO: number;
  HDB: number;
  Udef: number;
  Sentry: number;
  Replication: number;
  CsLanguage: string | null;
  DisplayField: string | null;
  RawDisplayField: string | null;
  NoPreviewPane: boolean;
  CanHaveCsExtraFields: boolean;
  CsDirectAccess: boolean;
  HasVisibleFor: boolean;
  OwnedBySuperOffice: boolean;
  HasAutoIncrementPK: boolean;
  BulkImportFacade: boolean;
  Privacy: string;
  Fields: Ref<Field>[];
  PhysicalFields: Ref<Field>[];
  Indexes: TableIndex[];
  TableNumber: number;
  DefaultTimeZoneInterpretation: number;
  Created: Ref<DictionaryStep>;
  Updated: Ref<DictionaryStep> | null;
  AdditionalValues: AdditionalValues;
}

// ── Database ──────────────────────────────────────────────────────────────────

export interface Database {
  "$id": string;
  DictionarySteps: DictionaryStep[];
  Tables: Table[];
  NextTableNumber: number;
}

// ── Decompression ─────────────────────────────────────────────────────────────

export async function unzipString(zipBytes: Uint8Array): Promise<string> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(zipBytes as Uint8Array<ArrayBuffer>);
  writer.close();

  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const decompressed = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    decompressed.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder("utf-8").decode(decompressed);
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface DbModelField {
  name: string;
  type: number;
  description: string | null;
}

export interface DbModelTable {
  name: string;
  primaryKey: string;
  fields: DbModelField[];
}

// ── Allowed-list filtering ────────────────────────────────────────────────────

/**
 * Tables excluded from the mass-ops picker.
 * These are internal system/infrastructure tables that should not be targeted
 * by bulk insert operations. Extend this set as needed.
 */
export const BLOCKED_TABLES = new Set([
  "sequence",
  "sequences",
  "dictionarystep",
  "dictionarybase",
  "freetextindex",
  "freetextwords",
  "freetextmatch",
  "freetextdocwords",
  "travelcurrent",
  "traveltransactionlog",
  "travelgenerateddatabase",
  "syslogininfo",
  "sysevent",
  "sysconfig",
  "systemconfig",
  "lockinglog",
  "loggeddebug",
  "diagnostics",
  "countervalue",
  "modifiedfields",
  "cacheinvalidation",
]);

function findPrimaryKeyName(table: Table, refMap: Map<string, unknown>): string {
  for (const fieldOrRef of table.PhysicalFields) {
    const field = resolve(fieldOrRef, refMap);
    if (field && field.Type === 1) return field.Name;
  }
  // Fallback: first physical field name
  const first = resolve(table.PhysicalFields[0], refMap);
  return first?.Name ?? "id";
}

/**
 * Resolves and flattens a Database into a filtered list of DbModelTable.
 * Removes tables in the blocklist and strips virtual/computed fields.
 */
export function flattenTables(
  db: Database,
  refMap: Map<string, unknown>,
  blocklist: Set<string> = BLOCKED_TABLES
): DbModelTable[] {
  const result: DbModelTable[] = [];
  for (const tableOrRef of db.Tables) {
    const table = resolve(tableOrRef, refMap);
    if (!table) continue;
    if (blocklist.has(table.Name.toLowerCase())) continue;

    const fields: DbModelField[] = [];
    for (const fieldOrRef of table.PhysicalFields) {
      const field = resolve(fieldOrRef, refMap);
      if (!field || field.IsCsVirtual) continue;
      fields.push({ name: field.Name, type: field.Type, description: field.Description });
    }

    result.push({
      name: table.Name,
      primaryKey: findPrimaryKeyName(table, refMap),
      fields
    });
  }
  return result;
}
