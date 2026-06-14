-- AlterEnum
ALTER TYPE "ReportStatus" ADD VALUE 'cancelled';

-- AlterEnum
ALTER TYPE "TranscriptStatus" ADD VALUE 'cancelled';

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "configSnapshot" JSONB,
ADD COLUMN     "configVersion" INTEGER;

-- CreateTable
CREATE TABLE "OrgModule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "coworkerId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "configVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgModule_orgId_idx" ON "OrgModule"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgModule_orgId_coworkerId_key" ON "OrgModule"("orgId", "coworkerId");

-- AddForeignKey
ALTER TABLE "OrgModule" ADD CONSTRAINT "OrgModule_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
