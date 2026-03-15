"use client";

import { useState } from "react";

interface PreviewField {
  field: string;
  value: string;
}

interface PreviewEntity {
  entityType: string;
  locale: string;
  fields: PreviewField[];
}

const ENTITY_ICONS: Record<string, string> = {
  company: "🏢",
  contact: "👤",
  followUp: "📅",
  project: "📋",
  sale: "💰"
};

export function TemplatePreview({ templateId }: { templateId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PreviewEntity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/templates/${templateId}/preview`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json.entities);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (!data) load();
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={handleToggle}
        className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs text-violet-700 hover:bg-violet-100"
      >
        {open ? "Hide preview" : "Preview"}
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
          {loading && (
            <p className="text-xs text-slate-400">Generating sample…</p>
          )}
          {error && (
            <p className="text-xs text-rose-500">Failed to generate preview.</p>
          )}
          {data && !loading && (
            <div className="space-y-3">
              {data.map((entity) => (
                <div key={entity.entityType}>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                    <span>{ENTITY_ICONS[entity.entityType] ?? "📦"}</span>
                    <span>{entity.entityType}</span>
                    <span className="font-normal text-slate-400 ml-1">locale: {entity.locale}</span>
                  </p>
                  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
                    {entity.fields.map((f) => (
                      <>
                        <span key={`${f.field}-k`} className="text-xs text-slate-500">{f.field}</span>
                        <span key={`${f.field}-v`} className="truncate font-mono text-xs text-slate-800">{f.value}</span>
                      </>
                    ))}
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => { setData(null); load(); }}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                ↺ Refresh
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
