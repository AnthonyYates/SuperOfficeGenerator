-- Remove duplicate versions, keeping the most recently downloaded record per version
DELETE FROM "DatabaseModel"
WHERE "id" NOT IN (
  SELECT "id" FROM "DatabaseModel" d1
  WHERE "downloadedAt" = (
    SELECT MAX("downloadedAt") FROM "DatabaseModel" d2
    WHERE d2."version" = d1."version"
  )
);

-- CreateIndex
CREATE UNIQUE INDEX "DatabaseModel_version_key" ON "DatabaseModel"("version");
