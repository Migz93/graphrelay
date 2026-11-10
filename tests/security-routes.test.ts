import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { GLOBAL_RATE_LIMIT } from "../src/server/rate-limit.js";

test("real routes share failed-attempt limits, preserve Microsoft callbacks and keep feed tokens out of logs", { timeout: 30_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "graphrelay-security-"));
  const server = fork(fileURLToPath(new URL("./fixtures/security-server.mjs", import.meta.url)), {
    execArgv: ["--import", "tsx"], silent: true,
    env: { ...process.env, DATA_DIR: directory, PORT: "0", PUBLIC_URL: "http://localhost:9304", TRUST_PROXY: "1",
      APP_SECRET: "fixture", ADMIN_PASSWORD: "", MICROSOFT_CLIENT_ID: "", MICROSOFT_CLIENT_SECRET: "" },
  });
  let logs = "";
  server.stdout!.on("data", chunk => { logs += chunk; });
  server.stderr!.on("data", chunk => { logs += chunk; });
  const exit = once(server, "exit");
  t.after(async () => { server.kill(); await exit; await rm(directory, { recursive: true, force: true }); });
  const [{ port }] = await Promise.race([
    once(server, "message", { signal: AbortSignal.timeout(10_000) }),
    exit.then(() => { throw new Error("Fixture exited before listening"); }),
  ]);
  const base = "http://127.0.0.1:" + port;
  const headers = { "Content-Type": "application/json", "X-GraphRelay": "1", Origin: "http://localhost:9304", "X-Forwarded-For": "192.0.2.1", cookie: "" };
  async function post(path: string, body: object) {
    const response = await fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
    await response.arrayBuffer();
    return response;
  }
  const credentials = { username: "fixture", password: "fixture-password" };
  assert.equal((await post("/api/setup", credentials)).status, 204);
  const login = await post("/api/login", credentials);
  assert.equal(login.status, 204);
  assert.match(login.headers.get("set-cookie")!, /SameSite=Lax/i);
  headers.cookie = login.headers.get("set-cookie")!.split(";")[0];
  const microsoft = await fetch(base + "/api/microsoft", { method: "PUT", headers, body: JSON.stringify({ clientId: "00000000-0000-4000-8000-000000000000", clientSecret: "fixture-secret" }) });
  assert.equal(microsoft.status, 204);
  const connect = await fetch(base + "/api/microsoft/connect", { method: "POST", headers });
  assert.equal(connect.status, 200);
  const authUrl = new URL((await connect.json()).url);
  assert.equal(authUrl.searchParams.get("redirect_uri"), "http://localhost:9304/api/microsoft/callback");
  const state = authUrl.searchParams.get("state")!;
  // Authentication failures on login and password-change consume one shared budget.
  for (let i = 0; i < 9; i++) assert.equal((await post("/api/login", { ...credentials, password: "wrong" })).status, 401);
  assert.equal((await post("/api/change-password", { currentPassword: "wrong", newPassword: "replacement", confirmPassword: "replacement" })).status, 400);
  const limited = await post("/api/login", credentials);
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get("retry-after"));
  // A GET callback is independent of the password-attempt limiter and custom write header.
  const callback = base + "/api/microsoft/callback?" + new URLSearchParams({ state, code: "fixture-code" });
  const callbackHeaders = { cookie: headers.cookie, "X-Forwarded-For": "192.0.2.1" };
  const completed = await fetch(callback, { headers: callbackHeaders, redirect: "manual" });
  assert.equal(completed.status, 302);
  assert.equal(completed.headers.get("location"), "/settings?tab=microsoft&connection=connected");
  const replay = await fetch(callback, { headers: callbackHeaders, redirect: "manual" });
  assert.equal(replay.headers.get("location"), "/settings?tab=microsoft&connection=failed&reason=session");
  const otherClient = await fetch(base + "/api/login", { method: "POST", headers: { ...headers, "X-Forwarded-For": "192.0.2.2" }, body: JSON.stringify(credentials) });
  assert.equal(otherClient.status, 204);
  // The public subscription router must also pass through the global limiter.
  const token = "a".repeat(64);
  const privateQuery = "private-query-value";
  const url = base + "/calendar-feeds/" + token + ".ics?code=" + privateQuery;
  const feedHeaders = { "X-Forwarded-For": "192.0.2.3" };
  for (let sent = 0; sent < GLOBAL_RATE_LIMIT.limit; sent += 100) {
    await Promise.all(Array.from({ length: Math.min(100, GLOBAL_RATE_LIMIT.limit - sent) }, async () => {
      const response = await fetch(url, { headers: feedHeaders });
      await response.arrayBuffer();
      assert.equal(response.status, 404);
    }));
  }
  const feedLimited = await fetch(url, { headers: feedHeaders });
  assert.equal(feedLimited.status, 429);
  assert.deepEqual(await feedLimited.json(), { error: "Too many requests. Please try again later." });
  server.kill();
  await exit;
  assert.match(logs, /Rate limit exceeded/);
  assert.doesNotMatch(logs, new RegExp(token + "|" + privateQuery + "|" + state + "|fixture-code"));
});
