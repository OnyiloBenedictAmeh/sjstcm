const ENROLLMENT_STATUSES = new Set(["ENROLLED", "PROMOTED", "COMPLETED", "WITHDRAWN"]);

function clean(value) { return typeof value === "string" ? value.trim() : ""; }
function dateValue(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}
function bad(res, message) { return res.status(400).json({ error: message }); }
function apiError(res, error, label) {
  if (error?.code === "P2002") return res.status(409).json({ error: "A record with that identifier already exists." });
  if (error?.code === "P2025") return res.status(404).json({ error: "Record not found." });
  if (error?.code === "P2003") return res.status(400).json({ error: "A referenced student, class, or session does not exist." });
  if (error?.code === "P2034") return res.status(409).json({ error: "The session changed concurrently. Refresh and try again." });
  console.error(`${label}:`, error);
  return res.status(500).json({ error: "Unable to complete the request." });
}

export function registerMainAdminRoutes(app, prisma, auth, requirePermission, getCurrentPermissions) {
  const viewStudents = [auth, requirePermission("STUDENTS_VIEW")];
  const manageStudents = [auth, requirePermission("STUDENTS_MANAGE")];
  const viewAcademics = [auth, requirePermission("ACADEMICS_VIEW")];
  const manageAcademics = [auth, requirePermission("ACADEMICS_MANAGE")];

  app.get("/api/admin/students/enrollment-options", ...viewStudents, async (_, res) => {
    try {
      const [classes, sessions] = await Promise.all([
        prisma.class.findMany({ select: { id: true, name: true, level: true }, orderBy: { name: "asc" } }),
        prisma.session.findMany({ select: { id: true, name: true, isCurrent: true }, orderBy: { name: "desc" } })
      ]);
      return res.json({ classes, sessions });
    } catch (error) { return apiError(res, error, "STUDENT ENROLLMENT OPTIONS ERROR"); }
  });

  app.get("/api/admin/students/:id", ...viewStudents, async (req, res) => {
    try {
      const student = await prisma.student.findUnique({
        where: { id: req.params.id },
        select: {
          id: true, studentId: true, firstName: true, middleName: true, lastName: true,
          dateOfBirth: true, gender: true, email: true, phone: true, address: true,
          photoUrl: true, status: true, userId: true, createdAt: true, updatedAt: true,
          enrollments: {
            include: {
              class: { select: { id: true, name: true, level: true } },
              session: { select: { id: true, name: true, startDate: true, endDate: true, isCurrent: true } }
            },
            orderBy: { createdAt: "desc" }
          }
        }
      });
      if (!student) return res.status(404).json({ error: "Student not found." });
      const permissions = req.user.role === "ADMIN" ? ["RESULTS_REVIEW"] : await getCurrentPermissions(req.user.sub);
      const currentEnrollment = student.enrollments.find(item => item.session.isCurrent && item.status === "ENROLLED") || null;
      const academicRecords = permissions.includes("RESULTS_REVIEW")
        ? await prisma.academicRecord.findMany({
            where: { studentId: student.id },
            select: { id: true, subject: true, caScore: true, examScore: true, totalScore: true, grade: true, remark: true, createdAt: true, session: { select: { id: true, name: true } } },
            orderBy: [{ session: { name: "desc" } }, { subject: "asc" }]
          })
        : undefined;
      return res.json({
        ...student,
        hasPortalAccount: Boolean(student.userId),
        userId: undefined,
        currentEnrollment,
        ...(academicRecords ? { academicRecords } : {})
      });
    } catch (error) { return apiError(res, error, "ADMIN STUDENT PROFILE ERROR"); }
  });

  app.get("/api/admin/students/:id/enrollments", ...viewStudents, async (req, res) => {
    try {
      const student = await prisma.student.findUnique({ where: { id: req.params.id }, select: { id: true } });
      if (!student) return res.status(404).json({ error: "Student not found." });
      const enrollments = await prisma.enrollment.findMany({
        where: { studentId: student.id },
        include: {
          class: { select: { id: true, name: true, level: true } },
          session: { select: { id: true, name: true, startDate: true, endDate: true, isCurrent: true } }
        },
        orderBy: { createdAt: "desc" }
      });
      return res.json(enrollments.map(item => ({ ...item, isCurrent: item.session.isCurrent && item.status === "ENROLLED" })));
    } catch (error) { return apiError(res, error, "ADMIN ENROLLMENT HISTORY ERROR"); }
  });

  app.post("/api/admin/students/:id/enrollments", ...manageStudents, async (req, res) => {
    const classId = clean(req.body.classId), sessionId = clean(req.body.sessionId);
    const status = clean(req.body.status) || "ENROLLED";
    if (!classId || !sessionId) return bad(res, "Both classId and sessionId are required.");
    if (!ENROLLMENT_STATUSES.has(status)) return bad(res, "Enrollment status is invalid.");
    try {
      const [student, classRecord, session] = await Promise.all([
        prisma.student.findUnique({ where: { id: req.params.id }, select: { id: true } }),
        prisma.class.findUnique({ where: { id: classId }, select: { id: true } }),
        prisma.session.findUnique({ where: { id: sessionId }, select: { id: true } })
      ]);
      if (!student || !classRecord || !session) return res.status(404).json({ error: "Student, class, or session not found." });
      const enrollment = await prisma.enrollment.create({ data: { studentId: student.id, classId, sessionId, status }, include: { class: { select: { id: true, name: true } }, session: { select: { id: true, name: true, isCurrent: true } } } });
      return res.status(201).json(enrollment);
    } catch (error) { return apiError(res, error, "ADMIN ENROLLMENT CREATE ERROR"); }
  });

  app.patch("/api/admin/students/:id/enrollments/:enrollmentId/status", ...manageStudents, async (req, res) => {
    const status = clean(req.body.status);
    if (!ENROLLMENT_STATUSES.has(status)) return bad(res, "Enrollment status is invalid.");
    try {
      const current = await prisma.enrollment.findUnique({ where: { id: req.params.enrollmentId }, select: { id: true, studentId: true } });
      if (!current || current.studentId !== req.params.id) return res.status(404).json({ error: "Enrollment not found for this student." });
      const enrollment = await prisma.enrollment.update({ where: { id: current.id }, data: { status }, include: { class: { select: { id: true, name: true } }, session: { select: { id: true, name: true, isCurrent: true } } } });
      return res.json(enrollment);
    } catch (error) { return apiError(res, error, "ADMIN ENROLLMENT UPDATE ERROR"); }
  });

  app.post("/api/admin/students/:id/enrollments/transfer", ...manageStudents, async (req, res) => {
    const enrollmentId = clean(req.body.enrollmentId), classId = clean(req.body.classId), sessionId = clean(req.body.sessionId);
    if (!enrollmentId || !classId || !sessionId) return bad(res, "enrollmentId, classId, and sessionId are required.");
    try {
      const [student, previous, classRecord, session] = await Promise.all([
        prisma.student.findUnique({ where: { id: req.params.id }, select: { id: true } }),
        prisma.enrollment.findUnique({ where: { id: enrollmentId }, select: { id: true, studentId: true, status: true, sessionId: true } }),
        prisma.class.findUnique({ where: { id: classId }, select: { id: true } }),
        prisma.session.findUnique({ where: { id: sessionId }, select: { id: true } })
      ]);
      if (!student || !previous || previous.studentId !== req.params.id || !classRecord || !session) return res.status(404).json({ error: "Student, enrollment, class, or session not found." });
      if (previous.status !== "ENROLLED") return bad(res, "Only an active enrollment can be transferred.");
      if (previous.sessionId === sessionId) return bad(res, "A transfer must use a different academic session.");
      const result = await prisma.$transaction(async tx => {
        const next = await tx.enrollment.create({ data: { studentId: student.id, classId, sessionId, status: "ENROLLED" }, include: { class: { select: { id: true, name: true } }, session: { select: { id: true, name: true, isCurrent: true } } } });
        const prior = await tx.enrollment.update({ where: { id: previous.id }, data: { status: "WITHDRAWN" } });
        return { previous: prior, current: next };
      });
      return res.status(201).json(result);
    } catch (error) { return apiError(res, error, "ADMIN ENROLLMENT TRANSFER ERROR"); }
  });

  app.get("/api/admin/sessions/:id", ...viewAcademics, async (req, res) => {
    try {
      const session = await prisma.session.findUnique({ where: { id: req.params.id }, include: { _count: { select: { enrollments: true, academicRecords: true } } } });
      return session ? res.json(session) : res.status(404).json({ error: "Session not found." });
    } catch (error) { return apiError(res, error, "ADMIN SESSION DETAIL ERROR"); }
  });

  async function validateSession(data, omitId = null) {
    const name = clean(data.name);
    if (!name || name.length > 80) return { error: "Session name is required and must be at most 80 characters." };
    const startDate = dateValue(data.startDate), endDate = dateValue(data.endDate);
    if (startDate === undefined || endDate === undefined) return { error: "Session dates must be valid dates." };
    if ((startDate && !endDate) || (!startDate && endDate)) return { error: "Provide both session dates or leave both empty." };
    if (startDate && endDate && endDate < startDate) return { error: "Session end date cannot be earlier than its start date." };
    if (startDate && endDate) {
      const sessions = await prisma.session.findMany({ where: omitId ? { id: { not: omitId }, startDate: { not: null }, endDate: { not: null } } : { startDate: { not: null }, endDate: { not: null } }, select: { id: true, name: true, startDate: true, endDate: true } });
      const overlapping = sessions.find(item => startDate <= item.endDate && item.startDate <= endDate);
      if (overlapping) return { error: `Session dates overlap with ${overlapping.name}.`, conflict: true };
    }
    return { value: { name, startDate, endDate } };
  }

  async function saveSession(req, res, update) {
    try {
      const validated = await validateSession(req.body, update ? req.params.id : null);
      if (validated.error) return res.status(validated.conflict ? 409 : 400).json({ error: validated.error });
      const data = { ...validated.value, isCurrent: req.body.isCurrent === true || req.body.isCurrent === "true" };
      if (update) {
        const existing = await prisma.session.findUnique({ where: { id: req.params.id }, select: { id: true } });
        if (!existing) return res.status(404).json({ error: "Session not found." });
      }
      const saved = await prisma.$transaction(async tx => {
        if (data.isCurrent) await tx.session.updateMany({ where: { isCurrent: true, ...(update ? { id: { not: req.params.id } } : {}) }, data: { isCurrent: false } });
        return update
          ? tx.session.update({ where: { id: req.params.id }, data })
          : tx.session.create({ data });
      }, { isolationLevel: "Serializable" });
      return res.status(update ? 200 : 201).json(saved);
    } catch (error) { return apiError(res, error, "ADMIN SESSION SAVE ERROR"); }
  }
  app.post("/api/admin/sessions", ...manageAcademics, (req, res) => saveSession(req, res, false));
  app.put("/api/admin/sessions/:id", ...manageAcademics, (req, res) => saveSession(req, res, true));
  app.patch("/api/admin/sessions/:id/current", ...manageAcademics, async (req, res) => {
    try {
      const exists = await prisma.session.findUnique({ where: { id: req.params.id }, select: { id: true } });
      if (!exists) return res.status(404).json({ error: "Session not found." });
      const session = await prisma.$transaction(async tx => {
        await tx.session.updateMany({ where: { isCurrent: true, id: { not: req.params.id } }, data: { isCurrent: false } });
        return tx.session.update({ where: { id: req.params.id }, data: { isCurrent: true } });
      }, { isolationLevel: "Serializable" });
      return res.json(session);
    } catch (error) { return apiError(res, error, "SET CURRENT SESSION ERROR"); }
  });
  app.delete("/api/admin/sessions/:id", ...manageAcademics, async (req, res) => {
    try {
      const session = await prisma.session.findUnique({ where: { id: req.params.id }, select: { id: true, isCurrent: true, _count: { select: { enrollments: true, academicRecords: true } } } });
      if (!session) return res.status(404).json({ error: "Session not found." });
      if (session.isCurrent) return res.status(409).json({ error: "The current session cannot be deleted." });
      if (session._count.enrollments || session._count.academicRecords) return res.status(409).json({ error: "This session has enrollment or academic-record history and cannot be deleted." });
      await prisma.session.delete({ where: { id: session.id } });
      return res.json({ ok: true });
    } catch (error) { return apiError(res, error, "ADMIN SESSION DELETE ERROR"); }
  });
}
