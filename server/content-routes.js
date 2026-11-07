const CONTENT_TYPES = {
  news: { model: "news", permission: "CONTENT_MANAGE" },
  events: { model: "event", permission: "EVENTS_MANAGE" },
  departments: { model: "department", permission: "CONTENT_MANAGE" },
  gallery: { model: "galleryPhoto", permission: "GALLERY_MANAGE" }
};

const clean = value => typeof value === "string" ? value.trim() : "";
const validImageUrl = value => {
  if (!value) return true;
  if (typeof value !== "string" || value.length > 2048) return false;
  if (value.startsWith("/uploads/content/")) return !value.includes("..");
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
};
const validDate = value => {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date : null;
};
const fail = (res, message) => res.status(400).json({ error: message });

function routeError(res, error, label) {
  if (error?.code === "P2002") return res.status(409).json({ error: "A record with that name or slug already exists." });
  if (error?.code === "P2025") return res.status(404).json({ error: "Content record not found." });
  console.error(`${label}:`, error);
  return res.status(500).json({ error: "Unable to complete content request." });
}

function imageSignature(buffer, mime) {
  if (!buffer) return false;
  if (mime === "image/jpeg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === "image/png") return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/webp") return buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  return false;
}

export function registerContentRoutes(app, prisma, auth, requirePermission, uploadTools) {
  const { imageUpload, storeUploadedImage, cleanupNewImage, uploadsRoot, isVercel, blobDelete, blobTokenFor } = uploadTools;
  const verifyUpload = async (req, res, next) => {
    if (!req.file) return next();
    try {
      const bytes = req.file.buffer || await import("node:fs/promises").then(fs => fs.readFile(req.file.path));
      if (!imageSignature(bytes, req.file.mimetype)) {
        await cleanupNewImage({ localPath: req.file.path });
        return fail(res, "The uploaded file is not a valid JPG, PNG or WebP image.");
      }
      next();
    } catch (error) { return routeError(res, error, "CONTENT IMAGE VALIDATION ERROR"); }
  };

  async function imageStillReferenced(url, except = {}) {
    if (!url) return false;
    for (const model of ["news", "event", "galleryPhoto"]) {
      if (!prisma[model]?.findFirst) continue;
      const where = { imageUrl: url };
      if (except.model === model) where.id = { not: except.id };
      if (await prisma[model].findFirst({ where, select: { id: true } })) return true;
    }
    return false;
  }

  async function removeOwnedImage(url) {
    if (!url || await imageStillReferenced(url)) return;
    if (url.startsWith("/uploads/content/")) {
      if (isVercel) return;
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const target = path.resolve(uploadsRoot, "content", path.basename(url));
      if (target.startsWith(path.resolve(uploadsRoot, "content") + path.sep)) await fs.rm(target, { force: true });
      return;
    }
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.endsWith(".public.blob.vercel-storage.com")) return;
      const pathname = decodeURIComponent(parsed.pathname).replace(/^\//, "");
      if (!pathname.startsWith("content/") || pathname.includes("..")) return;
      await blobDelete(pathname, { token: blobTokenFor("public") });
    } catch { /* Preserve uncertain or external resources. */ }
  }

  const upload = (req, res, next) => {
    req.uploadType = "content";
    imageUpload.single("image")(req, res, error => error ? next(error) : verifyUpload(req, res, next));
  };

  const guards = name => [auth, requirePermission(CONTENT_TYPES[name].permission)];
  const fileUrl = async req => {
    if (!req.file) return null;
    return storeUploadedImage(req.file, "content", "public");
  };
  const releaseUnpersistedFile = req => req.file && cleanupNewImage({ localPath: req.file.path });

  const tickerKey = "breakingNewsTicker";
  const readTicker = async () => {
    const setting = await prisma.setting.findUnique({ where: { key: tickerKey } });
    try { const value = JSON.parse(setting?.value || "[]"); return Array.isArray(value) ? value : []; }
    catch { return []; }
  };
  const saveTicker = async items => prisma.setting.upsert({
    where: { key: tickerKey },
    create: { key: tickerKey, value: JSON.stringify(items) },
    update: { value: JSON.stringify(items) }
  });
  const tickerDate = value => {
    if (value == null || value === "") return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : false;
  };
  const tickerDestination = value => {
    if (!value) return "";
    if (typeof value !== "string" || value.length > 2048) return null;
    if (value.startsWith("/") && !value.startsWith("//")) return value;
    try { return ["http:", "https:"].includes(new URL(value).protocol) ? value : null; }
    catch { return null; }
  };
  const tickerPayload = body => {
    const headline = clean(body.headline);
    const destinationUrl = tickerDestination(clean(body.destinationUrl));
    const startsAt = tickerDate(body.startsAt), expiresAt = tickerDate(body.expiresAt);
    if (!headline || headline.length > 240) return { error: "Headline is required and must be at most 240 characters." };
    if (destinationUrl === null) return { error: "Destination must be a relative path or HTTP(S) URL." };
    if (startsAt === false || expiresAt === false) return { error: "Schedule dates must be valid." };
    if (startsAt && expiresAt && expiresAt <= startsAt) return { error: "Expiry must be after the start date." };
    const priority = Number(body.priority ?? 0);
    if (!Number.isInteger(priority) || priority < 0 || priority > 100000) return { error: "Priority must be a whole number from 0 to 100000." };
    return { headline, destinationUrl, startsAt: startsAt?.toISOString() || null, expiresAt: expiresAt?.toISOString() || null, priority, isActive: body.isActive === true || body.isActive === "true" };
  };

  app.get("/api/breaking-news", async (_req, res) => {
    try {
      const now = Date.now();
      const items = (await readTicker())
        .filter(item => item?.isActive === true && (!item.startsAt || new Date(item.startsAt).getTime() <= now) && (!item.expiresAt || new Date(item.expiresAt).getTime() > now))
        .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")))
        .map(({ id, headline, destinationUrl, priority }) => ({ id, headline, destinationUrl, priority }));
      return res.set("Cache-Control", "no-store").json(items);
    } catch (error) { return routeError(res, error, "PUBLIC BREAKING NEWS ERROR"); }
  });

  const tickerGuard = [auth, requirePermission("CONTENT_MANAGE")];
  app.get("/api/admin/breaking-news", ...tickerGuard, async (_req, res) => {
    try { return res.json((await readTicker()).sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0))); }
    catch (error) { return routeError(res, error, "ADMIN BREAKING NEWS LIST ERROR"); }
  });
  app.post("/api/admin/breaking-news", ...tickerGuard, async (req, res) => {
    const payload = tickerPayload(req.body || {});
    if (payload.error) return fail(res, payload.error);
    try {
      const items = await readTicker();
      const item = { id: `ticker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, ...payload, createdAt: new Date().toISOString() };
      items.push(item); await saveTicker(items);
      return res.status(201).json(item);
    } catch (error) { return routeError(res, error, "ADMIN BREAKING NEWS CREATE ERROR"); }
  });
  app.put("/api/admin/breaking-news/:id", ...tickerGuard, async (req, res) => {
    const payload = tickerPayload(req.body || {});
    if (payload.error) return fail(res, payload.error);
    try {
      const items = await readTicker(), index = items.findIndex(item => item.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: "Ticker headline not found." });
      items[index] = { ...items[index], ...payload, updatedAt: new Date().toISOString() };
      await saveTicker(items); return res.json(items[index]);
    } catch (error) { return routeError(res, error, "ADMIN BREAKING NEWS UPDATE ERROR"); }
  });
  app.delete("/api/admin/breaking-news/:id", ...tickerGuard, async (req, res) => {
    try {
      const items = await readTicker(), next = items.filter(item => item.id !== req.params.id);
      if (next.length === items.length) return res.status(404).json({ error: "Ticker headline not found." });
      await saveTicker(next); return res.json({ ok: true });
    } catch (error) { return routeError(res, error, "ADMIN BREAKING NEWS DELETE ERROR"); }
  });

  app.get("/api/admin/news", ...guards("news"), async (req, res) => {
    try {
      const where = {};
      if (["published", "draft"].includes(req.query.status)) where.isPublished = req.query.status === "published";
      if (clean(req.query.q)) where.OR = ["title", "slug", "excerpt", "content"].map(key => ({ [key]: { contains: clean(req.query.q), mode: "insensitive" } }));
      return res.json(await prisma.news.findMany({ where, orderBy: [{ isPublished: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }] }));
    } catch (error) { return routeError(res, error, "ADMIN NEWS LIST ERROR"); }
  });
  app.get("/api/admin/news/:id", ...guards("news"), async (req, res) => {
    try { const item = await prisma.news.findUnique({ where: { id: req.params.id } }); return item ? res.json(item) : res.status(404).json({ error: "News article not found." }); }
    catch (error) { return routeError(res, error, "ADMIN NEWS GET ERROR"); }
  });
  app.post("/api/admin/news", ...guards("news"), upload, async (req, res) => {
    const title = clean(req.body.title), content = clean(req.body.content);
    if (!title || title.length > 180) { await releaseUnpersistedFile(req); return fail(res, "Title is required and must be at most 180 characters."); }
    if (!content || content.length > 100000) { await releaseUnpersistedFile(req); return fail(res, "Content is required and must be at most 100000 characters."); }
    const slug = clean(req.body.slug) || title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug || slug.length > 180 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { await releaseUnpersistedFile(req); return fail(res, "Slug must contain lowercase letters, numbers and single hyphens."); }
    if (!validImageUrl(req.body.imageUrl)) { await releaseUnpersistedFile(req); return fail(res, "Image URL must be an HTTP(S) URL or an owned content upload."); }
    let uploadedAsset;
    try {
      uploadedAsset = await fileUrl(req);
      const published = req.body.isPublished === true || req.body.isPublished === "true";
      const item = await prisma.news.create({ data: { title, slug, content, excerpt: clean(req.body.excerpt).slice(0, 1000) || null, imageUrl: uploadedAsset?.photoUrl || clean(req.body.imageUrl) || null, isPublished: published, publishedAt: published ? new Date() : null } });
      return res.status(201).json(item);
    } catch (error) { if (uploadedAsset) await cleanupNewImage(uploadedAsset); else await releaseUnpersistedFile(req); if (error?.code === "P2002") return res.status(409).json({ error: "A news article with that slug already exists." }); return routeError(res, error, "ADMIN NEWS CREATE ERROR"); }
  });
  app.put("/api/admin/news/:id", ...guards("news"), upload, async (req, res) => {
    const title = clean(req.body.title), content = clean(req.body.content);
    if (!title || title.length > 180) { await releaseUnpersistedFile(req); return fail(res, "Title is required and must be at most 180 characters."); }
    if (!content || content.length > 100000) { await releaseUnpersistedFile(req); return fail(res, "Content is required and must be at most 100000 characters."); }
    const slug = clean(req.body.slug) || title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug || slug.length > 180 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { await releaseUnpersistedFile(req); return fail(res, "Slug must contain lowercase letters, numbers and single hyphens."); }
    if (req.body.imageUrl && !validImageUrl(req.body.imageUrl)) { await releaseUnpersistedFile(req); return fail(res, "Image URL must be an HTTP(S) URL or an owned content upload."); }
    let uploadedAsset;
    try {
      const old = await prisma.news.findUnique({ where: { id: req.params.id } });
      if (!old) { await releaseUnpersistedFile(req); return res.status(404).json({ error: "News article not found." }); }
      uploadedAsset = await fileUrl(req);
      const isPublished = req.body.isPublished === true || req.body.isPublished === "true";
      const publishedAt = isPublished ? (old.isPublished && old.publishedAt ? old.publishedAt : new Date()) : null;
      const item = await prisma.news.update({ where: { id: old.id }, data: { title, slug, content, excerpt: clean(req.body.excerpt).slice(0, 1000) || null, imageUrl: uploadedAsset?.photoUrl || (Object.hasOwn(req.body, "imageUrl") ? clean(req.body.imageUrl) || null : old.imageUrl), isPublished, publishedAt } });
      if (old.imageUrl && old.imageUrl !== item.imageUrl) await removeOwnedImage(old.imageUrl);
      return res.json(item);
    } catch (error) { if (uploadedAsset) await cleanupNewImage(uploadedAsset); else await releaseUnpersistedFile(req); return routeError(res, error, "ADMIN NEWS UPDATE ERROR"); }
  });
  app.delete("/api/admin/news/:id", ...guards("news"), async (req, res) => {
    try { const old = await prisma.news.findUnique({ where: { id: req.params.id } }); if (!old) return res.status(404).json({ error: "News article not found." }); await prisma.news.delete({ where: { id: old.id } }); await removeOwnedImage(old.imageUrl); return res.json({ ok: true }); }
    catch (error) { return routeError(res, error, "ADMIN NEWS DELETE ERROR"); }
  });

  app.get("/api/admin/events", ...guards("events"), async (req, res) => {
    try {
      const q = clean(req.query.q), clauses = [];
      if (q) clauses.push({ OR: ["title", "description", "location"].map(key => ({ [key]: { contains: q, mode: "insensitive" } })) });
      const now = new Date();
      if (req.query.period === "upcoming") clauses.push({ OR: [{ startsAt: { gte: now } }, { AND: [{ startsAt: { lt: now } }, { endsAt: { gte: now } }] }] });
      if (req.query.period === "past") clauses.push({ OR: [{ endsAt: { lt: now } }, { endsAt: null, startsAt: { lt: now } }] });
      if (req.query.from || req.query.to) {
        const from = req.query.from ? validDate(req.query.from) : null, to = req.query.to ? validDate(req.query.to) : null;
        if ((req.query.from && !from) || (req.query.to && !to)) return fail(res, "Date filters must be valid dates.");
        if (from && to && to < from) return fail(res, "The end of the date filter cannot be earlier than its start.");
        clauses.push({ startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
      }
      const where = clauses.length ? { AND: clauses } : {};
      return res.json(await prisma.event.findMany({ where, orderBy: { startsAt: "asc" } }));
    } catch (error) { return routeError(res, error, "ADMIN EVENT LIST ERROR"); }
  });
  app.get("/api/admin/events/:id", ...guards("events"), async (req, res) => { try { const item = await prisma.event.findUnique({ where: { id: req.params.id } }); return item ? res.json(item) : res.status(404).json({ error: "Event not found." }); } catch (e) { return routeError(res, e, "ADMIN EVENT GET ERROR"); } });
  const eventValidation = async (req, res, next) => {
    const title = clean(req.body.title), startsAt = validDate(req.body.startsAt), endsAt = req.body.endsAt ? validDate(req.body.endsAt) : null;
    if (!title || title.length > 180) { await releaseUnpersistedFile(req); return fail(res, "Title is required and must be at most 180 characters."); }
    if (!startsAt || (req.body.endsAt && !endsAt)) { await releaseUnpersistedFile(req); return fail(res, "Start and end dates must be valid dates."); }
    if (endsAt && endsAt < startsAt) { await releaseUnpersistedFile(req); return fail(res, "End date cannot be earlier than start date."); }
    if (req.body.imageUrl && !validImageUrl(req.body.imageUrl)) { await releaseUnpersistedFile(req); return fail(res, "Image URL must be an HTTP(S) URL or an owned content upload."); }
    next();
  };
  const saveEvent = (isUpdate) => async (req, res) => {
    let uploadedAsset;
    try {
      const existing = isUpdate ? await prisma.event.findUnique({ where: { id: req.params.id } }) : null;
      if (isUpdate && !existing) { await releaseUnpersistedFile(req); return res.status(404).json({ error: "Event not found." }); }
      uploadedAsset = await fileUrl(req);
      const data = { title: clean(req.body.title), description: clean(req.body.description).slice(0, 5000) || null, location: clean(req.body.location).slice(0, 240) || null, startsAt: validDate(req.body.startsAt), endsAt: req.body.endsAt ? validDate(req.body.endsAt) : null, imageUrl: uploadedAsset?.photoUrl || (Object.hasOwn(req.body, "imageUrl") ? clean(req.body.imageUrl) || null : existing?.imageUrl || null) };
      const item = isUpdate ? await prisma.event.update({ where: { id: existing.id }, data }) : await prisma.event.create({ data });
      if (existing?.imageUrl && existing.imageUrl !== item.imageUrl) await removeOwnedImage(existing.imageUrl);
      return res.status(isUpdate ? 200 : 201).json(item);
    } catch (error) { if (uploadedAsset) await cleanupNewImage(uploadedAsset); else await releaseUnpersistedFile(req); return routeError(res, error, "ADMIN EVENT SAVE ERROR"); }
  };
  app.post("/api/admin/events", ...guards("events"), upload, eventValidation, saveEvent(false));
  app.put("/api/admin/events/:id", ...guards("events"), upload, eventValidation, saveEvent(true));
  app.delete("/api/admin/events/:id", ...guards("events"), async (req, res) => { try { const old = await prisma.event.findUnique({ where: { id: req.params.id } }); if (!old) return res.status(404).json({ error: "Event not found." }); await prisma.event.delete({ where: { id: old.id } }); await removeOwnedImage(old.imageUrl); return res.json({ ok: true }); } catch (e) { return routeError(res, e, "ADMIN EVENT DELETE ERROR"); } });

  app.get("/api/admin/departments", ...guards("departments"), async (req, res) => { try { const q = clean(req.query.q); return res.json(await prisma.department.findMany({ where: q ? { OR: ["name", "description", "head"].map(key => ({ [key]: { contains: q, mode: "insensitive" } })) } : {}, orderBy: { name: "asc" } })); } catch (e) { return routeError(res, e, "ADMIN DEPARTMENT LIST ERROR"); } });
  app.get("/api/admin/departments/:id", ...guards("departments"), async (req, res) => { try { const item = await prisma.department.findUnique({ where: { id: req.params.id } }); return item ? res.json(item) : res.status(404).json({ error: "Department not found." }); } catch (e) { return routeError(res, e, "ADMIN DEPARTMENT GET ERROR"); } });
  const saveDepartment = update => async (req, res) => {
    const name = clean(req.body.name), description = clean(req.body.description), head = clean(req.body.head);
    if (!name || name.length > 120) return fail(res, "Department name is required and must be at most 120 characters.");
    if (description.length > 2000 || head.length > 120) return fail(res, "Description or department head exceeds the allowed length.");
    try { const data = { name, description: description || null, head: head || null }; const item = update ? await prisma.department.update({ where: { id: req.params.id }, data }) : await prisma.department.create({ data }); return res.status(update ? 200 : 201).json(item); }
    catch (e) { if (e?.code === "P2002") return res.status(409).json({ error: "A department with that name already exists." }); return routeError(res, e, "ADMIN DEPARTMENT SAVE ERROR"); }
  };
  app.post("/api/admin/departments", ...guards("departments"), saveDepartment(false));
  app.put("/api/admin/departments/:id", ...guards("departments"), saveDepartment(true));
  app.delete("/api/admin/departments/:id", ...guards("departments"), async (req, res) => { try { const item = await prisma.department.findUnique({ where: { id: req.params.id }, include: { _count: { select: { staffAppointments: true } } } }); if (!item) return res.status(404).json({ error: "Department not found." }); if (item._count.staffAppointments) return res.status(409).json({ error: "This department has staff appointment history and cannot be deleted." }); await prisma.department.delete({ where: { id: item.id } }); return res.json({ ok: true }); } catch (e) { return routeError(res, e, "ADMIN DEPARTMENT DELETE ERROR"); } });

  app.get("/api/admin/gallery", ...guards("gallery"), async (req, res) => { try { const q = clean(req.query.q); return res.json(await prisma.galleryPhoto.findMany({ where: q ? { OR: ["title", "caption"].map(key => ({ [key]: { contains: q, mode: "insensitive" } })) } : {}, orderBy: { createdAt: "desc" } })); } catch (e) { return routeError(res, e, "ADMIN GALLERY LIST ERROR"); } });
  app.get("/api/admin/gallery/:id", ...guards("gallery"), async (req, res) => { try { const item = await prisma.galleryPhoto.findUnique({ where: { id: req.params.id } }); return item ? res.json(item) : res.status(404).json({ error: "Gallery entry not found." }); } catch (e) { return routeError(res, e, "ADMIN GALLERY GET ERROR"); } });
  const saveGallery = update => async (req, res) => {
    const title = clean(req.body.title), caption = clean(req.body.caption), imageUrl = clean(req.body.imageUrl);
    if (title.length > 180 || caption.length > 2000) { await releaseUnpersistedFile(req); return fail(res, "Title or caption exceeds the allowed length."); }
    if (!req.file && !imageUrl && !update) return fail(res, "An image upload or image URL is required.");
    if (imageUrl && !validImageUrl(imageUrl)) { await releaseUnpersistedFile(req); return fail(res, "Image URL must be an HTTP(S) URL or an owned content upload."); }
    let uploadedAsset;
    try { const old = update ? await prisma.galleryPhoto.findUnique({ where: { id: req.params.id } }) : null; if (update && !old) { await releaseUnpersistedFile(req); return res.status(404).json({ error: "Gallery entry not found." }); } uploadedAsset = await fileUrl(req); const data = { title: title || null, caption: caption || null, imageUrl: uploadedAsset?.photoUrl || imageUrl || old?.imageUrl }; const item = update ? await prisma.galleryPhoto.update({ where: { id: old.id }, data }) : await prisma.galleryPhoto.create({ data }); if (old?.imageUrl && old.imageUrl !== item.imageUrl) await removeOwnedImage(old.imageUrl); return res.status(update ? 200 : 201).json(item); }
    catch (e) { if (uploadedAsset) await cleanupNewImage(uploadedAsset); else await releaseUnpersistedFile(req); return routeError(res, e, "ADMIN GALLERY SAVE ERROR"); }
  };
  app.post("/api/admin/gallery", ...guards("gallery"), upload, saveGallery(false));
  app.put("/api/admin/gallery/:id", ...guards("gallery"), upload, saveGallery(true));
  app.delete("/api/admin/gallery/:id", ...guards("gallery"), async (req, res) => { try { const item = await prisma.galleryPhoto.findUnique({ where: { id: req.params.id } }); if (!item) return res.status(404).json({ error: "Gallery entry not found." }); await prisma.galleryPhoto.delete({ where: { id: item.id } }); await removeOwnedImage(item.imageUrl); return res.json({ ok: true }); } catch (e) { return routeError(res, e, "ADMIN GALLERY DELETE ERROR"); } });
}
