"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { createTemplateAction, updateTemplateAction } from "@/app/actions";
import type { TemplateDefinition } from "@/lib/types";

const initialState = { error: null as null | string | Record<string, string[]>, success: false };

interface TemplateFormProps {
  template?: TemplateDefinition;
}

export function TemplateForm({ template }: TemplateFormProps = {}) {
  const serverAction = template ? updateTemplateAction : createTemplateAction;
  const [state, formAction] = useFormState(serverAction, initialState);

  const starter = JSON.stringify(
    {
      name: "Full Provisioning Template",
      description: "Companies, persons, projects, follow-ups, and sales with FK chaining.",
      entities: [
        {
          entityType: "company",
          quantityDefault: 10,
          localeFallbacks: ["en"],
          fields: [
            { field: "name", strategy: "faker", fakerPath: "company.name" },
            { field: "department", strategy: "faker", fakerPath: "commerce.department" },
            { field: "orgnr", strategy: "faker", fakerPath: "string.numeric" }
          ]
        },
        {
          entityType: "contact",
          quantityDefault: 20,
          localeFallbacks: ["en"],
          fields: [
            { field: "firstName", strategy: "faker", fakerPath: "person.firstName" },
            { field: "lastName", strategy: "faker", fakerPath: "person.lastName" },
            { field: "title", strategy: "faker", fakerPath: "person.jobTitle" },
            { field: "phone", strategy: "faker", fakerPath: "phone.number" },
            { field: "email", strategy: "faker", fakerPath: "internet.email" }
          ]
        },
        {
          entityType: "project",
          quantityDefault: 5,
          localeFallbacks: ["en"],
          fields: [
            { field: "name", strategy: "faker", fakerPath: "commerce.productName" },
            { field: "number", strategy: "faker", fakerPath: "string.alphanumeric" }
          ]
        },
        {
          entityType: "followUp",
          quantityDefault: 15,
          localeFallbacks: ["en"],
          fields: [
            { field: "title", strategy: "faker", fakerPath: "lorem.words" }
          ]
        },
        {
          entityType: "sale",
          quantityDefault: 10,
          localeFallbacks: ["en"],
          fields: [
            { field: "heading", strategy: "faker", fakerPath: "commerce.productName" },
            { field: "amount", strategy: "faker", fakerPath: "finance.amount" }
          ]
        }
      ]
    },
    null,
    2
  );

  const editJson = template
    ? JSON.stringify(
        { name: template.name, description: template.description, entities: template.entities },
        null,
        2
      )
    : null;

  return (
    <form action={formAction} className="card space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {template ? "Edit template" : "Create template"}
          </h3>
          <p className="text-sm text-slate-500">
            Templates capture entity definitions, faker rules, default quantities, and locale
            fallbacks.
          </p>
        </div>
        {template && (
          <Link
            href="/templates"
            className="shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-slate-300 hover:text-slate-700"
          >
            ✕ Cancel
          </Link>
        )}
      </div>
      {template && <input type="hidden" name="templateId" value={template.id} />}
      <textarea
        name="templateJson"
        defaultValue={editJson ?? starter}
        rows={14}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 font-mono text-xs text-slate-700 focus:border-brand focus:outline-none"
      />
      {state.error && (
        <p className="text-sm text-rose-600">
          {typeof state.error === "string" ? state.error : "Validation failed. Check JSON payload."}
        </p>
      )}
      {state.success && template && (
        <p className="text-sm text-emerald-600">Template updated successfully.</p>
      )}
      <button
        type="submit"
        className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
      >
        {template ? "Update template" : "Save template"}
      </button>
    </form>
  );
}
