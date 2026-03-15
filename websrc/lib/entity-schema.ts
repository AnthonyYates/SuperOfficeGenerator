import type { CachedMetadata } from "./metadata";
import type { BuiltinEntityType, EntityDefinition, TemplateEntitySettings } from "./types";

export type EntityType = TemplateEntitySettings["entityType"];

/** Context passed to system column factories when generating each row */
export interface InsertContext {
  /** Accumulated primary keys from previously inserted entity types */
  insertedIds: Map<string, number[]>;
  metadata: CachedMetadata;
  /** Row index within the current entity phase (0-based) */
  rowIndex: number;
  /** Resolved locale for this entity's faker generation */
  locale: string;
}

/** Config for an additional table that must be populated per-parent-row */
export interface SecondaryTableConfig {
  table: string;
  /** Primary key column name for upsert keys parameter */
  primaryKey: string;
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
  /** Primary key column name — included in keys[] for upsertAsync; value "0" triggers INSERT */
  primaryKey: string;
  /** Ordered list of column names passed to upsertAsync (PK must be first) */
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns a deterministic weekday start time for a given row index.
 * Spreads appointments across the next 30 days, weekdays only, 08:00–16:45.
 * Using rowIndex as a seed means do_by / endDate / activeDate all agree for the same row.
 */
function businessStartFromIndex(rowIndex: number): Date {
  // Spread across 0-29 day offsets; exclude today's zero to start from tomorrow
  const rawDayOffset = ((rowIndex * 13) + 1) % 30;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + rawDayOffset);
  // Advance past Saturday (6) and Sunday (0)
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  // Hour: 8–16 (so a 1-hour meeting always ends by 17:00)
  const hour = 8 + ((rowIndex * 7) % 9);
  // Minute: 0, 15, 30, or 45
  const minute = ((rowIndex * 3) % 4) * 15;
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const companySchema: EntitySchema = {
  table: "contact",
  primaryKey: "contact_id",
  columns: ["contact_id", "name", "business_idx", "category_idx", "country_id", "orgnr", "department"],
  fieldMap: {
    name: "name",
    business: "business_idx",
    category: "category_idx",
    country: "country_id",
    orgnr: "orgnr",
    department: "department"
  },
  systemColumns: {
    contact_id: () => "0",
    business_idx: (ctx) => String(pickRoundRobin(ctx.metadata.businesses.map((b) => b.id), ctx.rowIndex) ?? 0),
    category_idx: (ctx) => String(pickRoundRobin(ctx.metadata.categories.map((c) => c.id), ctx.rowIndex) ?? 0),
    country_id: (ctx) => String(ctx.metadata.countries.find((c) => c.twoLetterISOCountry === "US")?.id ?? ctx.metadata.countries[0]?.id ?? 0)
  }
};

const personSchema: EntitySchema = {
  table: "person",
  primaryKey: "person_id",
  columns: [
    "person_id",
    "contact_id",
    "rank",
    "firstname",
    "lastname",
    "title",
    "country_id",
    "business_idx",
    "category_idx"
  ],
  fieldMap: {
    firstName: "firstname",
    lastName: "lastname",
    title: "title"
  },
  systemColumns: {
    person_id: () => "0",
    contact_id: (ctx) =>
      pickRoundRobin(ctx.insertedIds.get("company") ?? [], ctx.rowIndex),
    rank: (ctx) => {
      const companyCount = ctx.insertedIds.get("company")?.length ?? 1;
      return String(Math.floor(ctx.rowIndex / companyCount) + 1);
    },
    // Mirror the owning company's round-robin business/category/country so person
    // and company always share the same classification values for the same row index.
    country_id: (ctx) => String(ctx.metadata.countries.find((c) => c.twoLetterISOCountry === "US")?.id ?? ctx.metadata.countries[0]?.id ?? 0),
    business_idx: (ctx) => String(pickRoundRobin(ctx.metadata.businesses.map((b) => b.id), ctx.rowIndex) ?? 0),
    category_idx: (ctx) => String(pickRoundRobin(ctx.metadata.categories.map((c) => c.id), ctx.rowIndex) ?? 0)
  },
  secondaryTables: [
    {
      table: "phone",
      primaryKey: "phone_id",
      columns: ["phone_id", "contact_id", "person_id", "phone", "phonetype_idx", "rank"],
      buildRows: (parentRow, parentId, ctx) => {
        const phone = parentRow["phone"] ?? parentRow["mobile"];
        if (!phone) return [];
        const contactId = parentRow["contact_id"] ?? "0";
        return [["0", contactId, String(parentId), phone, "1", "1"]];
      }
    },
    {
      table: "email",
      primaryKey: "email_id",
      columns: ["email_id", "contact_id", "person_id", "email_address", "description", "rank"],
      buildRows: (parentRow, parentId, _ctx) => {
        const email = parentRow["email"];
        if (!email) return [];
        const contactId = parentRow["contact_id"] ?? "0";
        return [["0", contactId, String(parentId), email, "Work", "1"]];
      }
    }
  ]
};

const followUpSchema: EntitySchema = {
  table: "appointment",
  primaryKey: "appointment_id",
  columns: [
    "appointment_id",
    "contact_id",
    "person_id",
    "sale_id",
    "project_id",
    "associate_id",
    "group_idx",
    "task_idx",
    "type",
    "status",
    "done",
    "do_by",
    "endDate",
    "activeDate"
  ],
  fieldMap: {
    title: "description",
    description: "description"
  },
  systemColumns: {
    appointment_id: () => "0",
    contact_id: (ctx) =>
      pickRoundRobin(ctx.insertedIds.get("company") ?? [], ctx.rowIndex),
    person_id: (ctx) =>
      pickRoundRobin(ctx.insertedIds.get("contact") ?? [], ctx.rowIndex),
    sale_id: (ctx) =>
      pickRoundRobin(ctx.insertedIds.get("sale") ?? [], ctx.rowIndex),
    project_id: (ctx) =>
      pickRoundRobin(ctx.insertedIds.get("project") ?? [], ctx.rowIndex),
    associate_id: (ctx) => String(ctx.metadata.associateId),
    group_idx: (ctx) => String(ctx.metadata.groupId),
    task_idx: (ctx) => String(ctx.metadata.tasks[0]?.id ?? 0),
    type: () => "1", // appointment in diary
    status: () => "1", // 1 = Not started
    done: () => "1970-01-01T00:00:00.000Z", // zero datetime = not yet done
    do_by: (ctx) => businessStartFromIndex(ctx.rowIndex).toISOString(),
    endDate: (ctx) => {
      const d = businessStartFromIndex(ctx.rowIndex);
      d.setHours(d.getHours() + 1);
      return d.toISOString();
    },
    activeDate: (ctx) => businessStartFromIndex(ctx.rowIndex).toISOString().slice(0, 10)
  },
  secondaryTables: [
    {
      // Each appointment gets one invitee row (the contact person linked to the master).
      // slave row: mother_id = master appointment_id, type=6 (Booking/diary), status=5 (Booking),
      // associate_id=0 (external person — not a system user), invitedPersonId = person_id.
      table: "appointment",
      primaryKey: "appointment_id",
      columns: [
        "appointment_id", "contact_id", "person_id", "sale_id", "project_id",
        "associate_id", "group_idx", "task_idx",
        "type", "status", "done",
        "do_by", "endDate", "activeDate",
        "mother_id", "invitedPersonId"
      ],
      buildRows: (parentRow, parentId, _ctx) => {
        const personId = parentRow["person_id"];
        if (!personId || personId === "0") return [];
        return [[
          "0",                                  // appointment_id — triggers INSERT
          parentRow["contact_id"] ?? "0",       // contact_id
          personId,                             // person_id
          parentRow["sale_id"] ?? "0",          // sale_id
          parentRow["project_id"] ?? "0",       // project_id
          "0",                                  // associate_id — external (not an associate)
          "0",                                  // group_idx
          parentRow["task_idx"] ?? "0",         // task_idx — same task type as master
          "6",                                  // type = Booking, made for diary
          "5",                                  // status = Booking (pending acceptance)
          "1970-01-01T00:00:00.000Z",           // done = not done
          parentRow["do_by"] ?? "",             // do_by — same time slot as master
          parentRow["endDate"] ?? "",           // endDate
          parentRow["activeDate"] ?? "",        // activeDate
          String(parentId),                     // mother_id = master appointment_id
          personId                              // invitedPersonId
        ]];
      }
    }
  ]
};

const projectSchema: EntitySchema = {
  table: "project",
  primaryKey: "project_id",
  columns: ["project_id", "name", "type_idx", "status_idx", "project_number", "associate_id", "group_id"],
  fieldMap: {
    name: "name",
    number: "project_number"
  },
  systemColumns: {
    project_id: () => "0",
    type_idx: (ctx) => String(ctx.metadata.projectTypes[0]?.id ?? 0),
    status_idx: (ctx) => String(ctx.metadata.projectStatuses[0]?.id ?? 0),
    project_number: (ctx) => String(ctx.rowIndex + 1),
    associate_id: (ctx) => String(ctx.metadata.associateId),
    group_id: (ctx) => String(ctx.metadata.groupId)
  },
  secondaryTables: [
    {
      table: "projectmember",
      primaryKey: "projectmember_id",
      // Required columns per DB docs: projectmember_id, project_id, contact_id, person_id, rank, mtype_idx, text_id
      columns: ["projectmember_id", "project_id", "contact_id", "person_id", "rank", "mtype_idx", "text_id"],
      buildRows: (_parentRow, parentId, ctx) => {
        const companyIds = ctx.insertedIds.get("company") ?? [];
        const personIds = ctx.insertedIds.get("contact") ?? [];
        if (!companyIds.length || !personIds.length) return [];
        const companyCount = companyIds.length;
        // This project was assigned to the company at this round-robin index
        const projectCompanyIdx = ctx.rowIndex % companyCount;
        const projectContactId = String(companyIds[projectCompanyIdx]);
        const rows: string[][] = [];
        let rank = 1;
        for (let j = 0; j < personIds.length; j++) {
          // Person j was also assigned to company j % companyCount — match on same company
          if (j % companyCount === projectCompanyIdx) {
            rows.push([
              "0",                        // projectmember_id — triggers INSERT
              String(parentId),           // project_id
              projectContactId,           // contact_id (denormalised company FK)
              String(personIds[j]),       // person_id
              String(rank++),             // rank
              "3",                        // mtype_idx — default PMembType entry
              "0"                         // text_id — no comment
            ]);
          }
        }
        return rows;
      }
    }
  ]
};

const saleSchema: EntitySchema = {
  table: "sale",
  primaryKey: "sale_id",
  columns: [
    "sale_id",
    "heading",
    "amount",
    "contact_id",
    "person_id",
    "project_id",
    "saleType_id",
    "source_id",
    "saledate",
    "status",
    "probability_idx",
    "appointment_id",
    "associate_id",
    "group_idx"
  ],
  fieldMap: {
    heading: "heading",
    amount: "amount"
  },
  systemColumns: {
    sale_id: () => "0",
    contact_id: (ctx) =>
      pickRoundRobin(ctx.insertedIds.get("company") ?? [], ctx.rowIndex),
    person_id: (ctx) =>
      pickRoundRobin(ctx.insertedIds.get("contact") ?? [], ctx.rowIndex),
    project_id: (ctx) =>
      pickRoundRobin(ctx.insertedIds.get("project") ?? [], ctx.rowIndex),
    saleType_id: (ctx) => String(ctx.metadata.saleTypes[0]?.id ?? 0),
    source_id: (ctx) => String(ctx.metadata.sources[0]?.id ?? 0),
    saledate: () => todayIso(),
    status: () => "1", // 1 = Open
    probability_idx: (ctx) => String(ctx.metadata.defaultProbabilityId),
    appointment_id: () => "0",
    associate_id: (ctx) => String(ctx.metadata.associateId),
    group_idx: (ctx) => String(ctx.metadata.groupId)
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
  "sale",
  "followUp"
];

// ---------------------------------------------------------------------------
// Dynamic schema resolution (v2 entities)
// ---------------------------------------------------------------------------

/**
 * Returns an EntitySchema for the given EntityDefinition.
 * - Builtin types: returns the corresponding ENTITY_SCHEMAS entry, merging any
 *   declarative secondaryTables from the template definition on top.
 * - Custom types: builds a minimal EntitySchema from tableName / primaryKey / fields.
 */
export function resolveSchema(entity: EntityDefinition): EntitySchema {
  if (entity.builtinType) {
    const base = ENTITY_SCHEMAS[entity.builtinType as BuiltinEntityType];
    if (!base) throw new Error(`Unknown builtin entity type: ${entity.builtinType}`);
    if (!entity.secondaryTables?.length) return base;
    // Merge declarative secondary tables from the template definition
    const declarativeSecondary = entity.secondaryTables.map((st) => ({
      table: st.tableName,
      primaryKey: st.primaryKey,
      columns: [st.primaryKey, st.parentFkColumn, ...st.fields.map((f) => f.field)],
      buildRows: () => [] as string[][] // declarative rows handled separately in mass-ops
    } satisfies SecondaryTableConfig));
    return {
      ...base,
      secondaryTables: [...(base.secondaryTables ?? []), ...declarativeSecondary]
    };
  }

  // Custom entity — build schema from EntityDefinition metadata
  if (!entity.tableName || !entity.primaryKey) {
    throw new Error(`Custom entity "${entity.name}" is missing tableName or primaryKey`);
  }
  const columns = [entity.primaryKey, ...entity.fields.map((f) => f.field)];
  const fieldMap: Record<string, string> = {};
  for (const f of entity.fields) fieldMap[f.field] = f.field;

  return {
    table: entity.tableName,
    primaryKey: entity.primaryKey,
    columns,
    fieldMap,
    systemColumns: { [entity.primaryKey]: () => "0" }
  };
}

// ---------------------------------------------------------------------------
// Topological sort
// ---------------------------------------------------------------------------

/**
 * Returns entities sorted so that every entity appears after all of its
 * dependsOn entries. Throws on cycles.
 */
export function topoSort(entities: EntityDefinition[]): EntityDefinition[] {
  const byName = new Map(entities.map((e) => [e.name, e]));
  const result: EntityDefinition[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function visit(name: string) {
    if (visited.has(name)) return;
    if (inStack.has(name)) throw new Error(`Cycle detected in entity dependencies: ${name}`);
    inStack.add(name);
    const entity = byName.get(name);
    if (entity) {
      for (const dep of entity.dependsOn ?? []) {
        if (byName.has(dep)) visit(dep);
      }
      result.push(entity);
    }
    inStack.delete(name);
    visited.add(name);
  }

  for (const entity of entities) visit(entity.name);
  return result;
}
