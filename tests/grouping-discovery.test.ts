import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { GroupingStore, type Profile } from "../src/server/grouping-store.js";
import { groupingDraft, moveMatch } from "../src/client/lib/groupingDraft.js";

test("sync discovers editable shared entries, protects stale drafts and remembers moved matches", { timeout: 20_000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), "graphrelay-discovery-"));
  const store = new GroupingStore(join(dir, "todo", "groupings"));
  store.save({ id: "sample", name: "Sample", grocery: false, ignoreQuantities: true, groups: [
    { name: "Produce", matches: [], matchPlurals: true }, { name: "Other", matches: [] },
  ] });
  store.save({ id: "unrelated", name: "Unrelated", grocery: false, groups: [{ name: "Other", matches: [] }] });
  const server = fork(fileURLToPath(new URL("./fixtures/grouping-discovery-server.mjs", import.meta.url)), {
    execArgv: ["--import", "tsx"],
    env: { ...process.env, DATA_DIR: dir, PORT: "0", PUBLIC_URL: "http://localhost:9304", APP_SECRET: "fixture", ADMIN_PASSWORD: "fixture", MICROSOFT_CLIENT_ID: "fixture", MICROSOFT_CLIENT_SECRET: "fixture" },
  });
  const exit = once(server, "exit");
  t.after(async () => { server.kill(); await exit; await rm(dir, { recursive: true, force: true }); });
  const [{ port }] = await Promise.race([
    once(server, "message", { signal: AbortSignal.timeout(5_000) }),
    exit.then(() => { throw new Error("Fixture exited before listening"); }),
  ]);
  const base = "http://127.0.0.1:" + port;
  const headers = { "Content-Type": "application/json", "X-GraphRelay": "1", cookie: "" };
  const login = await fetch(base + "/api/login", { method: "POST", headers, body: JSON.stringify({ username: "admin", password: "fixture" }) });
  assert.equal(login.status, 204);
  headers.cookie = login.headers.get("set-cookie")!.split(";")[0];
  async function get<T>(path: string): Promise<T> {
    const response = await fetch(base + "/api/" + path, { headers });
    assert.equal(response.status, 200);
    return response.json();
  }
  async function sync(id: string) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const response = await fetch(base + "/api/lists/" + id + "/sync", { method: "POST", headers });
      if (response.status === 409) { await delay(50); continue; }
      assert.equal(response.status, 204, await response.text());
      return;
    }
    assert.fail("List remained busy");
  }
  type ApiProfile = Profile & { revision: string };
  const profiles = () => get<ApiProfile[]>("grouping-profiles");
  for (const id of ["first", "second", "disabled", "unenrolled"]) await sync(id);
  const initial = (await profiles()).find(profile => profile.id === "sample")!;
  assert.deepEqual(initial.groups[1].matches, ["star fruit"]);
  await Promise.all([sync("first"), sync("second")]);
  assert.equal((await profiles()).find(profile => profile.id === "sample")!.revision, initial.revision);
  const added = once(server, "message", { signal: AbortSignal.timeout(5_000) });
  server.send("add");
  assert.deepEqual(await added, ["added", undefined]);
  await sync("first");
  let current = (await profiles()).find(profile => profile.id === "sample")!;
  assert.deepEqual(current.groups[1].matches, ["star fruit", "dragon fruit"]);
  const stale = await fetch(base + "/api/grouping-profiles/sample", { method: "PUT", headers, body: JSON.stringify(initial) });
  assert.equal(stale.status, 409);
  const draft = groupingDraft(current.groups);
  const moved = moveMatch(draft, "star fruit", draft[0].id);
  const save = await fetch(base + "/api/grouping-profiles/sample", {
    method: "PUT", headers, body: JSON.stringify({ name: current.name, revision: current.revision, allMatches: true, groups: moved }),
  });
  assert.equal(save.status, 200, await save.text());
  for (const id of ["first", "second"]) {
    await sync(id);
    const snapshot = await get<{ items: { id: string; title: string; aisle: string }[] }>("lists/" + id + "/items");
    const item = snapshot.items.find(item => item.id === "open")!;
    assert.equal(item.aisle, "Produce");
    assert.equal(item.title, id === "first" ? "01 Produce · Star fruit 500g" : "01 · Star fruit 500g");
  }
  current = (await profiles()).find(profile => profile.id === "sample")!;
  assert.deepEqual(current.groups[0].matches, ["star fruit"]);
  assert.deepEqual(current.groups[1].matches, ["dragon fruit"]);
  assert.deepEqual(store.read().find(profile => profile.id === "sample")!.groups, current.groups);
  assert.deepEqual(store.read().find(profile => profile.id === "unrelated")!.groups[0].matches, []);
});
