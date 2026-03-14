"use client";

import { useFormState } from "react-dom";
import type { EnvironmentBundle, TemplateDefinition } from "@/lib/types";
import { createJobAction } from "@/app/actions";

const initialState = { error: null as null | string | Record<string, string[]>, success: false };

interface JobFormProps {
  environments: EnvironmentBundle[];
  templates: TemplateDefinition[];
}

export function JobForm({ environments, templates }: JobFormProps) {
  const [state, formAction] = useFormState(createJobAction, initialState);

  const firstTemplate = templates[0];
  const isDisabled = !environments.length || !templates.length;

  return (
    <form action={formAction} className="card space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Launch provisioning job</h3>
        <p className="text-sm text-slate-500">
          Jobs serialize manifests to encrypted JSON, then stream workloads to SuperOffice.WebApi.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Template
          <select
            name="templateId"
            disabled={isDisabled}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Environment
          <select
            name="environmentId"
            disabled={isDisabled}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          >
            {environments.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="text-sm font-medium text-slate-700">
        Locales (comma separated)
        <input
          name="locales"
          disabled={isDisabled}
          placeholder={(firstTemplate?.entities[0]?.localeFallbacks ?? ["en"]).join(", ")}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </label>
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">API mode</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 has-[:checked]:border-brand has-[:checked]:bg-brand/5">
            <input
              type="radio"
              name="apiMode"
              value="entity"
              defaultChecked
              disabled={isDisabled}
              className="mt-0.5 accent-brand"
            />
            <div>
              <p className="text-sm font-semibold text-slate-900">Entity agents</p>
              <p className="text-xs text-slate-500">
                Creates each record via ContactAgent / PersonAgent etc. Works with any OIDC token.
              </p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 has-[:checked]:border-brand has-[:checked]:bg-brand/5">
            <input
              type="radio"
              name="apiMode"
              value="massops"
              disabled={isDisabled}
              className="mt-0.5 accent-brand"
            />
            <div>
              <p className="text-sm font-semibold text-slate-900">Mass operations</p>
              <p className="text-xs text-slate-500">
                Bulk-inserts via DatabaseTableAgent in 500-row batches. Requires System Design
                access.
              </p>
            </div>
          </label>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {(["company", "contact", "followUp", "project", "sale"] as const).map((key) => (
          <label key={key} className="text-sm font-medium text-slate-700">
            {key} count
            <input
              name={`${key}Count`}
              type="number"
              min={1}
              disabled={isDisabled}
              defaultValue={firstTemplate?.entities.find((e) => e.entityType === key)?.quantityDefault ?? ""}
              placeholder="skip"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </label>
        ))}
      </div>
      {state.error && (
        <p className="text-sm text-rose-600">
          {typeof state.error === "string" ? state.error : "Validation failed. Check form inputs."}
        </p>
      )}
      <button
        type="submit"
        disabled={isDisabled}
        className="w-full rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        Start job
      </button>
    </form>
  );
}
