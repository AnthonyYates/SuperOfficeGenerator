"use client";

import { useEffect, useState } from "react";

interface VersionInfo {
  version: string;
  releaseDate: string;
}

interface VersionCheckResult {
  stored: (VersionInfo & { downloadedAt: string }) | null;
  live: VersionInfo | null;
  hasUpdate: boolean;
}

type Status = "checking" | "update-available" | "up-to-date" | "syncing" | "synced" | "error";

export function DbModelUpdateChecker() {
  const [status, setStatus] = useState<Status>("checking");
  const [liveVersion, setLiveVersion] = useState<VersionInfo | null>(null);

  useEffect(() => {
    fetch("/api/db-model/version")
      .then((r) => r.json() as Promise<VersionCheckResult>)
      .then((data) => {
        if (data.hasUpdate) {
          setLiveVersion(data.live);
          setStatus("update-available");
        } else {
          setStatus("up-to-date");
        }
      })
      .catch(() => setStatus("error"));
  }, []);

  async function handleSync() {
    setStatus("syncing");
    try {
      const res = await fetch("/api/db-model/sync", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      setStatus("synced");
    } catch {
      setStatus("error");
    }
  }

  if (status === "checking" || status === "up-to-date") return null;

  if (status === "error") {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        Failed to check for database model updates.
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
      <div>
        {status === "synced" ? (
          <span className="text-green-700">
            Database model updated — refresh the page to use the latest schema.
          </span>
        ) : (
          <>
            <span className="font-medium text-amber-800">Database model update available</span>
            {liveVersion && (
              <span className="ml-2 text-amber-600">
                v{liveVersion.version} ({liveVersion.releaseDate.slice(0, 10)})
              </span>
            )}
          </>
        )}
      </div>

      {(status === "update-available" || status === "syncing") && (
        <button
          onClick={handleSync}
          disabled={status === "syncing"}
          className="ml-4 shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
        >
          {status === "syncing" ? "Downloading…" : "Download & apply"}
        </button>
      )}
    </div>
  );
}
