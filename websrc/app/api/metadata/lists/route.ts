import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getListCatalog } from "@/lib/metadata";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken || !session.webApiUrl) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const lists = await getListCatalog(session.webApiUrl, session.accessToken);
  return NextResponse.json({ lists });
}
