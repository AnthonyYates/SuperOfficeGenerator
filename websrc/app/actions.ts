"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enqueueJob, saveEnvironment, saveTemplate, deleteEnvironment, deleteTemplate } from "@/lib/services";

const environmentSchema = z.object({
  name: z.string().min(3),
  tenantId: z.string().min(3),
  clientId: z.string().min(3),
  scopes: z.array(z.string().min(1)),
  isActive: z.boolean()
});

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
  environmentId: z.string(),
  locales: z.array(z.string()).optional(),
  counts: z.record(z.string(), z.coerce.number().int().min(1)).optional(),
  apiMode: z.enum(["entity", "massops"]).default("entity")
});

export async function createEnvironmentAction(
  _prev: { error: unknown; success: boolean },
  formData: FormData
) {
  const parsed = environmentSchema.safeParse({
    name: formData.get("name"),
    tenantId: formData.get("tenantId"),
    clientId: formData.get("clientId"),
    scopes: String(formData.get("scopes") ?? "")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
    isActive: formData.get("isActive") === "on"
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors, success: false };
  }

  await saveEnvironment({
    ...parsed.data,
    scopes: parsed.data.scopes,
    createdBy: "operator"
  });
  revalidatePath("/environments");
  return { error: null, success: true };
}

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

export async function deleteEnvironmentAction(formData: FormData) {
  const id = formData.get("id");
  if (typeof id === "string") {
    await deleteEnvironment(id);
  }
  revalidatePath("/environments");
}

export async function deleteTemplateAction(formData: FormData) {
  const id = formData.get("id");
  if (typeof id === "string") {
    await deleteTemplate(id);
  }
  revalidatePath("/templates");
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
    environmentId: formData.get("environmentId"),
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
    environmentId: payload.data.environmentId,
    locales: payload.data.locales ?? [],
    counts: payload.data.counts ?? {},
    createdBy: "operator",
    apiMode: payload.data.apiMode
  });

  // Redirect to the job detail page where the SSE stream will start execution
  redirect(`/jobs/${manifest.id}`);
}
