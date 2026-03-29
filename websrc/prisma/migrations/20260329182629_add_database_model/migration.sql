-- CreateTable
CREATE TABLE "DatabaseModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" TEXT NOT NULL,
    "releaseDate" DATETIME NOT NULL,
    "downloadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tables" TEXT NOT NULL
);
