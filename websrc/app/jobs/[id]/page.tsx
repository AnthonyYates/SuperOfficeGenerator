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
          Template {job.templateId} • locales{" "}
          {job.locales.join(", ")}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">Summary</h3>
          <dl className="space-y-2 text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <dt>Status</dt>
              <dd className={`pill ${job.status === "succeeded" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : job.status === "failed" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{job.status}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>API mode</dt>
              <dd className={`pill ${(job.apiMode ?? "entity") === "massops" ? "border-violet-200 bg-violet-50 text-violet-700" : "border-sky-200 bg-sky-50 text-sky-700"}`}>
                {(job.apiMode ?? "entity") === "massops" ? "Mass operations" : "Entity agents"}
              </dd>
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

      <JobStreamWatcher jobId={id} initialStatus={job.status} initialMetrics={job.metrics} initialPhases={job.phases} />
    </div>
  );
}
