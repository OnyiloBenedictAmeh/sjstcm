import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { registerPublicDirectoryRoutes } from "../server/public-directory-routes.js";

const events = [
  { id: "event-2", title: "Open Day", startsAt: new Date("2030-03-02T10:00:00Z"), endsAt: null, imageUrl: null },
  { id: "event-1", title: "Science Fair", startsAt: new Date("2030-02-01T10:00:00Z"), endsAt: new Date("2030-02-01T13:00:00Z"), imageUrl: "https://cdn.example.test/fair.jpg" }
];
const departments = [
  { id: "dept-1", name: "Technical Studies", description: "Practical learning", head: null, imageUrl: "https://cdn.example.test/technical.jpg" },
  { id: "dept-2", name: "Science", description: null, head: "A. Teacher", imageUrl: null }
];
let server, origin;
const prisma = {
  event: { findMany: async ({ orderBy }) => [...events].sort((a, b) => (a.startsAt - b.startsAt) * (orderBy.startsAt === "desc" ? -1 : 1)) },
  department: { findMany: async ({ orderBy }) => [...departments].sort((a, b) => a.name.localeCompare(b.name)), findFirst: async () => null }
};

before(async () => {
  const app = express(); registerPublicDirectoryRoutes(app, prisma);
  server = createServer(app); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

test("public Events API returns Admin-created event records ordered by start time", async () => {
  const response = await fetch(origin + "/api/events");
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.deepEqual(rows.map(row => row.title), ["Science Fair", "Open Day"]);
  assert.equal(rows[0].imageUrl, "https://cdn.example.test/fair.jpg");
  assert.equal("isPublished" in rows[0], false, "the existing Event model publishes records immediately");
});

test("public Departments API includes image URLs and retains the no-image record", async () => {
  const response = await fetch(origin + "/api/departments");
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.deepEqual(rows.map(row => row.name), ["Science", "Technical Studies"]);
  assert.equal(rows.find(row => row.id === "dept-1").imageUrl, "https://cdn.example.test/technical.jpg");
  assert.equal(rows.find(row => row.id === "dept-2").imageUrl, null);
});

test("public rendering covers event loading, empty and error states, department image fallback, and homepage overview", async () => {
  const [main, home, eventsPage, departmentsPage] = await Promise.all([
    readFile(new URL("../public/js/main.js", import.meta.url), "utf8"),
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/events.html", import.meta.url), "utf8"),
    readFile(new URL("../public/departments.html", import.meta.url), "utf8")
  ]);
  assert.match(main, /function eventEndTime\(event\)/);
  assert.match(main, /No upcoming events have been announced yet/);
  assert.match(main, /Events could not be loaded right now/);
  assert.match(eventsPage, /Loading events\.\.\./);
  assert.match(eventsPage, /id="past-events"/);
  assert.match(main, /department\.imageUrl/);
  assert.match(main, /department-card-fallback/);
  assert.match(main, /image\.addEventListener\("error"/);
  assert.match(departmentsPage, /id="departments-list"/);
  assert.match(home, /id="home-departments"/);
  assert.match(home, /id="events-list"/);
  assert.match(home, /id="news-list"/);
  assert.match(home, /results released by the school/);
});
