import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { registerMainAdminRoutes } from "../server/main-admin-routes.js";

let server, origin;
const db = { staffProfile: [], staffAppointment: [], department: [], user: [] };
const grants = { admin: [], staffView: ["STAFF_VIEW"], staffManage: ["STAFF_MANAGE"], none: [] };
const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => key === "id" || key === "userId" ? row[key] === value : row[key] === value);
const expandStaff = row => row && ({ ...structuredClone(row), user: db.user.find(user => user.id === row.userId) ? (({ id, email, role }) => ({ id, email, role }))(db.user.find(user => user.id === row.userId)) : null, appointments: db.staffAppointment.filter(item => item.staffProfileId === row.id).map(item => ({ ...structuredClone(item), department: db.department.find(dept => dept.id === item.departmentId) || null })) });
function model(name) {
  return {
    findUnique: async ({ where }) => {
      const row = db[name].find(item => matches(item, where));
      if (!row) return null;
      return name === "staffProfile" ? expandStaff(row) : structuredClone(row);
    },
    findMany: async ({ where = {} } = {}) => db[name].filter(row => name === "user" ? row.role === where.role : matches(row, where)).map(row => name === "staffProfile" ? expandStaff(row) : structuredClone(row)),
    count: async () => db[name].length,
    create: async ({ data }) => { const row = { id: `${name}-${db[name].length + 1}`, ...structuredClone(data) }; db[name].push(row); return structuredClone(row); },
    update: async ({ where, data }) => { const row = db[name].find(item => item.id === where.id); if (!row) { const error = new Error(); error.code = "P2025"; throw error; } Object.assign(row, structuredClone(data)); return structuredClone(row); },
    deleteMany: async ({ where }) => { const beforeCount = db[name].length; db[name] = db[name].filter(row => !(row.staffProfileId === where.staffProfileId && (!where.id || !where.id.notIn.includes(row.id)))); return { count: beforeCount - db[name].length }; }
  };
}
const prisma = Object.fromEntries(Object.keys(db).map(name => [name, model(name)]));
prisma.$transaction = async callback => callback(prisma);
const auth = (req, res, next) => { if (!req.get("x-user")) return res.status(401).json({ error: "Authentication required" }); req.user = { sub: req.get("x-user"), role: req.get("x-user") === "admin" ? "ADMIN" : "STAFF" }; next(); };
const requirePermission = (...required) => async (req, res, next) => req.user.role === "ADMIN" || required.every(key => grants[req.user.sub]?.includes(key) || (key === "STAFF_VIEW" && grants[req.user.sub]?.includes("STAFF_MANAGE"))) ? next() : res.status(403).json({ error: "FORBIDDEN" });
const call = (path, user, method = "GET", data) => fetch(origin + path, { method, headers: { ...(user ? { "x-user": user } : {}), ...(data ? { "content-type": "application/json" } : {}) }, body: data ? JSON.stringify(data) : undefined });

before(async () => {
  const app = express(); app.use(express.json()); registerMainAdminRoutes(app, prisma, auth, requirePermission, async id => grants[id] || []);
  server = createServer(app); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); origin = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => {
  for (const rows of Object.values(db)) rows.splice(0);
  db.user.push({ id: "staff-user", email: "teacher@example.test", role: "STAFF", passwordHash: "never-return-this" }, { id: "student-user", email: "student@example.test", role: "STUDENT", passwordHash: "secret" });
  db.department.push({ id: "dept-1", name: "Science" });
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

test("staff routes require read and manage permissions and safely create linked profiles with multiple appointments", async () => {
  assert.equal((await call("/api/admin/staff", null)).status, 401);
  assert.equal((await call("/api/admin/staff", "none")).status, 403);
  assert.equal((await call("/api/admin/staff", "none", "POST", { fullName: "Denied" })).status, 403);
  assert.equal((await call("/api/admin/staff", "staffView", "POST", { fullName: "Denied" })).status, 403);
  const response = await call("/api/admin/staff", "staffManage", "POST", {
    fullName: "Ada Okafor", employmentStatus: "CURRENT", verificationStatus: "VERIFIED", userId: "staff-user",
    appointments: [
      { position: "Teacher", departmentId: "dept-1", subjects: ["Biology"], startDate: "2020-09-01", startYear: 2020, isCurrent: true },
      { position: "Club coordinator", departmentLabel: "Science Club", subjects: [], startYear: 2022, isCurrent: true }
    ]
  });
  assert.equal(response.status, 201);
  const profile = await response.json();
  assert.equal(profile.appointments.length, 2);
  assert.equal(profile.appointments[0].department.name, "Science");
  assert.equal(profile.user.email, "teacher@example.test");
  assert.equal(JSON.stringify(profile).includes("never-return-this"), false);
  assert.equal((await call("/api/admin/staff", "staffView")).status, 200);
  assert.equal((await call("/api/admin/staff/options", "staffView")).status, 200);
});

test("staff creation rejects invalid or duplicate account links, duplicate appointments, and invalid dates", async () => {
  const base = { fullName: "Test Profile" };
  assert.equal((await call("/api/admin/staff", "staffManage", "POST", { ...base, userId: "student-user" })).status, 400);
  const first = await call("/api/admin/staff", "staffManage", "POST", { ...base, userId: "staff-user" });
  assert.equal(first.status, 201);
  assert.equal((await call("/api/admin/staff", "staffManage", "POST", { ...base, userId: "staff-user" })).status, 409);
  assert.equal((await call("/api/admin/staff", "staffManage", "POST", { fullName: "Bad Dates", appointments: [{ position: "Teacher", startDate: "2025-12-01", endDate: "2025-01-01" }] })).status, 400);
  assert.equal((await call("/api/admin/staff", "staffManage", "POST", { fullName: "Duplicate", appointments: [{ position: "Teacher" }, { position: " teacher " }] })).status, 409);
});

test("staff edits can replace multiple appointments and reject appointment IDs from another profile", async () => {
  const created = await call("/api/admin/staff", "staffManage", "POST", { fullName: "Ada", appointments: [{ position: "Teacher", startYear: 2020 }, { position: "Coach", startYear: 2022 }] });
  assert.equal(created.status, 201);
  const profile = await created.json();
  const current = db.staffAppointment.filter(item => item.staffProfileId === profile.id);
  assert.equal(current.length, 2);
  assert.equal((await call(`/api/admin/staff/${profile.id}`, "staffView")).status, 200);
  const updated = await call(`/api/admin/staff/${profile.id}`, "staffManage", "PUT", {
    fullName: "Ada O.", employmentStatus: "FORMER", verificationStatus: "NEEDS_INFORMATION", userId: "",
    appointments: [{ id: current[0].id, position: "Senior Teacher", startYear: 2020, endYear: 2025, isCurrent: false }]
  });
  assert.equal(updated.status, 200, await updated.clone().text());
  const body = await updated.json();
  assert.equal(body.fullName, "Ada O.");
  assert.equal(body.user, null);
  assert.equal(body.appointments.length, 1);
  assert.equal(body.appointments[0].position, "Senior Teacher");
  assert.equal((await call(`/api/admin/staff/${profile.id}`, "staffView", "PUT", { fullName: "Forbidden" })).status, 403);
  assert.equal((await call(`/api/admin/staff/${profile.id}`, "staffManage", "PUT", { appointments: [{ id: "other-profile-appointment", position: "Teacher" }] })).status, 400);
});
