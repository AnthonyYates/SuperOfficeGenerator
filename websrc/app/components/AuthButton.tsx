"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export function AuthButton() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <span className="text-xs text-slate-400">Loading…</span>;
  }

  if (session) {
    return (
      <div className="flex flex-col gap-1">
        <p className="truncate text-xs font-medium text-slate-700">
          {session.user?.name ?? session.user?.email ?? "Signed in"}
        </p>
        {session.companyName && (
          <p className="truncate text-xs text-slate-500">{session.companyName}</p>
        )}
        {session.ctx && (
          <p className="truncate font-mono text-xs text-slate-400">{session.ctx}</p>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => signIn("superoffice")}
      className="w-full rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
    >
      Sign in with SuperOffice
    </button>
  );
}
