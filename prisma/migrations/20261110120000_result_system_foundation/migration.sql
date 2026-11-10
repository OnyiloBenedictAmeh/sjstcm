-- Additive foundation for term-based results. Existing academic records,
-- student identifiers, and enrollment history are intentionally untouched.
CREATE TYPE "AcademicTerm" AS ENUM ('FIRST', 'SECOND', 'THIRD');
CREATE TYPE "ResultSubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'APPROVED');
CREATE TYPE "ResultAttendance" AS ENUM ('PRESENT', 'ABSENT');
CREATE TYPE "ResultReviewAction" AS ENUM ('SUBMITTED', 'RETURNED', 'APPROVED');

CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeachingAssignment" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeachingAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResultPeriod" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "term" "AcademicTerm" NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResultPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResultSubmission" (
    "id" TEXT NOT NULL,
    "resultPeriodId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teachingAssignmentId" TEXT NOT NULL,
    "status" "ResultSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResultSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentSubjectResult" (
    "id" TEXT NOT NULL,
    "resultPeriodId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "attendance" "ResultAttendance" NOT NULL DEFAULT 'PRESENT',
    "caScore" INTEGER,
    "examScore" INTEGER,
    "totalScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudentSubjectResult_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudentSubjectResult_caScore_range" CHECK ("caScore" IS NULL OR ("caScore" >= 0 AND "caScore" <= 40)),
    CONSTRAINT "StudentSubjectResult_examScore_range" CHECK ("examScore" IS NULL OR ("examScore" >= 0 AND "examScore" <= 60)),
    CONSTRAINT "StudentSubjectResult_totalScore_range" CHECK ("totalScore" IS NULL OR ("totalScore" >= 0 AND "totalScore" <= 100)),
    CONSTRAINT "StudentSubjectResult_totalScore_sum" CHECK ("totalScore" IS NULL OR ("caScore" IS NOT NULL AND "examScore" IS NOT NULL AND "totalScore" = "caScore" + "examScore")),
    CONSTRAINT "StudentSubjectResult_absent_has_no_scores" CHECK ("attendance" <> 'ABSENT' OR ("caScore" IS NULL AND "examScore" IS NULL AND "totalScore" IS NULL))
);

CREATE TABLE "ResultReview" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "ResultReviewAction" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResultReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClassResultPublication" (
    "id" TEXT NOT NULL,
    "resultPeriodId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "publishedById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassResultPublication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Subject_code_key" ON "Subject"("code");
CREATE UNIQUE INDEX "Subject_name_key" ON "Subject"("name");
CREATE UNIQUE INDEX "TeachingAssignment_staffProfileId_classId_subjectId_sessionId_key" ON "TeachingAssignment"("staffProfileId", "classId", "subjectId", "sessionId");
CREATE UNIQUE INDEX "TeachingAssignment_id_classId_subjectId_sessionId_key" ON "TeachingAssignment"("id", "classId", "subjectId", "sessionId");
CREATE INDEX "TeachingAssignment_classId_subjectId_sessionId_idx" ON "TeachingAssignment"("classId", "subjectId", "sessionId");
CREATE INDEX "TeachingAssignment_staffProfileId_sessionId_idx" ON "TeachingAssignment"("staffProfileId", "sessionId");
CREATE UNIQUE INDEX "ResultPeriod_sessionId_term_key" ON "ResultPeriod"("sessionId", "term");
CREATE UNIQUE INDEX "ResultPeriod_id_sessionId_key" ON "ResultPeriod"("id", "sessionId");
CREATE INDEX "ResultPeriod_sessionId_createdAt_idx" ON "ResultPeriod"("sessionId", "createdAt");
CREATE UNIQUE INDEX "ResultSubmission_resultPeriodId_classId_subjectId_teachingAssignmentId_key" ON "ResultSubmission"("resultPeriodId", "classId", "subjectId", "teachingAssignmentId");
CREATE UNIQUE INDEX "ResultSubmission_id_resultPeriodId_classId_subjectId_key" ON "ResultSubmission"("id", "resultPeriodId", "classId", "subjectId");
CREATE INDEX "ResultSubmission_resultPeriodId_classId_status_idx" ON "ResultSubmission"("resultPeriodId", "classId", "status");
CREATE INDEX "ResultSubmission_teachingAssignmentId_status_idx" ON "ResultSubmission"("teachingAssignmentId", "status");
CREATE UNIQUE INDEX "StudentSubjectResult_resultPeriodId_studentId_subjectId_key" ON "StudentSubjectResult"("resultPeriodId", "studentId", "subjectId");
CREATE INDEX "StudentSubjectResult_enrollmentId_resultPeriodId_idx" ON "StudentSubjectResult"("enrollmentId", "resultPeriodId");
CREATE INDEX "StudentSubjectResult_submissionId_idx" ON "StudentSubjectResult"("submissionId");
CREATE INDEX "ResultReview_submissionId_createdAt_idx" ON "ResultReview"("submissionId", "createdAt");
CREATE INDEX "ResultReview_actorId_createdAt_idx" ON "ResultReview"("actorId", "createdAt");
CREATE UNIQUE INDEX "ClassResultPublication_resultPeriodId_classId_key" ON "ClassResultPublication"("resultPeriodId", "classId");
CREATE INDEX "ClassResultPublication_classId_publishedAt_idx" ON "ClassResultPublication"("classId", "publishedAt");

ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_staffProfileId_fkey" FOREIGN KEY ("staffProfileId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Enrollment_id_studentId_classId_sessionId_key" ON "Enrollment"("id", "studentId", "classId", "sessionId");
ALTER TABLE "ResultPeriod" ADD CONSTRAINT "ResultPeriod_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultPeriod" ADD CONSTRAINT "ResultPeriod_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ResultSubmission" ADD CONSTRAINT "ResultSubmission_resultPeriodId_sessionId_fkey" FOREIGN KEY ("resultPeriodId", "sessionId") REFERENCES "ResultPeriod"("id", "sessionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultSubmission" ADD CONSTRAINT "ResultSubmission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultSubmission" ADD CONSTRAINT "ResultSubmission_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultSubmission" ADD CONSTRAINT "ResultSubmission_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultSubmission" ADD CONSTRAINT "ResultSubmission_teachingAssignmentId_classId_subjectId_sessionId_fkey" FOREIGN KEY ("teachingAssignmentId", "classId", "subjectId", "sessionId") REFERENCES "TeachingAssignment"("id", "classId", "subjectId", "sessionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentSubjectResult" ADD CONSTRAINT "StudentSubjectResult_resultPeriodId_sessionId_fkey" FOREIGN KEY ("resultPeriodId", "sessionId") REFERENCES "ResultPeriod"("id", "sessionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentSubjectResult" ADD CONSTRAINT "StudentSubjectResult_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentSubjectResult" ADD CONSTRAINT "StudentSubjectResult_enrollmentId_studentId_classId_sessionId_fkey" FOREIGN KEY ("enrollmentId", "studentId", "classId", "sessionId") REFERENCES "Enrollment"("id", "studentId", "classId", "sessionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentSubjectResult" ADD CONSTRAINT "StudentSubjectResult_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentSubjectResult" ADD CONSTRAINT "StudentSubjectResult_submissionId_resultPeriodId_classId_subjectId_fkey" FOREIGN KEY ("submissionId", "resultPeriodId", "classId", "subjectId") REFERENCES "ResultSubmission"("id", "resultPeriodId", "classId", "subjectId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultReview" ADD CONSTRAINT "ResultReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ResultSubmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultReview" ADD CONSTRAINT "ResultReview_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassResultPublication" ADD CONSTRAINT "ClassResultPublication_resultPeriodId_fkey" FOREIGN KEY ("resultPeriodId") REFERENCES "ResultPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassResultPublication" ADD CONSTRAINT "ClassResultPublication_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassResultPublication" ADD CONSTRAINT "ClassResultPublication_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
