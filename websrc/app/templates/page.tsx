import { TemplateForm } from "@/components/forms/template-form";
import { listTemplates } from "@/lib/services";
import { deleteTemplateAction } from "@/app/actions";

export default async function TemplatesPage() {
  const templates = await listTemplates();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-slate-500">Step 2</p>
        <h2 className="text-3xl font-semibold text-slate-900">Template builder</h2>
        <p className="text-slate-600">
          Define entity payloads with faker-powered fields, per-type quantities, and locale
          fallbacks. These definitions are versioned JSON artifacts stored in object storage.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <TemplateForm />
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Existing templates</h3>
          <div className="space-y-4 text-sm text-slate-600">
            {templates.map((template) => (
              <article key={template.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{template.name}</p>
                    <p className="text-xs text-slate-500">{template.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="pill border-brand bg-brand/10 text-brand">
                      {template.entities.length} entity types
                    </span>
                    <form action={deleteTemplateAction}>
                      <input type="hidden" name="id" value={template.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs text-rose-600 hover:bg-rose-100"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
                <ul className="mt-3 space-y-2 text-xs text-slate-500">
                  {template.entities.map((entity) => (
                    <li key={entity.entityType} className="rounded-xl border border-slate-100 p-2">
                      <strong className="text-slate-900">{entity.entityType}</strong> • default{" "}
                      {entity.quantityDefault} • locales {entity.localeFallbacks.join(", ")}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
