// ============================================================
// SCHOOL DIGITAL PLATFORM
// SERVER / API
// ============================================================

import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import fs from "fs";
import path from "path";
import { Readable } from "node:stream";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { del, get, put } from "@vercel/blob";
import { registerAlumniRoutes } from "./alumni-routes.js";
import { registerContentRoutes } from "./content-routes.js";
import { registerMainAdminRoutes } from "./main-admin-routes.js";


// ============================================================
// INITIALIZATION
// ============================================================

const prisma = new PrismaClient();

const app = express();

const __dirname =
  path.dirname(fileURLToPath(import.meta.url));

const isVercel =
  process.env.VERCEL === "1";


// ============================================================
// FILE UPLOAD DIRECTORIES
// ============================================================

const uploadsRoot =
  path.join(__dirname, "../public/uploads");

const classUploads =
  path.join(uploadsRoot, "classes");

const studentUploads =
  path.join(uploadsRoot, "students");
const contentUploads =
  path.join(uploadsRoot, "content");


// Create directories if they don't exist.

if (!isVercel) {
  fs.mkdirSync(classUploads, {
    recursive: true
  });

  fs.mkdirSync(studentUploads, {
    recursive: true
  });
  fs.mkdirSync(contentUploads, {
    recursive: true
  });
}


// ============================================================
// IMAGE UPLOAD
// ============================================================

function createImageFilename(originalName) {
  const extension =
    path.extname(originalName).toLowerCase();

  const safeExtension = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp"
  ].includes(extension)
    ? extension
    : ".jpg";

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}${safeExtension}`;
}


const imageStorage = isVercel
  ? multer.memoryStorage()
  : multer.diskStorage({

    destination: (req, file, cb) => {

      const folder =
        req.uploadType === "class"
          ? classUploads
          : req.uploadType === "content"
            ? contentUploads
          : studentUploads;

      cb(null, folder);

    },


    filename: (req, file, cb) =>
      cb(null, createImageFilename(file.originalname))

  });


const imageUpload =
  multer({

    storage: imageStorage,

    limits: {
      fileSize: 4 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {

      const allowed = [
        "image/jpeg",
        "image/png",
        "image/webp"
      ];


      if (!allowed.includes(file.mimetype)) {

        return cb(
          new Error(
            "Only JPG, PNG and WebP images are allowed."
          )
        );

      }


      cb(null, true);

    }

  });


// ============================================================
// FILE HELPERS
// ============================================================

function deleteUploadedFile(filePath) {

  try {

    if (
      filePath &&
      fs.existsSync(filePath)
    ) {

      fs.unlinkSync(filePath);

    }

  } catch (error) {

    console.error(
      "FILE DELETE ERROR:",
      error
    );

  }

}


function privateStudentPhotoUrl(pathname) {
  return `/api/private-student-photo?pathname=${encodeURIComponent(pathname)}`;
}


function privateStudentPhotoPathname(photoUrl) {
  if (typeof photoUrl !== "string") return null;

  try {
    const parsed = new URL(photoUrl, "https://sjstcm.invalid");
    if (parsed.pathname !== "/api/private-student-photo") return null;
    const pathname = parsed.searchParams.get("pathname");
    return pathname?.startsWith("students/") && !pathname.includes("..")
      ? pathname
      : null;
  } catch {
    return null;
  }
}


function blobTokenFor(access) {
  const token = access === "private"
    ? process.env.BLOB_READ_WRITE_TOKEN
    : process.env.CLASS_BLOB_READ_WRITE_TOKEN;

  if (!token) {
    throw new Error(
      access === "private"
        ? "Private image storage is not configured."
        : "Class image storage is not configured."
    );
  }

  return token;
}


async function storeUploadedImage(file, folder, access) {
  if (!file) return null;

  if (!isVercel) {
    return {
      photoUrl: `/uploads/${folder}/${file.filename}`,
      localPath: file.path,
      blobPathname: null,
      access
    };
  }

  const pathname = `${folder}/${createImageFilename(file.originalname)}`;
  const token = blobTokenFor(access);
  const blob = await put(pathname, file.buffer, {
    access,
    addRandomSuffix: true,
    contentType: file.mimetype,
    token
  });

  return {
    photoUrl: access === "private"
      ? privateStudentPhotoUrl(blob.pathname)
      : blob.url,
    localPath: null,
    blobPathname: blob.pathname,
    access
  };
}


async function cleanupNewImage(image) {
  if (!image) return;

  if (image.localPath) {
    deleteUploadedFile(image.localPath);
    return;
  }

  if (!image.blobPathname) return;

  try {
    await del(image.blobPathname, {
      token: blobTokenFor(image.access)
    });
  } catch (error) {
    console.error("NEW BLOB CLEANUP FAILED; ORPHAN MAY REMAIN:", error.message);
  }
}


async function deleteReplacedImage(photoUrl, folder) {
  if (typeof photoUrl !== "string" || !photoUrl) return;

  if (!isVercel) {
    const prefix = `/uploads/${folder}/`;
    if (photoUrl.startsWith(prefix)) {
      deleteUploadedFile(path.join(uploadsRoot, folder, path.basename(photoUrl)));
    }
    return;
  }

  // Legacy deployment files and user-provided URLs are preserved.
  if (photoUrl.startsWith("/uploads/")) return;

  const privatePathname = folder === "students"
    ? privateStudentPhotoPathname(photoUrl)
    : null;

  let blobPathname = privatePathname;
  let access = "private";

  if (!blobPathname && folder === "classes") {
    try {
      const parsed = new URL(photoUrl);
      if (parsed.hostname.endsWith(".public.blob.vercel-storage.com")) {
        blobPathname = photoUrl;
        access = "public";
      }
    } catch {
      return;
    }
  }

  if (!blobPathname) return;

  try {
    await del(blobPathname, {
      token: blobTokenFor(access)
    });
  } catch (error) {
    // Keep deletion best-effort so a replacement's live URL stays usable.
    console.error("REPLACED BLOB CLEANUP FAILED; OLD IMAGE MAY REMAIN:", error.message);
  }
}


// ============================================================
// EXPRESS MIDDLEWARE
// ============================================================

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);


app.use(
  express.json({
    limit: "2mb"
  })
);


app.use(
  express.urlencoded({
    extended: true
  })
);


app.use(
  cookieParser()
);


app.use(
  morgan("combined")
);


// Public GitHub Pages frontend origins allowed to read API responses.
// Same-origin local requests do not depend on CORS, but localhost is
// included for local frontend/API setups that use separate origins.
const allowedApiOrigins = new Set([
  "https://onyilobenedictameh.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);

const publicApiCorsMethods = new Map([
  ["/api/news", "GET"],
  ["/api/breaking-news", "GET"],
  ["/api/events", "GET"],
  ["/api/gallery", "GET"],
  ["/api/departments", "GET"],
  ["/api/settings/public", "GET"],
  ["/api/alumni", "GET"],
  ["/api/alumni/years", "GET"],
  ["/api/alumni/class-sets", "GET"],
  ["/api/alumni/register", "POST"],
  ["/api/contact", "POST"]
]);

app.use("/api", (req, res, next) => {
  const requestPath = req.originalUrl.split("?", 1)[0];
  const allowedMethods = publicApiCorsMethods.get(requestPath);

  // Keep cross-origin access limited to routes used by the public site.
  if (!allowedMethods) {
    return next();
  }

  const origin = req.get("Origin");
  const allowedOrigin = origin && allowedApiOrigins.has(origin);

  if (origin) {
    res.vary("Origin");
  }

  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  if (req.method === "OPTIONS") {
    if (!allowedOrigin) {
      return res.sendStatus(403);
    }

    res.setHeader("Access-Control-Allow-Methods", `${allowedMethods}, OPTIONS`);
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.sendStatus(204);
  }

  next();
});


app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300
  })
);


// Serve everything inside /public.

app.use(
  express.static(
    path.join(
      __dirname,
      "../public"
    )
  )
);


// The admin dashboard is named admin.html rather than index.html.
app.get("/admin/", (_, res) => {
  res.sendFile(
    path.join(__dirname, "../public/admin/admin.html")
  );
});


// ============================================================
// AUTHENTICATION
// ============================================================

function sign(user) {

  return jwt.sign(

    {
      sub: user.id,
      role: user.role,
      email: user.email
    },

    process.env.JWT_SECRET,

    {
      expiresIn: "8h"
    }

  );

}


function auth(req, res, next) {

  res.set("Cache-Control", "private, no-store");

  const token =
    req.cookies.school_token;


  if (!token) {

    return res.status(401).json({
      error: "Authentication required"
    });

  }


  try {

    req.user =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    next();

  } catch {

    return res.status(401).json({
      error: "Invalid or expired session"
    });

  }

}


const allow =
  (...roles) =>
  (req, res, next) => {

    if (
      roles.includes(
        req.user.role
      )
    ) {

      return next();

    }


    return res.status(403).json({
      error: "Forbidden"
    });

  };


const permissionCatalog = [
  ["STUDENTS_VIEW", "View students"],
  ["STUDENTS_MANAGE", "Manage students"],
  ["ACADEMICS_VIEW", "View academic records"],
  ["ACADEMICS_MANAGE", "Manage academic records"],
  ["RESULTS_REVIEW", "Review results"],
  ["ALUMNI_VIEW", "View alumni records"],
  ["ALUMNI_VERIFY", "Verify alumni submissions"],
  ["ALUMNI_MANAGE", "Manage alumni records"],
  ["STAFF_VIEW", "View staff records"],
  ["STAFF_MANAGE", "Manage staff records"],
  ["CONTENT_VIEW", "View school content"],
  ["CONTENT_MANAGE", "Manage school content"],
  ["EVENTS_MANAGE", "Manage events"],
  ["GALLERY_MANAGE", "Manage gallery"],
  ["SYSTEM_MANAGE", "Manage system access"]
];

// Resolve grants from the database for every request so revocations take
// effect immediately. ADMIN remains the existing full-access role.
async function getCurrentPermissions(userId) {
  const grants = await prisma.userPermission.findMany({
    where: {
      userId,
      permission: { isActive: true }
    },
    select: { permission: { select: { key: true } } }
  });

  return grants.map(grant => grant.permission.key);
}

const requirePermission = (...requiredPermissions) =>
  async (req, res, next) => {
    if (req.user.role === "ADMIN") return next();

    try {
      const granted = await getCurrentPermissions(req.user.sub);
      const hasPermission = permission =>
        granted.includes(permission) ||
        (permission === 'STUDENTS_VIEW' && granted.includes('STUDENTS_MANAGE'));

      if (requiredPermissions.every(hasPermission)) {
        return next();
      }

      return res.status(403).json({
        error: "FORBIDDEN",
        message: "You do not have access to this area."
      });
    } catch (error) {
      console.error("PERMISSION CHECK ERROR:", error);
      return res.status(500).json({ error: "Unable to authorize request." });
    }
  };

const requireAnyPermission = (...requiredPermissions) =>
  async (req, res, next) => {
    if (req.user.role === "ADMIN") return next();
    try {
      const granted = await getCurrentPermissions(req.user.sub);
      if (requiredPermissions.some(permission => granted.includes(permission))) return next();
      return res.status(403).json({ error: "FORBIDDEN", message: "You do not have access to this area." });
    } catch (error) {
      console.error("PERMISSION CHECK ERROR:", error);
      return res.status(500).json({ error: "Unable to authorize request." });
    }
  };

registerAlumniRoutes(app, prisma, auth, allow, requirePermission);
registerContentRoutes(app, prisma, auth, requirePermission, {
  imageUpload,
  storeUploadedImage,
  cleanupNewImage,
  uploadsRoot,
  isVercel,
  blobDelete: del,
  blobTokenFor
});
registerMainAdminRoutes(app, prisma, auth, requirePermission, getCurrentPermissions);


// Private student images are delivered through this same-origin route.
// The database stores this app URL, never the private Blob URL or token.
app.get(
  "/api/private-student-photo",
  auth,
  allow("ADMIN", "STAFF"),
  requirePermission("STUDENTS_VIEW"),
  async (req, res) => {
    try {
      const pathname = req.query.pathname;

      if (
        typeof pathname !== "string" ||
        !pathname.startsWith("students/") ||
        pathname.includes("..") ||
        pathname.includes("\\")
      ) {
        return res.sendStatus(404);
      }

      const photoUrl = privateStudentPhotoUrl(pathname);
      const student = await prisma.student.findFirst({
        where: { photoUrl },
        select: { id: true }
      });

      if (!student) return res.sendStatus(404);

      const blob = await get(pathname, {
        access: "private",
        token: blobTokenFor("private")
      });

      if (!blob || blob.statusCode !== 200) {
        return res.sendStatus(404);
      }

      res.set({
        "Content-Type": blob.blob.contentType,
        "Content-Length": String(blob.blob.size),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store"
      });

      Readable.fromWeb(blob.stream).pipe(res);
    } catch (error) {
      console.error("PRIVATE STUDENT PHOTO ERROR:", error.message);
      res.status(500).json({ error: "Unable to load student photograph." });
    }
  }
);


// ============================================================
// HEALTH
// ============================================================

app.get(
  "/api/health",
  (_, res) => {

    res.json({
      ok: true
    });

  }
);


// ============================================================
// PUBLIC SETTINGS
// ============================================================

app.get(
  "/api/settings/public",
  async (_, res) => {

    try {

      const settings =
        await prisma.setting.findMany();


      res.json(
        Object.fromEntries(
          settings.map(
            setting => [
              setting.key,
              setting.value
            ]
          )
        )
      );

    } catch (error) {

      console.error(
        "PUBLIC SETTINGS ERROR:",
        error
      );

      res.status(500).json({
        error: "Unable to load settings."
      });

    }

  }
);


// ============================================================
// AUTH LOGIN
// ============================================================

app.post(
  "/api/auth/login",
  async (req, res) => {

    let loginStage = "request validation";
    const sensitiveLoginValues = [];

    try {

      const {
        email,
        password
      } = req.body;

      if (typeof password === "string" && password) {
        sensitiveLoginValues.push(password);
      }


      if (!email || !password) {

        return res.status(400).json({
          error:
            "Email and password are required."
        });

      }


      loginStage = "database lookup";
      const user =
        await prisma.user.findUnique({

          where: {
            email:
              email.trim().toLowerCase()
          }

        });

      if (typeof user?.passwordHash === "string" && user.passwordHash) {
        sensitiveLoginValues.push(user.passwordHash);
      }


      let passwordMatches = false;
      if (user) {
        loginStage = "bcrypt comparison";
        passwordMatches = await bcrypt.compare(
          password,
          user.passwordHash
        );
      }

      if (!user || !passwordMatches) {

        return res.status(401).json({
          error:
            "Invalid email or password"
        });

      }

      if (user.role === "STUDENT") {
        loginStage = "student lookup";
        const student = await prisma.student.findUnique({
          where: { userId: user.id },
          select: { id: true, status: true }
        });

        if (!student || student.status === "INACTIVE") {
          return res.status(403).json({
            error: "This account is not currently active. Please contact the school."
          });
        }
      }


      loginStage = "JWT signing";
      const token = sign(user);
      sensitiveLoginValues.push(token);

      loginStage = "cookie/response";
      res.cookie(
        "school_token",
        token,
        {

          httpOnly: true,

          path: "/",

          sameSite: "lax",

          secure:
            process.env.NODE_ENV ===
            "production",

          maxAge:
            8 * 60 * 60 * 1000

        }
      );


      res.json({

        id: user.id,
        email: user.email,
        role: user.role

      });


    } catch (error) {

      let safeMessage = typeof error?.message === "string"
        ? error.message.replace(/[\r\n\t]+/g, " ").slice(0, 300)
        : "Unknown error";
      const valuesToRedact = [
        ...Object.values(process.env),
        ...sensitiveLoginValues
      ].filter(value => typeof value === "string" && value.length > 0)
        .sort((a, b) => b.length - a.length);
      for (const value of valuesToRedact) {
        safeMessage = safeMessage.split(value).join("[redacted]");
      }

      const sanitizedError = {
        stage: loginStage,
        name: typeof error?.name === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(error.name)
          ? error.name
          : "Error",
        code: (typeof error?.code === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(error.code)) || typeof error?.code === "number"
          ? error.code
          : undefined,
        message: safeMessage
      };

      console.error("LOGIN ERROR:", sanitizedError);

      res.status(500).json({
        error: "Unable to log in."
      });

    }

  }
);


// ============================================================
// AUTH LOGOUT
// ============================================================

app.post(
  "/api/auth/logout",
  (_, res) => {

    res.clearCookie(
      "school_token",
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/"
      }
    );


    res.json({
      ok: true
    });

  }
);


// ============================================================
// CURRENT USER
// ============================================================

app.get(
  "/api/auth/me",
  auth,
  async (req, res) => {

    try {

      const user = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          student: {
            select: { firstName: true, middleName: true, lastName: true }
          },
          alumni: {
            select: { fullName: true }
          }
        }
      });


      if (!user) {

        return res.status(404).json({
          error: "User not found."
        });

      }


      const permissions = user.role === "ADMIN"
        ? permissionCatalog.map(([key]) => key)
        : await getCurrentPermissions(user.id);

      res.json({ ...user, permissions });


    } catch (error) {

      console.error(
        "AUTH ME ERROR:",
        error
      );

      res.status(500).json({
        error: "Unable to load user."
      });

    }

  }
);


// ============================================================
// PERMISSIONS
// ============================================================

app.get(
  "/api/auth/permissions",
  auth,
  async (req, res) => {
    try {
      const permissions = req.user.role === "ADMIN"
        ? permissionCatalog.map(([key]) => key)
        : await getCurrentPermissions(req.user.sub);
      res.json({ permissions });
    } catch (error) {
      console.error("PERMISSIONS LOAD ERROR:", error);
      res.status(500).json({ error: "Unable to load permitted areas." });
    }
  }
);

app.get(
  "/api/admin/permissions/:userId",
  auth,
  requirePermission("SYSTEM_MANAGE"),
  async (req, res) => {
    try {
      const target = await prisma.user.findUnique({
        where: { id: req.params.userId },
        select: {
          id: true,
          email: true,
          role: true,
          userPermissions: {
            where: { permission: { isActive: true } },
            select: {
              grantedAt: true,
              permission: { select: { key: true, description: true } },
              grantedBy: { select: { email: true } }
            },
            orderBy: { grantedAt: "asc" }
          }
        }
      });

      if (!target) return res.status(404).json({ error: "User not found." });
      res.json({
        id: target.id,
        email: target.email,
        role: target.role,
        permissions: target.userPermissions.map(grant => ({
          key: grant.permission.key,
          description: grant.permission.description,
          grantedAt: grant.grantedAt,
          grantedBy: grant.grantedBy?.email || null
        }))
      });
    } catch (error) {
      console.error("PERMISSION LIST ERROR:", error);
      res.status(500).json({ error: "Unable to load permissions." });
    }
  }
);

app.post(
  "/api/admin/permissions/:userId/grant",
  auth,
  requirePermission("SYSTEM_MANAGE"),
  async (req, res) => {
    const key = String(req.body?.key || "");
    const definition = permissionCatalog.find(([permission]) => permission === key);
    if (!definition) return res.status(400).json({ error: "Invalid request." });

    try {
      const target = await prisma.user.findUnique({
        where: { id: req.params.userId },
        select: { id: true }
      });
      if (!target) return res.status(404).json({ error: "User not found." });

      await prisma.$transaction(async tx => {
        const permission = await tx.permission.upsert({
          where: { key },
          update: { description: definition[1], isActive: true },
          create: { key, description: definition[1] }
        });
        const existing = await tx.userPermission.findUnique({
          where: { userId_permissionId: { userId: target.id, permissionId: permission.id } },
          select: { userId: true }
        });
        if (existing) return;

        await tx.userPermission.create({
          data: {
            userId: target.id,
            permissionId: permission.id,
            grantedByUserId: req.user.sub
          }
        });
        await tx.permissionAudit.create({
          data: {
            userId: target.id,
            permissionKey: key,
            action: "GRANTED",
            changedByUserId: req.user.sub
          }
        });
      });

      res.json({ ok: true });
    } catch (error) {
      console.error("PERMISSION GRANT ERROR:", error);
      res.status(500).json({ error: "Unable to update access." });
    }
  }
);

app.post(
  "/api/admin/permissions/:userId/revoke",
  auth,
  requirePermission("SYSTEM_MANAGE"),
  async (req, res) => {
    const key = String(req.body?.key || "");
    const definition = permissionCatalog.find(([permission]) => permission === key);
    if (!definition) return res.status(400).json({ error: "Invalid request." });

    try {
      const target = await prisma.user.findUnique({
        where: { id: req.params.userId },
        select: { id: true }
      });
      if (!target) return res.status(404).json({ error: "User not found." });

      await prisma.$transaction(async tx => {
        const existing = await tx.permission.findUnique({
          where: { key },
          select: { id: true }
        });
        if (!existing) return;

        const removed = await tx.userPermission.deleteMany({
          where: { userId: target.id, permissionId: existing.id }
        });
        if (removed.count) {
          await tx.permissionAudit.create({
            data: {
              userId: target.id,
              permissionKey: key,
              action: "REVOKED",
              changedByUserId: req.user.sub
            }
          });
        }
      });

      res.json({ ok: true });
    } catch (error) {
      console.error("PERMISSION REVOKE ERROR:", error);
      res.status(500).json({ error: "Unable to update access." });
    }
  }
);


// ============================================================
// PUBLIC NEWS
// ============================================================

app.get(
  "/api/news",
  async (req, res) => {

    try {

      const items =
        await prisma.news.findMany({

          where: {
            isPublished: true
          },

          orderBy: {
            publishedAt: "desc"
          }

        });


      res.json(items);


    } catch (error) {

      console.error(
        "NEWS ERROR:",
        error
      );

      res.status(500).json({
        error: "Unable to load news."
      });

    }

  }
);


// ============================================================
// PUBLIC EVENTS
// ============================================================

app.get(
  "/api/events",
  async (_, res) => {

    try {

      const events =
        await prisma.event.findMany({

          orderBy: {
            startsAt: "asc"
          }

        });


      res.json(events);


    } catch (error) {

      console.error(
        "EVENTS ERROR:",
        error
      );

      res.status(500).json({
        error: "Unable to load events."
      });

    }

  }
);


// ============================================================
// PUBLIC GALLERY
// ============================================================

app.get(
  "/api/gallery",
  async (_, res) => {

    try {

      const photos =
        await prisma.galleryPhoto.findMany({

          orderBy: {
            createdAt: "desc"
          }

        });


      res.json(photos);


    } catch (error) {

      console.error(
        "GALLERY ERROR:",
        error
      );

      res.status(500).json({
        error: "Unable to load gallery."
      });

    }

  }
);


// ============================================================
// PUBLIC DEPARTMENTS
// ============================================================

app.get(
  "/api/departments",
  async (_, res) => {

    try {

      const departments =
        await prisma.department.findMany({

          orderBy: {
            name: "asc"
          }

        });


      res.json(departments);


    } catch (error) {

      console.error(
        "DEPARTMENTS ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to load departments."
      });

    }

  }
);


app.post(
  "/api/admin/departments",
  auth,
  allow("ADMIN", "STAFF"),
  async (req, res) => {
    const name =
      String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).json({
        error: "Department name is required."
      });
    }

    try {
      const department =
        await prisma.department.create({
          data: {
            name,
            description:
              String(req.body.description || "").trim() || null,
            head:
              String(req.body.head || "").trim() || null
          }
        });

      return res.status(201).json(department);
    } catch (error) {
      if (error.code === "P2002") {
        return res.status(409).json({
          error: "A department with that name already exists."
        });
      }

      console.error("CREATE DEPARTMENT ERROR:", error);
      return res.status(500).json({
        error: "Unable to create department."
      });
    }
  }
);


// ============================================================
// PUBLIC ALUMNI
// ============================================================

app.get(
  "/api/alumni",
  async (req, res) => {

    try {

      const year =
        Number(req.query.year);


      const alumni =
        await prisma.alumni.findMany({

          where: {
            isPublic: true,
            verificationStatus: "VERIFIED",
            ...(year ? { exitYear: year, publicSchoolHistory: true } : {})
          },

          select: {
            fullName: true,
            formerName: true,
            nameWhileAttending: true,
            photoUrl: true,
            exitYear: true,
            entryYear: true,
            approximatePeriod: true,
            graduationYear: true,
            graduationClass: true,
            lastClassAttended: true,
            departmentLabel: true,
            house: true,
            occupation: true,
            company: true,
            location: true,
            bio: true,
            memories: true,
            publicName: true,
            publicFormerName: true,
            publicSchoolHistory: true,
            publicPhoto: true,
            publicOccupation: true,
            publicLocation: true,
            publicBiography: true,
            publicMemories: true,
            classMemberships: {
              where: { status: "VERIFIED", classSet: { isPublic: true } },
              select: {
                classSet: {
                  select: {
                    displayName: true,
                    entryYear: true,
                    exitYear: true,
                    approximatePeriod: true
                  }
                }
              }
            },
            archiveMedia: {
              where: {
                isPublic: true,
                kind: { in: ["PROFILE_PHOTO", "THEN_PHOTO", "NOW_PHOTO"] }
              },
              select: { storageKey: true, kind: true }
            }
          },

          orderBy: { exitYear: "desc" }

        });


      res.json(alumni.map(record => {
        const mediaUrl = kind =>
          record.archiveMedia.find(media => media.kind === kind)?.storageKey || null;
        const schoolHistoryIsPublic = record.publicSchoolHistory;

        return {
          fullName: record.publicName ? record.fullName : null,
          formerName: record.publicFormerName ? record.formerName : null,
          nameWhileAttending: record.publicFormerName ? record.nameWhileAttending : null,
          photoUrl: record.publicPhoto ? (mediaUrl("PROFILE_PHOTO") || record.photoUrl) : null,
          entryYear: schoolHistoryIsPublic ? record.entryYear : null,
          exitYear: schoolHistoryIsPublic ? (record.exitYear ?? record.graduationYear) : null,
          graduationYear: schoolHistoryIsPublic ? (record.exitYear ?? record.graduationYear) : null,
          approximatePeriod: schoolHistoryIsPublic ? record.approximatePeriod : null,
          graduationClass: schoolHistoryIsPublic ? record.graduationClass : null,
          lastClass: schoolHistoryIsPublic ? record.lastClassAttended : null,
          department: schoolHistoryIsPublic ? record.departmentLabel : null,
          house: schoolHistoryIsPublic ? record.house : null,
          classSets: schoolHistoryIsPublic ? record.classMemberships.map(item => item.classSet) : [],
          thenPhotoUrl: record.publicPhoto ? mediaUrl("THEN_PHOTO") : null,
          nowPhotoUrl: record.publicPhoto ? mediaUrl("NOW_PHOTO") : null,
          occupation: record.publicOccupation ? record.occupation : null,
          company: record.publicOccupation ? record.company : null,
          location: record.publicLocation ? record.location : null,
          bio: record.publicBiography ? record.bio : null,
          memories: record.publicMemories ? record.memories : null
        };
      }));


    } catch (error) {

      console.error(
        "ALUMNI ERROR:",
        error
      );

      res.status(500).json({
        error: "Unable to load alumni."
      });

    }

  }
);


// ============================================================
// ALUMNI YEARS
// ============================================================

app.get(
  "/api/alumni/years",
  async (_, res) => {

    try {

      const rows =
        await prisma.alumni.findMany({

          where: {
            isPublic: true,
            verificationStatus: "VERIFIED",
            publicSchoolHistory: true,
            exitYear: { not: null }
          },

          distinct: [
            "exitYear"
          ],

          select: {
            exitYear: true
          },

          orderBy: {
            exitYear: "asc"
          }

        });


      res.json(
        rows.map(
          row => row.exitYear
        )
      );


    } catch (error) {

      console.error(
        "ALUMNI YEARS ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to load alumni years."
      });

    }

  }
);


// ============================================================
// CONTACT
// ============================================================

app.post(
  "/api/contact",
  async (req, res) => {

    try {

      const {
        name,
        email,
        phone,
        subject,
        message
      } = req.body;


      if (
        !name ||
        !email ||
        !message
      ) {

        return res.status(400).json({
          error:
            "Name, email and message are required"
        });

      }


      await prisma.message.create({

        data: {

          name:
            name.trim(),

          email:
            email.trim(),

          phone:
            phone?.trim() || null,

          subject:
            subject?.trim() || null,

          message:
            message.trim()

        }

      });


      res.status(201).json({
        message:
          "Message received"
      });


    } catch (error) {

      console.error(
        "CONTACT ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to send message."
      });

    }

  }
);


// ============================================================
// STUDENT PROFILE
// ============================================================

app.get(
  "/api/student/profile",
  auth,
  allow("STUDENT"),
  async (req, res) => {

    try {

      const student =
        await prisma.student.findFirst({
          where: { userId: req.user.sub, status: { not: "INACTIVE" } },
          select: {
            id: true,
            studentId: true,
            firstName: true,
            middleName: true,
            lastName: true,
            email: true,
            phone: true,
            dateOfBirth: true,
            gender: true,
            photoUrl: true,
            status: true,

            enrollments: {
              select: {
                id: true,
                status: true,
                class: { select: { id: true, name: true, level: true } },
                session: { select: { id: true, name: true, isCurrent: true } }
              },
              orderBy: { session: { name: "desc" } }
            },

            academicRecords: {
              select: {
                subject: true,
                caScore: true,
                examScore: true,
                totalScore: true,
                grade: true,
                remark: true,
                session: { select: { name: true } }
              },
              orderBy: [{ session: { name: "desc" } }, { subject: "asc" }]
            }
          }
        });


      if (!student) {

        return res.status(404).json({
          error:
            "Student not found"
        });

      }


      const currentEnrollment = student.enrollments.find(
        enrollment => enrollment.session.isCurrent && enrollment.status === "ENROLLED"
      ) || null;
      const classmates = currentEnrollment
        ? await prisma.enrollment.findMany({
            where: {
              classId: currentEnrollment.class.id,
              sessionId: currentEnrollment.session.id,
              status: "ENROLLED",
              studentId: { not: student.id }
            },
            select: {
              student: {
                select: { studentId: true, firstName: true, middleName: true, lastName: true }
              }
            },
            orderBy: { student: { lastName: "asc" } }
          })
        : [];

      res.json({
        ...student,
        photoUrl: privateStudentPhotoPathname(student.photoUrl)
          ? null
          : student.photoUrl,
        currentEnrollment,
        classmates: classmates.map(({ student: classmate }) => classmate)
      });


    } catch (error) {

      console.error(
        "STUDENT PROFILE ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to load student profile."
      });

    }

  }
);


// ============================================================
// ADMIN OVERVIEW
// ============================================================

app.get(
  "/api/admin/overview",
  auth,
  requireAnyPermission(...permissionCatalog.map(([key]) => key)),
  async (req, res) => {

    try {

      const granted = req.user.role === "ADMIN" ? permissionCatalog.map(([key]) => key) : await getCurrentPermissions(req.user.sub);
      const has = (...keys) => req.user.role === "ADMIN" || keys.some(key => granted.includes(key));
      const canAcademics = has("ACADEMICS_VIEW", "ACADEMICS_MANAGE");
      const currentSession = canAcademics ? await getCurrentSession() : null;

      const [
        students,
        alumni,
        news,
        events,
        messages,
        requests,
        activeStudents,
        currentEnrollments,
        classes,
        sessions,
        classSummary
      ] =
        await Promise.all([

          prisma.student.count(),

          prisma.alumni.count(),

          prisma.news.count(),

          prisma.event.count(),

          prisma.message.count({
            where: {
              isRead: false
            }
          }),

          prisma.updateRequest.count({
            where: {
              status: "PENDING"
            }
          }),

          prisma.student.count({ where: { status: "ACTIVE" } }),

          prisma.enrollment.count({ where: { status: "ENROLLED", session: { isCurrent: true } } }),

          prisma.class.count(),

          canAcademics
            ? prisma.session.findMany({ orderBy: { name: "desc" }, select: { id: true, name: true, startDate: true, endDate: true, isCurrent: true } })
            : Promise.resolve([]),

          canAcademics
            ? prisma.class.findMany({
                orderBy: { name: "asc" },
                take: 6,
                select: {
                  id: true, name: true, level: true,
                  _count: { select: { enrollments: { where: { status: "ENROLLED", ...(currentSession ? { sessionId: currentSession.id } : {}) } } } }
                }
              })
            : Promise.resolve([])

        ]);


      res.json({
        students: has("STUDENTS_VIEW", "STUDENTS_MANAGE") ? students : null,
        activeStudents: has("STUDENTS_VIEW", "STUDENTS_MANAGE") ? activeStudents : null,
        currentlyEnrolled: has("STUDENTS_VIEW", "STUDENTS_MANAGE", "ACADEMICS_VIEW", "ACADEMICS_MANAGE") ? currentEnrollments : null,
        classes: canAcademics ? classes : null,
        classSummary: canAcademics ? classSummary : null,
        alumni: has("ALUMNI_VIEW", "ALUMNI_MANAGE", "ALUMNI_VERIFY") ? alumni : null,
        news: has("CONTENT_VIEW", "CONTENT_MANAGE") ? news : null,
        events: has("EVENTS_MANAGE") ? events : null,
        unreadMessages: req.user.role === "ADMIN" ? messages : null,
        pendingUpdateRequests: has("ALUMNI_VERIFY") ? requests : null,
        sessions: canAcademics ? sessions : null,
        currentSession: canAcademics ? currentSession?.id || null : null
      });


    } catch (error) {

      console.error(
        "ADMIN OVERVIEW ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to load dashboard overview."
      });

    }

  }
);


// ============================================================
// ADMIN STUDENTS — LIST
// ============================================================

app.get(
  "/api/admin/students",
  auth,
  requirePermission("STUDENTS_VIEW"),
  async (req, res) => {

    try {
      const q = String(req.query.q || "").trim().slice(0, 120);
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 50));
      const clauses = [];
      if (q) clauses.push({ OR: ["studentId", "firstName", "middleName", "lastName", "email", "phone"].map(field => ({ [field]: { contains: q, mode: "insensitive" } })) });
      if (["ACTIVE", "GRADUATED", "ALUMNI", "INACTIVE"].includes(req.query.status)) clauses.push({ status: req.query.status });
      if (req.query.classId || req.query.sessionId || ["ENROLLED", "PROMOTED", "COMPLETED", "WITHDRAWN"].includes(req.query.enrollmentStatus)) {
        clauses.push({ enrollments: { some: {
          ...(req.query.classId ? { classId: String(req.query.classId) } : {}),
          ...(req.query.sessionId ? { sessionId: String(req.query.sessionId) } : {}),
          ...(["ENROLLED", "PROMOTED", "COMPLETED", "WITHDRAWN"].includes(req.query.enrollmentStatus) ? { status: req.query.enrollmentStatus } : {})
        } } });
      }
      const where = clauses.length ? { AND: clauses } : {};
      const [total, students] = await Promise.all([
        prisma.student.count({ where }),
        prisma.student.findMany({
          where,
          select: {
            id: true, studentId: true, firstName: true, middleName: true, lastName: true, status: true,
            enrollments: {
              select: {
                id: true, status: true, class: { select: { id: true, name: true } },
                session: { select: { id: true, name: true, isCurrent: true } }
              },
              orderBy: [{ session: { isCurrent: "desc" } }, { createdAt: "desc" }],
              take: 1
            }
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { studentId: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize
        })
      ]);
      res.json({ items: students, total, page, pageSize, pages: Math.ceil(total / pageSize) });


    } catch (error) {

      console.error(
        "ADMIN STUDENTS ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to load students."
      });

    }

  }
);


// ============================================================
// ADMIN STUDENTS — CREATE
// ============================================================

app.post(
  "/api/admin/students",
  auth,
  requirePermission("STUDENTS_MANAGE"),
  async (req, res) => {

    req.uploadType =
      "student";

    let uploadedImage = null;
    let databaseCommitted = false;

    imageUpload.single(
      "photo"
    )(req, res, async error => {

      try {

        if (error) {

          return res.status(400).json({
            error:
              error.message
          });

        }


        const {
          studentId,
          firstName,
          middleName,
          lastName,
          dateOfBirth,
          gender,
          email,
          phone,
          address,
          status,
          classId,
          sessionId
        } = req.body;


        // ------------------------------------------------------
        // REQUIRED FIELDS
        // ------------------------------------------------------

        if (
          !studentId?.trim() ||
          !firstName?.trim() ||
          !lastName?.trim()
        ) {

          deleteUploadedFile(
            req.file?.path
          );


          return res.status(400).json({
            error:
              "Student ID, first name and last name are required."
          });

        }

        if (Boolean(classId) !== Boolean(sessionId)) {
          deleteUploadedFile(req.file?.path);
          return res.status(400).json({ error: "Choose both a class and an academic session for the initial enrollment, or leave both unselected." });
        }

        if (!(["ACTIVE", "GRADUATED", "ALUMNI", "INACTIVE"].includes(status || "ACTIVE"))) {
          deleteUploadedFile(req.file?.path);
          return res.status(400).json({ error: "Student status is invalid." });
        }

        if (studentId.trim().length > 80 || firstName.trim().length > 100 || lastName.trim().length > 100 || (middleName && middleName.trim().length > 100)) {
          deleteUploadedFile(req.file?.path);
          return res.status(400).json({ error: "Student ID or name exceeds the allowed length." });
        }

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          deleteUploadedFile(req.file?.path);
          return res.status(400).json({ error: "Enter a valid email address." });
        }


        // ------------------------------------------------------
        // VALIDATE DATE
        // ------------------------------------------------------

        let parsedDateOfBirth =
          null;


        if (dateOfBirth) {

          const parsed =
            new Date(
              dateOfBirth
            );


          if (
            Number.isNaN(
              parsed.getTime()
            )
          ) {

            deleteUploadedFile(
              req.file?.path
            );


            return res.status(400).json({
              error:
                "Invalid date of birth."
            });

          }


          parsedDateOfBirth =
            parsed;

        }


        // ------------------------------------------------------
        // PHOTO URL
        // ------------------------------------------------------

        uploadedImage = req.file
          ? await storeUploadedImage(req.file, "students", "private")
          : null;

        const photoUrl = uploadedImage?.photoUrl || null;


        // ------------------------------------------------------
        // CREATE STUDENT
        // ------------------------------------------------------

        const student =
          await prisma.$transaction(
            async tx => {

              const created =
                await tx.student.create({

                  data: {

                    studentId:
                      studentId.trim(),

                    firstName:
                      firstName.trim(),

                    middleName:
                      middleName?.trim() ||
                      null,

                    lastName:
                      lastName.trim(),

                    dateOfBirth:
                      parsedDateOfBirth,

                    gender:
                      gender?.trim() ||
                      null,

                    email:
                      email?.trim() ||
                      null,

                    phone:
                      phone?.trim() ||
                      null,

                    address:
                      address?.trim() ||
                      null,

                    status:
                      status ||
                      "ACTIVE",

                    photoUrl

                  }

                });


              // ------------------------------------------------
              // ENROLLMENT
              // ------------------------------------------------

              if (
                classId &&
                sessionId
              ) {

                await tx.enrollment.create({

                  data: {

                    studentId:
                      created.id,

                    classId,

                    sessionId,

                    status:
                      "ENROLLED"

                  }

                });

              }


              return tx.student.findUnique({

                where: {
                  id:
                    created.id
                },

                include: {

                  enrollments: {

                    include: {
                      class: true,
                      session: true
                    },

                    orderBy: {
                      createdAt: "desc"
                    }

                  }

                }

              });

            }
          );

        databaseCommitted = true;

        res.status(201).json(
          student
        );


      } catch (error) {

        if (!databaseCommitted) {
          await cleanupNewImage(uploadedImage);
          if (!uploadedImage) deleteUploadedFile(req.file?.path);
        }


        console.error(
          "CREATE STUDENT ERROR:",
          error
        );


        if (
          error.code ===
          "P2002"
        ) {

          return res.status(409).json({
            error:
              "That Student ID already exists or this student is already enrolled in this session."
          });

        }


        if (
          error.code ===
          "P2025"
        ) {

          return res.status(404).json({
            error:
              "The selected class or session could not be found."
          });

        }


        res.status(500).json({
          error:
            "Unable to create student."
        });

      }

    });

  }
);


// ============================================================
// ADMIN STUDENTS — UPDATE
// ============================================================

app.put(
  "/api/admin/students/:id",
  auth,
  requirePermission("STUDENTS_MANAGE"),
  async (req, res) => {

    try {

      const allowed = [

        "firstName",
        "middleName",
        "lastName",
        "dateOfBirth",
        "gender",
        "email",
        "phone",
        "address",
        "photoUrl",
        "status"

      ];


      const data =
        Object.fromEntries(

          Object.entries(
            req.body
          ).filter(
            ([key]) =>
              allowed.includes(
                key
              )
          )

        );

      if ("status" in data && !["ACTIVE", "GRADUATED", "ALUMNI", "INACTIVE"].includes(data.status)) {
        return res.status(400).json({ error: "Student status is invalid." });
      }


      // ------------------------------------------------------
      // CLEAN STRING VALUES
      // ------------------------------------------------------

      [
        "firstName",
        "middleName",
        "lastName",
        "gender",
        "email",
        "phone",
        "address",
        "photoUrl"
      ].forEach(key => {

        if (key in data) {

          data[key] =
            data[key]
              ?.toString()
              .trim() || null;

        }

      });

      if (("firstName" in data && !data.firstName) || ("lastName" in data && !data.lastName)) {
        return res.status(400).json({ error: "First and last name cannot be blank." });
      }

      if ((data.firstName?.length || 0) > 100 || (data.middleName?.length || 0) > 100 || (data.lastName?.length || 0) > 100) {
        return res.status(400).json({ error: "Student name exceeds the allowed length." });
      }

      if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        return res.status(400).json({ error: "Enter a valid email address." });
      }


      // ------------------------------------------------------
      // DATE
      // ------------------------------------------------------

      if (
        "dateOfBirth" in data
      ) {

        if (!data.dateOfBirth) {

          data.dateOfBirth =
            null;

        } else {

          const parsed =
            new Date(
              data.dateOfBirth
            );


          if (
            Number.isNaN(
              parsed.getTime()
            )
          ) {

            return res.status(400).json({
              error:
                "Invalid date of birth."
            });

          }


          data.dateOfBirth =
            parsed;

        }

      }


      const student =
        await prisma.student.update({

          where: {
            id:
              req.params.id
          },

          data,

          include: {

            enrollments: {

              include: {
                class: true,
                session: true
              },

              orderBy: {
                createdAt: "desc"
              }

            }

          }

        });


      res.json(student);


    } catch (error) {

      console.error(
        "UPDATE STUDENT ERROR:",
        error
      );


      if (
        error.code ===
        "P2025"
      ) {

        return res.status(404).json({
          error:
            "Student not found."
        });

      }


      res.status(500).json({
        error:
          "Unable to update student."
      });

    }

  }
);


// ============================================================
// ADMIN STUDENT PHOTO — UPDATE
// ============================================================

app.post(
  "/api/admin/students/:id/photo",
  auth,
  requirePermission("STUDENTS_MANAGE"),
  async (req, res) => {

    req.uploadType =
      "student";

    let uploadedImage = null;
    let databaseCommitted = false;

    imageUpload.single(
      "photo"
    )(req, res, async error => {

      try {

        if (error) {

          return res.status(400).json({
            error:
              error.message
          });

        }


        if (!req.file) {

          return res.status(400).json({
            error:
              "Please select a student photograph."
          });

        }


        const student =
          await prisma.student.findUnique({

            where: {
              id:
                req.params.id
            }

          });


        if (!student) {

          deleteUploadedFile(
            req.file.path
          );


          return res.status(404).json({
            error:
              "Student not found."
          });

        }


        uploadedImage = await storeUploadedImage(
          req.file,
          "students",
          "private"
        );


        const updated =
          await prisma.student.update({

            where: {
              id:
                req.params.id
            },

            data: {
              photoUrl: uploadedImage.photoUrl
            },

            include: {

              enrollments: {

                include: {
                  class: true,
                  session: true
                },

                orderBy: {
                  createdAt: "desc"
                }

              }

            }

          });

        databaseCommitted = true;

        // Delete old photo only
        // after successful update.

        if (
          student.photoUrl
        ) {

          await deleteReplacedImage(
            student.photoUrl,
            "students"
          );

        }


        res.json(updated);


      } catch (error) {

        if (!databaseCommitted) {
          await cleanupNewImage(uploadedImage);
          if (!uploadedImage) deleteUploadedFile(req.file?.path);
        }


        console.error(
          "STUDENT PHOTO ERROR:",
          error
        );


        res.status(500).json({
          error:
            "Unable to save student photograph."
        });

      }

    });

  }
);


// ============================================================
// CURRENT SESSION HELPER
// ============================================================

async function getCurrentSession() {

  return prisma.session.findFirst({

    where: {
      isCurrent: true
    }

  });

}


// ============================================================
// ADMIN CLASSES — LIST
// ============================================================

app.get(
  "/api/admin/classes",
  auth,
  requirePermission("ACADEMICS_VIEW"),
  async (req, res) => {

    try {

      const currentSession =
        await getCurrentSession();


      const sessionId =
        req.query.sessionId ||
        currentSession?.id ||
        null;


      const classes =
        await prisma.class.findMany({

          include: {

            _count: {

              select: {

                enrollments: {
                  where: { ...(sessionId ? { sessionId } : {}), status: "ENROLLED" }
                }

              }

            }

          },

          orderBy: {
            name: "asc"
          }

        });


      res.json(classes);


    } catch (error) {

      console.error(
        "LOAD CLASSES ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to load classes."
      });

    }

  }
);


// ============================================================
// ADMIN CLASSES — CREATE
// ============================================================

app.post(
  "/api/admin/classes",
  auth,
  requirePermission("ACADEMICS_MANAGE"),
  async (req, res) => {

    try {

      const {
        name,
        level,
        classTeacher,
        description
      } = req.body;


      if (!name?.trim()) {

        return res.status(400).json({
          error:
            "Class name is required."
        });

      }

      if (name.trim().length > 80 || [level, classTeacher, description].some(value => value != null && String(value).trim().length > 1000)) {
        return res.status(400).json({ error: "Class name or details exceed the allowed length." });
      }


      const classRecord =
        await prisma.class.create({

          data: {

            name:
              name.trim(),

            level:
              level?.trim() ||
              null,

            classTeacher:
              classTeacher?.trim() ||
              null,

            description:
              description?.trim() ||
              null

          },

          include: {

            _count: {

              select: {
                enrollments: true
              }

            }

          }

        });


      res.status(201).json(
        classRecord
      );


    } catch (error) {

      console.error(
        "CREATE CLASS ERROR:",
        error
      );


      if (
        error.code ===
        "P2002"
      ) {

        return res.status(409).json({
          error:
            "A class with that name already exists."
        });

      }


      res.status(500).json({
        error:
          "Unable to create class."
      });

    }

  }
);


// ============================================================
// ADMIN CLASSES — UPDATE
// ============================================================

app.put(
  "/api/admin/classes/:id",
  auth,
  requirePermission("ACADEMICS_MANAGE"),
  async (req, res) => {

    try {

      const {
        name,
        level,
        classTeacher,
        description
      } = req.body;


      if (!name?.trim()) {

        return res.status(400).json({
          error:
            "Class name is required."
        });

      }

      if (name.trim().length > 80 || [level, classTeacher, description].some(value => value != null && String(value).trim().length > 1000)) {
        return res.status(400).json({ error: "Class name or details exceed the allowed length." });
      }


      const classRecord =
        await prisma.class.update({

          where: {
            id:
              req.params.id
          },

          data: {

            name:
              name.trim(),

            level:
              level?.trim() ||
              null,

            classTeacher:
              classTeacher?.trim() ||
              null,

            description:
              description?.trim() ||
              null

          },

          include: {

            _count: {

              select: {
                enrollments: true
              }

            }

          }

        });


      res.json(
        classRecord
      );


    } catch (error) {

      console.error(
        "UPDATE CLASS ERROR:",
        error
      );


      if (
        error.code ===
        "P2025"
      ) {

        return res.status(404).json({
          error:
            "Class not found."
        });

      }


      if (
        error.code ===
        "P2002"
      ) {

        return res.status(409).json({
          error:
            "A class with that name already exists."
        });

      }


      res.status(500).json({
        error:
          "Unable to update class."
      });

    }

  }
);


// ============================================================
// ADMIN CLASS DETAIL
// ============================================================

app.get(
  "/api/admin/classes/:id",
  auth,
  requirePermission("ACADEMICS_VIEW"),
  async (req, res) => {

    try {

      const currentSession =
        await getCurrentSession();


      const sessionId =
        req.query.sessionId ||
        currentSession?.id ||
        null;


      const classRecord =
        await prisma.class.findUnique({

          where: {
            id:
              req.params.id
          },

          include: {

            enrollments: {

              where: { ...(sessionId ? { sessionId } : {}), status: "ENROLLED" },

              include: {

                student: {
                  select: {
                    id: true,
                    studentId: true,
                    firstName: true,
                    middleName: true,
                    lastName: true,
                    photoUrl: true,
                    status: true
                  }
                },

                session: true

              },

              orderBy: {
                createdAt: "asc"
              }

            },

            _count: {

              select: {

                enrollments: {
                  where: { ...(sessionId ? { sessionId } : {}), status: "ENROLLED" }
                }

              }

            }

          }

        });


      if (!classRecord) {

        return res.status(404).json({
          error:
            "Class not found."
        });

      }


      res.json({

        ...classRecord,

        selectedSessionId:
          sessionId

      });


    } catch (error) {

      console.error(
        "CLASS DETAIL ERROR:",
        error
      );


      res.status(500).json({
        error:
          "Unable to load class."
      });

    }

  }
);


// ============================================================
// CLASS PHOTOGRAPH UPLOAD
// ============================================================

app.post(
  "/api/admin/classes/:id/photo",
  auth,
  requirePermission("ACADEMICS_MANAGE"),
  async (req, res) => {

    req.uploadType =
      "class";

    let uploadedImage = null;
    let databaseCommitted = false;

    imageUpload.single(
      "photo"
    )(req, res, async error => {

      try {

        if (error) {

          return res.status(400).json({
            error:
              error.message
          });

        }


        if (!req.file) {

          return res.status(400).json({
            error:
              "Please select a class photograph."
          });

        }


        const classRecord =
          await prisma.class.findUnique({

            where: {
              id:
                req.params.id
            }

          });


        if (!classRecord) {

          deleteUploadedFile(
            req.file.path
          );


          return res.status(404).json({
            error:
              "Class not found."
          });

        }


        uploadedImage = await storeUploadedImage(
          req.file,
          "classes",
          "public"
        );


        const updatedClass =
          await prisma.class.update({

            where: {
              id:
                req.params.id
            },

            data: {
              classPhotoUrl:
                uploadedImage.photoUrl
            }

          });

        databaseCommitted = true;

        // Delete old photo only after
        // database update succeeded.

        if (
          classRecord.classPhotoUrl
        ) {

          await deleteReplacedImage(
            classRecord.classPhotoUrl,
            "classes"
          );

        }


        // Return a session-aware class
        // object to the frontend.

        const currentSession =
          await getCurrentSession();


        const sessionId =
          req.query.sessionId ||
          currentSession?.id ||
          null;


        const result =
          await prisma.class.findUnique({

            where: {
              id:
                updatedClass.id
            },

            include: {

              enrollments: {

                where:
                  sessionId
                    ? {
                        sessionId
                      }
                    : {},

                include: {

                  student: true,

                  session: true

                },

                orderBy: {
                  createdAt: "asc"
                }

              },

              _count: {

                select: {

                  enrollments:
                    sessionId
                      ? {
                          where: {
                            sessionId
                          }
                        }
                      : true

                }

              }

            }

          });


        res.json({

          ...result,

          selectedSessionId:
            sessionId

        });


      } catch (error) {

        if (!databaseCommitted) {
          await cleanupNewImage(uploadedImage);
          if (!uploadedImage) deleteUploadedFile(req.file?.path);
        }


        console.error(
          "CLASS PHOTO UPLOAD ERROR:",
          error
        );


        res.status(500).json({
          error:
            "Unable to save class photograph."
        });

      }

    });

  }
);


// ============================================================
// ADMIN SESSIONS
// ============================================================

app.get(
  "/api/admin/sessions",
  auth,
  requirePermission("ACADEMICS_VIEW"),
  async (_, res) => {

    try {

      const sessions =
        await prisma.session.findMany({

          orderBy: {
            name: "desc"
          }

        });


      res.json(sessions);


    } catch (error) {

      console.error(
        "SESSIONS ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to load sessions."
      });

    }

  }
);


// ============================================================
// ADMIN NEWS — CREATE
// ============================================================

app.post(
  "/api/admin/news",
  auth,
  allow(
    "ADMIN",
    "STAFF"
  ),
  async (req, res) => {

    try {

      const {
        title,
        slug,
        excerpt,
        content,
        imageUrl,
        publishedAt,
        isPublished
      } = req.body;


      if (!title?.trim()) {

        return res.status(400).json({
          error:
            "News title is required."
        });

      }


      if (!content?.trim()) {

        return res.status(400).json({
          error:
            "News content is required."
        });

      }


      const generatedSlug =
        slug?.trim() ||
        title
          .toLowerCase()
          .replace(
            /[^a-z0-9]+/g,
            "-"
          )
          .replace(
            /^-|-$/g,
            ""
          );


      const news =
        await prisma.news.create({

          data: {

            title:
              title.trim(),

            slug:
              generatedSlug,

            excerpt:
              excerpt?.trim() ||
              null,

            content:
              content.trim(),

            imageUrl:
              imageUrl?.trim() ||
              null,

            publishedAt:
              publishedAt
                ? new Date(
                    publishedAt
                  )
                : null,

            isPublished:
              Boolean(
                isPublished
              )

          }

        });


      res.status(201).json(
        news
      );


    } catch (error) {

      console.error(
        "CREATE NEWS ERROR:",
        error
      );


      if (
        error.code ===
        "P2002"
      ) {

        return res.status(409).json({
          error:
            "A news article with that slug already exists."
        });

      }


      res.status(500).json({
        error:
          "Unable to create news article."
      });

    }

  }
);


// ============================================================
// ADMIN EVENTS — CREATE
// ============================================================

app.post(
  "/api/admin/events",
  auth,
  allow(
    "ADMIN",
    "STAFF"
  ),
  async (req, res) => {

    try {

      const {
        title,
        description,
        location,
        startsAt,
        endsAt,
        imageUrl
      } = req.body;


      if (!title?.trim()) {

        return res.status(400).json({
          error:
            "Event title is required."
        });

      }


      if (!startsAt) {

        return res.status(400).json({
          error:
            "Event start date is required."
        });

      }


      const event =
        await prisma.event.create({

          data: {

            title:
              title.trim(),

            description:
              description?.trim() ||
              null,

            location:
              location?.trim() ||
              null,

            startsAt:
              new Date(
                startsAt
              ),

            endsAt:
              endsAt
                ? new Date(
                    endsAt
                  )
                : null,

            imageUrl:
              imageUrl?.trim() ||
              null

          }

        });


      res.status(201).json(
        event
      );


    } catch (error) {

      console.error(
        "CREATE EVENT ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to create event."
      });

    }

  }
);


// ============================================================
// ADMIN GALLERY — CREATE
// ============================================================

app.post(
  "/api/admin/gallery",
  auth,
  allow(
    "ADMIN",
    "STAFF"
  ),
  async (req, res) => {

    try {

      const {
        title,
        imageUrl,
        caption
      } = req.body;


      if (!imageUrl?.trim()) {

        return res.status(400).json({
          error:
            "Image URL is required."
        });

      }


      const photo =
        await prisma.galleryPhoto.create({

          data: {

            title:
              title?.trim() ||
              null,

            imageUrl:
              imageUrl.trim(),

            caption:
              caption?.trim() ||
              null

          }

        });


      res.status(201).json(
        photo
      );


    } catch (error) {

      console.error(
        "CREATE GALLERY ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to add gallery photo."
      });

    }

  }
);


// ============================================================
// ADMIN MESSAGES
// ============================================================

app.get(
  "/api/admin/messages",
  auth,
  allow(
    "ADMIN",
    "STAFF"
  ),
  async (_, res) => {

    try {

      const messages =
        await prisma.message.findMany({

          orderBy: {
            createdAt: "desc"
          },

          take: 300

        });


      res.json(messages);


    } catch (error) {

      console.error(
        "ADMIN MESSAGES ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to load messages."
      });

    }

  }
);


// ============================================================
// ADMIN UPDATE REQUESTS
// ============================================================

app.get(
  "/api/admin/update-requests",
  auth,
  allow(
    "ADMIN",
    "STAFF"
  ),
  async (_, res) => {

    try {

      const requests =
        await prisma.updateRequest.findMany({

          include: {

            alumni: {

              include: {
                student: true
              }

            }

          },

          orderBy: {
            createdAt: "desc"
          }

        });


      res.json(requests);


    } catch (error) {

      console.error(
        "UPDATE REQUESTS ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to load update requests."
      });

    }

  }
);


// ============================================================
// ALUMNI UPDATE REQUEST
// ============================================================

app.post(
  "/api/alumni/update-request",
  auth,
  allow("ALUMNI"),
  async (req, res) => {

    try {

      const alumni =
        await prisma.alumni.findUnique({

          where: {
            userId:
              req.user.sub
          }

        });


      if (!alumni) {

        return res.status(404).json({
          error:
            "Alumni profile not found"
        });

      }


      const request =
        await prisma.updateRequest.create({

          data: {

            alumniId:
              alumni.id,

            payload: Object.fromEntries(
              Object.entries(req.body || {}).filter(([key, value]) =>
                ["fullName", "nameWhileAttending", "formerName", "phone", "whatsapp", "entryYear", "exitYear", "approximatePeriod", "lastClassAttended", "departmentLabel", "house", "occupation", "company", "location", "bio", "memories"].includes(key) &&
                ["string", "number"].includes(typeof value)
              ).map(([key, value]) => [key, typeof value === "string" ? value.trim().slice(0, 2000) : value])
            )

          }

        });


      res.status(201).json(
        request
      );


    } catch (error) {

      console.error(
        "ALUMNI UPDATE REQUEST ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to submit update request."
      });

    }

  }
);


// ============================================================
// MULTER / SERVER ERROR HANDLER
// ============================================================

app.use(
  (err, req, res, next) => {

    if (
      err instanceof
      multer.MulterError
    ) {

      return res.status(400).json({
        error:
          err.message
      });

    }


    if (
      err?.message?.includes(
        "Only JPG"
      )
    ) {

      return res.status(400).json({
        error:
          err.message
      });

    }


    console.error(
      "SERVER ERROR:",
      err
    );


    res.status(500).json({
      error:
        "Internal server error."
    });

  }
);


// ============================================================
// API 404 + SPA FALLBACK
// ============================================================

app.use(
  (req, res) => {

    if (
      req.path.startsWith(
        "/api/"
      )
    ) {

      return res.status(404).json({
        error:
          "Endpoint not found"
      });

    }


    res.sendFile(
      path.join(
        __dirname,
        "../public/index.html"
      )
    );

  }
);


// ============================================================
// SERVER
// ============================================================

const port =
  Number(
    process.env.PORT || 3000
  );


const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url);


if (isDirectExecution) {
  app.listen(
    port,
    () => {

      console.log(
        `School platform running on http://localhost:${port}`
      );

    }
  );
}


// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

async function shutdown() {

  console.log(
    "Shutting down..."
  );


  await prisma.$disconnect();

  process.exit(0);

}


process.on(
  "SIGINT",
  shutdown
);

process.on(
  "SIGTERM",
  shutdown
);


export default app;
