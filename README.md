# School Digital Platform

A production-oriented full-stack foundation for a school website, student portal, alumni system and admin dashboard.

## Architecture

- Node.js + Express API
- PostgreSQL + Prisma ORM
- JWT authentication stored in HTTP-only cookies
- Vanilla HTML/CSS/JS public frontend
- Permanent `studentId` identity with separate class/session enrollment history
- Role-based access: ADMIN, STAFF, STUDENT, ALUMNI
- News, events, gallery, messages, update requests and academic records

## Start locally

This project is configured for a local SQLite database so it works out of the box in a fresh development environment.

1. Install Node.js 20+.
2. Copy `.env.example` to `.env` and update the secret if needed.
3. Run:
   ```bash
   npm install
   npx prisma generate
   npx prisma migrate dev --name init
   npm run prisma:seed
   npm run dev
   ```
4. Open `http://localhost:3000`.

Seed admin:
- Email: `admin@example.com`
- Password: `ChangeMe123!`

Change the password immediately in a real deployment.

## Production checklist

- Use a managed PostgreSQL database.
- Set a strong random JWT secret.
- Put the app behind HTTPS and a reverse proxy.
- Replace local upload storage with S3-compatible object storage.
- Add transactional email/SMS provider credentials.
- Configure backups, monitoring and audit-log retention.
- Change seeded credentials before deployment.
1. What you downloaded

You downloaded:

school-platform-full-stack.zip

When you extract it, you will have a folder like:

school-platform/
│
├── public/
├── server/
├── prisma/
├── package.json
├── .env.example
└── README.md

This isn't just HTML. It is a full-stack application.

The important parts are:

public/       → website pages and frontend
server/       → backend/API
prisma/       → database structure
package.json  → software dependencies
.env          → database/password configuration
2. Install Node.js

The application needs Node.js.

Go to the official Node.js website:

Node.js

Download the LTS version for Windows and install it.

After installation, open Command Prompt or PowerShell and type:

node --version

You should see something similar to:

v20.x.x

Then:

npm --version

You should also get a version number.

If both commands work, Node.js is installed correctly.

3. Install PostgreSQL

The school platform needs a real database.

Install PostgreSQL from:

PostgreSQL

During installation, PostgreSQL will ask you to create a password for the postgres database user.

Remember that password.

For example, suppose you chose:

postgres

You can use that for local development.

PostgreSQL normally runs on:

localhost:5432
4. Create the database

Once PostgreSQL is installed, open pgAdmin.

You should see something similar to:

Servers
  └── PostgreSQL
       └── Databases

Right-click Databases → Create → Database.

Name it:

school_platform

Save it.

You now have:

PostgreSQL
   ↓
school_platform

This is where students, classes, results, alumni, news, etc. will eventually live.

5. Extract the school platform

Extract:

school-platform-full-stack.zip

For example, put it somewhere easy:

C:\school-platform

So you have:

C:\school-platform
6. Open the project in VS Code

I strongly recommend using Visual Studio Code.

Visual Studio Code

Open VS Code.

Choose:

File → Open Folder

and select:

C:\school-platform

You should see:

school-platform
│
├── prisma
├── public
├── server
├── package.json
├── README.md
└── .env.example
7. Create the .env file

This part is important.

Inside the project you have:

.env.example

Make a copy of it and rename the copy:

.env

So you now have:

.env
.env.example

Open .env.

You'll see something like:

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/school_platform?schema=public"
JWT_SECRET="replace-with-a-long-random-secret"
PORT=3000
SCHOOL_NAME="Your School Name"
NODE_ENV="development"

Change it to match your PostgreSQL password.

For example, if your PostgreSQL username is:

postgres

and password is:

mypassword

use:

DATABASE_URL="postgresql://postgres:mypassword@localhost:5432/school_platform?schema=public"
JWT_SECRET="put-a-long-random-secret-here"
PORT=3000
SCHOOL_NAME="Your Actual School Name"
NODE_ENV="development"

And replace:

Your Actual School Name

with the school's real name.

8. Open the terminal in VS Code

In VS Code, go to:

Terminal → New Terminal

You should get something like:

PS C:\school-platform>

This is where we'll run the application commands.

9. Install the application dependencies

Run:

npm install

This downloads the software the application needs.

You'll see packages being installed.

When it finishes, you should have:

node_modules/

inside the project.

10. Set up Prisma

Now run:

npx prisma generate

This creates the database client used by the application.

Then run:

npx prisma migrate dev --name init

This is a very important command.

It takes the database structure we designed:

Student
Class
Session
Enrollment
AcademicRecord
Alumni
News
Events
Gallery
Messages
Users
UpdateRequests
...

and actually creates those tables in PostgreSQL.

11. Add the initial school data

Now run:

npm run prisma:seed

This creates some initial data.

For example:

JSS 1
JSS 2
JSS 3
SS 1
SS 2
SS 3

and:

2026/2027

It also creates the first administrator.

12. Start the website

Now run:

npm run dev

You should see something similar to:

School platform running on http://localhost:3000

Open Chrome and go to:

http://localhost:3000