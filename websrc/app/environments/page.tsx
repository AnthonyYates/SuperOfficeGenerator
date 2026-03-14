import { listEnvironments } from "@/lib/services";
import { deleteEnvironmentAction } from "@/app/actions";
import { EnvironmentForm } from "@/components/forms/environment-form";

export default async function EnvironmentsPage() {
  const environments = await listEnvironments();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-slate-500">Step 1</p>
        <h2 className="text-3xl font-semibold text-slate-900">Environment bundles</h2>
        <p className="text-slate-600">
          Each environment encapsulates tenant metadata, SuperOffice OAuth scopes, and references to
          secrets defined in your .env / deployment store. No database required—just encrypted JSON
          bundles.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <EnvironmentForm />
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Registered environments</h3>
          <div className="space-y-3">
            {environments.map((env) => (
              <article
                key={env.id}
                className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900">{env.name}</p>
                  <div className="flex items-center gap-2">
                    <span
                      className={`pill ${
                        env.isActive
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                      }`}
                    >
                      {env.isActive ? "active" : "disabled"}
                    </span>
                    <form action={deleteEnvironmentAction}>
                      <input type="hidden" name="id" value={env.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs text-rose-600 hover:bg-rose-100"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </div>
                <p>Tenant: {env.tenantId}</p>
                <p>Client: {env.clientId}</p>
                <p className="text-xs text-slate-500">Scopes: {env.scopes.join(", ")}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
