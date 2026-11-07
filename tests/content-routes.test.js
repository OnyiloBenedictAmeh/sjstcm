import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import multer from "multer";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { registerContentRoutes } from "../server/content-routes.js";

let server, origin, tempRoot;
const state = { news: [], event: [], department: [], galleryPhoto: [], setting: [] };
const permissions = { admin: ["ADMIN"], editor: ["CONTENT_VIEW", "CONTENT_MANAGE"], eventer: ["EVENTS_MANAGE"], gallerist: ["GALLERY_MANAGE"], reader: ["CONTENT_VIEW"], none: [] };
const matches = (row, where = {}) => {
  if (where.AND && !where.AND.every(clause => matches(row, clause))) return false;
  if (where.OR && !where.OR.some(clause => matches(row, clause))) return false;
  for (const [key, condition] of Object.entries(where)) {
    if (["AND", "OR"].includes(key)) continue;
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("contains" in condition && !String(row[key] || "").toLowerCase().includes(condition.contains.toLowerCase())) return false;
      if ("equals" in condition && row[key] !== condition.equals) return false;
      if ("not" in condition && row[key] === condition.not) return false;
      if ("gte" in condition && new Date(row[key]) < condition.gte) return false;
      if ("lte" in condition && new Date(row[key]) > condition.lte) return false;
      if ("lt" in condition && !(new Date(row[key]) < condition.lt)) return false;
    } else if (row[key] !== condition) return false;
  }
  return true;
};

function model(name) {
  return {
    findMany: async ({ where = {}, orderBy } = {}) => {
      const rows = state[name].filter(row => matches(row, where));
      if (orderBy) { const [key, direction] = Object.entries(orderBy)[0]; rows.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (direction === "desc" ? -1 : 1)); }
      return rows;
    },
    findUnique: async ({ where }) => { const row = state[name].find(item => item.id === where.id || item.slug === where.slug || item.name === where.name || item.key === where.key); return row ? structuredClone(row) : null; },
    findFirst: async ({ where = {} } = {}) => { const row = state[name].find(item => matches(item, where)); return row ? structuredClone(row) : null; },
    create: async ({ data }) => { if ((name === "news" && state.news.some(x => x.slug === data.slug)) || (name === "department" && state.department.some(x => x.name === data.name))) { const error = new Error("conflict"); error.code = "P2002"; throw error; } const row = { id: `${name}-${Date.now()}-${Math.random()}`, createdAt: new Date(), updatedAt: new Date(), ...data }; state[name].push(row); return row; },
    update: async ({ where, data }) => { const row = state[name].find(x => x.id === where.id); if (!row) { const error = new Error("missing"); error.code = "P2025"; throw error; } if (name === "department" && data.name && state.department.some(x => x.id !== row.id && x.name === data.name)) { const error = new Error("conflict"); error.code = "P2002"; throw error; } Object.assign(row, data, { updatedAt: new Date() }); return structuredClone(row); },
    upsert: async ({ where, create, update }) => { let row = state[name].find(item => item.key === where.key); if (row) Object.assign(row, update, { updatedAt: new Date() }); else { row = { id: `setting-${Date.now()}`, ...create, updatedAt: new Date() }; state[name].push(row); } return structuredClone(row); },
    delete: async ({ where }) => { const index = state[name].findIndex(x => x.id === where.id); if (index < 0) { const error = new Error("missing"); error.code = "P2025"; throw error; } return state[name].splice(index, 1)[0]; }
  };
}

const prisma = Object.fromEntries(Object.keys(state).map(name => [name, model(name)]));
prisma.department.findUnique = async ({ where, include }) => {
  const item = state.department.find(row => row.id === where.id || row.name === where.name) || null;
  return item && include?._count ? { ...item, _count: { staffAppointments: item.staffAppointments || 0 } } : item;
};
const auth = (req, res, next) => { const user = req.get("x-user"); if (!user) return res.status(401).json({ error: "Authentication required" }); req.user = { sub: user, role: user === "admin" ? "ADMIN" : "STAFF" }; next(); };
const requirePermission = (...required) => (req, res, next) => { const grants = permissions[req.user.sub] || []; if (req.user.role === "ADMIN" || required.every(key => grants.includes(key))) return next(); return res.status(403).json({ error: "FORBIDDEN" }); };
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 }, fileFilter: (req, file, cb) => cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) });
const stored = new Map();
const uploadTools = {
  imageUpload,
  uploadsRoot: "",
  isVercel: true,
  blobDelete: async key => stored.delete(key),
  blobTokenFor: () => "test-token",
  storeUploadedImage: async (file, folder) => { const pathname = `${folder}/${Date.now()}-${Math.random()}.png`; const result = { photoUrl: `https://test.public.blob.vercel-storage.com/${pathname}`, blobPathname: pathname, access: "public" }; stored.set(pathname, file.buffer); return result; },
  cleanupNewImage: async asset => { if (asset?.blobPathname) stored.delete(asset.blobPathname); }
};

before(async () => {
  for (const rows of Object.values(state)) rows.length = 0;
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "sjstcm-content-tests-"));
  const app = express(); app.use(express.json()); app.use(express.urlencoded({ extended: true }));
  app.get("/api/news", async (req, res) => res.json(state.news.filter(item => item.isPublished).sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))));
  registerContentRoutes(app, prisma, auth, requirePermission, uploadTools);
  app.use((error, req, res, next) => res.status(error instanceof multer.MulterError ? 400 : 500).json({ error: error.message }));
  server = createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (tempRoot) await rm(tempRoot, { recursive: true, force: true }); });

const call = (path, { user, method = "GET", body, headers = {} } = {}) => fetch(`${origin}${path}`, { method, headers: { ...(user ? { "x-user": user } : {}), ...headers }, body });

test("content admin endpoints require authentication and each section permission", async () => {
  for (const path of ["news", "events", "departments", "gallery"]) assert.equal((await call(`/api/admin/${path}`)).status, 401);
  assert.equal((await call("/api/admin/news", { user: "none" })).status, 403);
  assert.equal((await call("/api/admin/events", { user: "reader" })).status, 403);
  assert.equal((await call("/api/admin/gallery", { user: "reader" })).status, 403);
  assert.equal((await call("/api/admin/departments", { user: "eventer" })).status, 403);
  for (const [section, user] of [["news", "eventer"], ["events", "reader"], ["departments", "gallerist"], ["gallery", "eventer"]]) {
    const denied = await call(`/api/admin/${section}`, { user, method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(denied.status, 403, `${user} cannot create ${section}`);
  }
  assert.equal((await call("/api/admin/news", { user: "admin" })).status, 200);
});

test("news drafts stay private; create, list filter, edit, publish, unpublish and delete work", async () => {
  const created = await call("/api/admin/news", { user: "editor", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Draft item", content: "Body", isPublished: false }) });
  assert.equal(created.status, 201); const draft = await created.json();
  assert.equal((await (await call("/api/news?all=true")).json()).some(x => x.id === draft.id), false);
  assert.equal((await call("/api/admin/news?status=draft", { user: "editor" })).status, 200);
  const published = await call(`/api/admin/news/${draft.id}`, { user: "editor", method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Updated article", slug: "updated-article", content: "Changed", isPublished: true }) });
  assert.equal(published.status, 200); const item = await published.json(); assert.ok(item.publishedAt);
  const unpublish = await call(`/api/admin/news/${draft.id}`, { user: "editor", method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: item.title, slug: item.slug, content: item.content, isPublished: false }) });
  assert.equal((await unpublish.json()).publishedAt, null);
  assert.equal((await (await call("/api/news?all=true")).json()).some(x => x.id === draft.id), false);
  assert.equal((await call(`/api/admin/news/${draft.id}`, { user: "editor", method: "DELETE" })).status, 200);
  assert.equal((await call("/api/admin/news", { user: "reader" })).status, 403);
});

test("breaking-news public feed filters schedules, sorts priority and exposes only public fields", async () => {
  const now = Date.now();
  const create = (headline, options = {}) => call("/api/admin/breaking-news", { user: "editor", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ headline, priority: 0, isActive: true, ...options }) });
  assert.equal((await create("Low priority", { priority: 1, destinationUrl: "/news.html?article=low" })).status, 201);
  assert.equal((await create("Top priority", { priority: 9, destinationUrl: "https://example.test/story" })).status, 201);
  assert.equal((await create("Inactive", { isActive: false, priority: 99 })).status, 201);
  assert.equal((await create("Future", { startsAt: new Date(now + 86400000).toISOString(), priority: 100 })).status, 201);
  assert.equal((await create("Expired", { expiresAt: new Date(now - 86400000).toISOString(), priority: 100 })).status, 201);
  const response = await call("/api/breaking-news");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const items = await response.json();
  assert.deepEqual(items.map(item => item.headline), ["Top priority", "Low priority"]);
  assert.equal(items[0].destinationUrl, "https://example.test/story");
  assert.deepEqual(Object.keys(items[0]).sort(), ["destinationUrl", "headline", "id", "priority"]);
  assert.equal(JSON.parse(state.setting[0].value).length, 5);
});

test("breaking-news management protects endpoints and supports validation and full lifecycle", async () => {
  for (const [path, method, body] of [["/api/admin/breaking-news", "GET"], ["/api/admin/breaking-news", "POST", { headline: "No auth" }], ["/api/admin/breaking-news/item", "PUT", { headline: "No auth" }], ["/api/admin/breaking-news/item", "DELETE"]]) {
    assert.equal((await call(path, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) })).status, 401);
  }
  assert.equal((await call("/api/admin/breaking-news", { user: "reader" })).status, 403);
  assert.equal((await call("/api/admin/breaking-news", { user: "editor" })).status, 200);
  const post = (body, user = "editor") => call("/api/admin/breaking-news", { user, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  for (const [path, method, body] of [["/api/admin/breaking-news", "POST", { headline: "Denied" }], ["/api/admin/breaking-news/item", "PUT", { headline: "Denied" }], ["/api/admin/breaking-news/item", "DELETE"]]) {
    assert.equal((await call(path, { user: "reader", method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) })).status, 403);
  }
  for (const invalid of [{ headline: "" }, { headline: "Invalid URL", destinationUrl: "javascript:alert(1)" }, { headline: "Invalid date", startsAt: "not-a-date" }, { headline: "Bad range", startsAt: "2026-02-02", expiresAt: "2026-02-01" }, { headline: "Bad priority", priority: -1 }]) assert.equal((await post(invalid)).status, 400);
  const createdResponse = await post({ headline: "Lifecycle", priority: 3, isActive: false });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.destinationUrl, "");
  const initialPublic = await (await call("/api/breaking-news")).json();
  assert.equal(initialPublic.some(item => item.id === created.id), false);
  const retrieved = await (await call("/api/admin/breaking-news", { user: "editor" })).json();
  assert.ok(retrieved.some(item => item.id === created.id));
  let updatedResponse = await call(`/api/admin/breaking-news/${created.id}`, { user: "editor", method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...created, isActive: true, priority: 12 }) });
  assert.equal(updatedResponse.status, 200);
  let publicItems = await (await call("/api/breaking-news")).json();
  assert.ok(publicItems.some(item => item.id === created.id));
  assert.equal(publicItems[0].id, created.id);
  updatedResponse = await call(`/api/admin/breaking-news/${created.id}`, { user: "editor", method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...created, headline: "Edited lifecycle", isActive: false }) });
  assert.equal(updatedResponse.status, 200);
  publicItems = await (await call("/api/breaking-news")).json();
  assert.equal(publicItems.some(item => item.id === created.id), false);
  assert.equal((await call(`/api/admin/breaking-news/${created.id}`, { user: "editor", method: "DELETE" })).status, 200);
  assert.equal((await call(`/api/admin/breaking-news/${created.id}`, { user: "editor", method: "DELETE" })).status, 404);
});

test("breaking-news public endpoint returns an empty array without saved headlines", async () => {
  state.setting.length = 0;
  const response = await call("/api/breaking-news");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test("events validate real dates/range and support create, update, filters and deletion", async () => {
  const invalid = await call("/api/admin/events", { user: "eventer", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Invalid", startsAt: "not-a-date" }) }); assert.equal(invalid.status, 400);
  const reverse = await call("/api/admin/events", { user: "eventer", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Invalid", startsAt: "2030-01-02", endsAt: "2030-01-01" }) }); assert.equal(reverse.status, 400);
  const response = await call("/api/admin/events", { user: "eventer", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "School fair", startsAt: "2030-01-01T10:00:00Z", endsAt: "2030-01-01T12:00:00Z", location: "Hall" }) }); assert.equal(response.status, 201); const item = await response.json();
  assert.equal((await call("/api/admin/events?q=fair&period=upcoming", { user: "eventer" })).status, 200);
  assert.equal((await call(`/api/admin/events/${item.id}`, { user: "eventer", method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Changed fair", startsAt: "2030-01-01T10:00:00Z" }) })).status, 200);
  assert.equal((await call(`/api/admin/events/${item.id}`, { user: "eventer", method: "DELETE" })).status, 200);
});

test("departments validate duplicates, update and preserve appointment history on delete", async () => {
  let response = await call("/api/admin/departments", { user: "editor", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Science", description: "Laboratory", head: "A. Teacher" }) }); assert.equal(response.status, 201); const item = await response.json();
  response = await call("/api/admin/departments", { user: "editor", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Science" }) }); assert.equal(response.status, 409);
  assert.equal((await call(`/api/admin/departments/${item.id}`, { user: "editor", method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Applied Science", description: "Updated" }) })).status, 200);
  state.department.find(row => row.id === item.id).staffAppointments = 2;
  assert.equal((await call(`/api/admin/departments/${item.id}`, { user: "editor", method: "DELETE" })).status, 409);
  assert.ok(state.department.some(row => row.id === item.id));
});

test("gallery supports permissioned CRUD, validates image signatures and cleans owned assets only", async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const form = new FormData(); form.set("title", "Photo"); form.set("image", new Blob([png], { type: "image/png" }), "photo.png");
  const createdResponse = await call("/api/admin/gallery", { user: "gallerist", method: "POST", body: form }); assert.equal(createdResponse.status, 201); const item = await createdResponse.json(); assert.match(item.imageUrl, /^https:\/\/test\.public\.blob\.vercel-storage\.com\/content\//);
  const forged = new FormData(); forged.set("image", new Blob(["not png"], { type: "image/png" }), "fake.png");
  assert.equal((await call("/api/admin/gallery", { user: "gallerist", method: "POST", body: forged })).status, 400);
  const wrongMime = new FormData(); wrongMime.set("image", new Blob([png], { type: "text/plain" }), "fake.txt");
  assert.equal((await call("/api/admin/gallery", { user: "gallerist", method: "POST", body: wrongMime })).status, 400);
  const tooLarge = new FormData(); tooLarge.set("image", new Blob([Buffer.alloc(4 * 1024 * 1024 + 1)], { type: "image/png" }), "large.png");
  assert.equal((await call("/api/admin/gallery", { user: "gallerist", method: "POST", body: tooLarge })).status, 400);
  const externalUpdate = await call(`/api/admin/gallery/${item.id}`, { user: "gallerist", method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "External", imageUrl: "https://images.example/school.jpg" }) }); assert.equal(externalUpdate.status, 200);
  assert.equal(stored.size, 0, "replaced owned blob is cleaned after reference check");
  assert.equal((await call(`/api/admin/gallery/${item.id}`, { user: "gallerist", method: "DELETE" })).status, 200);
  assert.equal((await call(`/api/admin/gallery/${item.id}`, { user: "gallerist" })).status, 404);
  const another = await call("/api/admin/gallery", { user: "gallerist", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ imageUrl: "https://shared.public.blob.vercel-storage.com/content/shared.png" }) });
  const shared = await another.json(); stored.set("content/shared.png", png);
  const reference = await call("/api/admin/gallery", { user: "gallerist", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ imageUrl: shared.imageUrl }) });
  const secondReference = await reference.json();
  await call(`/api/admin/gallery/${shared.id}`, { user: "gallerist", method: "DELETE" });
  assert.ok(stored.has("content/shared.png"), "an image referenced by another record is retained");
  await call(`/api/admin/gallery/${secondReference.id}`, { user: "gallerist", method: "DELETE" });
  assert.equal(stored.has("content/shared.png"), false, "owned image is removed when its final reference is deleted");
  const externalResponse = await call("/api/admin/gallery", { user: "gallerist", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ imageUrl: "https://images.example/school.jpg" }) });
  const external = await externalResponse.json();
  await call(`/api/admin/gallery/${external.id}`, { user: "gallerist", method: "DELETE" });
  assert.equal(stored.size, 0, "external images are never passed to storage cleanup");
});

test("content UI and public image resolution remain wired", async () => {
  const [admin, js, publicJs, serverSource] = await Promise.all([readFile("public/admin/admin.html", "utf8"), readFile("public/js/admin.js", "utf8"), readFile("public/js/main.js", "utf8"), readFile("server/index.js", "utf8")]);
  for (const endpoint of ["/api/admin/news", "/api/admin/events", "/api/admin/departments", "/api/admin/gallery"]) assert.ok(js.includes(endpoint));
  for (const id of ["news-search", "news-status-filter", "events-period-filter", "departments-search", "gallery-search"]) assert.ok(admin.includes(id));
  assert.ok(admin.includes('accept="image/jpeg,image/png,image/webp"'));
  assert.ok(publicJs.includes("contentImageUrl(news.imageUrl)"));
  assert.ok(publicJs.includes("contentImageUrl(photo.imageUrl)"));
  assert.match(serverSource, /where:\s*\{\s*isPublished:\s*true\s*\}/);
  assert.doesNotMatch(serverSource, /req\.query\.all\s*===\s*"true"/);
});
