-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('pending', 'running', 'ready', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'pending',
    "profile" JSONB,
    "scores" JSONB,
    "narrative" TEXT,
    "configSnapshot" JSONB NOT NULL,
    "configVersion" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assessment_orgId_idx" ON "Assessment"("orgId");

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
