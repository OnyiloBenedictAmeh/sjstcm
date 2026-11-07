import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcryptjs";
import { readFile } from "node:fs/promises";
import { registerAlumniRoutes } from "../server/alumni-routes.js";

let server, base;
const users = new Map();
const alumniRows = [];
const reviewers = [];
const membershipRows = new Map();
const updateRows = new Map();
const reviewRows = [];
const studentRows = new Map([["student-1", { id: "student-1", studentId: "SJ-001", firstName: "Sam", middleName: null, lastName: "Student", email: "sam@example.test", status: "GRADUATED" }]]);
let listQuery;
let failProfileCreate = false;
const classSetRows = new Map([["set-edit", { id: "set-edit", displayName: "1995 Set", entryYear: 1990, exitYear: 1995, isPublic: false }]]);
const prisma = {
  $transaction: async fn => {
    const priorUsers = new Map(users), priorLength = alumniRows.length;
    try { return await fn(prisma); }
    catch (e) { users.clear(); for (const [key, value] of priorUsers) users.set(key, value); alumniRows.length = priorLength; throw e; }
  },
  user: {
    findFirst: async ({ where }) => [...users.values()].find(u => u.email.toLowerCase() === where.email.equals.toLowerCase()) || null,
    findUnique: async ({ where }) => users.get(where.email) || null,
    create: async ({ data }) => { const row = Object.assign({ id: "user-" + (users.size + 1) }, data); users.set(row.email, row); return row; }
  },
  alumni: {
    create: async ({ data }) => { if (failProfileCreate) throw new Error("simulated profile insert failure"); const row = Object.assign({ id: "alumni-" + (alumniRows.length + 1), alumniId: "ALM-" + (alumniRows.length + 1) }, data); alumniRows.push(row); return row; },
    findMany: async query => { listQuery = query; return []; },
    findUnique: async ({ where }) => { const row = where.id ? reviewers.find(a => a.id === where.id) : reviewers.find(a => a.studentId === where.studentId); return row ? { ...row } : null; },
    update: async ({ where, data }) => { const a = reviewers.find(x => x.id === where.id); if (!a) throw Object.assign(new Error("missing"), { code: "P2025" }); Object.assign(a, data); return a; }
  },
  alumniReview: { create: async ({ data }) => { reviewRows.push(data); return data; } },
  student: { findUnique: async ({ where }) => studentRows.get(where.id) || null, findMany: async () => [...studentRows.values()] },
  alumniClassMembership: {
    create: async ({ data }) => { const key = data.alumniId + ":" + data.classSetId; if (membershipRows.has(key)) throw Object.assign(new Error("duplicate"), { code: "P2002" }); membershipRows.set(key, { ...data }); return data; },
    update: async ({ where, data }) => { const key = where.alumniId_classSetId.alumniId + ":" + where.alumniId_classSetId.classSetId; if (!membershipRows.has(key)) throw Object.assign(new Error("missing"), { code: "P2025" }); Object.assign(membershipRows.get(key), data); return membershipRows.get(key); },
    delete: async ({ where }) => { const key = where.alumniId_classSetId.alumniId + ":" + where.alumniId_classSetId.classSetId; membershipRows.delete(key); return {}; }
  },
  updateRequest: {
    findMany: async () => [...updateRows.values()],
    findUnique: async ({ where }) => updateRows.get(where.id) || null,
    update: async ({ where, data }) => { const row = updateRows.get(where.id); Object.assign(row, data); return row; }
  },
  alumniClassSet: {
    findMany: async () => [{ id: "set-1", displayName: "1990 Set", entryYear: 1986, exitYear: 1990, approximatePeriod: null, members: [{ alumniId: "a1" }, { alumniId: "a2" }] }],
    findUnique: async ({ where }) => classSetRows.get(where.id) || null,
    update: async ({ where, data }) => { const row = classSetRows.get(where.id); Object.assign(row, data); return row; },
    create: async ({ data }) => ({ id: "new-set", ...data })
  }
};
function auth(req, res, next) {
  const role = req.get("x-test-role");
  if (!role) return res.status(401).json({ error: "Authentication required" });
  req.user = { sub: "reviewer-1", role }; next();
}
function allow(...roles) { return (req, res, next) => roles.includes(req.user.role) ? next() : res.sendStatus(403); }
function requirePermission(...required) {
  return (req, res, next) => req.user.role === "ADMIN" || required.every(p => String(req.get("x-test-permissions") || "").split(",").includes(p)) ? next() : res.sendStatus(403);
}
before(async () => {
  const app = express(); app.use(express.json()); registerAlumniRoutes(app, prisma, auth, allow, requirePermission);
  server = app.listen(0); await new Promise(resolve => server.once("listening", resolve));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

test("public registration stores independent pending profile with hashed password and fixed ALUMNI role", async () => {
  const response = await fetch(base + "/api/alumni/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "Alum@example.com", password: "strong-password", fullName: "Alumni Example", role: "ADMIN", verificationStatus: "VERIFIED", studentId: "student-1", exitYear: "1990" }) });
  assert.equal(response.status, 201);
  assert.equal(users.get("alum@example.com").role, "ALUMNI");
  assert.equal(await bcrypt.compare("strong-password", users.get("alum@example.com").passwordHash), true);
  assert.equal(alumniRows[0].verificationStatus, "PENDING"); assert.equal(alumniRows[0].isPublic, false);
  assert.equal(alumniRows[0].studentId, undefined); assert.equal(alumniRows[0].role, undefined);
  reviewers.push({ id: "record-1", verificationStatus: "PENDING", studentId: null, fullName: "Alumni Example", isPublic: false });
});
test("registration validates input and handles duplicate email without disclosing account details", async () => {
  const invalid = await fetch(base + "/api/alumni/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "bad", password: "x", fullName: "" }) });
  assert.equal(invalid.status, 400);
  const duplicate = await fetch(base + "/api/alumni/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "ALUM@example.com", password: "strong-password", fullName: "Second Example" }) });
  assert.equal(duplicate.status, 409); assert.match((await duplicate.json()).error, /may already exist/);
});
test("registration transaction rolls back the account if profile creation fails", async () => {
  const beforeCount = alumniRows.length;
  const originalConsoleError = console.error;
  failProfileCreate = true;
  let response;
  console.error = () => {};
  try { response = await fetch(base + "/api/alumni/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "rollback@example.com", password: "strong-password", fullName: "Rollback Example" }) }); }
  finally { failProfileCreate = false; console.error = originalConsoleError; }
  assert.equal(response.status, 500);
  assert.equal(users.has("rollback@example.com"), false);
  assert.equal(alumniRows.length, beforeCount);
});
test("admin listing enforces authentication and ALUMNI_VIEW and applies filters", async () => {
  assert.equal((await fetch(base + "/api/admin/alumni")).status, 401);
  assert.equal((await fetch(base + "/api/admin/alumni", { headers: { "x-test-role": "STAFF" } })).status, 403);
  assert.equal((await fetch(base + "/api/admin/alumni", { headers: { "x-test-role": "ALUMNI", "x-test-permissions": "ALUMNI_VIEW" } })).status, 403);
  assert.equal((await fetch(base + "/api/admin/alumni", { headers: { "x-test-role": "ADMIN" } })).status, 200);
  const response = await fetch(base + "/api/admin/alumni?q=example&status=PENDING&year=1990&classSetId=set-1", { headers: { "x-test-role": "STAFF", "x-test-permissions": "ALUMNI_VIEW" } });
  assert.equal(response.status, 200); assert.equal(listQuery.where.verificationStatus, "PENDING");
  assert.equal(listQuery.where.classMemberships.some.classSetId, "set-1"); assert.equal(listQuery.where.AND[0].OR.length, 6);
});
test("authorized staff can create/edit alumni records but cannot inject status or student IDs", async () => {
  const headers = { "content-type": "application/json", "x-test-role": "STAFF", "x-test-permissions": "ALUMNI_MANAGE" };
  const created = await fetch(base + "/api/admin/alumni", { method: "POST", headers, body: JSON.stringify({ fullName: "Standalone Alum", studentId: "student-1", userId: "admin-1", verificationStatus: "VERIFIED", role: "ADMIN" }) });
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.equal(body.fullName, "Standalone Alum"); assert.equal(body.studentId, undefined); assert.equal(body.verificationStatus, undefined);
  const edited = await fetch(base + "/api/admin/alumni/record-1", { method: "PUT", headers, body: JSON.stringify({ fullName: "Renamed Alum", studentId: "student-1", verificationStatus: "REJECTED" }) });
  assert.equal(edited.status, 200); assert.equal(reviewers[0].fullName, "Renamed Alum"); assert.equal(reviewers[0].studentId, null); assert.equal(reviewers[0].verificationStatus, "PENDING");
});
test("public class-set response contains only public set metadata and member count", async () => {
  const response = await fetch(base + "/api/alumni/class-sets"); assert.equal(response.status, 200);
  const rows = await response.json();
  assert.deepEqual(rows, [{ id: "set-1", displayName: "1990 Set", entryYear: 1986, exitYear: 1990, approximatePeriod: null, memberCount: 2 }]);
  assert.equal(JSON.stringify(rows).includes("email"), false);
  const adminSets = await fetch(base + "/api/admin/alumni/class-sets", { headers: { "x-test-role": "STAFF", "x-test-permissions": "ALUMNI_VIEW" } });
  assert.equal(adminSets.status, 200);
});
test("verification requires ALUMNI_VERIFY and records reviewer, status, time history and notes", async () => {
  const denied = await fetch(base + "/api/admin/alumni/record-1/verification", { method: "POST", headers: { "content-type": "application/json", "x-test-role": "STAFF" }, body: JSON.stringify({ status: "VERIFIED" }) });
  assert.equal(denied.status, 403);
  const response = await fetch(base + "/api/admin/alumni/record-1/verification", { method: "POST", headers: { "content-type": "application/json", "x-test-role": "STAFF", "x-test-permissions": "ALUMNI_VERIFY" }, body: JSON.stringify({ status: "VERIFIED", notes: "Matched archive record" }) });
  assert.equal(response.status, 200); assert.equal(reviewers[0].verificationStatus, "VERIFIED");
  assert.deepEqual(reviewRows[0], { alumniId: "record-1", reviewerId: "reviewer-1", previousStatus: "PENDING", newStatus: "VERIFIED", notes: "Matched archive record" });
});
test("student linking never updates a student ID and rejects already-linked/conflicting records", async () => {
  const headers = { "content-type": "application/json", "x-test-role": "STAFF", "x-test-permissions": "ALUMNI_VERIFY" };
  const first = await fetch(base + "/api/admin/alumni/record-1/student-link", { method: "PUT", headers, body: JSON.stringify({ studentId: "student-1", studentNumber: "NEW-ID" }) });
  assert.equal(first.status, 200); assert.equal(reviewers[0].studentId, "student-1"); assert.equal(studentRows.get("student-1").studentId, "SJ-001");
  const duplicate = await fetch(base + "/api/admin/alumni/record-1/student-link", { method: "PUT", headers, body: JSON.stringify({ studentId: "student-1" }) });
  assert.equal(duplicate.status, 409);
  reviewers.push({ id: "record-2", verificationStatus: "PENDING", studentId: null, fullName: "Other Alum" });
  const conflict = await fetch(base + "/api/admin/alumni/record-2/student-link", { method: "PUT", headers, body: JSON.stringify({ studentId: "student-1" }) });
  assert.equal(conflict.status, 409);
});
test("class-set membership assignment prevents duplicates and allows authorized verification", async () => {
  const headers = { "content-type": "application/json", "x-test-role": "STAFF", "x-test-permissions": "ALUMNI_MANAGE,ALUMNI_VERIFY" };
  const add = await fetch(base + "/api/admin/alumni/record-1/class-sets", { method: "POST", headers, body: JSON.stringify({ classSetId: "set-1" }) });
  assert.equal(add.status, 201); assert.equal(membershipRows.get("record-1:set-1").status, "PENDING");
  const dupe = await fetch(base + "/api/admin/alumni/record-1/class-sets", { method: "POST", headers, body: JSON.stringify({ classSetId: "set-1" }) });
  assert.equal(dupe.status, 409);
  const verify = await fetch(base + "/api/admin/alumni/record-1/class-sets/set-1", { method: "PATCH", headers, body: JSON.stringify({ status: "VERIFIED" }) });
  assert.equal(verify.status, 200); assert.equal(membershipRows.get("record-1:set-1").status, "VERIFIED");
});
test("class-set edits validate partial year changes against the stored companion year", async () => {
  const headers = { "content-type": "application/json", "x-test-role": "STAFF", "x-test-permissions": "ALUMNI_MANAGE" };
  const invalid = await fetch(base + "/api/admin/alumni/class-sets/set-edit", { method: "PUT", headers, body: JSON.stringify({ entryYear: 2000 }) });
  assert.equal(invalid.status, 400); assert.equal(classSetRows.get("set-edit").entryYear, 1990);
  const valid = await fetch(base + "/api/admin/alumni/class-sets/set-edit", { method: "PUT", headers, body: JSON.stringify({ entryYear: 1992 }) });
  assert.equal(valid.status, 200); assert.equal(classSetRows.get("set-edit").entryYear, 1992);
});
test("update-request approval applies only approved profile fields; information request persists private review metadata", async () => {
  updateRows.set("request-1", { id: "request-1", alumniId: "record-1", status: "PENDING", payload: { fullName: "Updated Alumni", role: "ADMIN" } });
  const headers = { "content-type": "application/json", "x-test-role": "STAFF", "x-test-permissions": "ALUMNI_VERIFY" };
  const needsInfo = await fetch(base + "/api/admin/update-requests/request-1/review", { method: "POST", headers, body: JSON.stringify({ decision: "NEEDS_INFORMATION", notes: "Please confirm the year." }) });
  assert.equal(needsInfo.status, 200); assert.equal(updateRows.get("request-1").status, "PENDING"); assert.equal(updateRows.get("request-1").payload._review.decision, "NEEDS_INFORMATION");
  const approved = await fetch(base + "/api/admin/update-requests/request-1/review", { method: "POST", headers, body: JSON.stringify({ decision: "APPROVED" }) });
  assert.equal(approved.status, 200); assert.equal(updateRows.get("request-1").status, "APPROVED"); assert.equal(reviewers[0].fullName, "Updated Alumni"); assert.equal(reviewers[0].role, undefined);
});
test("public class-member query excludes unverified records and selects no private identifiers or contact fields", async () => {
  const response = await fetch(base + "/api/alumni?classSetId=set-1"); assert.equal(response.status, 200);
  assert.equal(listQuery.where.verificationStatus, "VERIFIED"); assert.equal(listQuery.where.isPublic, true);
  assert.equal(listQuery.select.phone, undefined); assert.equal(listQuery.select.whatsapp, undefined); assert.equal(listQuery.select.dateOfBirth, undefined); assert.equal(listQuery.select.studentId, undefined); assert.equal(listQuery.select.user, undefined);
  assert.equal(listQuery.where.classMemberships.some.status, "VERIFIED");
});
test("admin and public alumni controls are connected and mobile layouts have responsive rules", async () => {
  const [adminHtml, adminJs, publicMain, onboarding, adminCss] = await Promise.all([
    readFile(new URL("../public/admin/admin.html", import.meta.url), "utf8"),
    readFile(new URL("../public/js/admin.js", import.meta.url), "utf8"),
    readFile(new URL("../public/js/main.js", import.meta.url), "utf8"),
    readFile(new URL("../public/js/alumni-onboarding.js", import.meta.url), "utf8"),
    readFile(new URL("../public/css/admin.css", import.meta.url), "utf8")
  ]);
  for (const id of ["alumni-status-filter", "alumni-class-filter", "alumni-modal", "class-set-form", "requests-list"]) assert.match(adminHtml, new RegExp('id="' + id + '"'));
  const ids = [...adminHtml.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual([...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))], []);
  for (const selector of ['$("#alumni-search")?.addEventListener', '$("#alumni-status-filter")?.addEventListener', '$("#alumni-year-filter")?.addEventListener', '$("#alumni-class-filter")?.addEventListener', '$("#class-set-form")?.addEventListener', '$("#requests-list")?.addEventListener']) assert.equal(adminJs.split(selector).length - 1, 1, selector + " should have one event binding");
  for (const route of ["/api/admin/alumni", "/verification", "/student-link", "/class-sets", "/update-requests/"]) assert.ok(adminJs.includes(route), "admin UI should call " + route);
  assert.ok(publicMain.includes("/api/alumni/class-sets"));
  assert.ok(onboarding.includes("/api/alumni/register"));
  assert.ok(onboarding.includes("Photo and evidence uploads are not supported yet"));
  assert.match(adminCss, /@media\s*\(max-width:\s*700px\)/);
});
