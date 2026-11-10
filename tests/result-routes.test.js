import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { registerResultRoutes } from "../server/result-routes.js";

const names = ["subject", "classSubjectRequirement", "class", "session", "staffProfile", "teachingAssignment", "teachingAssignmentAudit", "resultPeriod", "resultSubjectExemption", "resultSubmission", "enrollment", "studentSubjectResult", "resultReview", "classResultPublication", "student"];
const db = Object.fromEntries(names.map(name => [name, []]));
let server, origin;

function equalValue(actual, expected) {
  if (expected && typeof expected === "object" && !(expected instanceof Date)) return false;
  return actual === expected;
}
function matches(row, where = {}, modelName = "") {
  return Object.entries(where).every(([key, expected]) => {
    if (["AND", "OR"].includes(key)) return Array.isArray(expected) && (key === "AND" ? expected.every(item => matches(row, item, modelName)) : expected.some(item => matches(row, item, modelName)));
    if (key === "resultPeriod" && modelName === "classResultPublication") {
      const period = db.resultPeriod.find(item => item.id === row.resultPeriodId);
      return Boolean(period && matches(period, expected, "resultPeriod"));
    }
    if (key === "resultPeriod" && modelName === "studentSubjectResult") {
      const period = db.resultPeriod.find(item => item.id === row.resultPeriodId);
      const some = expected.publications?.some;
      return Boolean(period && some && db.classResultPublication.some(item => item.resultPeriodId === period.id && matches(item, some, "classResultPublication")));
    }
    if (expected && typeof expected === "object" && !Array.isArray(expected) && !(expected instanceof Date)) {
      if ("in" in expected) return expected.in.includes(row[key]);
      if ("not" in expected) return row[key] !== expected.not;
      return Object.entries(expected).every(([subkey, value]) => row[key]?.[subkey] === value);
    }
    return equalValue(row[key], expected);
  });
}
function normalizeWhere(where = {}) {
  const normalized = { ...where };
  for (const [key, value] of Object.entries(where)) {
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && !["in", "not"].some(part => part in value)) {
      Object.assign(normalized, value);
      delete normalized[key];
    }
  }
  return normalized;
}
function model(name) {
  const rows = () => db[name];
  return {
    findUnique: async ({ where }) => rows().find(row => matches(row, normalizeWhere(where), name)) || null,
    findFirst: async ({ where = {} } = {}) => rows().find(row => matches(row, where, name)) || null,
    findMany: async ({ where = {}, include = {} } = {}) => rows().filter(row => matches(row, where, name)).map(row => {
      const copy = structuredClone(row);
      if (name === "classSubjectRequirement" && include.exemptions) copy.exemptions = db.resultSubjectExemption.filter(item => item.requirementId === row.id && (!include.exemptions.where?.resultPeriodId || item.resultPeriodId === include.exemptions.where.resultPeriodId));
      if (name === "enrollment" && include.student) copy.student = structuredClone(db.student.find(item => item.id === row.studentId));
      if (name === "studentSubjectResult") {
        if (include.subject) copy.subject = structuredClone(db.subject.find(item => item.id === row.subjectId));
        if (include.resultPeriod) {
          const period = db.resultPeriod.find(item => item.id === row.resultPeriodId);
          copy.resultPeriod = { ...structuredClone(period), session: structuredClone(db.session.find(item => item.id === period.sessionId)), publications: structuredClone(db.classResultPublication.filter(item => item.resultPeriodId === period.id)) };
        }
        if (include.enrollment) {
          const enrollment = db.enrollment.find(item => item.id === row.enrollmentId);
          copy.enrollment = { ...structuredClone(enrollment), class: structuredClone(db.class.find(item => item.id === enrollment.classId)) };
        }
      }
      return copy;
    }),
    create: async ({ data }) => {
      const row = { id: `${name}-${rows().length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...(name === "subject" ? { isActive: true } : {}), ...(name === "resultSubmission" ? { status: "DRAFT" } : {}), ...(name === "studentSubjectResult" ? { attendance: "PRESENT" } : {}), ...structuredClone(data) };
      if (name === "resultPeriod" && rows().some(item => item.sessionId === row.sessionId && item.term === row.term)) throw Object.assign(new Error(), { code: "P2002" });
      if (name === "classSubjectRequirement" && rows().some(item => item.classId === row.classId && item.sessionId === row.sessionId && item.subjectId === row.subjectId)) throw Object.assign(new Error(), { code: "P2002" });
      if (name === "teachingAssignment" && rows().some(item => item.staffProfileId === row.staffProfileId && item.classId === row.classId && item.subjectId === row.subjectId && item.sessionId === row.sessionId)) throw Object.assign(new Error(), { code: "P2002" });
      if (name === "teachingAssignment" && row.isPrimary && rows().some(item => item.isPrimary && item.classId === row.classId && item.subjectId === row.subjectId && item.sessionId === row.sessionId)) throw Object.assign(new Error(), { code: "P2002" });
      if (name === "resultSubmission" && rows().some(item => item.resultPeriodId === row.resultPeriodId && item.classId === row.classId && item.subjectId === row.subjectId && item.teachingAssignmentId === row.teachingAssignmentId)) throw Object.assign(new Error(), { code: "P2002" });
      if (name === "studentSubjectResult" && rows().some(item => item.resultPeriodId === row.resultPeriodId && item.studentId === row.studentId && item.subjectId === row.subjectId)) throw Object.assign(new Error(), { code: "P2002" });
      if (name === "classResultPublication" && rows().some(item => item.resultPeriodId === row.resultPeriodId && item.classId === row.classId)) throw Object.assign(new Error(), { code: "P2002" });
      rows().push(row);
      return structuredClone(row);
    },
    update: async ({ where, data }) => {
      const row = rows().find(item => matches(item, normalizeWhere(where), name));
      if (!row) throw Object.assign(new Error(), { code: "P2025" });
      Object.assign(row, structuredClone(data), { updatedAt: new Date() });
      return structuredClone(row);
    },
    updateMany: async ({ where, data }) => {
      const selected = rows().filter(row => matches(row, where, name));
      selected.forEach(row => Object.assign(row, structuredClone(data)));
      return { count: selected.length };
    },
    upsert: async ({ where, create, update }) => {
      const row = rows().find(item => matches(item, normalizeWhere(where), name));
      if (row) { Object.assign(row, structuredClone(update)); return structuredClone(row); }
      return model(name).create({ data: create });
    },
    deleteMany: async ({ where }) => {
      const before = rows().length;
      db[name] = rows().filter(row => !matches(row, where, name));
      return { count: before - db[name].length };
    }
  };
}
const prisma = Object.fromEntries(names.map(name => [name, model(name)]));
prisma.$transaction = async callback => {
  const snapshot = Object.fromEntries(names.map(name => [name, structuredClone(db[name])]));
  try { return await callback(prisma); }
  catch (error) { for (const name of names) db[name] = snapshot[name]; throw error; }
};

const users = {
  admin: { role: "ADMIN", permissions: [] },
  teacher: { role: "STAFF", permissions: [] },
  helper: { role: "STAFF", permissions: [] },
  reviewer: { role: "STAFF", permissions: ["RESULTS_REVIEW"] },
  studentUser: { role: "STUDENT", permissions: [] },
  denied: { role: "STAFF", permissions: [] }
};
const auth = (req, res, next) => {
  const user = users[req.get("x-user")];
  if (!user) return res.status(401).json({ error: "Authentication required" });
  req.user = { sub: req.get("x-user"), role: user.role };
  next();
};
const allow = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: "Forbidden" });
const requirePermission = (...required) => (req, res, next) => req.user.role === "ADMIN" || required.every(key => users[req.user.sub].permissions.includes(key)) ? next() : res.status(403).json({ error: "FORBIDDEN" });

before(async () => {
  const app = express();
  app.use(express.json());
  registerResultRoutes(app, prisma, auth, allow, requirePermission);
  server = createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });
beforeEach(() => {
  for (const rows of Object.values(db)) rows.splice(0);
  db.class.push({ id: "class1", name: "JSS 1" });
  db.session.push({ id: "session1", name: "2026/2027" });
  db.staffProfile.push({ id: "staff1", userId: "teacher", fullName: "Teacher One", employmentStatus: "CURRENT" }, { id: "staff2", userId: "helper", fullName: "Teacher Two", employmentStatus: "CURRENT" });
  db.student.push({ id: "student1", userId: "studentUser", studentId: "SJ-001" });
  db.enrollment.push({ id: "enroll1", studentId: "student1", classId: "class1", sessionId: "session1", status: "ENROLLED" }, { id: "enroll2", studentId: "student2", classId: "class1", sessionId: "session1", status: "ENROLLED" });
});

const call = (path, user, method = "GET", body) => fetch(origin + path, { method, headers: { ...(user ? { "x-user": user } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
const json = response => response.json();
async function createSubject(name) { const response = await call("/api/admin/results/subjects", "admin", "POST", { name }); assert.equal(response.status, 201); return json(response); }
async function requireSubjects(subjectIds) { return call("/api/admin/results/classes/class1/subjects", "admin", "PUT", { sessionId: "session1", subjectIds }); }
async function assign(staffProfileId, subjectId, isPrimary) { const response = await call("/api/admin/results/assignments", "admin", "POST", { staffProfileId, classId: "class1", subjectId, sessionId: "session1", isPrimary }); assert.equal(response.status, 201); return json(response); }
async function createPeriod() { const response = await call("/api/admin/results/periods", "admin", "POST", { sessionId: "session1", term: "FIRST" }); assert.equal(response.status, 201); return json(response); }
async function submitAndApprove(assignment, period, { attendance = "PRESENT" } = {}) {
  const draft = await call(`/api/teacher/results/assignments/${assignment.id}/periods/${period.id}/draft`, "teacher", "PUT", { entries: [{ enrollmentId: "enroll1", attendance, caScore: attendance === "PRESENT" ? 38 : null, examScore: attendance === "PRESENT" ? 59 : null }, { enrollmentId: "enroll2", attendance: "ABSENT" }] });
  assert.equal(draft.status, 200);
  const submitted = await call(`/api/teacher/results/assignments/${assignment.id}/periods/${period.id}/submit`, "teacher", "POST");
  assert.equal(submitted.status, 200);
  const body = await json(submitted);
  const approved = await call(`/api/admin/results/submissions/${body.id}/review`, "reviewer", "POST", { action: "APPROVED" });
  assert.equal(approved.status, 200);
  return body;
}

test("result configuration requires Admin authorization and stores class/session subjects", async () => {
  assert.equal((await call("/api/admin/results/subjects", null)).status, 401);
  assert.equal((await call("/api/admin/results/subjects", "teacher")).status, 403);
  const subject = await createSubject("Mathematics");
  assert.equal((await requireSubjects([subject.id])).status, 200);
  assert.equal(db.classSubjectRequirement.length, 1);
  assert.equal((await call("/api/admin/results/periods", "admin", "POST", { sessionId: "session1", term: "FOURTH" })).status, 400);
});

test("only primary assigned teachers can enter results and primary changes are audited", async () => {
  const math = await createSubject("Mathematics");
  const primary = await assign("staff1", math.id);
  const helper = await assign("staff2", math.id, false);
  const period = await createPeriod();
  assert.equal((await call(`/api/teacher/results/assignments/${helper.id}/periods/${period.id}/roster`, "helper")).status, 403);
  assert.equal((await call(`/api/teacher/results/assignments/${primary.id}/periods/${period.id}/roster`, "denied")).status, 403);
  assert.equal((await call(`/api/teacher/results/assignments/${primary.id}/periods/${period.id}/draft`, "teacher", "PUT", { entries: [{ enrollmentId: "enroll1", caScore: 12 }] })).status, 200);
  const change = await call(`/api/admin/results/assignments/${helper.id}/primary`, "admin", "PATCH", { reason: "Staff rotation" });
  assert.equal(change.status, 200);
  assert.equal(db.teachingAssignment.find(row => row.id === primary.id).isPrimary, false);
  assert.equal(db.teachingAssignment.find(row => row.id === helper.id).isPrimary, true);
  assert.equal((await call(`/api/teacher/results/assignments/${primary.id}/periods/${period.id}/roster`, "teacher")).status, 403);
  assert.equal((await call(`/api/teacher/results/assignments/${helper.id}/periods/${period.id}/draft`, "helper", "PUT", { entries: [{ enrollmentId: "enroll1", caScore: 13 }] })).status, 200);
  assert.equal(db.studentSubjectResult.length, 1, "a primary-teacher handoff must keep one student/subject result");
  const audit = await call(`/api/admin/results/assignments/${helper.id}/audit`, "admin");
  assert.equal(audit.status, 200);
  assert.equal(db.teachingAssignmentAudit.find(row => row.action === "PRIMARY_CHANGED").reason, "Staff rotation");
  const science = await createSubject("Science");
  db.teachingAssignment.push({ id: "legacy-assignment", staffProfileId: "staff1", classId: "class1", subjectId: science.id, sessionId: "session1", isPrimary: false });
  assert.equal((await call("/api/admin/results/assignments/legacy-assignment/primary", "admin", "PATCH", { reason: "Initial primary designation" })).status, 200);
  assert.equal(db.teachingAssignment.find(row => row.id === "legacy-assignment").isPrimary, true);
});

test("score limits, enrollment scope, duplicate entries, and server totals are enforced", async () => {
  const math = await createSubject("Mathematics");
  const assignment = await assign("staff1", math.id);
  const period = await createPeriod();
  const draftUrl = `/api/teacher/results/assignments/${assignment.id}/periods/${period.id}/draft`;
  assert.equal((await call(draftUrl, "teacher", "PUT", { entries: [{ enrollmentId: "enroll1", caScore: 41 }] })).status, 400);
  assert.equal((await call(draftUrl, "teacher", "PUT", { entries: [{ enrollmentId: "enroll1" }, { enrollmentId: "enroll1" }] })).status, 400);
  assert.equal((await call(draftUrl, "teacher", "PUT", { entries: [{ enrollmentId: "not-enrolled", caScore: 4 }] })).status, 403);
  assert.equal((await call(draftUrl, "teacher", "PUT", { entries: [{ enrollmentId: "enroll1", caScore: 0, examScore: 61 }] })).status, 400);
  const saved = await call(draftUrl, "teacher", "PUT", { entries: [{ enrollmentId: "enroll1", caScore: 40, examScore: 60 }, { enrollmentId: "enroll2", attendance: "ABSENT" }] });
  assert.equal(saved.status, 200, JSON.stringify(await saved.clone().json()));
  assert.equal(db.studentSubjectResult[0].totalScore, 100);
  assert.equal(db.studentSubjectResult[1].attendance, "ABSENT");
  assert.equal(db.studentSubjectResult[1].totalScore, null);
});

test("draft submission requires full roster, review transitions record actor and reason", async () => {
  const math = await createSubject("Mathematics");
  const assignment = await assign("staff1", math.id);
  const period = await createPeriod();
  const path = `/api/teacher/results/assignments/${assignment.id}/periods/${period.id}`;
  await call(`${path}/draft`, "teacher", "PUT", { entries: [{ enrollmentId: "enroll1", caScore: 20, examScore: 30 }] });
  assert.equal((await call(`${path}/submit`, "teacher", "POST")).status, 409);
  await call(`${path}/draft`, "teacher", "PUT", { entries: [{ enrollmentId: "enroll2", attendance: "ABSENT" }] });
  const submitted = await call(`${path}/submit`, "teacher", "POST");
  assert.equal(submitted.status, 200, JSON.stringify(await submitted.clone().json()));
  const submission = await json(submitted);
  assert.equal((await call(`/api/admin/results/submissions/${submission.id}/review`, "denied", "POST", { action: "APPROVED" })).status, 403);
  assert.equal((await call(`/api/admin/results/submissions/${submission.id}/review`, "reviewer", "POST", { action: "RETURNED" })).status, 400);
  assert.equal((await call(`/api/admin/results/submissions/${submission.id}/review`, "reviewer", "POST", { action: "RETURNED", reason: "Correct the CA score." })).status, 200);
  assert.equal((await call(`${path}/draft`, "teacher", "PUT", { entries: [{ enrollmentId: "enroll1", caScore: 21, examScore: 30 }] })).status, 200);
  const resubmitted = await call(`${path}/submit`, "teacher", "POST");
  assert.equal(resubmitted.status, 200);
  assert.equal((await call(`/api/admin/results/submissions/${submission.id}/review`, "reviewer", "POST", { action: "APPROVED" })).status, 200);
  assert.deepEqual(db.resultReview.map(row => row.action), ["SUBMITTED", "RETURNED", "SUBMITTED", "APPROVED"]);
  assert.equal(db.resultReview[1].actorId, "reviewer");
  assert.equal(db.resultReview[1].reason, "Correct the CA score.");
  assert.equal((await call(`/api/admin/results/submissions/${submission.id}/review`, "reviewer", "POST", { action: "RETURNED", reason: "Too late" })).status, 409);
  const english = await createSubject("English");
  const secondAssignment = await assign("staff2", english.id);
  const incomplete = await prisma.resultSubmission.create({ data: { resultPeriodId: submission.resultPeriodId, sessionId: "session1", classId: "class1", subjectId: english.id, teachingAssignmentId: secondAssignment.id, status: "SUBMITTED" } });
  assert.equal((await call(`/api/admin/results/submissions/${incomplete.id}/review`, "reviewer", "POST", { action: "APPROVED" })).status, 409);
});

test("publication requires every required subject approved or an authorized reasoned exemption", async () => {
  const math = await createSubject("Mathematics"), english = await createSubject("English");
  const period = await createPeriod();
  assert.equal((await call(`/api/admin/results/periods/${period.id}/classes/class1/publish`, "admin", "POST", {})).status, 409);
  assert.equal((await requireSubjects([math.id, english.id])).status, 200);
  const mathAssignment = await assign("staff1", math.id);
  await assign("staff2", english.id);
  await submitAndApprove(mathAssignment, period);
  const publishPath = `/api/admin/results/periods/${period.id}/classes/class1/publish`;
  const incomplete = await call(publishPath, "admin", "POST", {});
  assert.equal(incomplete.status, 409);
  assert.deepEqual((await json(incomplete)).missingSubjectIds, [english.id]);
  const englishRequirement = db.classSubjectRequirement.find(row => row.subjectId === english.id);
  const exemptionPath = `/api/admin/results/periods/${period.id}/exemptions`;
  assert.equal((await call(exemptionPath, "admin", "POST", { requirementId: englishRequirement.id })).status, 400);
  assert.equal((await call(exemptionPath, "reviewer", "POST", { requirementId: englishRequirement.id, reason: "Authorized absence" })).status, 403);
  assert.equal((await call(exemptionPath, "admin", "POST", { requirementId: englishRequirement.id, reason: "Subject delivery cancelled" })).status, 201);
  const published = await call(publishPath, "admin", "POST", {});
  assert.equal(published.status, 201);
  assert.equal(db.classResultPublication.length, 1);
  assert.equal((await call(publishPath, "admin", "POST", {})).status, 409);
  assert.equal((await call(`/api/admin/results/periods/${period.id}/classes/class1/broadsheet`, "reviewer")).status, 200);
});

test("student result retrieval is identity-scoped and returns only class-published results", async () => {
  const math = await createSubject("Mathematics");
  await requireSubjects([math.id]);
  const assignment = await assign("staff1", math.id);
  const period = await createPeriod();
  await submitAndApprove(assignment, period);
  assert.equal((await call("/api/student/results", "teacher")).status, 403);
  assert.equal((await call("/api/student/results", "studentUser")).status, 200);
  assert.equal((await json(await call("/api/student/results", "studentUser"))).length, 0);
  assert.equal((await call(`/api/admin/results/periods/${period.id}/classes/class1/publish`, "admin", "POST", {})).status, 201);
  const visible = await call("/api/student/results", "studentUser");
  assert.equal(visible.status, 200);
  const results = await json(visible);
  assert.equal(results.length, 1);
  assert.equal("studentId" in results[0], false);
  assert.equal(results[0].totalScore, 97);
});
