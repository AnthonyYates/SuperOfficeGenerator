export type LocaleCode = string;

export type BuiltinEntityType = "company" | "contact" | "followUp" | "project" | "sale";

// ---------------------------------------------------------------------------
// Field rules
// ---------------------------------------------------------------------------

/**
 * How a field value should be applied to the entity DTO.
 *   "string"         → set as a plain string value
 *   "integer"        → set as a plain string (engine parses where needed)
 *   "service-object" → wrap as { id: Number(value) } because the SDK expects a typed reference object
 */
export type EntityFieldCategory = "string" | "integer" | "service-object";

export interface TemplateFieldRule {
  field: string;
  strategy: "static" | "faker" | "list" | "sequence" | "fk" | "mdolist";
  // faker
  fakerPath?: string;
  // static
  value?: string;
  // list
  list?: string[];
  // fk — resolved from another entity that ran before this one
  fkEntity?: string;              // references EntityDefinition.name within the same template
  fkSelect?: "round-robin" | "random";
  // mdolist — picks a random item ID from a live SuperOffice MDO list
  listId?: number;                // numeric list ID from GET /api/v1/List catalog
  listType?: string;              // "udlist" = user-defined, anything else = built-in
  listName?: string;              // human-readable display name (stored for self-describing templates)
  // entity-agent mode field application hint — set when discovered from FieldProperties
  fieldCategory?: EntityFieldCategory;
}

// ---------------------------------------------------------------------------
// Secondary table — populated once per row of the owning entity
// ---------------------------------------------------------------------------

export interface SecondaryTableDef {
  tableName: string;
  primaryKey: string;
  parentFkColumn: string;   // column in THIS table that stores the parent row's PK
  fields: TemplateFieldRule[];
}

// ---------------------------------------------------------------------------
// Entity definition (v2 schema)
// ---------------------------------------------------------------------------

export interface EntityDefinition {
  name: string;                    // unique within the template; used for FK references
  builtinType?: BuiltinEntityType; // if set, tableName/PK resolved from ENTITY_SCHEMAS
  tableName?: string;              // required when builtinType is absent
  primaryKey?: string;             // required when builtinType is absent
  quantityDefault: number;
  localeFallbacks: LocaleCode[];
  dependsOn?: string[];            // entity names that must execute first (drives topo sort)
  fields: TemplateFieldRule[];
  secondaryTables?: SecondaryTableDef[];
}

// ---------------------------------------------------------------------------
// Legacy type — v1 templates stored before the EntityDefinition redesign.
// Kept for backwards-compatible normalisation in storage.ts only.
// ---------------------------------------------------------------------------

export interface TemplateEntitySettings {
  entityType: BuiltinEntityType;
  quantityDefault: number;
  localeFallbacks: LocaleCode[];
  fields: TemplateFieldRule[];
}

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  mode: "massops";
  entities: EntityDefinition[];
  /** 1 = legacy TemplateEntitySettings[], 2 = EntityDefinition[] */
  schemaVersion: number;
  createdBy: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface JobMetricSummary {
  total: number;
  success: number;
  failed: number;
  durationSeconds: number;
}

export interface JobItemLog {
  id: string;
  entityType: string;    // entity name — may be a builtin type or any custom name
  payload: Record<string, unknown>;
  status: "success" | "failed";
  superOfficeId?: number;
  errorMessage?: string;
}

export type JobPhaseEvent =
  | { type: "phase_start"; entityType: string; total: number }
  | { type: "batch_done"; entityType: string; batchIndex: number; inserted: number }
  | { type: "phase_done"; entityType: string; success: number; failed: number }
  | { type: "job_done"; status: JobStatus; metrics: JobMetricSummary }
  | { type: "error"; message: string };

export interface JobPhaseResult {
  success: number;
  failed: number;
}

export interface JobManifest {
  id: string;
  templateId: string;
  locales: LocaleCode[];
  requestedCounts: Record<string, number>;
  apiMode: "massops";
  status: JobStatus;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
  metrics: JobMetricSummary;
  items: JobItemLog[];
  /** Per-entity phase results persisted when the job completes */
  phases?: Record<string, JobPhaseResult>;
}

// NextAuth session augmentation — accessToken and webApiUrl added by JWT/session callbacks
declare module "next-auth" {
  interface Session {
    accessToken: string;
    webApiUrl: string;
  }
}
