-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "entities" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Job" (
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
    CONSTRAINT "Job_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
