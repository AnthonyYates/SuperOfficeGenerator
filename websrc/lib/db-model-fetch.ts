import "server-only";

import { buildRefMap, unzipString, flattenTables, BLOCKED_TABLES } from "@/lib/db-model";
import type { Database, DbModelTable } from "@/lib/db-model";

export interface SuperOfficeVersion {
  version: string;     // NetServerVersion
  releaseDate: Date;   // NetServerDate parsed to Date
}

export interface DownloadedDbModel extends SuperOfficeVersion {
  tables: DbModelTable[];
}

/** Fetches version info from the tenant root API endpoint. */
export async function fetchSuperOfficeVersion(
  accessToken: string,
  webApiUrl: string
): Promise<SuperOfficeVersion> {
  // webApiUrl looks like "https://app-sod.superoffice.com/Cust26759/api/"
  // The version endpoint is the same URL without the trailing slash.
  const baseUrl = webApiUrl.replace(/\/$/, "");
  const res = await fetch(baseUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Version fetch failed: ${res.status}`);
  const data = await res.json() as Record<string, string>;
  return {
    version: data.NetServerVersion ?? "unknown",
    releaseDate: new Date(data.NetServerDate ?? new Date().toISOString().slice(0, 10)),
  };
}

/** Downloads the database model from SuperOffice and returns tables + version info. */
export async function downloadDbModel(
  accessToken: string,
  webApiUrl: string
): Promise<DownloadedDbModel> {
  const [versionInfo, tables] = await Promise.all([
    fetchSuperOfficeVersion(accessToken, webApiUrl),
    downloadAndParseTables(accessToken, webApiUrl),
  ]);
  return { ...versionInfo, tables };
}

async function downloadAndParseTables(
  accessToken: string,
  webApiUrl: string
): Promise<DbModelTable[]> {
  const url = `${webApiUrl}v1/archive/dynamic?$select=databasemodel.databasemodel_id,databasemodel.ModelData`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`Upstream error ${resp.status}`);

  const json = await resp.json() as { value?: Array<Record<string, string>> };
  const base64: string = json.value?.[0]?.["databasemodel.ModelData"] ?? "";
  if (!base64) throw new Error("ModelData missing in response");

  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const modelJson = await unzipString(binary);
  const db = JSON.parse(modelJson) as Database;

  const refMap = buildRefMap(db);
  return flattenTables(db, refMap, BLOCKED_TABLES);
}
