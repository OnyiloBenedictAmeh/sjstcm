const PUBLIC_FIELDS = {
  id: true,
  imageUrl: true,
  imageAlt: true,
  heading: true,
  description: true,
  buttonText: true,
  buttonUrl: true,
  displayOrder: true
};

const FIELD_LIMITS = {
  heading: 240,
  description: 5000,
  imageUrl: 2048,
  imageAlt: 500,
  buttonText: 160,
  buttonUrl: 2048
};
const ALLOWED_FIELDS = new Set([...Object.keys(FIELD_LIMITS), "displayOrder", "isPublished"]);
const clean = value => typeof value === "string" ? value.trim() : value;

class BannerLimitError extends Error {}
class BannerNotFoundError extends Error {}

const fail = (res, message) => res.status(400).json({ error: message });
const routeError = (res, error, label) => {
  if (error instanceof BannerLimitError) return res.status(409).json({ error: error.message });
  if (error instanceof BannerNotFoundError || error?.code === "P2025") return res.status(404).json({ error: "Homepage banner not found." });
  console.error(`${label}:`, error);
  return res.status(500).json({ error: "Unable to complete homepage banner request." });
};

function validImageUrl(value) {
  if (typeof value !== "string" || value.length > FIELD_LIMITS.imageUrl) return false;
  if (value.startsWith("/uploads/content/")) return !value.includes("..") && !value.startsWith("//");
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
}

function validButtonUrl(value) {
  if (typeof value !== "string" || value.length > FIELD_LIMITS.buttonUrl) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return !value.includes("\\");
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
}

function parsePayload(body, { partial = false, imageUploaded = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "A banner object is required." };
  for (const key of Object.keys(body)) if (!ALLOWED_FIELDS.has(key)) return { error: `Unsupported banner field: ${key}.` };

  const data = {};
  for (const [key, limit] of Object.entries(FIELD_LIMITS)) {
    if (!Object.hasOwn(body, key)) continue;
    const value = clean(body[key]);
    if (value == null) {
      if (!["description", "buttonText", "buttonUrl"].includes(key)) return { error: `${key} is required.` };
      data[key] = null;
      continue;
    }
    if (value === "" && ["description", "buttonText", "buttonUrl"].includes(key)) {
      data[key] = null;
      continue;
    }
    if (typeof value !== "string") return { error: `${key} must be a string.` };
    if (value.length > limit) return { error: `${key} must be at most ${limit} characters.` };
    if (["heading", "imageAlt", "imageUrl"].includes(key) && !value) return { error: `${key} is required.` };
    if (key === "imageUrl" && !validImageUrl(value)) return { error: "imageUrl must be an HTTP(S) URL or an owned content upload." };
    if (key === "buttonUrl" && value && !validButtonUrl(value)) return { error: "buttonUrl must be a relative path or HTTP(S) URL." };
    data[key] = value || null;
  }

  if (Object.hasOwn(body, "displayOrder")) {
    const value = body.displayOrder;
    const displayOrder = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
    if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 1000000) return { error: "displayOrder must be a whole number from 0 to 1000000." };
    data.displayOrder = displayOrder;
  }
  if (Object.hasOwn(body, "isPublished")) {
    const value = body.isPublished;
    if (value === "true") data.isPublished = true;
    else if (value === "false") data.isPublished = false;
    else if (typeof value === "boolean") data.isPublished = value;
    else return { error: "isPublished must be a boolean." };
  }
  if (imageUploaded) delete data.imageUrl;
  if (!partial) {
    if (!imageUploaded && !data.imageUrl) return { error: "imageUrl is required." };
    for (const key of ["heading", "imageAlt"]) if (!data[key]) return { error: `${key} is required.` };
  }
  return data;
}

function imageSignature(buffer, mime) {
  if (!buffer) return false;
  if (mime === "image/jpeg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === "image/png") return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/webp") return buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  return false;
}

export function registerHomepageBannerRoutes(app, prisma, auth, requirePermission, uploadTools) {
  const { imageUpload, storeUploadedImage, cleanupNewImage } = uploadTools;
  const guard = [auth, requirePermission("CONTENT_MANAGE")];
  const upload = (req, res, next) => {
    req.uploadType = "content";
    imageUpload.single("image")(req, res, async error => {
      if (error) return next(error);
      if (!req.file) return next();
      try {
        const bytes = req.file.buffer || await import("node:fs/promises").then(fs => fs.readFile(req.file.path));
        if (!imageSignature(bytes, req.file.mimetype)) {
          await cleanupNewImage({ localPath: req.file.path });
          return fail(res, "The uploaded file is not a valid JPG, PNG or WebP image.");
        }
        return next();
      } catch (error) { return next(error); }
    });
  };
  const discardUpload = req => req.file && cleanupNewImage({ localPath: req.file.path });
  const storeUpload = async req => req.file ? storeUploadedImage(req.file, "content", "public") : null;
  const runWithPublishLock = callback => prisma.$transaction(async tx => {
    // Serialize publication checks across concurrent requests in PostgreSQL.
    await tx.$queryRawUnsafe("SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(731829104)) AS banner_lock");
    return callback(tx);
  });
  const assertPublishedCapacity = async (tx, excludeId) => {
    const count = await tx.homepageBanner.count({
      where: { isPublished: true, ...(excludeId ? { id: { not: excludeId } } : {}) }
    });
    if (count >= 5) throw new BannerLimitError("A maximum of five homepage banners may be published.");
  };

  app.get("/api/homepage-banners", async (_req, res) => {
    try {
      const banners = await prisma.homepageBanner.findMany({
        where: { isPublished: true },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: PUBLIC_FIELDS
      });
      return res.set("Cache-Control", "no-store").json(banners);
    } catch (error) { return routeError(res, error, "PUBLIC HOMEPAGE BANNERS ERROR"); }
  });

  app.get("/api/admin/homepage-banners", ...guard, async (_req, res) => {
    try {
      return res.json(await prisma.homepageBanner.findMany({ orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }] }));
    } catch (error) { return routeError(res, error, "ADMIN HOMEPAGE BANNERS LIST ERROR"); }
  });

  app.post("/api/admin/homepage-banners", ...guard, upload, async (req, res) => {
    const payload = parsePayload(req.body, { imageUploaded: Boolean(req.file) });
    if (payload.error) { await discardUpload(req); return fail(res, payload.error); }
    let uploadedAsset;
    try {
      uploadedAsset = await storeUpload(req);
      const data = { ...payload, imageUrl: uploadedAsset?.photoUrl || payload.imageUrl };
      const create = tx => tx.homepageBanner.create({ data });
      const banner = data.isPublished
        ? await runWithPublishLock(async tx => { await assertPublishedCapacity(tx); return create(tx); })
        : await prisma.homepageBanner.create({ data });
      return res.status(201).json(banner);
    } catch (error) {
      if (uploadedAsset) await cleanupNewImage(uploadedAsset); else await discardUpload(req);
      return routeError(res, error, "ADMIN HOMEPAGE BANNER CREATE ERROR");
    }
  });

  app.put("/api/admin/homepage-banners/:id", ...guard, upload, async (req, res) => {
    const payload = parsePayload(req.body, { partial: true, imageUploaded: Boolean(req.file) });
    if (payload.error) { await discardUpload(req); return fail(res, payload.error); }
    let uploadedAsset;
    try {
      uploadedAsset = await storeUpload(req);
      if (uploadedAsset) payload.imageUrl = uploadedAsset.photoUrl;
      let banner;
      if (payload.isPublished === true) {
        banner = await runWithPublishLock(async tx => {
          const existing = await tx.homepageBanner.findUnique({ where: { id: req.params.id } });
          if (!existing) throw new BannerNotFoundError();
          if (!existing.isPublished) await assertPublishedCapacity(tx, existing.id);
          return tx.homepageBanner.update({ where: { id: existing.id }, data: payload });
        });
      } else {
        banner = await prisma.homepageBanner.update({ where: { id: req.params.id }, data: payload });
      }
      return res.json(banner);
    } catch (error) {
      if (uploadedAsset) await cleanupNewImage(uploadedAsset); else await discardUpload(req);
      return routeError(res, error, "ADMIN HOMEPAGE BANNER UPDATE ERROR");
    }
  });

  app.patch("/api/admin/homepage-banners/:id/publication", ...guard, async (req, res) => {
    if (!req.body || typeof req.body.isPublished !== "boolean") return fail(res, "isPublished must be a boolean.");
    try {
      const banner = req.body.isPublished
        ? await runWithPublishLock(async tx => {
          const existing = await tx.homepageBanner.findUnique({ where: { id: req.params.id } });
          if (!existing) throw new BannerNotFoundError();
          if (!existing.isPublished) await assertPublishedCapacity(tx, existing.id);
          return tx.homepageBanner.update({ where: { id: existing.id }, data: { isPublished: true } });
        })
        : await prisma.homepageBanner.update({ where: { id: req.params.id }, data: { isPublished: false } });
      return res.json(banner);
    } catch (error) { return routeError(res, error, "ADMIN HOMEPAGE BANNER PUBLICATION ERROR"); }
  });

  app.delete("/api/admin/homepage-banners/:id", ...guard, async (req, res) => {
    try {
      await prisma.homepageBanner.delete({ where: { id: req.params.id } });
      return res.json({ ok: true });
    } catch (error) { return routeError(res, error, "ADMIN HOMEPAGE BANNER DELETE ERROR"); }
  });
}
