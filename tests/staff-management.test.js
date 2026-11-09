import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { registerMainAdminRoutes } from "../server/main-admin-routes.js";

let server, origin;
let requestSequence = 0;
const db = { staffProfile: [], staffAppointment: [], staffProfileCreateRequest: [], department: [], user: [] };
const grants = { admin: [], staffView: ["STAFF_VIEW"], staffManage: ["STAFF_MANAGE"], none: [] };
const matches = (row, where = {}) => where.actorScope_keyHash
  ? row.actorScope === where.actorScope_keyHash.actorScope && row.keyHash === where.actorScope_keyHash.keyHash
  : Object.entries(where).every(([key, value]) => key === "id" || key === "userId" ? row[key] === value : row[key] === value);
const expandStaff = row => row && ({ ...structuredClone(row), user: db.user.find(user => user.id === row.userId) ? (({ id, email, role }) => ({ id, email, role }))(db.user.find(user => user.id === row.userId)) : null, appointments: db.staffAppointment.filter(item => item.staffProfileId === row.id).map(item => ({ ...structuredClone(item), department: db.department.find(dept => dept.id === item.departmentId) || null })) });
function model(name) {
  return {
    findUnique: async ({ where }) => {
      const row = db[name].find(item => matches(item, where));
      if (!row) return null;
      return name === "staffProfile" ? expandStaff(row) : structuredClone(row);
    },
    findMany: async ({ where = {} } = {}) => db[name].filter(row => name === "user" ? row.role === where.role : matches(row, where)).map(row => name === "staffProfile" ? expandStaff(row) : structuredClone(row)),
    findFirst: async ({ where = {} } = {}) => { const row = db[name].find(item => matches(item, where)); return row ? structuredClone(row) : null; },
    count: async () => db[name].length,
    create: async ({ data }) => {
      if (name === "staffProfileCreateRequest" && db[name].some(item => item.actorScope === data.actorScope && item.keyHash === data.keyHash)) { const error = new Error(); error.code = "P2002"; throw error; }
      const row = { id: `${name}-${db[name].length + 1}`, ...structuredClone(data) }; db[name].push(row); return structuredClone(row);
    },
    update: async ({ where, data }) => { const row = db[name].find(item => item.id === where.id); if (!row) { const error = new Error(); error.code = "P2025"; throw error; } Object.assign(row, structuredClone(data)); return structuredClone(row); },
    deleteMany: async ({ where }) => { const beforeCount = db[name].length; db[name] = db[name].filter(row => !(row.staffProfileId === where.staffProfileId && (!where.id || !where.id.notIn.includes(row.id)))); return { count: beforeCount - db[name].length }; }
  };
}
const prisma = Object.fromEntries(Object.keys(db).map(name => [name, model(name)]));
prisma.$queryRaw = async (strings, ...values) => {
  const sql = strings.join("?");
  if (sql.includes('FROM "StaffProfileCreateRequest"')) {
    const [actorScope, keyHash] = values;
    const row = db.staffProfileCreateRequest.find(item => item.actorScope === actorScope && item.keyHash === keyHash);
    return row ? [{ payloadHash: row.payloadHash, staffProfileId: row.staffProfileId }] : [];
  }
  if (sql.includes('INSERT INTO "StaffProfileCreateRequest"')) {
    const [id, actorScope, keyHash, payloadHash, staffProfileId] = values;
    if (db.staffProfileCreateRequest.some(item => item.actorScope === actorScope && item.keyHash === keyHash)) return [];
    db.staffProfileCreateRequest.push({ id, actorScope, keyHash, payloadHash, staffProfileId, createdAt: new Date() });
    return [{ id }];
  }
  throw new Error(`Unexpected mock raw query: ${sql}`);
};
let transactionQueue = Promise.resolve();
prisma.$transaction = async callback => {
  const previous = transactionQueue;
  let release;
  transactionQueue = new Promise(resolve => { release = resolve; });
  await previous;
  const snapshot = structuredClone(db);
  try { return await callback(prisma); }
  catch (error) { Object.assign(db, snapshot); throw error; }
  finally { release(); }
};
const auth = (req, res, next) => { if (!req.get("x-user")) return res.status(401).json({ error: "Authentication required" }); req.user = { sub: req.get("x-user"), role: req.get("x-user") === "admin" ? "ADMIN" : "STAFF" }; next(); };
const requirePermission = (...required) => async (req, res, next) => req.user.role === "ADMIN" || required.every(key => grants[req.user.sub]?.includes(key) || (key === "STAFF_VIEW" && grants[req.user.sub]?.includes("STAFF_MANAGE"))) ? next() : res.status(403).json({ error: "FORBIDDEN" });
const call = (path, user, method = "GET", data, requestId) => fetch(origin + path, { method, headers: { ...(user ? { "x-user": user } : {}), ...(data ? { "content-type": "application/json" } : {}), ...(method === "POST" && path === "/api/admin/staff" ? { "Idempotency-Key": requestId || `staff-test-${++requestSequence}` } : {}) }, body: data ? JSON.stringify(data) : undefined });

async function startTestServer() {
  const app = express(); app.use(express.json()); registerMainAdminRoutes(app, prisma, auth, requirePermission, async id => grants[id] || []);
  server = createServer(app); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); origin = `http://127.0.0.1:${server.address().port}`;
}
async function stopTestServer() { if (server) { await new Promise(resolve => server.close(resolve)); server = null; } }
before(startTestServer);
beforeEach(() => {
  for (const rows of Object.values(db)) rows.splice(0);
  db.user.push({ id: "staff-user", email: "teacher@example.test", role: "STAFF", passwordHash: "never-return-this" }, { id: "student-user", email: "student@example.test", role: "STUDENT", passwordHash: "secret" });
  db.department.push({ id: "dept-1", name: "Science" });
});
after(stopTestServer);

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

test("staff creation serializes concurrent retries, replays after route restart, and permits identical names", async () => {
  const payload = { fullName: "Alex Morgan" };
  const [first, repeated] = await Promise.all([
    call("/api/admin/staff", "staffManage", "POST", payload, "same-create-request"),
    call("/api/admin/staff", "staffManage", "POST", payload, "same-create-request")
  ]);
  assert.equal(first.status, 201);
  assert.equal(repeated.status, 201);
  assert.equal((await first.json()).id, (await repeated.json()).id);
  assert.equal(db.staffProfile.length, 1);
  assert.equal(db.staffProfileCreateRequest.length, 1);
  await stopTestServer();
  await startTestServer();
  const afterRestart = await call("/api/admin/staff", "staffManage", "POST", payload, "same-create-request");
  assert.equal(afterRestart.status, 201);
  assert.equal((await afterRestart.json()).id, "staffProfile-1");
  assert.equal(db.staffProfile.length, 1);
  const separate = await call("/api/admin/staff", "staffManage", "POST", payload, "different-create-request");
  assert.equal(separate.status, 201);
  assert.equal(db.staffProfile.length, 2);
  assert.equal((await call("/api/admin/staff", "staffManage", "POST", { fullName: "Changed" }, "same-create-request")).status, 409);
  assert.equal((await call("/api/admin/staff", "staffManage", "POST", { fullName: "Changed", appointments: [{ position: "Teacher", startDate: "not-a-date" }] }, "same-create-request")).status, 409);
});

test("a durable key tombstone prevents replacement after its original profile is deleted", async () => {
  const payload = { fullName: "Deleted Profile" };
  const created = await call("/api/admin/staff", "staffManage", "POST", payload, "deleted-profile-request");
  assert.equal(created.status, 201);
  db.staffProfile.splice(0);
  const retried = await call("/api/admin/staff", "staffManage", "POST", payload, "deleted-profile-request");
  assert.equal(retried.status, 410);
  assert.equal(db.staffProfile.length, 0);
  assert.equal(db.staffProfileCreateRequest.length, 1);
});

test("normalized idempotency payload hashes ignore object and appointment ordering", async () => {
  const first = await call("/api/admin/staff", "staffManage", "POST", {
    fullName: "Normalized Request",
    formerName: "Former Name",
    appointments: [
      { position: "Teacher", departmentId: "dept-1", startYear: 2000, subjects: ["Math", "Biology"] },
      { position: "Coach", departmentLabel: "Athletics", approximatePeriod: "Early 1990s" }
    ]
  }, "normalized-request");
  assert.equal(first.status, 201);
  const replay = await call("/api/admin/staff", "staffManage", "POST", {
    appointments: [
      { approximatePeriod: "Early 1990s", departmentLabel: "Athletics", position: "Coach" },
      { subjects: ["biology", "math"], startYear: 2000, departmentId: "dept-1", position: "Teacher" }
    ],
    formerName: "Former Name",
    fullName: "Normalized Request"
  }, "normalized-request");
  assert.equal(replay.status, 201);
  assert.equal((await first.json()).id, (await replay.json()).id);
  assert.equal(db.staffProfile.length, 1);
});

test("appointment identity preserves overlapping roles and distinguishes date from year precision", async () => {
  const response = await call("/api/admin/staff", "staffManage", "POST", {
    fullName: "Alex Morgan",
    appointments: [
      { position: "Teacher", departmentId: "dept-1", startYear: 2000, endYear: 2005, approximatePeriod: "early service" },
      { position: "Teacher", departmentId: "dept-1", startYear: 2006, endYear: 2010, approximatePeriod: "later service" },
      { position: "Head of Science", departmentId: "dept-1", startYear: 2003, endYear: 2008, approximatePeriod: "overlapping role" },
      { position: "Teacher", departmentId: "dept-1", startDate: "2000-06-01", startYear: 2000 },
      { position: "Teacher", departmentId: "dept-1", startYear: 2000 }
    ]
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).appointments.length, 5);
});

test("appointment normalization uses department IDs, period fallbacks and normalized subjects", async () => {
  const accepted = await call("/api/admin/staff", "staffManage", "POST", {
    fullName: "Normalization Cases",
    appointments: [
      { position: "Teacher", departmentId: "dept-1", departmentLabel: "Science", startYear: 2000, subjects: ["Math", "Biology"] },
      { position: "Coach", departmentLabel: " athletics ", approximatePeriod: "Early 1990s" },
      { position: "Coach", departmentLabel: "ATHLETICS", approximatePeriod: "Late 1990s" }
    ]
  });
  assert.equal(accepted.status, 201);
  assert.equal((await accepted.json()).appointments.length, 3);
  const changedLabel = await call("/api/admin/staff", "staffManage", "POST", {
    fullName: "Duplicate Department ID",
    appointments: [
      { position: "Teacher", departmentId: "dept-1", departmentLabel: "Science", startYear: 2000 },
      { position: "Teacher", departmentId: "dept-1", departmentLabel: "Old Science label", startYear: 2000 }
    ]
  });
  assert.equal(changedLabel.status, 409);
  const duplicate = await call("/api/admin/staff", "staffManage", "POST", {
    fullName: "Duplicate Subjects",
    appointments: [
      { position: "Teacher", departmentId: "dept-1", startYear: 2000, subjects: ["Math", "Biology"] },
      { position: " teacher ", departmentId: "dept-1", startYear: 2000, subjects: ["biology", " MATH "] }
    ]
  });
  assert.equal(duplicate.status, 409);
});

test("appointment validator rejects inconsistent date/year pairs and treats historical labels as descriptive", async () => {
  assert.equal((await call("/api/admin/staff", "staffManage", "POST", {
    fullName: "Date Year Mismatch", appointments: [{ position: "Teacher", startDate: "2001-01-01", startYear: 2000 }]
  })).status, 400);
  assert.equal((await call("/api/admin/staff", "staffManage", "POST", {
    fullName: "Duplicate Historical Label", appointments: [
      { position: "Teacher", startYear: 2000, historicalLabel: "Staff record A" },
      { position: "Teacher", startYear: 2000, historicalLabel: "Staff record B" }
    ]
  })).status, 409);
});

test("staff public profile controls are returned and updated independently", async () => {
  const created = await call("/api/admin/staff", "staffManage", "POST", {
    fullName: "Public Profile", isPublic: true, publicName: true, publicServiceHistory: true, publicBiography: false
  });
  assert.equal(created.status, 201);
  const profile = await created.json();
  assert.equal(profile.isPublic, true);
  assert.equal(profile.publicName, true);
  assert.equal(profile.publicServiceHistory, true);
  assert.equal(profile.publicBiography, false);
  const updated = await call(`/api/admin/staff/${profile.id}`, "staffManage", "PUT", {
    publicName: false, publicServiceHistory: false, publicBiography: true
  });
  assert.equal(updated.status, 200);
  const saved = await updated.json();
  assert.equal(saved.isPublic, true);
  assert.equal(saved.publicName, false);
  assert.equal(saved.publicServiceHistory, false);
  assert.equal(saved.publicBiography, true);
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
