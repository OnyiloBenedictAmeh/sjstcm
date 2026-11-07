const ENROLLMENT_STATUSES = new Set(["ENROLLED", "PROMOTED", "COMPLETED", "WITHDRAWN"]);
const STAFF_EMPLOYMENT_STATUSES = new Set(["CURRENT", "FORMER"]);
const STAFF_VERIFICATION_STATUSES = new Set(["PENDING", "VERIFIED", "REJECTED", "NEEDS_INFORMATION"]);

function clean(value) { return typeof value === "string" ? value.trim() : ""; }
function dateValue(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}
function bad(res, message) { return res.status(400).json({ error: message }); }
const staffInclude = {
  user: { select: { id: true, email: true, role: true } },
  appointments: {
    include: { department: { select: { id: true, name: true } } },
    orderBy: [{ isCurrent: "desc" }, { startDate: "desc" }, { createdAt: "asc" }]
  }
};
const staffText = (value, max, label, required = false) => {
  if (value == null) value = "";
  if (typeof value !== "string") return { error: `${label} must be text.` };
  const cleaned = value.trim();
  if (required && !cleaned) return { error: `${label} is required.` };
  if (cleaned.length > max) return { error: `${label} must be at most ${max} characters.` };
  return { value: cleaned || null };
};
function staffDateValue(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && parsed.toISOString().slice(0, 10) !== value) return undefined;
  return parsed;
}
function validateStaffAppointment(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Each appointment must be an object." };
  const position = staffText(input.position, 160, "Position", true);
  const departmentLabel = staffText(input.departmentLabel, 120, "Department label");
  const approximatePeriod = staffText(input.approximatePeriod, 120, "Approximate period");
  const historicalLabel = staffText(input.historicalLabel, 160, "Historical label");
  if (position.error || departmentLabel.error || approximatePeriod.error || historicalLabel.error) return { error: position.error || departmentLabel.error || approximatePeriod.error || historicalLabel.error };
  const departmentId = input.departmentId == null || input.departmentId === "" ? null : clean(input.departmentId);
  if (input.departmentId != null && input.departmentId !== "" && !departmentId) return { error: "Department is invalid." };
  const startDate = staffDateValue(input.startDate), endDate = staffDateValue(input.endDate);
  if (startDate === undefined || endDate === undefined) return { error: "Appointment dates must be valid dates." };
  if (startDate && endDate && endDate < startDate) return { error: "Appointment end date cannot be earlier than its start date." };
  const validYear = value => value == null || value === "" || (Number.isInteger(Number(value)) && Number(value) >= 1000 && Number(value) <= 9999);
  if (!validYear(input.startYear) || !validYear(input.endYear)) return { error: "Appointment years must be between 1000 and 9999." };
  const startYear = input.startYear == null || input.startYear === "" ? null : Number(input.startYear);
  const endYear = input.endYear == null || input.endYear === "" ? null : Number(input.endYear);
  if (startYear && endYear && endYear < startYear) return { error: "Appointment end year cannot be earlier than its start year." };
  if (input.subjects != null && !Array.isArray(input.subjects)) return { error: "Subjects must be a list of text values." };
  const rawSubjects = input.subjects || [];
  if (rawSubjects.some(subject => typeof subject !== "string" || subject.trim().length > 120)) return { error: "Each subject must be text and at most 120 characters." };
  const subjects = [...new Map(rawSubjects.map(subject => subject.trim()).filter(Boolean).map(subject => [subject.toLocaleLowerCase(), subject])).values()];
  if (subjects.length > 30) return { error: "An appointment can have at most 30 subjects." };
  return { value: {
    position: position.value,
    departmentId,
    departmentLabel: departmentLabel.value,
    subjects,
    startDate,
    endDate,
    startYear,
    endYear,
    approximatePeriod: approximatePeriod.value,
    historicalLabel: historicalLabel.value,
    isCurrent: input.isCurrent === true || input.isCurrent === "true"
  } };
}
const appointmentKey = appointment => [appointment.position.trim().toLocaleLowerCase(), appointment.departmentId || (appointment.departmentLabel || "").trim().toLocaleLowerCase(), appointment.startDate ? new Date(appointment.startDate).toISOString().slice(0, 10) : "", appointment.endDate ? new Date(appointment.endDate).toISOString().slice(0, 10) : ""].join("|");
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
  const viewStaff = [auth, requirePermission("STAFF_VIEW")];
  const manageStaff = [auth, requirePermission("STAFF_MANAGE")];

  app.get("/api/admin/staff/options", ...viewStaff, async (_, res) => {
    try {
      const [departments, accounts] = await Promise.all([
        prisma.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
        prisma.user.findMany({ where: { role: "STAFF" }, select: { id: true, email: true, staffProfile: { select: { id: true } } }, orderBy: { email: "asc" } })
      ]);
      return res.json({ departments, accounts: accounts.map(({ id, email, staffProfile }) => ({ id, email, linked: Boolean(staffProfile) })) });
    } catch (error) { return apiError(res, error, "STAFF OPTIONS ERROR"); }
  });

  app.get("/api/admin/staff", ...viewStaff, async (req, res) => {
    try {
      const q = clean(req.query.q).slice(0, 120);
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 50));
      if (req.query.employmentStatus && !STAFF_EMPLOYMENT_STATUSES.has(req.query.employmentStatus)) return bad(res, "Employment status filter is invalid.");
      if (req.query.verificationStatus && !STAFF_VERIFICATION_STATUSES.has(req.query.verificationStatus)) return bad(res, "Verification status filter is invalid.");
      const where = {
        ...(req.query.employmentStatus ? { employmentStatus: req.query.employmentStatus } : {}),
        ...(req.query.verificationStatus ? { verificationStatus: req.query.verificationStatus } : {}),
        ...(q ? { OR: ["fullName", "formerName", "formerStaffId"].map(field => ({ [field]: { contains: q, mode: "insensitive" } })), } : {})
      };
      if (q) where.OR.push({ appointments: { some: { OR: [{ position: { contains: q, mode: "insensitive" } }, { departmentLabel: { contains: q, mode: "insensitive" } }, { department: { name: { contains: q, mode: "insensitive" } } }] } } });
      const [total, items] = await Promise.all([
        prisma.staffProfile.count({ where }),
        prisma.staffProfile.findMany({ where, include: staffInclude, orderBy: [{ fullName: "asc" }, { formerStaffId: "asc" }], skip: (page - 1) * pageSize, take: pageSize })
      ]);
      return res.json({ items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
    } catch (error) { return apiError(res, error, "ADMIN STAFF LIST ERROR"); }
  });

  app.get("/api/admin/staff/:id", ...viewStaff, async (req, res) => {
    try {
      const item = await prisma.staffProfile.findUnique({ where: { id: req.params.id }, include: staffInclude });
      return item ? res.json(item) : res.status(404).json({ error: "Staff profile not found." });
    } catch (error) { return apiError(res, error, "ADMIN STAFF GET ERROR"); }
  });

  async function validateStaffProfile(input, existing = null) {
    const data = {};
    const fields = [
      ["fullName", 160, true], ["formerName", 160], ["biography", 10000], ["memories", 10000]
    ];
    for (const [key, max, required] of fields) {
      if (!Object.hasOwn(input, key) && existing) continue;
      const result = staffText(input[key], max, key === "fullName" ? "Full name" : key === "formerName" ? "Former name" : key === "biography" ? "Biography" : "Memories", required);
      if (result.error) return { error: result.error };
      data[key] = key === "fullName" ? result.value : result.value;
    }
    for (const [key, values] of [["employmentStatus", STAFF_EMPLOYMENT_STATUSES], ["verificationStatus", STAFF_VERIFICATION_STATUSES]]) {
      if (!Object.hasOwn(input, key) && existing) continue;
      const value = input[key] || (key === "employmentStatus" ? "FORMER" : "PENDING");
      if (!values.has(value)) return { error: `${key === "employmentStatus" ? "Employment" : "Verification"} status is invalid.` };
      data[key] = value;
    }
    for (const key of ["isPublic", "publicName", "publicServiceHistory", "publicBiography"]) {
      if (!Object.hasOwn(input, key) && existing) continue;
      if (input[key] != null && typeof input[key] !== "boolean") return { error: `${key} must be true or false.` };
      data[key] = input[key] === true;
    }
    if (Object.hasOwn(input, "userId") || !existing) {
      const userId = input.userId == null || input.userId === "" ? null : clean(input.userId);
      if (input.userId != null && input.userId !== "" && !userId) return { error: "Linked account is invalid." };
      if (userId) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
        if (!user || user.role !== "STAFF") return { error: "Only an existing STAFF account can be linked." };
        const linked = await prisma.staffProfile.findUnique({ where: { userId }, select: { id: true } });
        if (linked && linked.id !== existing?.id) return { conflict: "This STAFF account is already linked to another profile." };
      }
      data.userId = userId;
    }
    return { value: data };
  }

  async function validateStaffAppointments(input, existingAppointments = []) {
    if (input === undefined) return { value: undefined };
    if (!Array.isArray(input) || input.length > 50) return { error: "Appointments must be a list of at most 50 entries." };
    const values = [];
    const ids = new Set();
    const keys = new Set();
    for (const raw of input) {
      const result = validateStaffAppointment(raw);
      if (result.error) return result;
      const value = result.value;
      const id = raw.id == null || raw.id === "" ? null : clean(raw.id);
      if (id && (ids.has(id) || !existingAppointments.some(item => item.id === id))) return { error: "Appointment ID is duplicated or does not belong to this staff profile." };
      if (id) ids.add(id);
      const key = appointmentKey(value);
      if (keys.has(key)) return { conflict: "Duplicate appointments are not allowed." };
      keys.add(key);
      if (value.departmentId) {
        const department = await prisma.department.findUnique({ where: { id: value.departmentId }, select: { id: true } });
        if (!department) return { error: "Selected department was not found." };
      }
      values.push({ id, ...value });
    }
    return { value: values };
  }

  async function saveStaff(req, res, update) {
    try {
      const existing = update ? await prisma.staffProfile.findUnique({ where: { id: req.params.id }, include: { appointments: true } }) : null;
      if (update && !existing) return res.status(404).json({ error: "Staff profile not found." });
      const profile = await validateStaffProfile(req.body || {}, existing);
      if (profile.error) return bad(res, profile.error);
      if (profile.conflict) return res.status(409).json({ error: profile.conflict });
      const appointments = await validateStaffAppointments(req.body?.appointments, existing?.appointments || []);
      if (appointments.error) return bad(res, appointments.error);
      if (appointments.conflict) return res.status(409).json({ error: appointments.conflict });
      if (!update && appointments.value?.some(item => item.id)) return bad(res, "New staff profiles cannot reference existing appointment IDs.");
      const saved = await prisma.$transaction(async tx => {
        const item = update
          ? await tx.staffProfile.update({ where: { id: existing.id }, data: profile.value })
          : await tx.staffProfile.create({ data: profile.value });
        if (appointments.value !== undefined) {
          const retained = appointments.value.filter(appointment => appointment.id).map(appointment => appointment.id);
          await tx.staffAppointment.deleteMany({ where: { staffProfileId: item.id, ...(retained.length ? { id: { notIn: retained } } : {}) } });
          for (const appointment of appointments.value) {
            const { id, ...data } = appointment;
            if (id) await tx.staffAppointment.update({ where: { id }, data });
            else await tx.staffAppointment.create({ data: { ...data, staffProfileId: item.id } });
          }
        }
        return tx.staffProfile.findUnique({ where: { id: item.id }, include: staffInclude });
      });
      return res.status(update ? 200 : 201).json(saved);
    } catch (error) {
      if (error?.code === "P2002") return res.status(409).json({ error: "The staff account is already linked or the record conflicts with an existing entry." });
      if (error?.code === "P2003") return res.status(400).json({ error: "A linked account or department does not exist." });
      return apiError(res, error, "ADMIN STAFF SAVE ERROR");
    }
  }
  app.post("/api/admin/staff", ...manageStaff, (req, res) => saveStaff(req, res, false));
  app.put("/api/admin/staff/:id", ...manageStaff, (req, res) => saveStaff(req, res, true));

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
