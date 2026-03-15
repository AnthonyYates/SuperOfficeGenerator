import "server-only";

import {
  readTemplates,
  writeTemplates,
  readJobs,
  writeJobs,
  newId
} from "./storage";
import type {
  JobManifest,
  JobStatus,
  TemplateDefinition
} from "./types";

export async function listTemplates() {
  return readTemplates();
}

export async function listJobs() {
  const jobs = await readJobs();
  return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveTemplate(
  input: Omit<TemplateDefinition, "id" | "updatedAt" | "createdBy">
) {
  const templates = await readTemplates();
  const template: TemplateDefinition = {
    ...input,
    id: newId("tmpl"),
    createdBy: "operator",
    updatedAt: new Date().toISOString()
  };
  templates.push(template);
  await writeTemplates(templates);
  return template;
}

export async function updateTemplate(
  id: string,
  input: Omit<TemplateDefinition, "id" | "updatedAt" | "createdBy">
) {
  const templates = await readTemplates();
  const idx = templates.findIndex((t) => t.id === id);
  if (idx < 0) throw new Error("Template not found");
  templates[idx] = {
    ...templates[idx],
    ...input,
    updatedAt: new Date().toISOString()
  };
  await writeTemplates(templates);
  return templates[idx];
}

export interface JobRequest {
  templateId: string;
  counts: Record<string, number>;
  locales: string[];
  createdBy: string;
  apiMode: JobManifest["apiMode"];
}

/** Creates a job manifest with status "queued" and persists it. Execution happens in the SSE route. */
export async function enqueueJob(request: JobRequest): Promise<JobManifest> {
  const templates = await readTemplates();
  const template = templates.find((t) => t.id === request.templateId);
  if (!template) {
    throw new Error("Template not found");
  }

  const jobs = await readJobs();
  const manifest: JobManifest = {
    id: newId("job"),
    templateId: template.id,
    locales: request.locales.length ? request.locales : collectTemplateLocales(template),
    requestedCounts: request.counts,
    apiMode: request.apiMode,
    status: "queued",
    createdBy: request.createdBy,
    createdAt: new Date().toISOString(),
    metrics: { total: 0, success: 0, failed: 0, durationSeconds: 0 },
    items: []
  };

  jobs.unshift(manifest);
  await writeJobs(jobs);
  return manifest;
}

export async function getJob(jobId: string): Promise<JobManifest | null> {
  const jobs = await readJobs();
  return jobs.find((job) => job.id === jobId) ?? null;
}

export async function getTemplate(templateId: string): Promise<TemplateDefinition | null> {
  const templates = await readTemplates();
  return templates.find((t) => t.id === templateId) ?? null;
}

export async function updateJobStatus(jobId: string, status: JobStatus): Promise<void> {
  const jobs = await readJobs();
  const job = jobs.find((j) => j.id === jobId);
  if (job) {
    job.status = status;
    await writeJobs(jobs);
  }
}

export async function patchJob(jobId: string, patch: Partial<JobManifest>): Promise<void> {
  const jobs = await readJobs();
  const idx = jobs.findIndex((j) => j.id === jobId);
  if (idx >= 0) {
    jobs[idx] = { ...jobs[idx], ...patch };
    await writeJobs(jobs);
  }
}

export async function deleteEnvironment(id: string): Promise<void> {
  // no-op: environments removed
  void id;
}

export async function deleteJob(id: string): Promise<void> {
  const jobs = await readJobs();
  await writeJobs(jobs.filter((j) => j.id !== id));
}

export async function deleteTemplate(id: string): Promise<void> {
  const templates = await readTemplates();
  await writeTemplates(templates.filter((t) => t.id !== id));
}

export async function summarizeDashboard() {
  const [templates, jobs] = await Promise.all([
    readTemplates(),
    readJobs()
  ]);
  const totalEntities = jobs.reduce((sum, job) => sum + job.metrics.total, 0);
  const success = jobs.reduce((sum, job) => sum + job.metrics.success, 0);
  return {
    templateCount: templates.length,
    jobCount: jobs.length,
    successRate: jobs.length === 0 ? 100 : Math.round((success / Math.max(totalEntities, 1)) * 100)
  };
}

function collectTemplateLocales(template: TemplateDefinition) {
  const set = new Set<string>();
  template.entities.forEach((entity) => entity.localeFallbacks.forEach((loc) => set.add(loc)));
  return [...set];
}
