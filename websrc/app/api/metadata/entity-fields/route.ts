import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntityFields } from "@/lib/metadata";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken || !session.webApiUrl) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const fields = await getEntityFields(session.webApiUrl, session.accessToken);
  return NextResponse.json(fields);
}
