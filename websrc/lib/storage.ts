import "server-only";

import { faker } from "@faker-js/faker";
import { prisma } from "./db";
import type {
  TemplateDefinition,
  EntityDefinition,
  TemplateEntitySettings,
  BuiltinEntityType,
  JobManifest,
  JobItemLog,
  JobMetricSummary,
  JobPhaseResult
} from "./types";

// ---------------------------------------------------------------------------
// JSON serialization helpers
// ---------------------------------------------------------------------------

function serialize<T>(value: T): string {
  return JSON.stringify(value);
}

function deserialize<T>(value: string): T {
  return JSON.parse(value) as T;
}

// ---------------------------------------------------------------------------
// v1 → v2 entity normalisation
// v1 templates stored entities as TemplateEntitySettings[] (entityType field).
// v2 templates store EntityDefinition[] (name + optional builtinType).
// ---------------------------------------------------------------------------

const BUILTIN_DEPENDS_ON: Record<BuiltinEntityType, string[]> = {
  company: [],
  contact: ["company"],
  project: ["company"],
  sale: ["company", "contact", "project"],
  followUp: ["company", "contact", "sale", "project"]
};

function normalizeEntities(
  raw: (TemplateEntitySettings | EntityDefinition)[],
  schemaVersion: number
): EntityDefinition[] {
  if (schemaVersion >= 2) return raw as EntityDefinition[];
  return (raw as TemplateEntitySettings[]).map((e) => ({
    name: e.entityType,
    builtinType: e.entityType,
    quantityDefault: e.quantityDefault,
    localeFallbacks: e.localeFallbacks,
    fields: e.fields,
    dependsOn: BUILTIN_DEPENDS_ON[e.entityType] ?? [],
    secondaryTables: []
  }));
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function rowToTemplate(row: {
  id: string;
  name: string;
  description: string;
  entities: string;
  schemaVersion: number;
  createdBy: string;
  updatedAt: Date;
}): TemplateDefinition {
  const rawEntities = deserialize<(TemplateEntitySettings | EntityDefinition)[]>(row.entities);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    entities: normalizeEntities(rawEntities, row.schemaVersion),
    schemaVersion: Math.max(row.schemaVersion, 2), // always expose as v2 after normalisation
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString()
  };
}

function rowToJob(row: {
  id: string;
  templateId: string;
  locales: string;
  requestedCounts: string;
  apiMode: string;
  status: string;
  createdBy: string;
  createdAt: Date;
  completedAt: Date | null;
  metrics: string;
  items: string;
  phases: string | null;
}): JobManifest {
  return {
    id: row.id,
    templateId: row.templateId,
    locales: deserialize<string[]>(row.locales),
    requestedCounts: deserialize<Record<string, number>>(row.requestedCounts),
    apiMode: row.apiMode as JobManifest["apiMode"],
    status: row.status as JobManifest["status"],
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    metrics: deserialize<JobMetricSummary>(row.metrics),
    items: deserialize<JobItemLog[]>(row.items),
    phases: row.phases ? deserialize<Record<string, JobPhaseResult>>(row.phases) : undefined
  };
}

// ---------------------------------------------------------------------------
// Seed data — stored as v2 EntityDefinition format
// ---------------------------------------------------------------------------

const seedTemplate: TemplateDefinition = {
  id: "tmpl-onboarding",
  name: "Onboarding Burst",
  description: "Creates demo company/contact/follow-up data for pilot tenants.",
  schemaVersion: 2,
  createdBy: "system",
  updatedAt: new Date().toISOString(),
  entities: [
    {
      name: "company",
      builtinType: "company",
      quantityDefault: 10,
      localeFallbacks: ["en", "nb"],
      dependsOn: [],
      fields: [
        { field: "name", strategy: "faker", fakerPath: "company.name" },
        { field: "phone", strategy: "faker", fakerPath: "phone.number" },
        { field: "email", strategy: "faker", fakerPath: "internet.email" }
      ],
      secondaryTables: []
    },
    {
      name: "contact",
      builtinType: "contact",
      quantityDefault: 15,
      localeFallbacks: ["en", "nb"],
      dependsOn: ["company"],
      fields: [
        { field: "firstName", strategy: "faker", fakerPath: "person.firstName" },
        { field: "lastName", strategy: "faker", fakerPath: "person.lastName" },
        { field: "mobile", strategy: "faker", fakerPath: "phone.number" }
      ],
      secondaryTables: []
    },
    {
      name: "followUp",
      builtinType: "followUp",
      quantityDefault: 5,
      localeFallbacks: ["en"],
      dependsOn: ["company", "contact"],
      fields: [
        { field: "title", strategy: "faker", fakerPath: "lorem.words" },
        { field: "description", strategy: "faker", fakerPath: "lorem.sentence" }
      ],
      secondaryTables: []
    }
  ]
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function readTemplates(): Promise<TemplateDefinition[]> {
  const rows = await prisma.template.findMany();
  if (rows.length === 0) {
    await prisma.template.upsert({
      where: { id: seedTemplate.id },
      create: {
        id: seedTemplate.id,
        name: seedTemplate.name,
        description: seedTemplate.description,
        entities: serialize(seedTemplate.entities),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        schemaVersion: seedTemplate.schemaVersion as any,
        createdBy: seedTemplate.createdBy,
        updatedAt: new Date(seedTemplate.updatedAt)
      },
      update: {}
    });
    return [seedTemplate];
  }
  return rows.map(rowToTemplate);
}

export async function writeTemplates(templates: TemplateDefinition[]): Promise<void> {
  await prisma.$transaction(
    templates.map((t) =>
      prisma.template.upsert({
        where: { id: t.id },
        create: {
          id: t.id,
          name: t.name,
          description: t.description,
          entities: serialize(t.entities),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          schemaVersion: t.schemaVersion as any,
          createdBy: t.createdBy,
          updatedAt: new Date(t.updatedAt)
        },
        update: {
          name: t.name,
          description: t.description,
          entities: serialize(t.entities),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          schemaVersion: t.schemaVersion as any,
          updatedAt: new Date(t.updatedAt)
        }
      })
    )
  );

  const ids = templates.map((t) => t.id);
  await prisma.template.deleteMany({ where: { id: { notIn: ids } } });
}

export async function readJobs(): Promise<JobManifest[]> {
  const rows = await prisma.job.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(rowToJob);
}

export async function writeJobs(jobs: JobManifest[]): Promise<void> {
  await prisma.$transaction(
    jobs.map((j) =>
      prisma.job.upsert({
        where: { id: j.id },
        create: {
          id: j.id,
          templateId: j.templateId,
          locales: serialize(j.locales),
          requestedCounts: serialize(j.requestedCounts),
          apiMode: j.apiMode,
          status: j.status,
          createdBy: j.createdBy,
          createdAt: new Date(j.createdAt),
          completedAt: j.completedAt ? new Date(j.completedAt) : null,
          metrics: serialize(j.metrics),
          items: serialize(j.items),
          phases: j.phases ? serialize(j.phases) : null
        },
        update: {
          status: j.status,
          completedAt: j.completedAt ? new Date(j.completedAt) : null,
          metrics: serialize(j.metrics),
          items: serialize(j.items),
          phases: j.phases ? serialize(j.phases) : null
        }
      })
    )
  );

  const ids = jobs.map((j) => j.id);
  await prisma.job.deleteMany({ where: { id: { notIn: ids } } });
}

export function newId(prefix: string): string {
  return `${prefix}-${faker.string.alphanumeric(10).toLowerCase()}`;
}
