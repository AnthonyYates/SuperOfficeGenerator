import type { CachedMetadata } from "./metadata";
import type { TemplateEntitySettings } from "./types";

export type EntityType = TemplateEntitySettings["entityType"];

/** Context passed to system column factories when generating each row */
export interface InsertContext {
  /** Accumulated primary keys from previously inserted entity types */
  insertedIds: Map<string, number[]>;
  metadata: CachedMetadata;
  /** Row index within the current entity phase (0-based) */
  rowIndex: number;
}

/** Config for an additional table that must be populated per-parent-row */
export interface SecondaryTableConfig {
  table: string;
  columns: string[];
  /** Returns rows to insert for one parent row + its newly assigned primary key */
  buildRows: (
    parentRow: Record<string, string>,
    parentId: number,
    ctx: InsertContext
  ) => string[][];
}

export interface EntitySchema {
  /** Physical DB table name */
  table: string;
  /** Ordered list of column names passed to upsertAsync */
  columns: string[];
  /** Maps template field name → DB column name */
  fieldMap: Record<string, string>;
  /**
   * Columns that are always injected regardless of template fields.
   * Value is either a literal string or a factory receiving the context.
   */
  systemColumns: Record<string, string | ((ctx: InsertContext) => string)>;
  /** Additional tables to populate after the primary insert (e.g. phone/email for person) */
  secondaryTables?: SecondaryTableConfig[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pickRoundRobin(ids: number[], index: number): string {
  if (!ids.length) return "0";
  return String(ids[index % ids.length]);
}

function nowIso(): string {
  return new Date().toISOString();
}

function nowPlusHour(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const companySchema: EntitySchema = {
  table: "contact",
  columns: ["name", "business_idx", "category_idx", "country_id", "orgnr", "department"],
  fieldMap: {
    name: "name",
    business: "business_idx",
    category: "category_idx",
    country: "country_id",
    orgnr: "orgnr",
    department: "department"
  },
  systemColumns: {
    business_idx: (ctx) => String(ctx.metadata.businesses[0]?.id ?? 0),
    category_idx: (ctx) => String(ctx.metadata.categories[0]?.id ?? 0),
    country_id: (ctx) => String(ctx.metadata.countries.find((c) => c.twoLetterISOCountry === "US")?.id ?? ctx.metadata.countries[0]?.id ?? 0)
  }
};

const personSchema: EntitySchema = {
  table: "person",
  columns: ["firstname", "lastname", "contact_id", "title"],
  fieldMap: {
    firstName: "firstname",
    lastName: "lastname",
    title: "title"
  },
  systemColumns: {
    contact_id: (ctx) =>
      pickRoundRobin(ctx.insertedIds.get("company") ?? [], ctx.rowIndex)
  },
  secondaryTables: [
    {
      table: "phone",
      columns: ["contact_id", "person_id", "phone", "phonetype_idx", "rank"],
      buildRows: (parentRow, parentId, ctx) => {
        const phone = parentRow["phone"] ?? parentRow["mobile"];
        if (!phone) return [];
        const contactId = parentRow["contact_id"] ?? "0";
        return [[contactId, String(parentId), phone, "1", "1"]];
      }
    },
    {
      table: "email",
      columns: ["contact_id", "person_id", "email_address", "description", "rank"],
      buildRows: (parentRow, parentId, _ctx) => {
        const email = parentRow["email"];
        if (!email) return [];
        const contactId = parentRow["contact_id"] ?? "0";
        return [[contactId, String(parentId), email, "Work", "1"]];
      }
    }
  ]
};

const followUpSchema: EntitySchema = {
  table: "appointment",
  columns: ["contact_id", "person_id", "task_idx", "type", "startdate", "enddate", "activedate"],
  fieldMap: {
    title: "description",
    description: "description"
  },
  systemColumns: {
    contact_id: (ctx) =>
      pickRoundRobin(ctx.insertedIds.get("company") ?? [], ctx.rowIndex),
    person_id: (ctx) =>
      pickRoundRobin(ctx.insertedIds.get("contact") ?? [], ctx.rowIndex),
    task_idx: (ctx) => String(ctx.metadata.tasks[0]?.id ?? 0),
    type: () => "6", // appointment type 6 = follow-up
    startdate: () => nowIso(),
    enddate: () => nowPlusHour(),
    activedate: () => todayIso()
  }
};

const projectSchema: EntitySchema = {
  table: "project",
  columns: ["name", "type_idx", "status_idx", "number"],
  fieldMap: {
    name: "name",
    number: "number"
  },
  systemColumns: {
    type_idx: (ctx) => String(ctx.metadata.projectTypes[0]?.id ?? 0),
    status_idx: (ctx) => String(ctx.metadata.projectStatuses[0]?.id ?? 0)
  }
};

const saleSchema: EntitySchema = {
  table: "sale",
  columns: [
    "heading",
    "amount",
    "contact_id",
    "person_id",
    "project_id",
    "saletype_id",
    "source_id",
    "sale_date",
    "status"
  ],
  fieldMap: {
    heading: "heading",
    amount: "amount"
  },
  systemColumns: {
    contact_id: (ctx) =>
      pickRoundRobin(ctx.insertedIds.get("company") ?? [], ctx.rowIndex),
    person_id: (ctx) =>
      pickRoundRobin(ctx.insertedIds.get("contact") ?? [], ctx.rowIndex),
    project_id: (ctx) =>
      pickRoundRobin(ctx.insertedIds.get("project") ?? [], ctx.rowIndex),
    saletype_id: (ctx) => String(ctx.metadata.saleTypes[0]?.id ?? 0),
    source_id: (ctx) => String(ctx.metadata.sources[0]?.id ?? 0),
    sale_date: () => todayIso(),
    status: () => "1" // 1 = Open
  }
};

export const ENTITY_SCHEMAS: Record<EntityType, EntitySchema> = {
  company: companySchema,
  contact: personSchema, // "contact" entity type in templates = person in DB
  followUp: followUpSchema,
  project: projectSchema,
  sale: saleSchema
};

/** Execution order respecting foreign key dependencies */
export const ENTITY_EXECUTION_ORDER: EntityType[] = [
  "company",
  "contact",
  "project",
  "followUp",
  "sale"
];
