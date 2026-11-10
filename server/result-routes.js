const TERMS = new Set(["FIRST", "SECOND", "THIRD"]);
const ATTENDANCE = new Set(["PRESENT", "ABSENT"]);
const ACTIVE_ENROLLMENT = { not: "WITHDRAWN" };

const bad = (res, message, status = 400) => res.status(status).json({ error: message });
const clean = value => typeof value === "string" ? value.trim() : "";
const idValue = value => typeof value === "string" && value.trim() ? value.trim() : null;
const statusCode = error => error?.code === "P2002" || error?.code === "P2034" ? 409 : error?.code === "P2003" ? 400 : error?.code === "P2025" ? 404 : 500;
const serializable = (prisma, work) => prisma.$transaction(work, { isolationLevel: "Serializable" });

function fail(res, error, label) {
  const status = statusCode(error);
  if (error?.code === "P2034") return res.status(409).json({ error: "Another result update conflicted with this request. Retry it." });
  if (status === 500) console.error(`${label}:`, error);
  return res.status(status).json({ error: status === 409 ? "A matching result record already exists." : status === 404 ? "Record not found." : status === 400 ? "A referenced record does not exist." : "Unable to complete the result request." });
}

function validScore(value, max) {
  return value == null || (Number.isInteger(value) && value >= 0 && value <= max);
}

function validateEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "Each result entry must be an object.";
  if (!idValue(entry.enrollmentId)) return "Each result entry must identify an enrollment.";
  if (!ATTENDANCE.has(entry.attendance ?? "PRESENT")) return "Attendance must be PRESENT or ABSENT.";
  const attendance = entry.attendance ?? "PRESENT";
  if (!validScore(entry.caScore, 40)) return "CA score must be an integer from 0 to 40.";
  if (!validScore(entry.examScore, 60)) return "Examination score must be an integer from 0 to 60.";
  if (attendance === "ABSENT" && (entry.caScore != null || entry.examScore != null)) return "Absent students cannot have scores.";
  return null;
}

async function staffAssignment(prisma, userId, assignmentId) {
  const profile = await prisma.staffProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) return null;
  return prisma.teachingAssignment.findFirst({
    where: { id: assignmentId, staffProfileId: profile.id, isPrimary: true },
    include: { class: true, subject: true, session: true }
  });
}

async function getOrCreateSubmission(tx, assignment, period) {
  let submission = await tx.resultSubmission.findFirst({
    where: { resultPeriodId: period.id, classId: assignment.classId, subjectId: assignment.subjectId }
  });
  if (!submission) {
    submission = await tx.resultSubmission.create({ data: {
      resultPeriodId: period.id,
      sessionId: assignment.sessionId,
      classId: assignment.classId,
      subjectId: assignment.subjectId,
      teachingAssignmentId: assignment.id
    } });
  } else if (submission.teachingAssignmentId !== assignment.id) {
    if (submission.status !== "DRAFT" && submission.status !== "RETURNED") return submission;
    submission = await tx.resultSubmission.update({
      where: { id: submission.id }, data: { teachingAssignmentId: assignment.id }
    });
  }
  return submission;
}

export function registerResultRoutes(app, prisma, auth, allow, requirePermission) {
  const admin = [auth, allow("ADMIN"), requirePermission("ACADEMICS_MANAGE")];

  app.get("/api/admin/results/subjects", ...admin, async (_req, res) => {
    try { return res.json(await prisma.subject.findMany({ orderBy: { name: "asc" } })); }
    catch (error) { return fail(res, error, "RESULT SUBJECT LIST ERROR"); }
  });

  app.post("/api/admin/results/subjects", ...admin, async (req, res) => {
    const name = clean(req.body?.name);
    const code = req.body?.code == null ? null : clean(req.body.code) || null;
    if (!name || name.length > 120 || (code && code.length > 40)) return bad(res, "A subject name up to 120 characters and optional code up to 40 characters are required.");
    try { return res.status(201).json(await prisma.subject.create({ data: { name, code } })); }
    catch (error) { return fail(res, error, "RESULT SUBJECT CREATE ERROR"); }
  });

  app.patch("/api/admin/results/subjects/:subjectId", ...admin, async (req, res) => {
    const data = {};
    if (Object.hasOwn(req.body || {}, "name")) {
      const name = clean(req.body.name);
      if (!name || name.length > 120) return bad(res, "Subject name is required and must be at most 120 characters.");
      data.name = name;
    }
    if (Object.hasOwn(req.body || {}, "code")) {
      const code = req.body.code == null ? null : clean(req.body.code) || null;
      if (code && code.length > 40) return bad(res, "Subject code must be at most 40 characters.");
      data.code = code;
    }
    if (Object.hasOwn(req.body || {}, "isActive")) {
      if (typeof req.body.isActive !== "boolean") return bad(res, "isActive must be true or false.");
      data.isActive = req.body.isActive;
    }
    if (!Object.keys(data).length) return bad(res, "Provide at least one subject field to update.");
    try { return res.json(await prisma.subject.update({ where: { id: req.params.subjectId }, data })); }
    catch (error) { return fail(res, error, "RESULT SUBJECT UPDATE ERROR"); }
  });

  app.get("/api/admin/results/classes/:classId/subjects", ...admin, async (req, res) => {
    try {
      const rows = await prisma.classSubjectRequirement.findMany({ where: { classId: req.params.classId }, include: { subject: true, session: true }, orderBy: [{ session: { name: "desc" } }, { subject: { name: "asc" } }] });
      return res.json(rows);
    } catch (error) { return fail(res, error, "RESULT REQUIREMENT LIST ERROR"); }
  });

  app.put("/api/admin/results/classes/:classId/subjects", ...admin, async (req, res) => {
    const sessionId = idValue(req.body?.sessionId);
    const subjectIds = req.body?.subjectIds;
    if (!sessionId || !Array.isArray(subjectIds) || subjectIds.some(value => !idValue(value)) || new Set(subjectIds).size !== subjectIds.length) return bad(res, "Provide a session and a unique list of subject IDs.");
    try {
      const [classRow, session, subjects] = await Promise.all([
        prisma.class.findUnique({ where: { id: req.params.classId }, select: { id: true } }),
        prisma.session.findUnique({ where: { id: sessionId }, select: { id: true } }),
        prisma.subject.findMany({ where: { id: { in: subjectIds }, isActive: true }, select: { id: true } }),
      ]);
      if (!classRow || !session || subjects.length !== subjectIds.length) return bad(res, "Class, session, or subject was not found.", 404);
      const updated = await serializable(prisma, async tx => {
        const published = await tx.classResultPublication.findFirst({ where: { classId: req.params.classId, resultPeriod: { sessionId } } });
        const submissions = await tx.resultSubmission.findFirst({ where: { classId: req.params.classId, sessionId } });
        if (published || submissions) return false;
        await tx.classSubjectRequirement.deleteMany({ where: { classId: req.params.classId, sessionId } });
        for (const subjectId of subjectIds) await tx.classSubjectRequirement.create({ data: { classId: req.params.classId, sessionId, subjectId } });
        return true;
      });
      if (!updated) return bad(res, "Required subjects cannot change after result entry has started.", 409);
      return res.json(await prisma.classSubjectRequirement.findMany({ where: { classId: req.params.classId, sessionId }, include: { subject: true } }));
    } catch (error) { return fail(res, error, "RESULT REQUIREMENT UPDATE ERROR"); }
  });

  app.post("/api/admin/results/assignments", ...admin, async (req, res) => {
    const { staffProfileId, classId, subjectId, sessionId } = req.body || {};
    if (![staffProfileId, classId, subjectId, sessionId].every(idValue)) return bad(res, "Staff profile, class, subject, and session are required.");
    try {
      const [profile, subject] = await Promise.all([
        prisma.staffProfile.findUnique({ where: { id: staffProfileId }, select: { id: true, employmentStatus: true } }),
        prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true, isActive: true } })
      ]);
      if (!profile || profile.employmentStatus !== "CURRENT" || !subject?.isActive) return bad(res, "A current staff profile and active subject are required.", 400);
      const existing = await prisma.teachingAssignment.findMany({ where: { classId, subjectId, sessionId } });
      const hasPrimary = existing.some(row => row.isPrimary);
      const isPrimary = !hasPrimary;
      if (req.body.isPrimary === true && hasPrimary) return bad(res, "Use the primary-teacher change endpoint to replace the current primary.", 409);
      const assignment = await serializable(prisma, async tx => {
        const created = await tx.teachingAssignment.create({ data: { staffProfileId, classId, subjectId, sessionId, isPrimary } });
        await tx.teachingAssignmentAudit.create({ data: { assignmentId: created.id, actorId: req.user.sub, action: "ASSIGNED", toAssignmentId: created.id } });
        return created;
      });
      return res.status(201).json(assignment);
    } catch (error) { return fail(res, error, "TEACHING ASSIGNMENT CREATE ERROR"); }
  });

  app.get("/api/admin/results/assignments", ...admin, async (req, res) => {
    const where = {};
    for (const key of ["classId", "subjectId", "sessionId"]) if (req.query[key]) where[key] = req.query[key];
    try { return res.json(await prisma.teachingAssignment.findMany({ where, include: { staffProfile: { select: { id: true, fullName: true } }, class: true, subject: true, session: true }, orderBy: [{ class: { name: "asc" } }, { subject: { name: "asc" } }, { isPrimary: "desc" }] })); }
    catch (error) { return fail(res, error, "TEACHING ASSIGNMENT LIST ERROR"); }
  });

  app.patch("/api/admin/results/assignments/:assignmentId/primary", ...admin, async (req, res) => {
    const reason = clean(req.body?.reason);
    if (reason.length > 500) return bad(res, "Reason must be at most 500 characters.");
    try {
      const changed = await serializable(prisma, async tx => {
        const target = await tx.teachingAssignment.findUnique({ where: { id: req.params.assignmentId } });
        if (!target) return null;
        if (target.isPrimary) return { current: true, assignment: target };
        const targetStaff = await tx.staffProfile.findUnique({ where: { id: target.staffProfileId }, select: { employmentStatus: true } });
        if (targetStaff?.employmentStatus !== "CURRENT") return { formerStaff: true };
        const previous = await tx.teachingAssignment.findFirst({ where: { classId: target.classId, subjectId: target.subjectId, sessionId: target.sessionId, isPrimary: true } });
        if (previous) await tx.teachingAssignment.update({ where: { id: previous.id }, data: { isPrimary: false } });
        const assignment = await tx.teachingAssignment.update({ where: { id: target.id }, data: { isPrimary: true } });
        await tx.teachingAssignmentAudit.create({ data: { assignmentId: target.id, actorId: req.user.sub, action: "PRIMARY_CHANGED", fromAssignmentId: previous?.id || null, toAssignmentId: target.id, reason: reason || null } });
        return { assignment, previousAssignmentId: previous?.id || null };
      });
      if (!changed) return bad(res, "Teaching assignment not found.", 404);
      if (changed.formerStaff) return bad(res, "Only a current staff member can be the primary result-entry teacher.");
      return res.json(changed);
    } catch (error) { return fail(res, error, "PRIMARY TEACHER CHANGE ERROR"); }
  });

  app.get("/api/admin/results/assignments/:assignmentId/audit", ...admin, async (req, res) => {
    try { return res.json(await prisma.teachingAssignmentAudit.findMany({ where: { assignmentId: req.params.assignmentId }, include: { actor: { select: { id: true, email: true } }, fromAssignment: { include: { staffProfile: { select: { fullName: true } } } }, toAssignment: { include: { staffProfile: { select: { fullName: true } } } } }, orderBy: { createdAt: "asc" } })); }
    catch (error) { return fail(res, error, "PRIMARY TEACHER AUDIT ERROR"); }
  });

  app.post("/api/admin/results/periods", ...admin, async (req, res) => {
    const sessionId = idValue(req.body?.sessionId), term = req.body?.term;
    if (!sessionId || !TERMS.has(term)) return bad(res, "A valid session and FIRST, SECOND, or THIRD term are required.");
    try { return res.status(201).json(await prisma.resultPeriod.create({ data: { sessionId, term, createdById: req.user.sub } })); }
    catch (error) { return fail(res, error, "RESULT PERIOD CREATE ERROR"); }
  });

  app.get("/api/admin/results/periods", ...admin, async (_req, res) => {
    try { return res.json(await prisma.resultPeriod.findMany({ include: { session: true }, orderBy: [{ session: { name: "desc" } }, { term: "asc" }] })); }
    catch (error) { return fail(res, error, "RESULT PERIOD LIST ERROR"); }
  });

  app.post("/api/admin/results/periods/:periodId/exemptions", ...admin, async (req, res) => {
    const requirementId = idValue(req.body?.requirementId), reason = clean(req.body?.reason);
    if (!requirementId || !reason || reason.length > 1000) return bad(res, "A required-subject ID and reason up to 1000 characters are required.");
    try {
      const created = await serializable(prisma, async tx => {
        const [period, requirement, published] = await Promise.all([
          tx.resultPeriod.findUnique({ where: { id: req.params.periodId } }),
          tx.classSubjectRequirement.findUnique({ where: { id: requirementId } }),
          tx.classResultPublication.findFirst({ where: { resultPeriodId: req.params.periodId } })
        ]);
        if (!period || !requirement) return { missing: true };
        if (period.sessionId !== requirement.sessionId) return { invalidSession: true };
        if (published) return { published: true };
        return { exemption: await tx.resultSubjectExemption.create({ data: { resultPeriodId: period.id, requirementId, reason, authorizedById: req.user.sub } }) };
      });
      if (created.missing) return bad(res, "Result period or required subject was not found.", 404);
      if (created.invalidSession) return bad(res, "The requirement is not configured for this academic session.");
      if (created.published) return bad(res, "A published class result cannot be changed.", 409);
      return res.status(201).json(created.exemption);
    } catch (error) { return fail(res, error, "RESULT EXEMPTION CREATE ERROR"); }
  });

  app.get("/api/teacher/results/assignments", auth, allow("STAFF"), async (req, res) => {
    try {
      const profile = await prisma.staffProfile.findUnique({ where: { userId: req.user.sub }, select: { id: true } });
      if (!profile) return bad(res, "A staff profile is required.", 403);
      return res.json(await prisma.teachingAssignment.findMany({ where: { staffProfileId: profile.id, isPrimary: true }, include: { class: true, subject: true, session: true }, orderBy: [{ session: { name: "desc" } }, { class: { name: "asc" } }, { subject: { name: "asc" } }] }));
    } catch (error) { return fail(res, error, "TEACHER ASSIGNMENT LIST ERROR"); }
  });

  app.get("/api/teacher/results/assignments/:assignmentId/periods/:periodId/roster", auth, allow("STAFF"), async (req, res) => {
    try {
      const [assignment, period] = await Promise.all([
        staffAssignment(prisma, req.user.sub, req.params.assignmentId),
        prisma.resultPeriod.findUnique({ where: { id: req.params.periodId } })
      ]);
      if (!assignment) return bad(res, "Primary teaching assignment not found.", 403);
      if (!period || period.sessionId !== assignment.sessionId) return bad(res, "Result period not found for this assignment.", 404);
      const publication = await prisma.classResultPublication.findFirst({ where: { resultPeriodId: period.id, classId: assignment.classId } });
      if (publication) return bad(res, "This class term has already been published.", 409);
      const [submission, enrollments] = await Promise.all([
        prisma.resultSubmission.findFirst({ where: { resultPeriodId: period.id, classId: assignment.classId, subjectId: assignment.subjectId } }),
        prisma.enrollment.findMany({ where: { classId: assignment.classId, sessionId: assignment.sessionId, status: ACTIVE_ENROLLMENT }, include: { student: { select: { id: true, studentId: true, firstName: true, middleName: true, lastName: true } } }, orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }] })
      ]);
      const rows = submission ? await prisma.studentSubjectResult.findMany({ where: { submissionId: submission.id } }) : [];
      return res.json({ assignment, period, submission, roster: enrollments.map(enrollment => ({ enrollmentId: enrollment.id, ...enrollment.student, result: rows.find(row => row.enrollmentId === enrollment.id) || null })) });
    } catch (error) { return fail(res, error, "TEACHER RESULT ROSTER ERROR"); }
  });

  app.put("/api/teacher/results/assignments/:assignmentId/periods/:periodId/draft", auth, allow("STAFF"), async (req, res) => {
    const entries = req.body?.entries;
    if (!Array.isArray(entries) || entries.length > 1000) return bad(res, "Entries must be a list of at most 1000 results.");
    const validationError = entries.map(validateEntry).find(Boolean);
    if (validationError) return bad(res, validationError);
    const enrollmentIds = entries.map(entry => entry.enrollmentId);
    if (new Set(enrollmentIds).size !== enrollmentIds.length) return bad(res, "An enrollment may appear only once in a submission.");
    try {
      const assignment = await staffAssignment(prisma, req.user.sub, req.params.assignmentId);
      if (!assignment) return bad(res, "Primary teaching assignment not found.", 403);
      const period = await prisma.resultPeriod.findUnique({ where: { id: req.params.periodId } });
      if (!period || period.sessionId !== assignment.sessionId) return bad(res, "Result period not found for this assignment.", 404);
      const publication = await prisma.classResultPublication.findFirst({ where: { resultPeriodId: period.id, classId: assignment.classId } });
      if (publication) return bad(res, "This class term has already been published.", 409);
      const enrollments = await prisma.enrollment.findMany({ where: { id: { in: enrollmentIds }, classId: assignment.classId, sessionId: assignment.sessionId, status: ACTIVE_ENROLLMENT }, select: { id: true, studentId: true } });
      if (enrollments.length !== enrollmentIds.length) return bad(res, "Every result must belong to an enrolled student in this assigned class and session.", 403);
      const submission = await serializable(prisma, async tx => {
        if (await tx.classResultPublication.findFirst({ where: { resultPeriodId: period.id, classId: assignment.classId } })) return { published: true };
        const current = await getOrCreateSubmission(tx, assignment, period);
        if (current.status !== "DRAFT" && current.status !== "RETURNED") throw Object.assign(new Error("Submission is locked."), { code: "P2025" });
        for (const entry of entries) {
          const enrollment = enrollments.find(row => row.id === entry.enrollmentId);
          const existing = await tx.studentSubjectResult.findUnique({ where: { resultPeriodId_studentId_subjectId: { resultPeriodId: period.id, studentId: enrollment.studentId, subjectId: assignment.subjectId } } });
          if (existing && existing.submissionId !== current.id) throw Object.assign(new Error("Duplicate student result."), { code: "P2002" });
          const attendance = entry.attendance ?? "PRESENT";
          const caScore = attendance === "ABSENT" ? null : entry.caScore ?? null;
          const examScore = attendance === "ABSENT" ? null : entry.examScore ?? null;
          const totalScore = caScore != null && examScore != null ? caScore + examScore : null;
          await tx.studentSubjectResult.upsert({
            where: { resultPeriodId_studentId_subjectId: { resultPeriodId: period.id, studentId: enrollment.studentId, subjectId: assignment.subjectId } },
            create: { resultPeriodId: period.id, studentId: enrollment.studentId, enrollmentId: enrollment.id, classId: assignment.classId, sessionId: assignment.sessionId, subjectId: assignment.subjectId, submissionId: current.id, attendance, caScore, examScore, totalScore },
            update: { enrollmentId: enrollment.id, submissionId: current.id, attendance, caScore, examScore, totalScore }
          });
        }
        return tx.resultSubmission.update({ where: { id: current.id }, data: { status: "DRAFT" } });
      });
      if (submission.published) return bad(res, "This class term has already been published.", 409);
      return res.json(submission);
    } catch (error) { return fail(res, error, "RESULT DRAFT SAVE ERROR"); }
  });

  app.post("/api/teacher/results/assignments/:assignmentId/periods/:periodId/submit", auth, allow("STAFF"), async (req, res) => {
    try {
      const assignment = await staffAssignment(prisma, req.user.sub, req.params.assignmentId);
      if (!assignment) return bad(res, "Primary teaching assignment not found.", 403);
      const period = await prisma.resultPeriod.findUnique({ where: { id: req.params.periodId } });
      if (!period || period.sessionId !== assignment.sessionId) return bad(res, "Result period not found for this assignment.", 404);
      if (await prisma.classResultPublication.findFirst({ where: { resultPeriodId: period.id, classId: assignment.classId } })) return bad(res, "This class term has already been published.", 409);
      const enrollments = await prisma.enrollment.findMany({ where: { classId: assignment.classId, sessionId: assignment.sessionId, status: ACTIVE_ENROLLMENT }, select: { id: true, studentId: true } });
      const submitted = await serializable(prisma, async tx => {
        if (await tx.classResultPublication.findFirst({ where: { resultPeriodId: period.id, classId: assignment.classId } })) return { published: true };
        const submission = await getOrCreateSubmission(tx, assignment, period);
        if (submission.status !== "DRAFT" && submission.status !== "RETURNED") throw Object.assign(new Error("Submission is not editable."), { code: "P2025" });
        const rows = await tx.studentSubjectResult.findMany({ where: { submissionId: submission.id } });
        const byEnrollment = new Map(rows.map(row => [row.enrollmentId, row]));
        const incomplete = enrollments.filter(enrollment => {
          const row = byEnrollment.get(enrollment.id);
          return !row || (row.attendance === "PRESENT" && (row.caScore == null || row.examScore == null));
        });
        if (incomplete.length) return { incomplete: incomplete.map(row => row.id) };
        const updated = await tx.resultSubmission.update({ where: { id: submission.id }, data: { status: "SUBMITTED" } });
        await tx.resultReview.create({ data: { submissionId: submission.id, actorId: req.user.sub, action: "SUBMITTED" } });
        return { submission: updated };
      });
      if (submitted.published) return bad(res, "This class term has already been published.", 409);
      if (submitted.incomplete) return bad(res, "Every enrolled student needs a complete score or an absent status before submission.", 409);
      return res.json(submitted.submission);
    } catch (error) { return fail(res, error, "RESULT SUBMIT ERROR"); }
  });

  app.get("/api/admin/results/submissions", auth, allow("ADMIN", "STAFF"), requirePermission("RESULTS_REVIEW"), async (req, res) => {
    const where = {};
    for (const key of ["resultPeriodId", "classId"]) if (req.query[key]) where[key] = req.query[key];
    if (req.query.status) {
      if (!["DRAFT", "SUBMITTED", "RETURNED", "APPROVED"].includes(req.query.status)) return bad(res, "Submission status is invalid.");
      where.status = req.query.status;
    }
    try { return res.json(await prisma.resultSubmission.findMany({ where, include: { subject: true, class: true, resultPeriod: { include: { session: true } }, teachingAssignment: { include: { staffProfile: { select: { fullName: true } } } }, reviews: { include: { actor: { select: { id: true, email: true } } }, orderBy: { createdAt: "asc" } } }, orderBy: { updatedAt: "desc" } })); }
    catch (error) { return fail(res, error, "RESULT REVIEW QUEUE ERROR"); }
  });

  app.post("/api/admin/results/submissions/:submissionId/review", auth, allow("ADMIN", "STAFF"), requirePermission("RESULTS_REVIEW"), async (req, res) => {
    const action = req.body?.action, reason = clean(req.body?.reason);
    if (!["RETURNED", "APPROVED"].includes(action)) return bad(res, "Review action must be RETURNED or APPROVED.");
    if (action === "RETURNED" && !reason) return bad(res, "A reason is required when returning a submission.");
    if (reason.length > 1000) return bad(res, "Reason must be at most 1000 characters.");
    try {
      const reviewed = await serializable(prisma, async tx => {
        const submission = await tx.resultSubmission.findUnique({ where: { id: req.params.submissionId } });
        if (!submission) return null;
        if (submission.status !== "SUBMITTED") return { conflict: true };
        if (await tx.classResultPublication.findFirst({ where: { resultPeriodId: submission.resultPeriodId, classId: submission.classId } })) return { conflict: true };
        if (action === "APPROVED") {
          const [period, enrollments, rows] = await Promise.all([
            tx.resultPeriod.findUnique({ where: { id: submission.resultPeriodId } }),
            tx.enrollment.findMany({ where: { classId: submission.classId, sessionId: submission.sessionId, status: ACTIVE_ENROLLMENT }, select: { id: true } }),
            tx.studentSubjectResult.findMany({ where: { submissionId: submission.id } })
          ]);
          if (!period) return { conflict: true };
          const byEnrollment = new Map(rows.map(row => [row.enrollmentId, row]));
          const incomplete = enrollments.some(enrollment => {
            const row = byEnrollment.get(enrollment.id);
            return !row || (row.attendance === "PRESENT" && (row.caScore == null || row.examScore == null));
          });
          if (incomplete) return { incomplete: true };
        }
        const updated = await tx.resultSubmission.update({ where: { id: submission.id }, data: { status: action } });
        await tx.resultReview.create({ data: { submissionId: submission.id, actorId: req.user.sub, action, reason: reason || null } });
        return { submission: updated };
      });
      if (!reviewed) return bad(res, "Submission not found.", 404);
      if (reviewed.conflict) return bad(res, "Only unpublished submitted results can be reviewed.", 409);
      if (reviewed.incomplete) return bad(res, "The submission is missing scores or attendance for enrolled students.", 409);
      return res.json(reviewed.submission);
    } catch (error) { return fail(res, error, "RESULT REVIEW ERROR"); }
  });

  app.post("/api/admin/results/periods/:periodId/classes/:classId/publish", ...admin, async (req, res) => {
    try {
      const publication = await serializable(prisma, async tx => {
        const period = await tx.resultPeriod.findUnique({ where: { id: req.params.periodId } });
        if (!period) return { missingPeriod: true };
        const existing = await tx.classResultPublication.findFirst({ where: { resultPeriodId: period.id, classId: req.params.classId } });
        if (existing) return { existing };
        const requirements = await tx.classSubjectRequirement.findMany({ where: { classId: req.params.classId, sessionId: period.sessionId }, include: { exemptions: { where: { resultPeriodId: period.id } } } });
        if (!requirements.length) return { unconfigured: true };
        const missing = [];
        for (const requirement of requirements) {
          if (requirement.exemptions.length) continue;
          // Approved work from a previous primary remains valid after an audited handoff.
          const submission = await tx.resultSubmission.findFirst({ where: { resultPeriodId: period.id, classId: req.params.classId, subjectId: requirement.subjectId, status: "APPROVED" } });
          if (!submission || submission.status !== "APPROVED") missing.push(requirement.subjectId);
        }
        if (missing.length) return { missing };
        const created = await tx.classResultPublication.create({ data: { resultPeriodId: period.id, classId: req.params.classId, publishedById: req.user.sub } });
        return { publication: created };
      });
      if (publication.missingPeriod) return bad(res, "Result period not found.", 404);
      if (publication.unconfigured) return bad(res, "Configure at least one required subject before publishing class results.", 409);
      if (publication.missing) return res.status(409).json({ error: "Required subjects are not approved or exempted.", missingSubjectIds: publication.missing });
      if (publication.existing) return bad(res, "Class results for this period are already published.", 409);
      return res.status(201).json(publication.publication);
    } catch (error) { return fail(res, error, "RESULT PUBLICATION ERROR"); }
  });

  app.get("/api/admin/results/periods/:periodId/classes/:classId/broadsheet", auth, allow("ADMIN", "STAFF"), requirePermission("RESULTS_REVIEW"), async (req, res) => {
    try {
      const period = await prisma.resultPeriod.findUnique({ where: { id: req.params.periodId } });
      if (!period) return bad(res, "Result period not found.", 404);
      const [publication, enrollments, requirements, results] = await Promise.all([
        prisma.classResultPublication.findFirst({ where: { resultPeriodId: period.id, classId: req.params.classId } }),
        prisma.enrollment.findMany({ where: { classId: req.params.classId, sessionId: period.sessionId, status: ACTIVE_ENROLLMENT }, include: { student: { select: { id: true, studentId: true, firstName: true, middleName: true, lastName: true } } }, orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }] }),
        prisma.classSubjectRequirement.findMany({ where: { classId: req.params.classId, sessionId: period.sessionId }, include: { subject: true } }),
        prisma.studentSubjectResult.findMany({ where: { resultPeriodId: period.id, classId: req.params.classId }, include: { subject: true } })
      ]);
      return res.json({ period, classId: req.params.classId, published: Boolean(publication), requirements, students: enrollments.map(enrollment => ({ enrollmentId: enrollment.id, ...enrollment.student, results: results.filter(result => result.enrollmentId === enrollment.id) })) });
    } catch (error) { return fail(res, error, "RESULT BROADSHEET ERROR"); }
  });

  app.get("/api/student/results", auth, allow("STUDENT"), async (req, res) => {
    try {
      const student = await prisma.student.findUnique({ where: { userId: req.user.sub }, select: { id: true } });
      if (!student) return bad(res, "Student profile not found.", 404);
      const results = await prisma.studentSubjectResult.findMany({
        where: { studentId: student.id, resultPeriod: { publications: { some: {} } } },
        include: { subject: { select: { id: true, name: true, code: true } }, resultPeriod: { include: { session: { select: { name: true } }, publications: true } }, enrollment: { include: { class: { select: { id: true, name: true } } } } },
        orderBy: [{ resultPeriod: { session: { name: "desc" } } }, { subject: { name: "asc" } }]
      });
      return res.json(results
        .filter(result => result.resultPeriod.publications.some(publication => publication.classId === result.enrollment.classId))
        .map(result => ({
          term: result.resultPeriod.term,
          session: result.resultPeriod.session.name,
          class: result.enrollment.class,
          subject: result.subject,
          attendance: result.attendance,
          caScore: result.caScore,
          examScore: result.examScore,
          totalScore: result.totalScore
        })));
    } catch (error) { return fail(res, error, "STUDENT RESULT LIST ERROR"); }
  });
}
