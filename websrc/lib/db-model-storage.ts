import "server-only";

import { prisma } from "@/lib/db";
import type { DbModelTable } from "@/lib/db-model";

export interface StoredDbModelMeta {
  id: string;
  version: string;
  releaseDate: Date;
  downloadedAt: Date;
}

export interface StoredDbModel extends StoredDbModelMeta {
  tables: DbModelTable[];
}

// ---------------------------------------------------------------------------
// Module-level memory cache shared across routes in the same Node.js process.
// Source of truth is the DB; this avoids redundant DB reads on every request.
// ---------------------------------------------------------------------------
let _memCache: { tables: DbModelTable[]; fetchedAt: number } | null = null;
const MEM_CACHE_TTL_MS = 30 * 60 * 1000;

export function getMemCache(): DbModelTable[] | null {
  if (_memCache && Date.now() - _memCache.fetchedAt < MEM_CACHE_TTL_MS) {
    return _memCache.tables;
  }
  return null;
}

export function setMemCache(tables: DbModelTable[]): void {
  _memCache = { tables, fetchedAt: Date.now() };
}

export function clearMemCache(): void {
  _memCache = null;
}

// ---------------------------------------------------------------------------
// DB access
// ---------------------------------------------------------------------------

export async function getLatestDbModelMeta(): Promise<StoredDbModelMeta | null> {
  return prisma.databaseModel.findFirst({
    orderBy: { downloadedAt: "desc" },
    select: { id: true, version: true, releaseDate: true, downloadedAt: true },
  });
}

export async function getLatestDbModel(): Promise<StoredDbModel | null> {
  const record = await prisma.databaseModel.findFirst({
    orderBy: { downloadedAt: "desc" },
  });
  if (!record) return null;
  return {
    id: record.id,
    version: record.version,
    releaseDate: record.releaseDate,
    downloadedAt: record.downloadedAt,
    tables: JSON.parse(record.tables) as DbModelTable[],
  };
}

export async function saveDbModel(
  version: string,
  releaseDate: Date,
  tables: DbModelTable[]
): Promise<StoredDbModelMeta> {
  const tablesJson = JSON.stringify(tables);
  // Upsert by version: update if this exact version exists, otherwise create.
  // (The DB enforces uniqueness via the DatabaseModel_version_key index.)
  const existing = await prisma.databaseModel.findFirst({
    where: { version },
    select: { id: true },
  });
  if (existing) {
    return prisma.databaseModel.update({
      where: { id: existing.id },
      data: { releaseDate, downloadedAt: new Date(), tables: tablesJson },
      select: { id: true, version: true, releaseDate: true, downloadedAt: true },
    });
  }
  return prisma.databaseModel.create({
    data: { version, releaseDate, tables: tablesJson },
    select: { id: true, version: true, releaseDate: true, downloadedAt: true },
  });
}
