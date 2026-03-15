"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enqueueJob, saveTemplate, updateTemplate, deleteTemplate, deleteJob } from "@/lib/services";

const templateSchema = z.object({
  name: z.string().min(3),
  description: z.string().min(5),
  entities: z.array(
    z.object({
      entityType: z.enum(["company", "contact", "followUp", "project", "sale"]),
      quantityDefault: z.number().int().min(1),
      localeFallbacks: z.array(z.string().min(2)),
      fields: z.array(
        z.object({
          field: z.string(),
          strategy: z.enum(["static", "faker", "list", "sequence"]),
          value: z.string().optional(),
          fakerPath: z.string().optional(),
          list: z.array(z.string()).optional()
        })
      )
    })
  )
});

const jobSchema = z.object({
  templateId: z.string(),
  locales: z.array(z.string()).optional(),
  counts: z.record(z.string(), z.coerce.number().int().min(1)).optional(),
  apiMode: z.enum(["entity", "massops"]).default("entity")
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

export async function createJobAction(
  _prev: { error: unknown; success: boolean },
  formData: FormData
) {
  const countsEntries = ["company", "contact", "followUp", "project", "sale"]
    .map((key) => {
      const raw = formData.get(`${key}Count`);
      if (!raw) return null;
      return [key, Number(raw)] as const;
    })
    .filter(Boolean) as [string, number][];

  const payload = jobSchema.safeParse({
    templateId: formData.get("templateId"),
    locales: String(formData.get("locales") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    counts: Object.fromEntries(countsEntries),
    apiMode: formData.get("apiMode") ?? "entity"
  });

  if (!payload.success) {
    return { error: payload.error.flatten().fieldErrors, success: false };
  }

  const manifest = await enqueueJob({
    templateId: payload.data.templateId,
    locales: payload.data.locales ?? [],
    counts: payload.data.counts ?? {},
    createdBy: "operator",
    apiMode: payload.data.apiMode
  });

  // Redirect to the job detail page where the SSE stream will start execution
  redirect(`/jobs/${manifest.id}`);
}
