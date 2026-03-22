import "server-only";

import { NextResponse } from "next/server";
import { getFakerPaths } from "@/lib/faker";

// No auth required — faker paths are static/bundled, not tenant-specific.
export async function GET() {
  return NextResponse.json({ paths: getFakerPaths() });
}
