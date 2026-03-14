import Link from "next/link";
import { JobForm } from "@/components/forms/job-form";
import { listJobs, listEnvironments, listTemplates } from "@/lib/services";

export default async function JobsPage() {
  const [jobs, environments, templates] = await Promise.all([
    listJobs(),
    listEnvironments(),
    listTemplates()
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-slate-500">Step 3</p>
        <h2 className="text-3xl font-semibold text-slate-900">Provisioning jobs</h2>
        <p className="text-slate-600">
          When you launch a job we create a manifest JSON artifact that stateless workers stream
          through the SuperOffice.WebApi SDK with faker-generated payloads and locale-aware data.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <JobForm environments={environments} templates={templates} />
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Job history</h3>
          <div className="space-y-3 text-sm text-slate-600">
            {jobs.map((job) => (
              <Link key={job.id} href={`/jobs/${job.id}`} className="block rounded-2xl border border-slate-200 p-4 transition hover:border-slate-300">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{job.id}</p>
                    <p className="text-xs text-slate-500">
                      template {job.templateId} • env {job.environmentId}
                    </p>
                  </div>
                  <StatusPill status={job.status} />
                </div>
                <p className="text-xs text-slate-500">
                  Locales: {job.locales.join(", ")} • Success {job.metrics.success}/
                  {job.metrics.total}
                </p>
              </Link>
            ))}
            {jobs.length === 0 && (
              <p className="text-sm text-slate-500">No jobs yet. Launch your first manifest.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    succeeded: "border-emerald-200 bg-emerald-50 text-emerald-700",
    failed: "border-rose-200 bg-rose-50 text-rose-600",
    running: "border-amber-200 bg-amber-50 text-amber-600",
    queued: "border-slate-200 bg-slate-50 text-slate-600"
  };
  return <span className={`pill ${map[status] ?? ""}`}>{status}</span>;
}
