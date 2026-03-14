export type LocaleCode = string;

export interface EnvironmentBundle {
  id: string;
  name: string;
  tenantId: string;
  clientId: string;
  scopes: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

export interface TemplateFieldRule {
  field: string;
  strategy: "static" | "faker" | "list" | "sequence";
  value?: string;
  fakerPath?: string;
  list?: string[];
}

export interface TemplateEntitySettings {
  entityType: "company" | "contact" | "followUp" | "project" | "sale";
  quantityDefault: number;
  localeFallbacks: LocaleCode[];
  fields: TemplateFieldRule[];
}

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  entities: TemplateEntitySettings[];
  createdBy: string;
  updatedAt: string;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface JobMetricSummary {
  total: number;
  success: number;
  failed: number;
  durationSeconds: number;
}

export interface JobItemLog {
  id: string;
  entityType: TemplateEntitySettings["entityType"];
  payload: Record<string, unknown>;
  status: "success" | "failed";
  superOfficeId?: string;
  errorMessage?: string;
}

export type JobPhaseEvent =
  | { type: "phase_start"; entityType: string; total: number }
  | { type: "batch_done"; entityType: string; batchIndex: number; inserted: number }
  | { type: "phase_done"; entityType: string; success: number; failed: number }
  | { type: "job_done"; status: JobStatus; metrics: JobMetricSummary }
  | { type: "error"; message: string };

export type JobApiMode = "entity" | "massops";

export interface JobManifest {
  id: string;
  templateId: string;
  environmentId: string;
  locales: LocaleCode[];
  requestedCounts: Record<string, number>;
  apiMode: JobApiMode;
  status: JobStatus;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
  metrics: JobMetricSummary;
  items: JobItemLog[];
}

// NextAuth session augmentation — accessToken and webApiUrl added by JWT/session callbacks
declare module "next-auth" {
  interface Session {
    accessToken: string;
    webApiUrl: string;
  }
}

