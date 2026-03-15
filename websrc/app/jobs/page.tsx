import Link from "next/link";
import { JobForm } from "@/components/forms/job-form";
import { listJobs, listTemplates } from "@/lib/services";
import { deleteJobAction } from "@/app/actions";

export default async function JobsPage() {
  const [jobs, templates] = await Promise.all([
    listJobs(),
    listTemplates()
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-slate-500">Step 2</p>
        <h2 className="text-3xl font-semibold text-slate-900">Provisioning jobs</h2>
        <p className="text-slate-600">
          When you launch a job we create a manifest JSON artifact that stateless workers stream
          through the SuperOffice.WebApi SDK with faker-generated payloads and locale-aware data.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <JobForm templates={templates} />
        <div className="card space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Job history</h3>
          <div className="space-y-3 text-sm text-slate-600">
            {jobs.map((job) => (
              <div key={job.id} className="relative rounded-2xl border border-slate-200 transition hover:border-slate-300">
                <Link href={`/jobs/${job.id}`} className="block p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{job.id}</p>
                      <p className="text-xs text-slate-500">
                        template {job.templateId}
                      </p>
                    </div>
                    <StatusPill status={job.status} />
                  </div>
                  <p className="text-xs text-slate-500">
                    Locales: {job.locales.join(", ")} • Success {job.metrics.success}/
                    {job.metrics.total}
                  </p>
                </Link>
                {(job.status === "succeeded" || job.status === "failed") && (
                  <form action={deleteJobAction} className="absolute right-3 top-3">
                    <input type="hidden" name="id" value={job.id} />
                    <button
                      type="submit"
                      title="Delete job"
                      className="rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      ✕
                    </button>
                  </form>
                )}
              </div>
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
