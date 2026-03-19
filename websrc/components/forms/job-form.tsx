"use client";

import { useFormState } from "react-dom";
import { useState, useMemo } from "react";
import type { TemplateDefinition } from "@/lib/types";
import { createJobAction } from "@/app/actions";
import { LocalePicker } from "@/components/ui/locale-picker";

const initialState = { error: null as null | string | Record<string, string[]>, success: false };

function countsFromTemplate(template: TemplateDefinition | undefined): Record<string, string> {
  if (!template) return {};
  return Object.fromEntries(template.entities.map((e) => [e.name, String(e.quantityDefault)]));
}

interface JobFormProps {
  templates: TemplateDefinition[];
}

export function JobForm({ templates }: JobFormProps) {
  const [state, formAction] = useFormState(createJobAction, initialState);

  const firstTemplate = templates[0];
  const isDisabled = !templates.length;

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(firstTemplate?.id ?? "");
  const [counts, setCounts] = useState<Record<string, string>>(() => countsFromTemplate(firstTemplate));
  const [locales, setLocales] = useState<string[]>([]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId]
  );

  function handleTemplateChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setSelectedTemplateId(id);
    setCounts(countsFromTemplate(templates.find((t) => t.id === id)));
  }

  const countsJson = JSON.stringify(
    Object.fromEntries(
      Object.entries(counts)
        .filter(([, v]) => v !== "")
        .map(([k, v]) => [k, Number(v)])
    )
  );

  return (
    <form action={formAction} className="card space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Launch provisioning job</h3>
        <p className="text-sm text-slate-500">
          Jobs serialize manifests to encrypted JSON, then stream workloads to SuperOffice.WebApi.
        </p>
      </div>
      <div>
        <label className="text-sm font-medium text-slate-700">
          Template
          <select
            name="templateId"
            value={selectedTemplateId}
            onChange={handleTemplateChange}
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
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700 mb-1">Locales</p>
        <LocalePicker
          name="locales"
          value={locales}
          onChange={setLocales}
          disabled={isDisabled}
        />
      </div>
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
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">
          Entity counts
          <span className="ml-2 text-xs font-normal text-slate-400">
            — company is the total; all others are <strong>per company</strong>
          </span>
        </p>
        {selectedTemplate && selectedTemplate.entities.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {selectedTemplate.entities.map((entity) => (
              <label key={entity.name} className="text-sm font-medium text-slate-700">
                {entity.name}{entity.name !== "company" ? " / co." : ""}
                <input
                  type="number"
                  min={1}
                  disabled={isDisabled}
                  value={counts[entity.name] ?? ""}
                  onChange={(e) => setCounts((prev) => ({ ...prev, [entity.name]: e.target.value }))}
                  placeholder="skip"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </label>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">Select a template to configure counts.</p>
        )}
        <input type="hidden" name="countsJson" value={countsJson} />
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
