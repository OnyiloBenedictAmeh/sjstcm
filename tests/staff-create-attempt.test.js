import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const helperSource = await readFile(new URL("../public/js/staff-create-attempt.js", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../public/js/admin.js", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../public/admin/admin.html", import.meta.url), "utf8");

function createHarness() {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
  const context = { window: {} };
  vm.runInNewContext(helperSource, context);
  let sequence = 0;
  const create = actorId => context.window.StaffCreateAttempt.create({
    storage,
    actorId,
    createKey: () => `key-${++sequence}`
  });
  return { create, values };
}

test("network failures preserve the same key for retry", async () => {
  const { create } = createHarness();
  const attempt = create("admin-a");
  const firstKey = attempt.begin();
  await assert.rejects(Promise.reject(new Error("network failure")), /network failure/);
  assert.equal(attempt.begin(), firstKey);
});

test("409 responses preserve the same key for retry", async () => {
  const { create } = createHarness();
  const attempt = create("admin-a");
  const firstKey = attempt.begin();
  await assert.rejects(Promise.reject(new Error("409 conflict")), /409 conflict/);
  assert.equal(attempt.begin(), firstKey);
});

test("explicit abandonment starts a new attempt and persists its key", () => {
  const { create, values } = createHarness();
  const attempt = create("admin-a");
  const abandonedKey = attempt.begin();
  const newKey = attempt.abandon();
  assert.notEqual(newKey, abandonedKey);
  assert.equal(attempt.begin(), newKey);
  assert.equal([...values.values()][0], newKey);
});

test("separate administrators have isolated pending keys", () => {
  const { create, values } = createHarness();
  const adminA = create("admin-a");
  const adminB = create("admin-b");
  const keyA = adminA.begin();
  const keyB = adminB.begin();
  assert.notEqual(keyA, keyB);
  assert.equal(create("admin-a").begin(), keyA);
  assert.equal(create("admin-b").begin(), keyB);
  assert.equal(values.size, 2);
});

test("confirmed success clears only that administrator's pending key", () => {
  const { create, values } = createHarness();
  const attempt = create("admin-a");
  const createdKey = attempt.begin();
  attempt.complete();
  assert.equal(values.size, 0);
  assert.notEqual(attempt.begin(), createdKey);
});

test("admin form uses actor-scoped attempts and exposes abandonment only for create mode", () => {
  assert.match(adminSource, /actorId:\s*currentUser\?\.id/);
  assert.match(adminSource, /getStaffCreateAttempt\(\)\.begin\(\)/);
  assert.match(adminSource, /getStaffCreateAttempt\(\)\.complete\(\)/);
  assert.match(adminSource, /getStaffCreateAttempt\(\)\.abandon\(\)/);
  assert.match(adminSource, /if \(!id\) \{[\s\S]*?getStaffCreateAttempt\(\)\.complete\(\)/);
  assert.match(adminSource, /if \(!profile\) \{\s*getStaffCreateAttempt\(\)\.begin\(\);/);
  assert.match(adminSource, /abandonButton\.hidden = !canManage \|\| Boolean\(profile\)/);
  assert.match(htmlSource, /id="abandon-staff-create"/);
});

function createAbandonHandlerHarness(profileId = "") {
  const state = { pendingKey: "pending-key", abandonCalls: 0, resetCalls: 0, messages: [] };
  const form = { elements: { id: { value: profileId } } };
  const handlerStart = adminSource.indexOf('$("#abandon-staff-create")?.addEventListener("click", () => {');
  assert.notEqual(handlerStart, -1, "staff creation abandonment handler exists");
  const bodyStart = adminSource.indexOf("=> {", handlerStart) + "=> {".length;
  const bodyEnd = adminSource.indexOf("\n  });", bodyStart);
  assert.ok(bodyStart >= "=> {".length && bodyEnd > bodyStart, "staff abandonment handler body can be extracted");
  const handler = vm.runInNewContext(`(() => {${adminSource.slice(bodyStart, bodyEnd)}\n})`, {
    form,
    staffSaveInProgress: false,
    staffCanManage: () => true,
    getStaffCreateAttempt: () => ({ abandon() { state.abandonCalls += 1; state.pendingKey = "new-key"; } }),
    showStaffForm() { state.resetCalls += 1; form.elements.id.value = ""; },
    setMessage(_selector, message) { state.messages.push(message); },
    state
  });
  return { handler, state };
}

test("abandonment starts a new attempt and resets the form in create mode", () => {
  const { handler, state } = createAbandonHandlerHarness();
  handler();
  assert.equal(state.abandonCalls, 1);
  assert.equal(state.resetCalls, 1);
  assert.equal(state.pendingKey, "new-key");
  assert.match(state.messages[0], /new creation attempt is ready/);
});

test("abandonment leaves an edit form and pending creation key unchanged", () => {
  const { handler, state } = createAbandonHandlerHarness("staff-profile-1");
  handler();
  assert.equal(state.abandonCalls, 0);
  assert.equal(state.resetCalls, 0);
  assert.equal(state.pendingKey, "pending-key");
});
