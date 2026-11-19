import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import multer from "multer";
import { createServer } from "node:http";
import { registerHomepageBannerRoutes } from "../server/homepage-banner-routes.js";

let server, origin;
let rows = [];
let transactionTail = Promise.resolve();
let sequence = 0;
let cleanupCount = 0;
const permissions = { admin: ["ADMIN"], editor: ["CONTENT_MANAGE"], reader: ["CONTENT_VIEW"], none: [] };
const clone = value => value == null ? value : structuredClone(value);

function bannerModel() {
  return {
    findMany: async ({ where = {}, orderBy, select } = {}) => {
      let found = rows.filter(row => Object.entries(where).every(([key, value]) => {
        if (key === "id" && value && typeof value === "object" && "not" in value) return row.id !== value.not;
        return row[key] === value;
      }));
      const orders = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
      found = [...found].sort((a, b) => {
        for (const order of orders) {
          const [key, direction] = Object.entries(order)[0];
          if (a[key] !== b[key]) return (a[key] < b[key] ? -1 : 1) * (direction === "desc" ? -1 : 1);
        }
        return 0;
      });
      return clone(select ? found.map(row => Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, row[key]]))) : found);
    },
    findUnique: async ({ where }) => clone(rows.find(row => row.id === where.id) || null),
    count: async ({ where = {} } = {}) => rows.filter(row => Object.entries(where).every(([key, value]) => {
      if (key === "id" && value && typeof value === "object" && "not" in value) return row.id !== value.not;
      return row[key] === value;
    })).length,
    create: async ({ data }) => { const row = { id: `banner-${++sequence}`, createdAt: new Date(sequence * 1000), updatedAt: new Date(sequence * 1000), isPublished: false, displayOrder: 0, description: null, buttonText: null, buttonUrl: null, ...data }; rows.push(row); return clone(row); },
    update: async ({ where, data }) => { const row = rows.find(item => item.id === where.id); if (!row) { const error = new Error("missing"); error.code = "P2025"; throw error; } Object.assign(row, data, { updatedAt: new Date() }); return clone(row); },
    delete: async ({ where }) => { const index = rows.findIndex(item => item.id === where.id); if (index < 0) { const error = new Error("missing"); error.code = "P2025"; throw error; } return clone(rows.splice(index, 1)[0]); }
  };
}

const model = bannerModel();
const transactionModel = {
  homepageBanner: model,
  $queryRawUnsafe: async () => []
};
const prisma = {
  homepageBanner: model,
  $transaction: callback => {
    const run = transactionTail.then(() => callback(transactionModel));
    transactionTail = run.catch(() => {});
    return run;
  }
};
const auth = (req, res, next) => {
  const user = req.get("x-user");
  if (!user) return res.status(401).json({ error: "Authentication required" });
  req.user = { sub: user, role: user === "admin" ? "ADMIN" : "STAFF" };
  next();
};
const requirePermission = (...required) => (req, res, next) => {
  const grants = permissions[req.user.sub] || [];
  return req.user.role === "ADMIN" || required.every(permission => grants.includes(permission)) ? next() : res.status(403).json({ error: "FORBIDDEN" });
};
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) });
const uploadTools = {
  imageUpload,
  storeUploadedImage: async (_file, folder) => ({ photoUrl: `https://test.public.blob.vercel-storage.com/${folder}/image-${++sequence}.png`, blobPathname: `${folder}/image-${sequence}.png`, access: "public" }),
  cleanupNewImage: async () => { cleanupCount++; }
};

before(async () => {
  const app = express(); app.use(express.json()); app.use(express.urlencoded({ extended: true }));
  registerHomepageBannerRoutes(app, prisma, auth, requirePermission, uploadTools);
  app.use((error, _req, res, _next) => res.status(error instanceof multer.MulterError ? 400 : 500).json({ error: error.message }));
  server = createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });
beforeEach(() => { rows = []; sequence = 0; cleanupCount = 0; transactionTail = Promise.resolve(); });

const call = (path, { user, method = "GET", body, multipart = false } = {}) => fetch(`${origin}${path}`, {
  method,
  headers: { ...(user ? { "x-user": user } : {}), ...(body && !multipart ? { "content-type": "application/json" } : {}) },
  body: body ? multipart ? body : JSON.stringify(body) : undefined
});
const valid = (overrides = {}) => ({ heading: "Welcome", imageUrl: "https://images.example/banner.jpg", imageAlt: "Students at school", ...overrides });
const create = async (overrides = {}, user = "editor") => {
  const response = await call("/api/admin/homepage-banners", { user, method: "POST", body: valid(overrides) });
  return { response, banner: await response.json() };
};

test("admin banner management requires authentication and CONTENT_MANAGE", async () => {
  for (const [path, method] of [["/api/admin/homepage-banners", "GET"], ["/api/admin/homepage-banners", "POST"], ["/api/admin/homepage-banners/x", "PUT"], ["/api/admin/homepage-banners/x/publication", "PATCH"], ["/api/admin/homepage-banners/x", "DELETE"]]) {
    assert.equal((await call(path, { method, body: method === "GET" || method === "DELETE" ? undefined : {} })).status, 401);
  }
  assert.equal((await call("/api/admin/homepage-banners", { user: "reader" })).status, 403);
  assert.equal((await call("/api/admin/homepage-banners", { user: "admin" })).status, 200);
});

test("banner CRUD validates fields, updates only the selected banner, and deletes without removing media", async () => {
  for (const invalid of [
    {}, { ...valid(), heading: " " }, { ...valid(), imageAlt: 2 }, { ...valid(), imageUrl: "javascript:alert(1)" },
    { ...valid(), buttonUrl: "//evil.example" }, { ...valid(), buttonUrl: "javascript:alert(1)" },
    { ...valid(), displayOrder: -1 }, { ...valid(), displayOrder: "1.5" }, { ...valid(), isPublished: "yes" },
    { ...valid(), unexpected: "no" }
  ]) assert.equal((await call("/api/admin/homepage-banners", { user: "editor", method: "POST", body: invalid })).status, 400);

  const created = await create({ description: "Intro", buttonText: "Learn more", buttonUrl: "/about", displayOrder: 2 });
  assert.equal(created.response.status, 201);
  const other = await create({ heading: "Second" });
  const updatedResponse = await call(`/api/admin/homepage-banners/${created.banner.id}`, { user: "editor", method: "PUT", body: { heading: "Updated", description: "Updated description" } });
  assert.equal(updatedResponse.status, 200);
  const updated = await updatedResponse.json();
  assert.equal(updated.heading, "Updated");
  assert.equal(updated.imageUrl, created.banner.imageUrl);
  assert.equal(rows.find(row => row.id === other.banner.id).heading, "Second");
  assert.equal((await call(`/api/admin/homepage-banners/missing`, { user: "editor", method: "PUT", body: { heading: "No row" } })).status, 404);
  assert.equal((await call(`/api/admin/homepage-banners/${created.banner.id}`, { user: "editor", method: "DELETE" })).status, 200);
  assert.equal(rows.some(row => row.id === created.banner.id), false);
  assert.equal(cleanupCount, 0, "deleting a banner never deletes its uploaded image");
});

test("multipart banner image uploads reuse shared public content storage and reject invalid image bytes", async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const form = new FormData();
  for (const [key, value] of Object.entries({ heading: "Uploaded", imageAlt: "Alt" })) form.set(key, value);
  form.set("image", new Blob([png], { type: "image/png" }), "banner.png");
  const response = await call("/api/admin/homepage-banners", { user: "editor", method: "POST", body: form, multipart: true });
  assert.equal(response.status, 201);
  assert.match((await response.json()).imageUrl, /^https:\/\/test\.public\.blob\.vercel-storage\.com\/content\//);

  const forged = new FormData(); forged.set("heading", "Forged"); forged.set("imageAlt", "Alt"); forged.set("image", new Blob(["not png"], { type: "image/png" }), "fake.png");
  assert.equal((await call("/api/admin/homepage-banners", { user: "editor", method: "POST", body: forged, multipart: true })).status, 400);
});

test("publication lifecycle enforces five published banners including concurrent requests", async () => {
  const banners = [];
  for (let index = 0; index < 4; index++) banners.push((await create({ heading: `Banner ${index}`, isPublished: true })).banner);
  const first = (await create({ heading: "Fifth" })).banner;
  const sixth = (await create({ heading: "Sixth" })).banner;
  assert.equal((await call(`/api/admin/homepage-banners/${first.id}/publication`, { user: "editor", method: "PATCH", body: { isPublished: true } })).status, 200);
  assert.equal((await call(`/api/admin/homepage-banners/${sixth.id}/publication`, { user: "editor", method: "PATCH", body: { isPublished: true } })).status, 409);
  assert.equal((await call(`/api/admin/homepage-banners/${first.id}/publication`, { user: "editor", method: "PATCH", body: { isPublished: false } })).status, 200);
  assert.equal((await call(`/api/admin/homepage-banners/${sixth.id}/publication`, { user: "editor", method: "PATCH", body: { isPublished: true } })).status, 200);

  rows = [];
  for (let index = 0; index < 4; index++) await create({ heading: `Concurrent ${index}`, isPublished: true });
  const a = (await create({ heading: "Concurrent A" })).banner;
  const b = (await create({ heading: "Concurrent B" })).banner;
  const outcomes = await Promise.all([a, b].map(item => call(`/api/admin/homepage-banners/${item.id}/publication`, { user: "editor", method: "PATCH", body: { isPublished: true } })));
  assert.deepEqual(outcomes.map(response => response.status).sort(), [200, 409]);
  assert.equal(rows.filter(row => row.isPublished).length, 5);

  const createSixth = await create({ heading: "Published sixth", isPublished: true });
  assert.equal(createSixth.response.status, 409);
});

test("public endpoint returns only published banner fields in stable display order", async () => {
  const late = (await create({ heading: "Late", displayOrder: 4, isPublished: true })).banner;
  const early = (await create({ heading: "Early", displayOrder: 1, isPublished: true })).banner;
  await create({ heading: "Draft", displayOrder: 0 });
  const response = await call("/api/homepage-banners");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const items = await response.json();
  assert.deepEqual(items.map(item => item.id), [early.id, late.id]);
  assert.deepEqual(Object.keys(items[0]).sort(), ["buttonText", "buttonUrl", "description", "displayOrder", "heading", "id", "imageAlt", "imageUrl"].sort());
});
