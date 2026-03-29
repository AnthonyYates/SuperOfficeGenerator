import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveDbModel, clearMemCache } from "@/lib/db-model-storage";
import { downloadDbModel } from "@/lib/db-model-fetch";

export async function POST() {
  const session = await auth();
  if (!session?.accessToken || !session.webApiUrl) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { tables, version, releaseDate } = await downloadDbModel(
      session.accessToken,
      session.webApiUrl
    );
    await saveDbModel(version, releaseDate, tables);
    clearMemCache();
    return NextResponse.json({ version, releaseDate, tableCount: tables.length });
  } catch (err) {
    return new NextResponse(`Download failed: ${err}`, { status: 502 });
  }
}
