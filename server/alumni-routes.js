import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";

const recordSelect = {
  id: true, alumniId: true, userId: true, studentId: true, fullName: true,
  nameWhileAttending: true, formerName: true, dateOfBirth: true, gender: true,
  phone: true, whatsapp: true, entryYear: true, exitYear: true,
  approximatePeriod: true, lastClassAttended: true, departmentLabel: true,
  house: true, graduationYear: true, graduationClass: true, occupation: true,
  company: true, location: true, bio: true, memories: true, photoUrl: true,
  verificationStatus: true, isPublic: true, publicName: true,
  publicFormerName: true, publicSchoolHistory: true, publicPhoto: true,
  publicOccupation: true, publicLocation: true, publicBiography: true,
  publicMemories: true, createdAt: true, updatedAt: true,
  user: { select: { email: true } },
  student: { select: { id: true, studentId: true, firstName: true, middleName: true, lastName: true, status: true } },
  classMemberships: { include: { classSet: { select: { id: true, displayName: true, entryYear: true, exitYear: true, isPublic: true } } } },
  reviews: { orderBy: { createdAt: "desc" }, include: { reviewer: { select: { email: true } } } }
};
const fields = ["fullName", "nameWhileAttending", "formerName", "dateOfBirth", "gender", "phone", "whatsapp", "entryYear", "exitYear", "approximatePeriod", "lastClassAttended", "departmentLabel", "house", "graduationYear", "graduationClass", "occupation", "company", "location", "bio", "memories", "isPublic", "publicName", "publicFormerName", "publicSchoolHistory", "publicPhoto", "publicOccupation", "publicLocation", "publicBiography", "publicMemories"];
const strFields = new Set(["fullName", "nameWhileAttending", "formerName", "gender", "phone", "whatsapp", "approximatePeriod", "lastClassAttended", "departmentLabel", "house", "graduationClass", "occupation", "company", "location", "bio", "memories"]);
function cleanData(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request body.");
  const out = {};
  for (const key of fields) {
    if (!(key in (body || {}))) continue;
    let value = body[key];
    if (strFields.has(key)) {
      if (typeof value !== "string") throw new Error(`Invalid ${key}.`);
      value = value.trim().slice(0, key === "bio" || key === "memories" ? 3000 : 250) || null;
      if (key === "fullName" && !value) throw new Error("Full name is required.");
    } else if (key === "dateOfBirth") {
      value = value ? new Date(value) : null;
      if (value && Number.isNaN(value.getTime())) throw new Error("Invalid date of birth.");
    } else if (["entryYear", "exitYear", "graduationYear"].includes(key)) {
      value = value === "" || value == null ? null : Number(value);
      if (value != null && (!Number.isInteger(value) || value < 1900 || value > new Date().getFullYear() + 1)) throw new Error(`Invalid ${key}.`);
    } else if (typeof value !== "boolean") throw new Error(`Invalid ${key}.`);
    out[key] = value;
  }
  if (!partial && !out.fullName) throw new Error("Full name is required.");
  if (out.entryYear && out.exitYear && out.exitYear < out.entryYear) throw new Error("Exit year must be no earlier than entry year.");
  return out;
}
const error = (res, e, fallback) => {
  if (e?.code === "P2002") return res.status(409).json({ error: "That record conflicts with an existing record." });
  if (e?.code === "P2025") return res.status(404).json({ error: "Record not found." });
  if (e?.message?.startsWith("Invalid ") || e?.message === "Full name is required." || e?.message?.startsWith("Exit year")) return res.status(400).json({ error: e.message });
  console.error(fallback, e);
  return res.status(500).json({ error: fallback });
};

export function registerAlumniRoutes(app, prisma, auth, allow, requirePermission, emailVerification) {
  const registrationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
  app.get("/api/alumni/class-sets", async (_, res) => {
    try {
      const rows = await prisma.alumniClassSet.findMany({
        where: { isPublic: true }, select: { id: true, displayName: true, entryYear: true, exitYear: true, approximatePeriod: true, members: { where: { status: "VERIFIED", alumni: { isPublic: true, verificationStatus: "VERIFIED" } }, select: { alumniId: true } } },
        orderBy: [{ exitYear: "desc" }, { displayName: "asc" }]
      });
      res.json(rows.map(({ members, ...set }) => ({ ...set, memberCount: members.length })));
    } catch (e) { error(res, e, "Unable to load public class sets."); }
  });
  // The original public directory query is kept intact except that this
  // wrapper adds explicit membership filtering for class-set pages.
  app.get("/api/alumni", async (req, res, next) => {
    if (!req.query.classSetId) return next();
    try {
      const setId = String(req.query.classSetId).slice(0, 100);
      const rows = await prisma.alumni.findMany({ where: { isPublic: true, verificationStatus: "VERIFIED", classMemberships: { some: { classSetId: setId, status: "VERIFIED", classSet: { isPublic: true } } } }, select: {
        id: true, fullName: true, formerName: true, nameWhileAttending: true, photoUrl: true, exitYear: true, entryYear: true, approximatePeriod: true, graduationYear: true, graduationClass: true, lastClassAttended: true, departmentLabel: true, house: true, occupation: true, company: true, location: true, bio: true, memories: true, publicName: true, publicFormerName: true, publicSchoolHistory: true, publicPhoto: true, publicOccupation: true, publicLocation: true, publicBiography: true, publicMemories: true,
        classMemberships: { where: { status: "VERIFIED", classSet: { isPublic: true } }, select: { classSet: { select: { displayName: true, entryYear: true, exitYear: true, approximatePeriod: true } } } },
        archiveMedia: { where: { isPublic: true, kind: { in: ["PROFILE_PHOTO", "THEN_PHOTO", "NOW_PHOTO"] } }, select: { storageKey: true, kind: true } }
      }, orderBy: { exitYear: "desc" } });
      res.json(rows.map(r => {
        const media = kind => r.archiveMedia.find(x => x.kind === kind)?.storageKey || null;
        return { id: r.id, fullName: r.publicName ? r.fullName : null, formerName: r.publicFormerName ? r.formerName : null, nameWhileAttending: r.publicFormerName ? r.nameWhileAttending : null, photoUrl: r.publicPhoto ? (media("PROFILE_PHOTO") || r.photoUrl) : null,
          entryYear: r.publicSchoolHistory ? r.entryYear : null, exitYear: r.publicSchoolHistory ? (r.exitYear ?? r.graduationYear) : null, graduationYear: r.publicSchoolHistory ? (r.exitYear ?? r.graduationYear) : null, approximatePeriod: r.publicSchoolHistory ? r.approximatePeriod : null, graduationClass: r.publicSchoolHistory ? r.graduationClass : null, lastClass: r.publicSchoolHistory ? r.lastClassAttended : null, department: r.publicSchoolHistory ? r.departmentLabel : null, house: r.publicSchoolHistory ? r.house : null, classSets: r.publicSchoolHistory ? r.classMemberships.map(x => x.classSet) : [], thenPhotoUrl: r.publicPhoto ? media("THEN_PHOTO") : null, nowPhotoUrl: r.publicPhoto ? media("NOW_PHOTO") : null, occupation: r.publicOccupation ? r.occupation : null, company: r.publicOccupation ? r.company : null, location: r.publicLocation ? r.location : null, bio: r.publicBiography ? r.bio : null, memories: r.publicMemories ? r.memories : null };
      }));
    } catch (e) { error(res, e, "Unable to load alumni class members."); }
  });
  app.post("/api/alumni/register", registrationLimiter, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 200 || !fullName || fullName.length > 160) return res.status(400).json({ error: "Enter a valid email, a password of at least 8 characters, and your full name." });
    if (!emailVerification?.isConfigured) return res.status(503).json({ error: "Email verification is temporarily unavailable. Please try again later." });
    const year = value => value === "" || value == null ? null : (/^\d{4}$/.test(String(value)) ? Number(value) : NaN);
    const entryYear = year(req.body?.entryYear), exitYear = year(req.body?.exitYear);
    if ([entryYear, exitYear].some(Number.isNaN) || (entryYear != null && exitYear != null && exitYear < entryYear) || [entryYear, exitYear].some(v => v != null && (v < 1900 || v > new Date().getFullYear() + 1))) return res.status(400).json({ error: "Enter valid school years." });
    const text = (key, max = 250) => typeof req.body?.[key] === "string" ? req.body[key].trim().slice(0, max) || null : null;
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      const result = await prisma.$transaction(async tx => {
        if (await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } })) throw Object.assign(new Error("DUPLICATE_EMAIL"), { code: "ALREADY_EXISTS" });
        const user = await tx.user.create({ data: { email, passwordHash, role: "ALUMNI" }, select: { id: true } });
        const alumni = await tx.alumni.create({ data: {
          userId: user.id, fullName, nameWhileAttending: text("schoolName", 160), phone: text("phone", 50),
          entryYear, exitYear, approximatePeriod: text("approximatePeriod", 120), lastClassAttended: text("lastClass", 120),
          departmentLabel: text("department", 120), house: text("house", 100), graduationClass: text("classSet", 120),
          occupation: text("occupation", 160), location: text("location", 160), bio: text("biography", 1000),
          verificationStatus: "PENDING", isPublic: false,
          publicName: req.body.publicName === true, publicFormerName: req.body.publicFormerName === true,
          publicSchoolHistory: req.body.publicSchoolHistory === true, publicOccupation: req.body.publicOccupation === true,
          publicLocation: req.body.publicLocation === true, publicBiography: req.body.publicBiography === true,
          publicMemories: req.body.publicMemories === true, publicPhoto: false
        }, select: { id: true } });
        return { alumni, user: { id: user.id, email, name: fullName } };
      });
      await emailVerification.issueAndSend(result.user);
      res.status(202).json({ ok: true, message: "If this email can be registered, verification instructions will be sent. Your alumni profile remains private until the school verifies it." });
    } catch (e) {
      if (e?.code === "ALREADY_EXISTS" || e?.code === "P2002") return res.status(202).json({ ok: true, message: "If this email can be registered, verification instructions will be sent. Your alumni profile remains private until the school verifies it." });
      return error(res, e, "Unable to submit alumni registration.");
    }
  });

  app.get("/api/admin/alumni", auth, allow("ADMIN", "STAFF"), requirePermission("ALUMNI_VIEW"), async (req, res) => {
    try {
      const q = String(req.query.q || "").trim().slice(0, 100), status = String(req.query.status || "");
      if (status && !["PENDING", "VERIFIED", "REJECTED", "NEEDS_INFORMATION"].includes(status)) return res.status(400).json({ error: "Invalid verification status." });
      const year = req.query.year ? Number(req.query.year) : null;
      if (year && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1)) return res.status(400).json({ error: "Invalid year." });
      const classSetId = String(req.query.classSetId || "");
      const where = {
        ...(status ? { verificationStatus: status } : {}),
        ...(year ? { OR: [{ exitYear: year }, { graduationYear: year }] } : {}),
        ...(classSetId ? { classMemberships: { some: { classSetId } } } : {}),
        ...(q ? { AND: [{ OR: ["fullName", "nameWhileAttending", "formerName", "phone", "location", "occupation"].map(k => ({ [k]: { contains: q, mode: "insensitive" } })) }] } : {})
      };
      res.json(await prisma.alumni.findMany({ where, select: recordSelect, orderBy: { updatedAt: "desc" } }));
    } catch (e) { error(res, e, "Unable to load alumni records."); }
  });
  app.get("/api/admin/alumni/:id", auth, allow("ADMIN", "STAFF"), requirePermission("ALUMNI_VIEW"), async (req, res, next) => {
    if (req.params.id === "class-sets") return next();
    try { const row = await prisma.alumni.findUnique({ where: { id: req.params.id }, select: recordSelect }); return row ? res.json(row) : res.status(404).json({ error: "Alumni record not found." }); }
    catch (e) { error(res, e, "Unable to load alumni record."); }
  });
  app.post("/api/admin/alumni", auth, allow("ADMIN", "STAFF"), requirePermission("ALUMNI_MANAGE"), async (req, res) => {
    try { const data = cleanData(req.body); const row = await prisma.alumni.create({ data, select: recordSelect }); res.status(201).json(row); }
    catch (e) { error(res, e, "Unable to create alumni record."); }
  });
  app.put("/api/admin/alumni/:id", auth, allow("ADMIN", "STAFF"), requirePermission("ALUMNI_MANAGE"), async (req, res) => {
    try { const data = cleanData(req.body, true); delete data.studentId; delete data.userId; delete data.verificationStatus; const row = await prisma.alumni.update({ where: { id: req.params.id }, data, select: recordSelect }); res.json(row); }
    catch (e) { error(res, e, "Unable to update alumni record."); }
  });
  app.post("/api/admin/alumni/:id/verification", auth, allow("ADMIN", "STAFF"), requirePermission("ALUMNI_VERIFY"), async (req, res) => {
    const status = req.body?.status, notes = typeof req.body?.notes === "string" ? req.body.notes.trim().slice(0, 2000) || null : null;
    if (!["VERIFIED", "REJECTED", "NEEDS_INFORMATION"].includes(status)) return res.status(400).json({ error: "Choose a valid verification decision." });
    try {
      const row = await prisma.$transaction(async tx => {
        const previous = await tx.alumni.findUnique({ where: { id: req.params.id }, select: { verificationStatus: true } });
        if (!previous) throw Object.assign(new Error("Record not found."), { code: "P2025" });
        const updated = await tx.alumni.update({ where: { id: req.params.id }, data: { verificationStatus: status, ...(status !== "VERIFIED" ? { isPublic: false } : {}) }, select: recordSelect });
        await tx.alumniReview.create({ data: { alumniId: req.params.id, reviewerId: req.user.sub, previousStatus: previous.verificationStatus, newStatus: status, notes } });
        return updated;
      });
      res.json(row);
    } catch (e) { error(res, e, "Unable to record verification decision."); }
  });
  app.get("/api/admin/students/search", auth, allow("ADMIN", "STAFF"), requirePermission("ALUMNI_VERIFY"), async (req, res) => {
    const q = String(req.query.q || "").trim().slice(0, 100);
    if (q.length < 2) return res.json([]);
    try { res.json(await prisma.student.findMany({ where: { OR: ["studentId", "firstName", "middleName", "lastName", "email"].map(k => ({ [k]: { contains: q, mode: "insensitive" } })) }, select: { id: true, studentId: true, firstName: true, middleName: true, lastName: true, email: true, status: true }, take: 20 })); }
    catch (e) { error(res, e, "Unable to search student records."); }
  });
  app.put("/api/admin/alumni/:id/student-link", auth, allow("ADMIN", "STAFF"), requirePermission("ALUMNI_VERIFY"), async (req, res) => {
    const studentId = typeof req.body?.studentId === "string" ? req.body.studentId.trim() : "";
    if (!studentId) return res.status(400).json({ error: "Select a student record to link." });
    try {
      const result = await prisma.$transaction(async tx => {
        const [alumni, student] = await Promise.all([tx.alumni.findUnique({ where: { id: req.params.id }, select: { id: true, studentId: true } }), tx.student.findUnique({ where: { id: studentId }, select: { id: true, studentId: true } })]);
        if (!alumni || !student) throw Object.assign(new Error("Record not found."), { code: "P2025" });
        if (alumni.studentId) throw Object.assign(new Error("This alumni record is already linked to a student."), { code: "LINK_CONFLICT" });
        if (await tx.alumni.findUnique({ where: { studentId }, select: { id: true } })) throw Object.assign(new Error("This student is already linked to another alumni record."), { code: "LINK_CONFLICT" });
        return tx.alumni.update({ where: { id: req.params.id }, data: { studentId }, select: recordSelect });
      });
      res.json(result);
    } catch (e) { if (e.code === "LINK_CONFLICT") return res.status(409).json({ error: e.message }); error(res, e, "Unable to link student record."); }
  });

  app.get("/api/admin/alumni/class-sets", auth, allow("ADMIN", "STAFF"), requirePermission("ALUMNI_VIEW"), async (_, res) => {
    try { res.json(await prisma.alumniClassSet.findMany({ include: { _count: { select: { members: true } } }, orderBy: [{ exitYear: "desc" }, { displayName: "asc" }] })); }
    catch (e) { error(res, e, "Unable to load class sets."); }
  });
  app.post("/api/admin/alumni/class-sets", auth, allow("ADMIN", "STAFF"), requirePermission("ALUMNI_MANAGE"), async (req, res) => {
    const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim().slice(0, 120) : "";
    if (!displayName) return res.status(400).json({ error: "Class-set name is required." });
    const asYear = v => v === "" || v == null ? null : Number(v);
    try { const entryYear = asYear(req.body?.entryYear), exitYear = asYear(req.body?.exitYear); if ([entryYear, exitYear].some(v => v != null && (!Number.isInteger(v) || v < 1900 || v > new Date().getFullYear() + 1)) || (entryYear != null && exitYear != null && exitYear < entryYear)) throw new Error("Invalid class-set years."); res.status(201).json(await prisma.alumniClassSet.create({ data: { displayName, entryYear, exitYear, approximatePeriod: typeof req.body?.approximatePeriod === "string" ? req.body.approximatePeriod.trim().slice(0, 120) || null : null, notes: typeof req.body?.notes === "string" ? req.body.notes.trim().slice(0, 1000) || null : null, isPublic: req.body?.isPublic === true } })); }
    catch (e) { error(res, e, "Unable to create class set."); }
  });
  app.put("/api/admin/alumni/class-sets/:id", auth, allow("ADMIN", "STAFF"), requirePermission("ALUMNI_MANAGE"), async (req, res) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) return res.status(400).json({ error: "Invalid request body." });
    const data = {};
    if (typeof req.body?.displayName === "string") data.displayName = req.body.displayName.trim().slice(0, 120);
    for (const k of ["entryYear", "exitYear"]) if (k in (req.body || {})) data[k] = req.body[k] === "" || req.body[k] == null ? null : Number(req.body[k]);
    if (typeof req.body?.approximatePeriod === "string") data.approximatePeriod = req.body.approximatePeriod.trim().slice(0, 120) || null;
    if (typeof req.body?.notes === "string") data.notes = req.body.notes.trim().slice(0, 1000) || null;
    if (typeof req.body?.isPublic === "boolean") data.isPublic = req.body.isPublic;
    if ((data.entryYear != null && (!Number.isInteger(data.entryYear) || data.entryYear < 1900 || data.entryYear > new Date().getFullYear() + 1)) || (data.exitYear != null && (!Number.isInteger(data.exitYear) || data.exitYear < 1900 || data.exitYear > new Date().getFullYear() + 1))) return res.status(400).json({ error: "Enter valid class-set years." });
    if (data.entryYear !== undefined || data.exitYear !== undefined) {
      try {
        const current = await prisma.alumniClassSet.findUnique({ where: { id: req.params.id }, select: { entryYear: true, exitYear: true } });
        if (!current) return res.status(404).json({ error: "Class set not found." });
        const entryYear = data.entryYear === undefined ? current.entryYear : data.entryYear;
        const exitYear = data.exitYear === undefined ? current.exitYear : data.exitYear;
        if (entryYear != null && exitYear != null && exitYear < entryYear) return res.status(400).json({ error: "Exit year must be no earlier than entry year." });
      } catch (e) { return error(res, e, "Unable to validate class-set years."); }
    }
    try { res.json(await prisma.alumniClassSet.update({ where: { id: req.params.id }, data })); } catch (e) { error(res, e, "Unable to update class set."); }
  });
  app.post("/api/admin/alumni/:id/class-sets", auth, allow("ADMIN", "STAFF"), requirePermission("ALUMNI_MANAGE"), async (req, res) => {
    const classSetId = typeof req.body?.classSetId === "string" ? req.body.classSetId : "";
    if (!classSetId) return res.status(400).json({ error: "Select a class set." });
    try { res.status(201).json(await prisma.alumniClassMembership.create({ data: { alumniId: req.params.id, classSetId, status: "PENDING", lastClassAttended: typeof req.body.lastClassAttended === "string" ? req.body.lastClassAttended.trim().slice(0, 120) || null : null } })); }
    catch (e) { error(res, e, "Unable to assign class set."); }
  });
  app.delete("/api/admin/alumni/:id/class-sets/:classSetId", auth, allow("ADMIN", "STAFF"), requirePermission("ALUMNI_MANAGE"), async (req, res) => {
    try { await prisma.alumniClassMembership.delete({ where: { alumniId_classSetId: { alumniId: req.params.id, classSetId: req.params.classSetId } } }); res.json({ ok: true }); }
    catch (e) { error(res, e, "Unable to remove class-set membership."); }
  });
  app.patch("/api/admin/alumni/:id/class-sets/:classSetId", auth, allow("ADMIN", "STAFF"), requirePermission("ALUMNI_VERIFY"), async (req, res) => {
    const status = req.body?.status;
    if (!["VERIFIED", "PENDING", "REJECTED"].includes(status)) return res.status(400).json({ error: "Choose a valid class-set membership status." });
    try {
      const alumni = await prisma.alumni.findUnique({ where: { id: req.params.id }, select: { verificationStatus: true } });
      if (!alumni) return res.status(404).json({ error: "Alumni record not found." });
      if (status === "VERIFIED" && alumni.verificationStatus !== "VERIFIED") return res.status(409).json({ error: "Verify the alumni profile before verifying its class-set membership." });
      res.json(await prisma.alumniClassMembership.update({ where: { alumniId_classSetId: { alumniId: req.params.id, classSetId: req.params.classSetId } }, data: { status } }));
    } catch (e) { error(res, e, "Unable to update class-set membership."); }
  });

  app.get("/api/admin/update-requests", auth, allow("ADMIN", "STAFF"), requirePermission("ALUMNI_VERIFY"), async (_, res) => {
    try {
      const requests = await prisma.updateRequest.findMany({
        include: {
          alumni: {
            select: {
              id: true, fullName: true,
              user: { select: { email: true } },
              student: { select: { studentId: true, firstName: true, middleName: true, lastName: true } }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      });
      res.json(requests);
    }
    catch (e) { error(res, e, "Unable to load update requests."); }
  });
  app.post("/api/admin/update-requests/:id/review", auth, allow("ADMIN", "STAFF"), requirePermission("ALUMNI_VERIFY"), async (req, res) => {
    const decision = req.body?.decision, notes = typeof req.body?.notes === "string" ? req.body.notes.trim().slice(0, 2000) : "";
    if (!["APPROVED", "REJECTED", "NEEDS_INFORMATION"].includes(decision) || (decision === "NEEDS_INFORMATION" && !notes)) return res.status(400).json({ error: "Choose a decision and include a note when requesting information." });
    try {
      const row = await prisma.$transaction(async tx => {
        const reqRow = await tx.updateRequest.findUnique({ where: { id: req.params.id } });
        if (!reqRow) throw Object.assign(new Error("Record not found."), { code: "P2025" });
        if (reqRow.status !== "PENDING") throw Object.assign(new Error("This request has already been reviewed."), { code: "REQUEST_DONE" });
        if (decision === "APPROVED") {
          const submitted = reqRow.payload && typeof reqRow.payload === "object" ? reqRow.payload : {};
          const allowed = ["fullName", "nameWhileAttending", "formerName", "phone", "whatsapp", "entryYear", "exitYear", "approximatePeriod", "lastClassAttended", "departmentLabel", "house", "occupation", "company", "location", "bio", "memories"];
          const values = Object.fromEntries(Object.entries(submitted).filter(([k]) => allowed.includes(k)));
          if (Object.keys(values).length) await tx.alumni.update({ where: { id: reqRow.alumniId }, data: cleanData(values, true) });
        }
        const payload = decision === "NEEDS_INFORMATION" ? { ...(reqRow.payload && typeof reqRow.payload === "object" ? reqRow.payload : { submitted: reqRow.payload }), _review: { decision, notes, reviewerId: req.user.sub, reviewedAt: new Date().toISOString() } } : reqRow.payload;
        return tx.updateRequest.update({ where: { id: reqRow.id }, data: { status: decision === "NEEDS_INFORMATION" ? "PENDING" : decision, reviewedBy: req.user.sub, reviewedAt: new Date(), payload } });
      });
      res.json(row);
    } catch (e) { if (e.code === "REQUEST_DONE") return res.status(409).json({ error: e.message }); error(res, e, "Unable to review update request."); }
  });
}
