-- Additive Phase 2 configuration, primary-teacher, exemption and audit support.
ALTER TABLE "TeachingAssignment"
ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "TeachingAssignment_one_primary_per_class_subject_session"
ON "TeachingAssignment" ("classId", "subjectId", "sessionId")
WHERE "isPrimary" = true;

CREATE TABLE "ClassSubjectRequirement" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassSubjectRequirement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClassSubjectRequirement_classId_sessionId_subjectId_key"
ON "ClassSubjectRequirement"("classId", "sessionId", "subjectId");
CREATE INDEX "ClassSubjectRequirement_sessionId_classId_idx"
ON "ClassSubjectRequirement"("sessionId", "classId");

CREATE TYPE "TeachingAssignmentAuditAction" AS ENUM ('ASSIGNED', 'PRIMARY_CHANGED');
CREATE TABLE "TeachingAssignmentAudit" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "TeachingAssignmentAuditAction" NOT NULL,
    "fromAssignmentId" TEXT,
    "toAssignmentId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeachingAssignmentAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TeachingAssignmentAudit_assignmentId_createdAt_idx"
ON "TeachingAssignmentAudit"("assignmentId", "createdAt");
CREATE INDEX "TeachingAssignmentAudit_actorId_createdAt_idx"
ON "TeachingAssignmentAudit"("actorId", "createdAt");

CREATE TABLE "ResultSubjectExemption" (
    "id" TEXT NOT NULL,
    "resultPeriodId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "authorizedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResultSubjectExemption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ResultSubjectExemption_resultPeriodId_requirementId_key"
ON "ResultSubjectExemption"("resultPeriodId", "requirementId");
CREATE INDEX "ResultSubjectExemption_requirementId_createdAt_idx"
ON "ResultSubjectExemption"("requirementId", "createdAt");

ALTER TABLE "ClassSubjectRequirement" ADD CONSTRAINT "ClassSubjectRequirement_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassSubjectRequirement" ADD CONSTRAINT "ClassSubjectRequirement_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassSubjectRequirement" ADD CONSTRAINT "ClassSubjectRequirement_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeachingAssignmentAudit" ADD CONSTRAINT "TeachingAssignmentAudit_assignmentId_fkey"
FOREIGN KEY ("assignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeachingAssignmentAudit" ADD CONSTRAINT "TeachingAssignmentAudit_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeachingAssignmentAudit" ADD CONSTRAINT "TeachingAssignmentAudit_fromAssignmentId_fkey"
FOREIGN KEY ("fromAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeachingAssignmentAudit" ADD CONSTRAINT "TeachingAssignmentAudit_toAssignmentId_fkey"
FOREIGN KEY ("toAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultSubjectExemption" ADD CONSTRAINT "ResultSubjectExemption_resultPeriodId_fkey"
FOREIGN KEY ("resultPeriodId") REFERENCES "ResultPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultSubjectExemption" ADD CONSTRAINT "ResultSubjectExemption_requirementId_fkey"
FOREIGN KEY ("requirementId") REFERENCES "ClassSubjectRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResultSubjectExemption" ADD CONSTRAINT "ResultSubjectExemption_authorizedById_fkey"
FOREIGN KEY ("authorizedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "check_one_primary_teaching_assignment"() RETURNS trigger AS $$
DECLARE
    target_class TEXT;
    target_subject TEXT;
    target_session TEXT;
    assignment_count INTEGER;
    primary_count INTEGER;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_class := OLD."classId";
        target_subject := OLD."subjectId";
        target_session := OLD."sessionId";
    ELSE
        target_class := NEW."classId";
        target_subject := NEW."subjectId";
        target_session := NEW."sessionId";
    END IF;
    SELECT COUNT(*), COUNT(*) FILTER (WHERE "isPrimary")
      INTO assignment_count, primary_count
      FROM "TeachingAssignment"
     WHERE "classId" = target_class AND "subjectId" = target_subject AND "sessionId" = target_session;
    IF assignment_count > 0 AND primary_count <> 1 THEN
        RAISE EXCEPTION 'A class, subject and session must have exactly one primary result-entry teacher';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "TeachingAssignment_exactly_one_primary"
AFTER INSERT OR UPDATE OR DELETE ON "TeachingAssignment"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "check_one_primary_teaching_assignment"();
