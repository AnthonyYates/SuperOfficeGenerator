import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildRefMap, unzipString, flattenTables, BLOCKED_TABLES } from "@/lib/db-model";
import type { Database, DbModelTable } from "@/lib/db-model";

// Module-level cache — survives across requests in the same Node.js process.
// DB model changes rarely; 30-minute TTL is sufficient.
let cache: { tables: DbModelTable[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;

export async function GET() {
  const session = await auth();
  if (!session?.accessToken || !session.webApiUrl) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ tables: cache.tables });
  }

  const url = `${session.webApiUrl}v1/archive/dynamic?$select=databasemodel.databasemodel_id,databasemodel.ModelData`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      Accept: "application/json"
    }
  });

  if (!resp.ok) {
    return new NextResponse(`Upstream error ${resp.status}`, { status: resp.status });
  }

  const json = await resp.json() as { value?: Array<Record<string, string>> };
  const base64: string = json.value?.[0]?.["databasemodel.ModelData"] ?? "";
  if (!base64) {
    return new NextResponse("ModelData missing in response", { status: 502 });
  }

  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const modelJson = await unzipString(binary);
  const db = JSON.parse(modelJson) as Database;

  const refMap = buildRefMap(db);
  const tables = flattenTables(db, refMap, BLOCKED_TABLES);

  cache = { tables, fetchedAt: Date.now() };
  return NextResponse.json({ tables });
}
