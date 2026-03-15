import Link from "next/link";
import { TemplateForm } from "@/components/forms/template-form";
import { listTemplates } from "@/lib/services";
import { deleteTemplateAction, duplicateTemplateAction } from "@/app/actions";

const ENTITY_ICONS: Record<string, string> = {
  company: "🏢",
  contact: "👤",
  followUp: "📅",
  project: "📋",
  sale: "💰"
};

function formatUpdated(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
}

export default async function TemplatesPage({
  searchParams
}: {
  searchParams?: Record<string, string>;
}) {
  const templates = await listTemplates();
  const editId = searchParams?.edit ?? null;
  const editTemplate = editId ? (templates.find((t) => t.id === editId) ?? null) : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-widest text-slate-500">Step 2</p>
        <h2 className="text-3xl font-semibold text-slate-900">Template builder</h2>
        <p className="text-slate-500">
          Define entity payloads with faker-powered fields, per-type quantities, and locale
          fallbacks.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        {/* ── Left: form (wider) ── */}
        <TemplateForm key={editTemplate?.id ?? "new"} template={editTemplate ?? undefined} />

        {/* ── Right: template list (compact) ── */}
        <aside className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            Saved templates
          </h3>

          {templates.length === 0 && (
            <p className="text-sm text-slate-400">No templates yet — create one on the left.</p>
          )}

          {templates.map((template) => (
            <article
              key={template.id}
              className="card space-y-2 py-3"
            >
              {/* Name + date */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{template.name}</p>
                  <p className="truncate text-xs text-slate-400">{template.description}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-300">
                  {formatUpdated(template.updatedAt)}
                </span>
              </div>

              {/* Entity chips */}
              <div className="flex flex-wrap gap-1">
                {template.entities.map((entity) => (
                  <span
                    key={entity.name}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-xs text-slate-600"
                  >
                    <span>{ENTITY_ICONS[entity.builtinType ?? entity.name] ?? "🗄️"}</span>
                    <span>{entity.name}</span>
                    <span className="text-slate-400">×{entity.quantityDefault}</span>
                  </span>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-1.5 border-t border-slate-100 pt-2">
                <form action={duplicateTemplateAction}>
                  <input type="hidden" name="id" value={template.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-50"
                  >
                    Duplicate
                  </button>
                </form>
                <Link
                  href={`/templates?edit=${template.id}`}
                  className="rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700 hover:bg-sky-100"
                >
                  Edit
                </Link>
                <form action={deleteTemplateAction}>
                  <input type="hidden" name="id" value={template.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs text-rose-600 hover:bg-rose-100"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </article>
          ))}
        </aside>
      </div>
    </div>
  );
}
