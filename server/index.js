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
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";


// ============================================================
// INITIALIZATION
// ============================================================

const prisma = new PrismaClient();

const app = express();

const __dirname =
  path.dirname(fileURLToPath(import.meta.url));


// ============================================================
// FILE UPLOAD DIRECTORIES
// ============================================================

const uploadsRoot =
  path.join(__dirname, "../public/uploads");

const classUploads =
  path.join(uploadsRoot, "classes");

const studentUploads =
  path.join(uploadsRoot, "students");


// Create directories if they don't exist.

fs.mkdirSync(classUploads, {
  recursive: true
});

fs.mkdirSync(studentUploads, {
  recursive: true
});


// ============================================================
// IMAGE UPLOAD
// ============================================================

const imageStorage =
  multer.diskStorage({

    destination: (req, file, cb) => {

      const folder =
        req.uploadType === "class"
          ? classUploads
          : studentUploads;

      cb(null, folder);

    },


    filename: (req, file, cb) => {

      const extension =
        path.extname(
          file.originalname
        ).toLowerCase();


      const safeExtension =
        [
          ".jpg",
          ".jpeg",
          ".png",
          ".webp"
        ].includes(extension)
          ? extension
          : ".jpg";


      const filename =
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 10)}${safeExtension}`;


      cb(null, filename);

    }

  });


const imageUpload =
  multer({

    storage: imageStorage,

    limits: {
      fileSize: 5 * 1024 * 1024
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


function deletePublicUpload(
  publicUrl,
  folder
) {

  if (
    !publicUrl ||
    typeof publicUrl !== "string"
  ) {

    return;

  }


  const prefix =
    `/uploads/${folder}/`;


  if (!publicUrl.startsWith(prefix)) {

    return;

  }


  const filename =
    path.basename(publicUrl);


  const fullPath =
    path.join(
      uploadsRoot,
      folder,
      filename
    );


  deleteUploadedFile(fullPath);

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

    try {

      const {
        email,
        password
      } = req.body;


      if (!email || !password) {

        return res.status(400).json({
          error:
            "Email and password are required."
        });

      }


      const user =
        await prisma.user.findUnique({

          where: {
            email:
              email.trim().toLowerCase()
          }

        });


      if (
        !user ||
        !(await bcrypt.compare(
          password,
          user.passwordHash
        ))
      ) {

        return res.status(401).json({
          error:
            "Invalid email or password"
        });

      }


      res.cookie(
        "school_token",
        sign(user),
        {

          httpOnly: true,

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

      console.error(
        "LOGIN ERROR:",
        error
      );

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
      "school_token"
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

      const user =
        await prisma.user.findUnique({

          where: {
            id: req.user.sub
          },

          include: {
            student: true,
            alumni: true
          }

        });


      if (!user) {

        return res.status(404).json({
          error: "User not found."
        });

      }


      res.json(user);


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
// PUBLIC NEWS
// ============================================================

app.get(
  "/api/news",
  async (req, res) => {

    try {

      const items =
        await prisma.news.findMany({

          where:
            req.query.all === "true"
              ? {}
              : {
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

            ...(year
              ? {
                  graduationYear:
                    year
                }
              : {})

          },

          include: {
            student: true
          },

          orderBy: {
            graduationYear: "desc"
          }

        });


      res.json(alumni);


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

            graduationYear: {
              not: null
            }

          },

          distinct: [
            "graduationYear"
          ],

          select: {
            graduationYear: true
          },

          orderBy: {
            graduationYear: "asc"
          }

        });


      res.json(
        rows.map(
          row => row.graduationYear
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
  allow(
    "STUDENT",
    "ADMIN",
    "STAFF"
  ),
  async (req, res) => {

    try {

      const student =
        await prisma.student.findFirst({

          where:
            req.user.role ===
            "STUDENT"

              ? {
                  userId:
                    req.user.sub
                }

              : {
                  studentId:
                    req.query.studentId
                },

          include: {

            enrollments: {

              include: {
                class: true,
                session: true
              },

              orderBy: {
                session: {
                  name: "desc"
                }
              }

            },

            academicRecords: {

              include: {
                session: true
              },

              orderBy: {
                createdAt: "desc"
              }

            }

          }

        });


      if (!student) {

        return res.status(404).json({
          error:
            "Student not found"
        });

      }


      res.json(student);


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
  allow(
    "ADMIN",
    "STAFF"
  ),
  async (_, res) => {

    try {

      const [
        students,
        alumni,
        news,
        events,
        messages,
        requests
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
          })

        ]);


      res.json({

        students,
        alumni,
        news,
        events,

        unreadMessages:
          messages,

        pendingUpdateRequests:
          requests

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
  allow(
    "ADMIN",
    "STAFF"
  ),
  async (req, res) => {

    try {

      const q =
        String(
          req.query.q || ""
        ).trim();


      const students =
        await prisma.student.findMany({

          where:
            q
              ? {
                  OR: [

                    {
                      studentId: {
                        contains: q,
                        mode: "insensitive"
                      }
                    },

                    {
                      firstName: {
                        contains: q,
                        mode: "insensitive"
                      }
                    },

                    {
                      lastName: {
                        contains: q,
                        mode: "insensitive"
                      }
                    }

                  ]
                }
              : {},

          include: {

            enrollments: {

              include: {
                class: true,
                session: true
              },

              orderBy: {
                createdAt: "desc"
              },

              take: 1

            }

          },

          orderBy: {
            lastName: "asc"
          },

          take: 200

        });


      res.json(students);


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
  allow(
    "ADMIN",
    "STAFF"
  ),
  async (req, res) => {

    req.uploadType =
      "student";


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

        const photoUrl =
          req.file
            ? `/uploads/students/${req.file.filename}`
            : null;


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


        res.status(201).json(
          student
        );


      } catch (error) {

        deleteUploadedFile(
          req.file?.path
        );


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
  allow(
    "ADMIN",
    "STAFF"
  ),
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
  allow(
    "ADMIN",
    "STAFF"
  ),
  async (req, res) => {

    req.uploadType =
      "student";


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


        const photoUrl =
          `/uploads/students/${req.file.filename}`;


        const updated =
          await prisma.student.update({

            where: {
              id:
                req.params.id
            },

            data: {
              photoUrl
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


        // Delete old photo only
        // after successful update.

        if (
          student.photoUrl
        ) {

          deletePublicUpload(
            student.photoUrl,
            "students"
          );

        }


        res.json(updated);


      } catch (error) {

        deleteUploadedFile(
          req.file?.path
        );


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
  allow(
    "ADMIN",
    "STAFF"
  ),
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
  allow(
    "ADMIN",
    "STAFF"
  ),
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
  allow(
    "ADMIN",
    "STAFF"
  ),
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
  allow(
    "ADMIN",
    "STAFF"
  ),
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
  allow(
    "ADMIN",
    "STAFF"
  ),
  async (req, res) => {

    req.uploadType =
      "class";


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


        const photoUrl =
          `/uploads/classes/${req.file.filename}`;


        const updatedClass =
          await prisma.class.update({

            where: {
              id:
                req.params.id
            },

            data: {
              classPhotoUrl:
                photoUrl
            }

          });


        // Delete old photo only after
        // database update succeeded.

        if (
          classRecord.classPhotoUrl
        ) {

          deletePublicUpload(
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

        deleteUploadedFile(
          req.file?.path
        );


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
  allow(
    "ADMIN",
    "STAFF"
  ),
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

            payload:
              req.body

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


app.listen(
  port,
  () => {

    console.log(
      `School platform running on http://localhost:${port}`
    );

  }
);


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
