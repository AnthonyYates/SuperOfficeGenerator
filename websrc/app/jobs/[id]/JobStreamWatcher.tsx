"use client";

import { useEffect, useRef, useReducer, useState } from "react";
import type { JobPhaseEvent, JobPhaseResult, JobStatus, JobMetricSummary } from "@/lib/types";

interface PhaseState {
  entityType: string;
  total: number;
  inserted: number;
  success?: number;
  failed?: number;
  done: boolean;
}

interface WatcherState {
  phases: Record<string, PhaseState>;
  errors: string[];
  finalStatus?: JobStatus;
  finalMetrics?: JobMetricSummary;
}

type Action =
  | { type: "event"; event: JobPhaseEvent }
  | { type: "connection_error" };

function reducer(state: WatcherState, action: Action): WatcherState {
  if (action.type === "connection_error") {
    return { ...state, errors: [...state.errors, "Connection lost"] };
  }

  const evt = action.event;
  switch (evt.type) {
    case "phase_start":
      return {
        ...state,
        phases: {
          ...state.phases,
          [evt.entityType]: { entityType: evt.entityType, total: evt.total, inserted: 0, done: false }
        }
      };
    case "batch_done": {
      const phase = state.phases[evt.entityType];
      if (!phase) return state;
      return {
        ...state,
        phases: {
          ...state.phases,
          [evt.entityType]: { ...phase, inserted: phase.inserted + evt.inserted }
        }
      };
    }
    case "phase_done": {
      const phase = state.phases[evt.entityType];
      if (!phase) return state;
      return {
        ...state,
        phases: {
          ...state.phases,
          [evt.entityType]: { ...phase, success: evt.success, failed: evt.failed, done: true }
        }
      };
    }
    case "job_done":
      return { ...state, finalStatus: evt.status, finalMetrics: evt.metrics };
    case "error":
      return { ...state, errors: [...state.errors, evt.message] };
    default:
      return state;
  }
}

const ENTITY_LABELS: Record<string, string> = {
  company: "Companies",
  contact: "Persons",
  followUp: "Follow-ups",
  project: "Projects",
  sale: "Sales"
};

interface Props {
  jobId: string;
  initialStatus: string;
  initialMetrics: JobMetricSummary;
  initialPhases?: Record<string, JobPhaseResult>;
}

export function JobStreamWatcher({ jobId, initialStatus, initialMetrics, initialPhases }: Props) {
  const isTerminal = initialStatus === "succeeded" || initialStatus === "failed";

  const [state, dispatch] = useReducer(reducer, {
    phases: isTerminal && initialPhases
      ? Object.fromEntries(
          Object.entries(initialPhases).map(([entityType, result]) => [
            entityType,
            { entityType, total: result.success + result.failed, inserted: result.success, success: result.success, failed: result.failed, done: true }
          ])
        )
      : {},
    errors: [],
    finalStatus: isTerminal ? (initialStatus as JobStatus) : undefined,
    finalMetrics: isTerminal ? initialMetrics : undefined
  });

  // Elapsed-seconds counter while running
  const startRef = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (isTerminal) return;
    startRef.current = Date.now();
    const iv = setInterval(() => {
      setElapsed(Math.round((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Derive live totals from phases
  const phaseList = Object.values(state.phases);
  const liveSuccess = state.finalMetrics
    ? state.finalMetrics.success
    : phaseList.reduce((s, p) => s + (p.success ?? p.inserted), 0);
  const liveFailed = state.finalMetrics
    ? state.finalMetrics.failed
    : phaseList.reduce((s, p) => s + (p.failed ?? 0), 0);
  const liveTotal = state.finalMetrics
    ? state.finalMetrics.total
    : phaseList.reduce((s, p) => s + p.total, 0);
  const liveDuration = state.finalMetrics
    ? `${state.finalMetrics.durationSeconds}s`
    : phaseList.length > 0 ? `${elapsed}s` : `${initialMetrics.durationSeconds}s`;

  useEffect(() => {
    // Only open stream if the job needs to run
    if (initialStatus !== "queued" && initialStatus !== "running") return;

    const es = new EventSource(`/api/jobs/${jobId}/stream`);

    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const event = JSON.parse(e.data) as JobPhaseEvent;
        dispatch({ type: "event", event });
        if (event.type === "job_done") {
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      dispatch({ type: "connection_error" });
      es.close();
    };

    return () => es.close();
  }, [jobId, initialStatus]);

  const phases = Object.values(state.phases);
  if (!phases.length && !state.finalStatus && !state.errors.length) return null;

  return (
    <section className="card space-y-4">
      <h3 className="text-lg font-semibold text-slate-900">Live progress</h3>

      {/* Live metrics row */}
      <dl className="grid grid-cols-4 gap-3 text-sm">
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">Total</dt>
          <dd className="font-semibold text-slate-900">{liveTotal}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">Success</dt>
          <dd className="font-semibold text-emerald-600">{liveSuccess}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">Failed</dt>
          <dd className="font-semibold text-rose-600">{liveFailed}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <dt className="text-xs text-slate-500">Duration</dt>
          <dd className="font-semibold text-slate-900">{liveDuration}</dd>
        </div>
      </dl>

      {phases.map((phase) => {
        const pct = phase.total > 0 ? Math.round((phase.inserted / phase.total) * 100) : 0;
        return (
          <div key={phase.entityType} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">
                {ENTITY_LABELS[phase.entityType] ?? phase.entityType}
              </span>
              <span className="text-slate-500">
                {phase.done
                  ? `${phase.success ?? phase.inserted} inserted${phase.failed ? `, ${phase.failed} failed` : ""}`
                  : `${phase.inserted} / ${phase.total}`}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  phase.done && (phase.failed ?? 0) > 0
                    ? "bg-amber-400"
                    : phase.done
                    ? "bg-emerald-500"
                    : "bg-blue-500"
                }`}
                style={{ width: `${phase.done ? 100 : pct}%` }}
              />
            </div>
          </div>
        );
      })}

      {state.errors.map((msg, i) => (
        <p key={i} className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {msg}
        </p>
      ))}

      {state.finalStatus && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${
            state.finalStatus === "succeeded"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700"
          }`}
        >
          {state.finalStatus === "succeeded" ? "✓ Job completed successfully" : "✗ Job completed with failures"}
          {state.finalMetrics && (
            <span className="ml-2 font-normal text-slate-500">
              — {state.finalMetrics.success} inserted in {state.finalMetrics.durationSeconds}s
            </span>
          )}
        </div>
      )}
    </section>
  );
}
