import Link from "next/link";
import { summarizeDashboard, listJobs, listEnvironments, listTemplates } from "@/lib/services";

export default async function DashboardPage() {
  const [summary, jobs, envs, templates] = await Promise.all([
    summarizeDashboard(),
    listJobs(),
    listEnvironments(),
    listTemplates()
  ]);

  const recentJobs = jobs.slice(0, 3);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-widest text-slate-500">Overview</p>
        <h2 className="text-3xl font-semibold text-slate-900">Provisioning Control Center</h2>
        <p className="text-slate-600">
          Authenticate with SuperOffice using OpenID Connect, then orchestrate entity provisioning
          via manifest-driven jobs backed by the SuperOffice.WebApi npm SDK.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Environments" value={summary.envCount} />
        <KpiCard label="Templates" value={summary.templateCount} />
        <KpiCard label="Jobs" value={summary.jobCount} />
        <KpiCard label="Success rate" value={`${summary.successRate}%`} accent />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Latest jobs</h3>
            <p className="text-sm text-slate-500">
              Generated manifests are stored as encrypted JSON files. No database required.
            </p>
          </div>
          <div className="space-y-3">
            {recentJobs.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm transition hover:border-slate-200"
              >
                <div>
                  <p className="font-semibold text-slate-900">{job.id}</p>
                  <p className="text-xs text-slate-500">
                    {[
                      job.requestedCounts.company ? `${job.requestedCounts.company} companies` : null,
                      job.requestedCounts.contact ? `${job.requestedCounts.contact} contacts` : null,
                      job.requestedCounts.project ? `${job.requestedCounts.project} projects` : null,
                      job.requestedCounts.followUp ? `${job.requestedCounts.followUp} follow-ups` : null,
                      job.requestedCounts.sale ? `${job.requestedCounts.sale} sales` : null,
                    ].filter(Boolean).join(" • ") || "No entities"}
                  </p>
                </div>
                <StatusPill status={job.status} />
              </Link>
            ))}
            {recentJobs.length === 0 && (
              <p className="text-sm text-slate-500">No jobs yet. Launch one from the Jobs tab.</p>
            )}
          </div>
        </div>
        <div className="card space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Next steps</h3>
            <p className="text-sm text-slate-500">
              Follow the workflow to configure environments, build templates, and start jobs.
            </p>
          </div>
          <ol className="space-y-3 text-sm text-slate-600">
            <li>
              <strong className="text-slate-900">1.</strong> Configure SuperOffice tenants under{" "}
              <Link className="text-brand underline" href="/environments">
                Environments
              </Link>{" "}
              (client IDs, scopes defined in .env).
            </li>
            <li>
              <strong className="text-slate-900">2.</strong> Build templates with faker rules on the{" "}
              <Link className="text-brand underline" href="/templates">
                Templates
              </Link>{" "}
              screen.
            </li>
            <li>
              <strong className="text-slate-900">3.</strong> Launch provisioning jobs with locales +
              per-entity counts on the{" "}
              <Link className="text-brand underline" href="/jobs">
                Jobs
              </Link>{" "}
              page.
            </li>
          </ol>
        </div>
      </section>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-semibold ${accent ? "text-brand" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    succeeded: "bg-emerald-50 text-emerald-600 border-emerald-200",
    failed: "bg-rose-50 text-rose-600 border-rose-200",
    running: "bg-amber-50 text-amber-600 border-amber-200",
    queued: "bg-slate-50 text-slate-600 border-slate-200"
  };
  return <span className={`pill ${map[status] ?? "bg-slate-100 text-slate-600"}`}>{status}</span>;
}
