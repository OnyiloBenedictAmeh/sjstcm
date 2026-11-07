import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { registerMainAdminRoutes } from "../server/main-admin-routes.js";

let server, origin;
const db = { student: [], class: [], session: [], enrollment: [], academicRecord: [] };
const grants = { admin: [], studentView: ["STUDENTS_VIEW"], studentManage: ["STUDENTS_VIEW", "STUDENTS_MANAGE"], academicView: ["ACADEMICS_VIEW"], academicManage: ["ACADEMICS_VIEW", "ACADEMICS_MANAGE"], results: ["STUDENTS_VIEW", "RESULTS_REVIEW"], none: [] };
const match = (row, where = {}) => Object.entries(where).every(([key, value]) => key === "id" ? row.id === value : row[key] === value);
const model = name => ({
  findUnique: async ({ where, include, select }) => { const row = db[name].find(item => match(item, where)); if (!row) return null; const copy = structuredClone(row); if (name === "session" && (include?._count || select?._count)) copy._count = { enrollments: db.enrollment.filter(e => e.sessionId === row.id).length, academicRecords: 0 }; return copy; },
  findMany: async ({ where = {} } = {}) => db[name].filter(row => name === "session" && where.startDate ? row.startDate && row.endDate : match(row, where)).map(row => structuredClone(row)),
  create: async ({ data }) => {
    if (name === "enrollment" && db.enrollment.some(row => row.studentId === data.studentId && row.sessionId === data.sessionId)) { const e = new Error(); e.code = "P2002"; throw e; }
    if (name === "session" && db.session.some(row => row.name === data.name)) { const e = new Error(); e.code = "P2002"; throw e; }
    const row = { id: name + "-" + (db[name].length + 1), createdAt: new Date(), ...data }; db[name].push(row); return structuredClone(row);
  },
  update: async ({ where, data }) => { const row = db[name].find(item => item.id === where.id); if (!row) { const e = new Error(); e.code = "P2025"; throw e; } Object.assign(row, data); return structuredClone(row); },
  updateMany: async ({ where, data }) => { let count = 0; for (const row of db[name]) if ((!where.isCurrent || row.isCurrent) && (!where.id?.not || row.id !== where.id.not)) { Object.assign(row, data); count++; } return { count }; },
  delete: async ({ where }) => { db[name] = db[name].filter(row => row.id !== where.id); }
});
const prisma = Object.fromEntries(["student", "class", "session", "enrollment", "academicRecord"].map(name => [name, model(name)]));
prisma.$transaction = async work => work(prisma);
const auth = (req, res, next) => { if (!req.get("x-user")) return res.status(401).json({ error: "Authentication required" }); req.user = { sub: req.get("x-user"), role: req.get("x-user") === "admin" ? "ADMIN" : "STAFF" }; next(); };
const requirePermission = (...required) => async (req, res, next) => req.user.role === "ADMIN" || required.every(key => grants[req.user.sub]?.includes(key)) ? next() : res.status(403).json({ error: "FORBIDDEN" });

before(async () => {
  for (const rows of Object.values(db)) rows.splice(0);
  db.student.push({ id: "s1", studentId: "SJ-001", firstName: "Ada", lastName: "Okafor", status: "ACTIVE", userId: "secret-user", enrollments: [] });
  db.class.push({ id: "c1", name: "JSS 1" }, { id: "c2", name: "JSS 2" });
  db.session.push({ id: "y1", name: "2025/2026", isCurrent: true, startDate: new Date("2025-09-01"), endDate: new Date("2026-07-01") }, { id: "y2", name: "2026/2027", isCurrent: false, startDate: new Date("2026-09-01"), endDate: new Date("2027-07-01") });
  const app = express(); app.use(express.json()); registerMainAdminRoutes(app, prisma, auth, requirePermission, async id => grants[id] || []);
  server = createServer(app); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); origin = "http://127.0.0.1:" + server.address().port;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });
const call = (path, user, method = "GET", data) => fetch(origin + path, { method, headers: { ...(user ? { "x-user": user } : {}), ...(data ? { "content-type": "application/json" } : {}) }, body: data ? JSON.stringify(data) : undefined });

test("student profile and enrollment routes enforce permissions, hide user linkage and preserve records", async () => {
  assert.equal((await call("/api/admin/students/s1", null)).status, 401);
  assert.equal((await call("/api/admin/students/s1", "none")).status, 403);
  assert.equal((await call("/api/admin/students/s1/enrollments", "studentView", "POST", { classId: "c1" })).status, 403);
  const profile = await (await call("/api/admin/students/s1", "studentView")).json();
  assert.equal("userId" in profile, false); assert.equal(profile.hasPortalAccount, true);
  assert.equal((await call("/api/admin/students/s1/enrollments", "studentManage", "POST", { classId: "c1" })).status, 400);
  assert.equal((await call("/api/admin/students/s1/enrollments", "studentManage", "POST", { classId: "c1", sessionId: "y1" })).status, 201);
  assert.equal((await call("/api/admin/students/s1/enrollments", "studentManage", "POST", { classId: "c2", sessionId: "y1" })).status, 409);
  assert.equal((await call("/api/admin/students/s1/enrollments/transfer", "studentManage", "POST", { enrollmentId: "enrollment-1", classId: "c2", sessionId: "y2" })).status, 201);
  assert.equal(db.enrollment.length, 2); assert.equal(db.enrollment[0].status, "WITHDRAWN"); assert.equal(db.enrollment[1].status, "ENROLLED");
});

test("session administration validates date ranges, permissions, current selection and history-safe deletion", async () => {
  assert.equal((await call("/api/admin/sessions", "none", "POST", { name: "Bad" })).status, 403);
  assert.equal((await call("/api/admin/sessions", "academicManage", "POST", { name: "Bad", startDate: "2026-01-01" })).status, 400);
  assert.equal((await call("/api/admin/sessions", "academicManage", "POST", { name: "Overlap", startDate: "2026-01-01", endDate: "2026-12-01" })).status, 409);
  const result = await call("/api/admin/sessions/y2/current", "academicManage", "PATCH", {});
  assert.equal(result.status, 200); assert.equal(db.session.filter(row => row.isCurrent).length, 1);
  db.enrollment.push({ id: "history", studentId: "s1", sessionId: "y1", classId: "c1", status: "COMPLETED" });
  assert.equal((await call("/api/admin/sessions/y1", "academicManage", "DELETE")).status, 409);
});
