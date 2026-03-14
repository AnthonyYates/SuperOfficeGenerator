import { notFound } from "next/navigation";
import { getJob } from "@/lib/services";
import { JobStreamWatcher } from "./JobStreamWatcher";

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const job = await getJob(id);
  if (!job) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-slate-500">Job manifest</p>
        <h2 className="text-3xl font-semibold text-slate-900">{job.id}</h2>
        <p className="text-slate-600">
          Template {job.templateId} • environment {job.environmentId} • locales{" "}
          {job.locales.join(", ")}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">Summary</h3>
          <dl className="space-y-2 text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <dt>Status</dt>
              <dd className="pill border-slate-200 bg-slate-50 text-slate-600">{job.status}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>API mode</dt>
              <dd className={`pill ${(job.apiMode ?? "entity") === "massops" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-sky-200 bg-sky-50 text-sky-700"}`}>
                {(job.apiMode ?? "entity") === "massops" ? "Mass operations" : "Entity agents"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Total entities</dt>
              <dd className="font-semibold text-slate-900">{job.metrics.total}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Success</dt>
              <dd className="text-emerald-600">{job.metrics.success}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Failed</dt>
              <dd className="text-rose-600">{job.metrics.failed}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Duration</dt>
              <dd>{job.metrics.durationSeconds}s</dd>
            </div>
          </dl>
        </div>
        <div className="card space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">Requested counts</h3>
          <ul className="space-y-2 text-sm text-slate-600">
            {Object.entries(job.requestedCounts).map(([key, value]) => (
              <li key={key} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                <span className="font-medium text-slate-900">{key}</span>
                <span>{value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <JobStreamWatcher jobId={id} initialStatus={job.status} />

      <section className="card space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Entity phases</h3>
          <p className="text-sm text-slate-500">
            Records are inserted in FK dependency order via SuperOffice MassOperations
            (upsertAsync). Live progress appears above while the job is running.
          </p>
        </div>
        <div className="space-y-2">
          {Object.entries(job.requestedCounts).length === 0 ? (
            <p className="text-sm text-slate-500">No entity counts configured for this job.</p>
          ) : (
            Object.entries(job.requestedCounts).map(([entityType, requested]) => (
              <div
                key={entityType}
                className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 text-sm"
              >
                <span className="font-medium capitalize text-slate-900">{entityType}</span>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>Requested: {requested}</span>
                  {job.status === "succeeded" || job.status === "failed" ? (
                    <span
                      className={`pill ${
                        job.metrics.failed === 0
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {job.status}
                    </span>
                  ) : (
                    <span className="pill border-slate-200 bg-slate-50 text-slate-600">
                      {job.status}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
