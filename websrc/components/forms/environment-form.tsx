"use client";

import { useFormState } from "react-dom";
import { createEnvironmentAction } from "@/app/actions";

const initialState = { error: null as null | string | Record<string, string[]>, success: false };

export function EnvironmentForm() {
  const [state, formAction] = useFormState(createEnvironmentAction, initialState);

  return (
    <form action={formAction} className="card space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Add environment</h3>
        <p className="text-sm text-slate-500">
          Client IDs, secrets, and encryption keys must reside in your .env / deployment secrets.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Name
          <input
            name="name"
            required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Tenant ID
          <input
            name="tenantId"
            required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Client ID
          <input
            name="clientId"
            required
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Scopes (comma separated)
          <input
            name="scopes"
            placeholder="openid, offline_access, crm/full"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" name="isActive" className="h-4 w-4 rounded border-slate-300" />
        Active
      </label>
      {state.error && (
        <p className="text-sm text-rose-600">
          {typeof state.error === "string" ? state.error : "Validation failed. Check fields."}
        </p>
      )}
      <button
        type="submit"
        className="w-full rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand/90"
      >
        Save environment
      </button>
    </form>
  );
}
