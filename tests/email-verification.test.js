import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import rateLimit from "express-rate-limit";
import { createServer } from "node:http";
import { createEmailVerificationService, hashVerificationToken, loginRequiresVerifiedEmail, registerEmailVerificationRoutes } from "../server/email-verification.js";

let server, origin;
const users = new Map();
const tokens = [];
const sentEmails = [];
const prisma = {
  emailVerificationToken: {
    create: async ({ data }) => { const row = { id: `token-${tokens.length + 1}`, createdAt: new Date(), ...structuredClone(data) }; tokens.push(row); return structuredClone(row); },
    findUnique: async ({ where }) => structuredClone(tokens.find(row => row.tokenHash === where.tokenHash) || null),
    findFirst: async ({ where }) => structuredClone(tokens.find(row => row.userId === where.userId && row.createdAt > where.createdAt.gt) || null),
    updateMany: async ({ where, data }) => { const matched = tokens.filter(row => row.id === where.id || (where.userId === row.userId && (!where.consumedAt || row.consumedAt == null))); for (const row of matched) { if (where.expiresAt?.gt && row.expiresAt <= where.expiresAt.gt) continue; Object.assign(row, structuredClone(data)); } return { count: matched.filter(row => row.consumedAt?.getTime() === data.consumedAt?.getTime()).length }; }
  },
  user: {
    findUnique: async ({ where }) => { const user = [...users.values()].find(row => row.email === where.email); return user ? structuredClone(user) : null; },
    update: async ({ where, data }) => { const user = [...users.values()].find(row => row.id === where.id); if (!user) throw new Error("missing user"); Object.assign(user, structuredClone(data)); return structuredClone(user); }
  },
  $transaction: async callback => callback(prisma)
};
const service = createEmailVerificationService(prisma, {
  apiKey: "test-key",
  from: "SJSTCM <noreply@example.test>",
  siteUrl: "https://school.example.test",
  fetchImpl: async (_url, request) => { sentEmails.push(JSON.parse(request.body)); return new Response("{}", { status: 200 }); }
});

test.before(async () => {
  users.clear(); tokens.length = 0; sentEmails.length = 0;
  users.set("student@example.test", { id: "student-user", email: "student@example.test", emailVerifiedAt: null, student: { firstName: "Sam", lastName: "Student" }, alumni: null, staffProfile: null });
  const app = express(); app.use(express.json()); registerEmailVerificationRoutes(app, prisma, service, rateLimit);
  server = createServer(app); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

const call = (path, body) => fetch(origin + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("verification stores only token hashes, verifies once, and rejects invalid, expired and reused links", async () => {
  assert.equal(await service.issueAndSend({ id: "student-user", email: "student@example.test", name: "Sam Student" }), true);
  assert.equal(tokens.length, 1);
  const html = sentEmails[0].html;
  const token = html.match(/#token=([a-f0-9]{64})/)?.[1];
  assert.ok(token);
  assert.equal(tokens[0].tokenHash, hashVerificationToken(token));
  assert.equal(tokens[0].tokenHash.includes(token), false);
  assert.equal(JSON.stringify(tokens).includes(token), false);
  assert.equal(html.includes("verify-email.html#token="), true);

  const verified = await call("/api/auth/verify-email", { token });
  assert.equal(verified.status, 200);
  assert.ok(users.get("student@example.test").emailVerifiedAt instanceof Date);
  const responseBody = await verified.json();
  assert.equal("token" in responseBody, false);
  assert.equal("password" in responseBody, false);
  assert.equal((await call("/api/auth/verify-email", { token })).status, 400, "a consumed token cannot be reused");
  assert.equal((await call("/api/auth/verify-email", { token: "not-a-token" })).status, 400);

  const expired = "b".repeat(64);
  tokens.push({ id: "expired", userId: "student-user", tokenHash: hashVerificationToken(expired), expiresAt: new Date(Date.now() - 1000), consumedAt: null, createdAt: new Date() });
  assert.equal((await call("/api/auth/verify-email", { token: expired })).status, 400);
});

test("resend responses do not reveal account presence and requests are throttled", async () => {
  tokens.length = 0; sentEmails.length = 0;
  users.get("student@example.test").emailVerifiedAt = null;
  const responses = [];
  for (const email of ["student@example.test", "student@example.test", "missing@example.test", "another@example.test", "third@example.test"]) {
    const response = await call("/api/auth/resend-verification", { email });
    responses.push({ status: response.status, body: await response.json() });
  }
  assert.equal(responses.every(result => result.status === 202), true);
  assert.deepEqual(responses[0].body, responses[2].body);
  assert.deepEqual(responses[0].body, responses[1].body);
  assert.equal(sentEmails.length, 1, "the per-account cooldown prevents repeated messages");
  assert.equal((await call("/api/auth/resend-verification", { email: "fourth@example.test" })).status, 429);
});

test("unverified accounts are denied sign-in while migrated verified accounts retain access", () => {
  assert.equal(loginRequiresVerifiedEmail({ emailVerifiedAt: null }), true);
  assert.equal(loginRequiresVerifiedEmail({ emailVerifiedAt: new Date() }), false);
  assert.equal(loginRequiresVerifiedEmail(undefined), true);
});
