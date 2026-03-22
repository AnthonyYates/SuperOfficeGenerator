"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enqueueJob, saveTemplate, updateTemplate, deleteTemplate, deleteJob, duplicateTemplate } from "@/lib/services";

// Columns automatically injected by the execution engine for each builtin entity type.
// Users must not define field rules for these columns — the engine sets them and duplicates cause job errors.
const SYSTEM_COLUMNS: Record<string, string[]> = {
  company:  ["contact_id", "business_idx", "category_idx", "country_id"],
  contact:  ["person_id", "contact_id", "rank", "country_id", "business_idx", "category_idx"],
  followUp: ["appointment_id", "contact_id", "person_id", "sale_id", "project_id", "associate_id", "group_idx", "task_idx", "type", "status", "done", "do_by", "endDate", "activeDate"],
  project:  ["project_id", "type_idx", "status_idx", "project_number", "associate_id", "group_id"],
  sale:     ["sale_id", "contact_id", "person_id", "project_id", "saleType_id", "source_id", "saledate", "status", "probability_idx", "appointment_id", "associate_id", "group_idx"]
};

function checkSystemColumnConflicts(
  entities: Array<{ name: string; builtinType?: string; fields: Array<{ field: string }> }>
): string | null {
  for (const entity of entities) {
    if (!entity.builtinType) continue;
    const sysColumns = SYSTEM_COLUMNS[entity.builtinType] ?? [];
    for (const f of entity.fields) {
      if (sysColumns.includes(f.field)) {
        return `"${f.field}" on entity "${entity.name}" is managed automatically — remove it from your fields.`;
      }
    }
  }
  return null;
}

const fieldRuleSchema = z.object({
  field: z.string().min(1),
  strategy: z.enum(["static", "faker", "list", "sequence", "fk", "mdolist"]),
  value: z.string().optional(),
  fakerPath: z.string().optional(),
  list: z.array(z.string()).optional(),
  fkEntity: z.string().optional(),
  fkSelect: z.enum(["round-robin", "random"]).optional(),
  listId: z.number().int().optional(),
  listType: z.string().optional(),
  listName: z.string().optional(),
  fieldCategory: z.enum(["string", "integer", "service-object"]).optional()
});

const secondaryTableSchema = z.object({
  tableName: z.string().min(1),
  primaryKey: z.string().min(1),
  parentFkColumn: z.string().min(1),
  fields: z.array(fieldRuleSchema)
});

const templateSchema = z.object({
  name: z.string().min(3),
  description: z.string().min(5),
  mode: z.enum(["entity", "massops"]).default("entity"),
  schemaVersion: z.number().int().default(2),
  entities: z.array(
    z.object({
      name: z.string().min(1),
      builtinType: z.enum(["company", "contact", "followUp", "project", "sale"]).optional(),
      tableName: z.string().optional(),
      primaryKey: z.string().optional(),
      quantityDefault: z.number().int().min(1),
      localeFallbacks: z.array(z.string().min(2)),
      dependsOn: z.array(z.string()).optional(),
      fields: z.array(fieldRuleSchema),
      secondaryTables: z.array(secondaryTableSchema).optional()
    })
  )
});

const jobSchema = z.object({
  templateId: z.string(),
  locales: z.array(z.string()).optional(),
  counts: z.record(z.string(), z.coerce.number().int().min(1)).optional()
});

export async function createTemplateAction(
  _prev: { error: unknown; success: boolean },
  formData: FormData
) {
  const raw = formData.get("templateJson");
  if (typeof raw !== "string") {
    return { error: "Template payload missing", success: false };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return { error: `Invalid JSON: ${(error as Error).message}`, success: false };
  }

  const parsed = templateSchema.safeParse(json);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors, success: false };
  }

  const conflict = checkSystemColumnConflicts(parsed.data.entities);
  if (conflict) return { error: conflict, success: false };

  await saveTemplate(parsed.data);
  revalidatePath("/templates");
  return { error: null, success: true };
}

export async function updateTemplateAction(
  _prev: { error: unknown; success: boolean },
  formData: FormData
) {
  const id = formData.get("templateId");
  const raw = formData.get("templateJson");
  if (typeof id !== "string" || typeof raw !== "string") {
    return { error: "Template payload missing", success: false };
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    return { error: `Invalid JSON: ${(error as Error).message}`, success: false };
  }

  const parsed = templateSchema.safeParse(json);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors, success: false };
  }

  const conflict = checkSystemColumnConflicts(parsed.data.entities);
  if (conflict) return { error: conflict, success: false };

  await updateTemplate(id, parsed.data);
  revalidatePath("/templates");
  return { error: null, success: true };
}

export async function deleteTemplateAction(formData: FormData) {
  const id = formData.get("id");
  if (typeof id === "string") {
    await deleteTemplate(id);
  }
  revalidatePath("/templates");
}

export async function deleteJobAction(formData: FormData) {
  const id = formData.get("id");
  if (typeof id === "string") {
    await deleteJob(id);
  }
  revalidatePath("/jobs");
}

export async function duplicateTemplateAction(formData: FormData) {
  const id = formData.get("id");
  if (typeof id === "string") {
    await duplicateTemplate(id);
  }
  revalidatePath("/templates");
}

export async function createJobAction(
  _prev: { error: unknown; success: boolean },
  formData: FormData
) {
  const rawCounts = formData.get("countsJson");
  let counts: Record<string, number> = {};
  if (typeof rawCounts === "string" && rawCounts) {
    try {
      counts = JSON.parse(rawCounts) as Record<string, number>;
    } catch {
      // ignore — empty counts is fine
    }
  }

  const payload = jobSchema.safeParse({
    templateId: formData.get("templateId"),
    locales: String(formData.get("locales") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    counts
  });

  if (!payload.success) {
    return { error: payload.error.flatten().fieldErrors, success: false };
  }

  const manifest = await enqueueJob({
    templateId: payload.data.templateId,
    locales: payload.data.locales ?? [],
    counts: payload.data.counts ?? {},
    createdBy: "operator"
  });

  // Redirect to the job detail page where the SSE stream will start execution
  redirect(`/jobs/${manifest.id}`);
}
