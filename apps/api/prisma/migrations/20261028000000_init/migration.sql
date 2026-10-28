-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CHW', 'DENTIST', 'ADMIN');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('PENDING', 'SYNCED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('ROUTINE', 'URGENT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "ViewType" AS ENUM ('FRONT', 'UPPER_ARCH', 'LOWER_ARCH', 'EXTRA');

-- CreateEnum
CREATE TYPE "SymptomDuration" AS ENUM ('LESS_THAN_1_DAY', 'DAYS_1_TO_7', 'WEEKS_1_TO_4', 'MORE_THAN_1_MONTH');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'NOT_STATED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "chwCode" TEXT,
    "assignedSite" TEXT,
    "licenseNumber" TEXT,
    "specialty" TEXT,
    "adminLevel" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "anonId" TEXT NOT NULL,
    "nameEncrypted" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "sex" "Sex",
    "consentGiven" BOOLEAN NOT NULL,
    "consentDate" TIMESTAMP(3) NOT NULL,
    "registeredById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "submittedById" UUID NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'SYNCED',
    "priority" "Priority",
    "reviewedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oral_images" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "filePath" TEXT NOT NULL,
    "sizeKB" INTEGER NOT NULL,
    "viewType" "ViewType" NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "sha256" TEXT NOT NULL,

    CONSTRAINT "oral_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "symptom_assessments" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "painLevel" INTEGER NOT NULL,
    "duration" "SymptomDuration" NOT NULL,

    CONSTRAINT "symptom_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_notes" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "noteText" TEXT NOT NULL,
    "referralAdvice" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "ipAddress" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_chwCode_key" ON "users"("chwCode");

-- CreateIndex
CREATE UNIQUE INDEX "patients_anonId_key" ON "patients"("anonId");

-- CreateIndex
CREATE INDEX "patients_location_idx" ON "patients"("location");

-- CreateIndex
CREATE INDEX "cases_status_syncedAt_idx" ON "cases"("status", "syncedAt");

-- CreateIndex
CREATE INDEX "cases_priority_syncedAt_idx" ON "cases"("priority", "syncedAt");

-- CreateIndex
CREATE INDEX "cases_submittedById_idx" ON "cases"("submittedById");

-- CreateIndex
CREATE INDEX "oral_images_caseId_idx" ON "oral_images"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "symptom_assessments_caseId_key" ON "symptom_assessments"("caseId");

-- CreateIndex
CREATE INDEX "clinical_notes_caseId_idx" ON "clinical_notes"("caseId");

-- CreateIndex
CREATE INDEX "audit_log_timestamp_idx" ON "audit_log"("timestamp");

-- CreateIndex
CREATE INDEX "audit_log_userId_timestamp_idx" ON "audit_log"("userId", "timestamp");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oral_images" ADD CONSTRAINT "oral_images_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symptom_assessments" ADD CONSTRAINT "symptom_assessments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

