-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "locales" TEXT NOT NULL,
    "requestedCounts" TEXT NOT NULL,
    "apiMode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "metrics" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "phases" TEXT,
    CONSTRAINT "Job_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("apiMode", "completedAt", "createdAt", "createdBy", "id", "items", "locales", "metrics", "phases", "requestedCounts", "status", "templateId") SELECT "apiMode", "completedAt", "createdAt", "createdBy", "id", "items", "locales", "metrics", "phases", "requestedCounts", "status", "templateId" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
