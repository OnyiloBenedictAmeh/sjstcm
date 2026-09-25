-- Keep all schema changes and backfills atomic on PostgreSQL.
BEGIN;

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'NEEDS_INFORMATION');

-- CreateEnum
CREATE TYPE "StaffEmploymentStatus" AS ENUM ('CURRENT', 'FORMER');

-- CreateEnum
CREATE TYPE "PermissionAuditAction" AS ENUM ('GRANTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ArchiveMediaKind" AS ENUM ('PROFILE_PHOTO', 'THEN_PHOTO', 'NOW_PHOTO', 'CLASS_GROUP_PHOTO', 'ARCHIVE_PHOTO', 'PRIVATE_EVIDENCE', 'ARCHIVE_DOCUMENT');

-- CreateEnum
CREATE TYPE "HistoricalArchiveKind" AS ENUM ('EVENT', 'STORY', 'MEMORY', 'HISTORICAL_NOTE', 'PHOTOGRAPH', 'DOCUMENT');

-- Allocate durable human-readable IDs from independent sequences.
CREATE SEQUENCE "alumni_public_id_seq";
CREATE SEQUENCE "former_staff_public_id_seq";

CREATE FUNCTION generate_alumni_id() RETURNS TEXT
LANGUAGE SQL VOLATILE AS $$
  WITH allocated AS (
    SELECT nextval('"alumni_public_id_seq"') AS value
  )
  SELECT 'ALM-' || CASE
    WHEN value < 1000000 THEN lpad(value::text, 6, '0')
    ELSE value::text
  END
  FROM allocated;
$$;

CREATE FUNCTION generate_former_staff_id() RETURNS TEXT
LANGUAGE SQL VOLATILE AS $$
  WITH allocated AS (
    SELECT nextval('"former_staff_public_id_seq"') AS value
  )
  SELECT 'FST-' || CASE
    WHEN value < 1000000 THEN lpad(value::text, 6, '0')
    ELSE value::text
  END
  FROM allocated;
$$;

-- DropForeignKey
ALTER TABLE "Alumni" DROP CONSTRAINT "Alumni_studentId_fkey";

-- AlterTable
ALTER TABLE "Alumni" ADD COLUMN     "alumniId" TEXT,
ADD COLUMN     "approximatePeriod" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "departmentLabel" TEXT,
ADD COLUMN     "entryYear" INTEGER,
ADD COLUMN     "exitYear" INTEGER,
ADD COLUMN     "formerName" TEXT,
ADD COLUMN     "fullName" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "house" TEXT,
ADD COLUMN     "lastClassAttended" TEXT,
ADD COLUMN     "memories" TEXT,
ADD COLUMN     "nameWhileAttending" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "publicBiography" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicFormerName" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicLocation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicMemories" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicName" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicOccupation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicPhoto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicSchoolHistory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "whatsapp" TEXT,
ALTER COLUMN "studentId" DROP NOT NULL,
ALTER COLUMN "isPublic" SET DEFAULT false;

-- Backfill existing records without inferring entry years or class memberships.
UPDATE "Alumni"
SET "alumniId" = generate_alumni_id()
WHERE "alumniId" IS NULL;
UPDATE "Alumni" SET "exitYear" = "graduationYear" WHERE "exitYear" IS NULL;
UPDATE "Alumni" AS a
SET "fullName" = trim(concat_ws(' ', s."firstName", s."middleName", s."lastName"))
FROM "Student" AS s
WHERE a."studentId" = s."id";
UPDATE "Alumni" SET "fullName" = 'Unverified alumni record' WHERE "fullName" IS NULL;
UPDATE "Alumni"
SET "verificationStatus" = 'PENDING', "isPublic" = false;
ALTER TABLE "Alumni" ALTER COLUMN "alumniId" SET NOT NULL;
ALTER TABLE "Alumni" ALTER COLUMN "alumniId" SET DEFAULT generate_alumni_id();
ALTER TABLE "Alumni" ALTER COLUMN "fullName" SET NOT NULL;
ALTER TABLE "Alumni" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "AlumniClassSet" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "entryYear" INTEGER,
    "exitYear" INTEGER,
    "approximatePeriod" TEXT,
    "notes" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlumniClassSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlumniClassMembership" (
    "id" TEXT NOT NULL,
    "alumniId" TEXT NOT NULL,
    "classSetId" TEXT NOT NULL,
    "lastClassAttended" TEXT,
    "departmentLabel" TEXT,
    "house" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlumniClassMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" TEXT NOT NULL,
    "formerStaffId" TEXT NOT NULL DEFAULT generate_former_staff_id(),
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "formerName" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "employmentStatus" "StaffEmploymentStatus" NOT NULL DEFAULT 'FORMER',
    "biography" TEXT,
    "memories" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "publicName" BOOLEAN NOT NULL DEFAULT false,
    "publicServiceHistory" BOOLEAN NOT NULL DEFAULT false,
    "publicBiography" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAppointment" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "departmentId" TEXT,
    "departmentLabel" TEXT,
    "subjects" TEXT[],
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "startYear" INTEGER,
    "endYear" INTEGER,
    "approximatePeriod" TEXT,
    "historicalLabel" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlumniReview" (
    "id" TEXT NOT NULL,
    "alumniId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "previousStatus" "VerificationStatus",
    "newStatus" "VerificationStatus" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlumniReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffReview" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "previousStatus" "VerificationStatus",
    "newStatus" "VerificationStatus" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalArchiveItem" (
    "id" TEXT NOT NULL,
    "kind" "HistoricalArchiveKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "exactDate" TIMESTAMP(3),
    "approximatePeriod" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "alumniId" TEXT,
    "staffProfileId" TEXT,
    "classSetId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricalArchiveItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchiveMedia" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "kind" "ArchiveMediaKind" NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "alumniId" TEXT,
    "staffProfileId" TEXT,
    "classSetId" TEXT,
    "archiveItemId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchiveMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "grantedByUserId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("userId","permissionId")
);

-- CreateTable
CREATE TABLE "PermissionAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "action" "PermissionAuditAction" NOT NULL,
    "changedByUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermissionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlumniClassMembership_classSetId_status_idx" ON "AlumniClassMembership"("classSetId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AlumniClassMembership_alumniId_classSetId_key" ON "AlumniClassMembership"("alumniId", "classSetId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_formerStaffId_key" ON "StaffProfile"("formerStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");

-- CreateIndex
CREATE INDEX "StaffAppointment_staffProfileId_startYear_idx" ON "StaffAppointment"("staffProfileId", "startYear");

-- CreateIndex
CREATE INDEX "AlumniReview_alumniId_createdAt_idx" ON "AlumniReview"("alumniId", "createdAt");

-- CreateIndex
CREATE INDEX "StaffReview_staffProfileId_createdAt_idx" ON "StaffReview"("staffProfileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArchiveMedia_storageKey_key" ON "ArchiveMedia"("storageKey");

-- CreateIndex
CREATE INDEX "ArchiveMedia_alumniId_isPublic_idx" ON "ArchiveMedia"("alumniId", "isPublic");

-- CreateIndex
CREATE INDEX "ArchiveMedia_staffProfileId_isPublic_idx" ON "ArchiveMedia"("staffProfileId", "isPublic");

-- CreateIndex
CREATE INDEX "ArchiveMedia_classSetId_isPublic_idx" ON "ArchiveMedia"("classSetId", "isPublic");

-- CreateIndex
CREATE INDEX "ArchiveMedia_archiveItemId_isPublic_idx" ON "ArchiveMedia"("archiveItemId", "isPublic");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "UserPermission_permissionId_idx" ON "UserPermission"("permissionId");

-- CreateIndex
CREATE INDEX "PermissionAudit_userId_createdAt_idx" ON "PermissionAudit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PermissionAudit_permissionKey_createdAt_idx" ON "PermissionAudit"("permissionKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Alumni_alumniId_key" ON "Alumni"("alumniId");

-- AddForeignKey
ALTER TABLE "Alumni" ADD CONSTRAINT "Alumni_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlumniClassMembership" ADD CONSTRAINT "AlumniClassMembership_alumniId_fkey" FOREIGN KEY ("alumniId") REFERENCES "Alumni"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlumniClassMembership" ADD CONSTRAINT "AlumniClassMembership_classSetId_fkey" FOREIGN KEY ("classSetId") REFERENCES "AlumniClassSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAppointment" ADD CONSTRAINT "StaffAppointment_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffAppointment" ADD CONSTRAINT "StaffAppointment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlumniReview" ADD CONSTRAINT "AlumniReview_alumniId_fkey" FOREIGN KEY ("alumniId") REFERENCES "Alumni"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlumniReview" ADD CONSTRAINT "AlumniReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffReview" ADD CONSTRAINT "StaffReview_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffReview" ADD CONSTRAINT "StaffReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalArchiveItem" ADD CONSTRAINT "HistoricalArchiveItem_alumniId_fkey" FOREIGN KEY ("alumniId") REFERENCES "Alumni"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalArchiveItem" ADD CONSTRAINT "HistoricalArchiveItem_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalArchiveItem" ADD CONSTRAINT "HistoricalArchiveItem_classSetId_fkey" FOREIGN KEY ("classSetId") REFERENCES "AlumniClassSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricalArchiveItem" ADD CONSTRAINT "HistoricalArchiveItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveMedia" ADD CONSTRAINT "ArchiveMedia_alumniId_fkey" FOREIGN KEY ("alumniId") REFERENCES "Alumni"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveMedia" ADD CONSTRAINT "ArchiveMedia_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveMedia" ADD CONSTRAINT "ArchiveMedia_classSetId_fkey" FOREIGN KEY ("classSetId") REFERENCES "AlumniClassSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArchiveMedia" ADD CONSTRAINT "ArchiveMedia_archiveItemId_fkey" FOREIGN KEY ("archiveItemId") REFERENCES "HistoricalArchiveItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionAudit" ADD CONSTRAINT "PermissionAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionAudit" ADD CONSTRAINT "PermissionAudit_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A media item must have exactly one owner. Private evidence can never be public.
ALTER TABLE "ArchiveMedia"
  ADD CONSTRAINT "ArchiveMedia_exactly_one_owner_check"
  CHECK (num_nonnulls("alumniId", "staffProfileId", "classSetId", "archiveItemId") = 1),
  ADD CONSTRAINT "ArchiveMedia_private_evidence_check"
  CHECK ("kind" <> 'PRIVATE_EVIDENCE' OR "isPublic" = false);

COMMIT;
