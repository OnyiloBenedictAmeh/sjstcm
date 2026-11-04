# SJSTCM Project Checkpoint

Updated: 2026-10-26

## Completed: student portal implementation

### Audit findings
- Express serves `public/`; existing authentication is `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, bcrypt password verification, JWT in an HTTP-only `school_token` cookie, and Prisma data.
- The schema already has a permanent unique `studentId`; enrollment links student/class/session; the current session flag exists; academic records link student and session and hold subject scores/grades.
- Previously, `/api/student/profile` returned broad Prisma includes and allowed ADMIN/STAFF lookups based on a browser student ID. The dashboard accepted ALUMNI and used the first enrollment as current.
- Existing admin student management uses separate `/api/admin/students` routes; admin frontend does not call `/api/student/profile`.
- No separate authenticated alumni UI or alumni creation endpoint was found. `public/alumni/join.html` and `alumni-onboarding.js` explicitly implement a frontend-only demo: credentials/files are not sent or saved and its confirmation reference is placeholder data.
- Admin UI filters sections by permissions, but most `/api/admin/*` handlers appear to use only `allow("ADMIN", "STAFF")`; the inspected student list/create/update/photo routes have no route-specific `requirePermission` middleware. This appears to let any STAFF JWT call student-management APIs directly, regardless of assigned permissions. This is a high-priority server-side authorization gap requiring route-by-route remediation and regression checks.
- Package manifest pins Prisma 6.19.3 while lockfile root describes Prisma 6.15.0 ranges. README describes SQLite setup while current Prisma schema declares PostgreSQL. No deployment configuration or test/lint scripts were found in inspected root files.

### Implemented
- Reused existing bcrypt/JWT/cookie login. Student login rejects missing or inactive student records; cookie path is explicit and logout clears matching options.
- Login checks an existing session and routes ADMIN/STAFF to `/admin/`, STUDENT to `/student/index.html`, ALUMNI to `/alumni/index.html`. The student dashboard accepts STUDENT only.
- Student profile API is STUDENT-only, resolves ownership from the signed-in user, excludes inactive records, selects portal fields, and returns current-session enrollment, enrolled classmates, and the student's own academic records.
- Authenticated API responses use private no-store cache headers. The dashboard renders current placement/classmates, results with session/class, empty/error states, expired-session notice, and logout.

### Files changed
- `server/index.js`
- `public/js/portal.js`
- `public/js/student.js`
- `public/student/index.html`
- `PROJECT_CHECKPOINT.md`

### Verification
- `node --check` passed for `server/index.js`, `public/js/portal.js`, and `public/js/student.js`.
- `git diff --check` passed.
- Prisma validation did not complete: PowerShell blocked `npx`; direct CLI invocation produced no output and hung, so it was stopped.
- `npm.cmd run dev` remained active without startup error output, but local HTTP probes did not return a usable result. Health/protected-route responses, database query, login/cookie/logout, role redirects, browser rendering, and admin/alumni regression are not verified.
- No test or lint scripts are defined. Database accounts/credentials were not tested. `.env` was not read or changed.
- `node_modules/` was already untracked before edits; it was not intentionally modified.

### Remaining issues / blockers
- Need a working Prisma CLI/database and reachable local server to verify actual API behavior.
- Student academic records do not directly reference a class; dashboard derives class from the student's unique enrollment for the same session.
- Alumni registration is explicitly demo-only and has no backend storage/account creation flow; alumni login currently routes to the existing public alumni landing page.
- Route-specific STAFF permission enforcement is missing on inspected admin student routes and likely other admin routes. Do not assume frontend section hiding is sufficient.
- Package lock and README setup descriptions conflict with manifest/schema and need review before deployment/package changes.

## Next task
Implement and verify route-specific server authorization for admin student list/create/update/photo routes using the existing permission catalog. Ensure ADMIN remains allowed and STAFF access follows `STUDENTS_VIEW` / `STUDENTS_MANAGE`, with clear handling when a staff member has manage but not view permission. Then audit remaining admin routes for the same permission gap.

## Approval-required actions
No destructive database action, migration, commit, push, or deployment was performed. Next task is source-only and does not require approval.
