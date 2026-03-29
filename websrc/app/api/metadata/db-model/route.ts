import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLatestDbModel, saveDbModel, getMemCache, setMemCache } from "@/lib/db-model-storage";
import { downloadDbModel } from "@/lib/db-model-fetch";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken || !session.webApiUrl) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 1. In-memory cache (fast path — same process, no DB round-trip)
  const cached = getMemCache();
  if (cached) {
    return NextResponse.json({ tables: cached });
  }

  // 2. Stored model in DB
  const stored = await getLatestDbModel();
  if (stored) {
    setMemCache(stored.tables);
    return NextResponse.json({
      tables: stored.tables,
      version: stored.version,
      releaseDate: stored.releaseDate,
    });
  }

  // 3. No stored model — download from SuperOffice, persist, and return
  try {
    const { tables, version, releaseDate } = await downloadDbModel(
      session.accessToken,
      session.webApiUrl
    );
    await saveDbModel(version, releaseDate, tables);
    setMemCache(tables);
    return NextResponse.json({ tables, version, releaseDate });
  } catch (err) {
    return new NextResponse(`Failed to fetch database model: ${err}`, { status: 502 });
  }
}
