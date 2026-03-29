import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLatestDbModelMeta } from "@/lib/db-model-storage";
import { fetchSuperOfficeVersion } from "@/lib/db-model-fetch";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken || !session.webApiUrl) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const [stored, live] = await Promise.all([
    getLatestDbModelMeta(),
    fetchSuperOfficeVersion(session.accessToken, session.webApiUrl).catch(() => null),
  ]);

  const hasUpdate =
    stored !== null && live !== null && live.releaseDate > stored.releaseDate;

  return NextResponse.json({
    stored: stored
      ? { version: stored.version, releaseDate: stored.releaseDate, downloadedAt: stored.downloadedAt }
      : null,
    live,
    hasUpdate,
  });
}
