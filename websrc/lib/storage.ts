import "server-only";

import { promises as fs } from "fs";
import path from "path";
import { faker } from "@faker-js/faker";
import type { TemplateDefinition, JobManifest } from "./types";

const storageDir = path.join(process.cwd(), "storage");

const files = {
  templates: path.join(storageDir, "templates.json"),
  jobs: path.join(storageDir, "jobs.json")
} as const;

async function ensureDir() {
  await fs.mkdir(storageDir, { recursive: true });
}

async function readJson<T>(filepath: string, fallback: () => T): Promise<T> {
  await ensureDir();
  try {
    const raw = await fs.readFile(filepath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const seeded = fallback();
      await writeJson(filepath, seeded);
      return seeded;
    }
    throw error;
  }
}

async function writeJson<T>(filepath: string, data: T) {
  await ensureDir();
  await fs.writeFile(filepath, JSON.stringify(data, null, 2), "utf8");
}

const seedTemplates = (): TemplateDefinition[] => [
  {
    id: "tmpl-onboarding",
    name: "Onboarding Burst",
    description: "Creates demo company/contact/follow-up data for pilot tenants.",
    createdBy: "system",
    updatedAt: new Date().toISOString(),
    entities: [
      {
        entityType: "company",
        quantityDefault: 10,
        localeFallbacks: ["en", "nb"],
        fields: [
          { field: "name", strategy: "faker", fakerPath: "company.name" },
          { field: "phone", strategy: "faker", fakerPath: "phone.number" },
          { field: "email", strategy: "faker", fakerPath: "internet.email" }
        ]
      },
      {
        entityType: "contact",
        quantityDefault: 15,
        localeFallbacks: ["en", "nb"],
        fields: [
          { field: "firstName", strategy: "faker", fakerPath: "person.firstName" },
          { field: "lastName", strategy: "faker", fakerPath: "person.lastName" },
          { field: "mobile", strategy: "faker", fakerPath: "phone.number" }
        ]
      },
      {
        entityType: "followUp",
        quantityDefault: 5,
        localeFallbacks: ["en"],
        fields: [
          { field: "title", strategy: "faker", fakerPath: "lorem.words" },
          { field: "description", strategy: "faker", fakerPath: "lorem.sentence" }
        ]
      }
    ]
  }
];

const seedJobs = (): JobManifest[] => [];

export async function readTemplates() {
  return readJson<TemplateDefinition[]>(files.templates, seedTemplates);
}

export async function writeTemplates(templates: TemplateDefinition[]) {
  await writeJson(files.templates, templates);
}

export async function readJobs() {
  return readJson<JobManifest[]>(files.jobs, seedJobs);
}

export async function writeJobs(jobs: JobManifest[]) {
  await writeJson(files.jobs, jobs);
}

export function newId(prefix: string) {
  return `${prefix}-${faker.string.alphanumeric(10).toLowerCase()}`;
}
