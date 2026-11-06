import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

test("large duplicate cleanup keeps protected copies and reports progress after reopening", { timeout: 20_000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), "graphrelay-cleanup-"));
  const server = fork(fileURLToPath(new URL("./fixtures/graph-server.mjs", import.meta.url)), {
    execArgv: ["--import", "tsx"],
    env: {
      ...process.env, DATA_DIR: dir, PORT: "0", PUBLIC_URL: "http://localhost:9304",
      APP_SECRET: "fixture", ADMIN_PASSWORD: "fixture", MICROSOFT_CLIENT_ID: "fixture", MICROSOFT_CLIENT_SECRET: "fixture",
    },
  });
  const exit = once(server, "exit");
  t.after(async () => {
    server.kill();
    await exit;
    await rm(dir, { recursive: true, force: true });
  });
  const [{ port }] = await Promise.race([
    once(server, "message", { signal: AbortSignal.timeout(5_000) }),
    exit.then(() => { throw new Error("Fixture server exited before listening"); }),
  ]);
  const base = "http://127.0.0.1:" + port;
  const headers = { "Content-Type": "application/json", "X-GraphRelay": "1", cookie: "" };
  const login = await fetch(base + "/api/login", { method: "POST", headers, body: JSON.stringify({ username: "admin", password: "fixture" }) });
  assert.equal(login.status, 204);
  headers.cookie = login.headers.get("set-cookie")!.split(";")[0];
  const path = "/api/lists/fixture/duplicates";
  async function get(suffix = "") {
    const response = await fetch(base + path + suffix, { headers });
    assert.equal(response.status, 200);
    return response.json();
  }
  async function waitFor<T>(load: () => Promise<T>, ready: (value: T) => boolean) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const value = await load();
      if (ready(value)) return value;
      await delay(50);
    }
    assert.fail("Timed out waiting for the cleanup state");
  }
  const preview = await waitFor(get, value => !!value.syncedAt);
  const group = preview.groups[0] as {
    key: string; keep: { id: string; completed: boolean };
    copies: { id: string; completed: boolean; flags: string[] }[];
  };
  const protectedCopies = group.copies.filter(copy => copy.flags.length);
  assert.equal(protectedCopies.length, 2);
  assert.equal(group.keep.completed, false);
  const proposed = group.copies.filter(copy => !copy.flags.length).map(copy => ({
    id: copy.id, key: group.key, keepId: group.keep.id, completed: copy.completed, keepCompleted: group.keep.completed,
  }));
  assert.equal(proposed.length, 266);
  const body = JSON.stringify({ proposed, background: true });
  assert.ok(Buffer.byteLength(body) > 16 * 1024);
  const oversized = await fetch(base + path + "/remove", { method: "POST", headers, body: JSON.stringify({ padding: "x".repeat(512 * 1024) }) });
  assert.equal(oversized.status, 413);
  assert.match((await oversized.json()).error, /size limit/);
  const accepted = await fetch(base + path + "/remove", { method: "POST", headers, body });
  assert.equal(accepted.status, 202);
  assert.deepEqual(await accepted.json(), { status: "running", processed: 0, total: 266 });
  const status = () => get("/progress");
  assert.deepEqual(await waitFor(status, value => value?.processed === 1), { status: "running", processed: 1, total: 266 });
  server.send("resume");
  // A fresh status request can recover the outcome without the original POST or a run ID.
  const totals = await waitFor(status, value => value?.status === "finished");
  assert.deepEqual(totals, { status: "finished", removed: 264, skipped: 1, failed: 1 });
  assert.deepEqual(await status(), totals);
  const remaining = (await get()).groups[0];
  assert.equal(remaining.keep.id, group.keep.id);
  assert.equal(remaining.copies.length, 4);
  for (const copy of protectedCopies) assert.ok(remaining.copies.some((item: { id: string }) => item.id === copy.id));
});
