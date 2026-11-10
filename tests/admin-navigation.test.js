import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, js, css] = await Promise.all([
  readFile(new URL("../public/admin/admin.html", import.meta.url), "utf8"),
  readFile(new URL("../public/js/admin.js", import.meta.url), "utf8"),
  readFile(new URL("../public/css/admin.css", import.meta.url), "utf8")
]);

test("Admin navigation has unique IDs and a matching section for every navigation target", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, "Admin HTML must not contain duplicate IDs");
  const navTargets = [...html.matchAll(/class="admin-nav-item[^\"]*"[^>]*data-section="([^"]+)"|data-section="([^"]+)"[^>]*class="admin-nav-item[^\"]*"/g)]
    .map(match => match[1] || match[2]);
  assert.ok(navTargets.length > 0, "navigation targets should be discoverable");
  for (const target of navTargets) assert.ok(ids.includes(`section-${target}`), `missing section-${target}`);
  assert.match(js, /results:\s*\{\s*title:\s*"Results"\s*\}/, "Results needs navigation metadata before openSection can activate it");
  assert.match(js, /item\.id\s*===\s*`section-\$\{section\}`/, "section activation should follow the selected data-section target");
  assert.match(js, /item\.dataset\.section\s*===\s*section/, "navigation active state should follow the selected section");
});

test("Results navigation retains permission gates and has responsive shared control styling", () => {
  assert.match(js, /section === "results"[^\n]*alumniCan\("ACADEMICS_MANAGE"\)[^\n]*alumniCan\("RESULTS_REVIEW"\)[^\n]*alumniCan\("RESULTS_ENTRY"\)/);
  assert.match(html, /data-section="results"/);
  assert.match(html, /id="section-results"/);
  assert.match(css, /\.admin-body input:not\(\[type="checkbox"\]\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 600px\)/);
});
