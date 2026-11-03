import express from "express";
import session from "express-session";
import Database from "better-sqlite3";
import { ConfidentialClientApplication, CryptoProvider } from "@azure/msal-node";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { aisles, planTitles, type Mode } from "./ordering.js";

declare module "express-session" {
  interface SessionData {
    admin?: boolean;
    oauth?: { state: string; verifier: string; issued: number };
  }
}

const app = express();
app.disable("x-powered-by");
const env = process.env;
const origin = new URL(env.PUBLIC_URL ?? "http://localhost:9304").origin;
const redirectUri = origin + "/api/microsoft/callback";
const key = env.APP_SECRET ? createHash("sha256").update(env.APP_SECRET).digest() : undefined;
const configured = Boolean(key && env.ADMIN_PASSWORD && env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET);
const dataDir = env.DATA_DIR ?? "/config";
mkdirSync(dataDir, { recursive: true });
const db = new Database(resolve(dataDir, "graphrelay.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS lists (id TEXT PRIMARY KEY, name TEXT, mode TEXT, aisle_order TEXT);
  CREATE TABLE IF NOT EXISTS titles (list_id TEXT, task_id TEXT, base TEXT, applied TEXT, PRIMARY KEY(list_id, task_id));
  CREATE TABLE IF NOT EXISTS pending_titles (list_id TEXT, task_id TEXT, base TEXT, applied TEXT, PRIMARY KEY(list_id, task_id));
  CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY, list_id TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP, message TEXT);
`);
function read(key: string) {
  return (db.prepare("SELECT value FROM state WHERE key = ?").get(key) as { value: string } | undefined)?.value;
}
function write(key: string, value: string) {
  db.prepare("INSERT OR REPLACE INTO state VALUES (?, ?)").run(key, value);
}
function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key!, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
function decrypt(value: string) {
  const raw = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key!, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
const msal = configured ? new ConfidentialClientApplication({
  auth: {
    clientId: env.MICROSOFT_CLIENT_ID!,
    clientSecret: env.MICROSOFT_CLIENT_SECRET!,
    authority: "https://login.microsoftonline.com/common",
  },
  cache: { cachePlugin: {
    async beforeCacheAccess(context) {
      const cache = read("cache");
      if (cache) context.tokenCache.deserialize(decrypt(cache));
    },
    async afterCacheAccess(context) {
      if (context.cacheHasChanged) write("cache", encrypt(context.tokenCache.serialize()));
    },
  } },
}) : undefined;
const scopes = ["openid", "profile", "offline_access", "Tasks.ReadWrite"];

let tokenRequest: Promise<string> | undefined;
async function accessToken() {
  if (!msal) throw new Error("Microsoft connection is unavailable.");
  const account = await msal.getTokenCache().getAccountByHomeId(read("account") ?? "");
  if (!account) throw new Error("Connect Microsoft in Settings.");
  return (await msal.acquireTokenSilent({ account, scopes })).accessToken;
}
async function graph<T>(path: string, body?: object): Promise<T> {
  const url = new URL(path, "https://graph.microsoft.com/v1.0/");
  if (url.origin !== "https://graph.microsoft.com" || !url.pathname.startsWith("/v1.0/me/todo/")) throw new Error("Invalid Graph URL.");
  tokenRequest ??= accessToken().finally(() => { tokenRequest = undefined; });
  const response = await fetch(url, {
    method: body ? "PATCH" : "GET",
    headers: { Authorization: "Bearer " + await tokenRequest, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Microsoft Graph returned " + response.status + ".");
  return await response.json() as T;
}
async function collection<T>(path: string) {
  const values: T[] = [];
  let next: string | undefined = path;
  while (next) {
    const page: { value: T[]; "@odata.nextLink"?: string } = await graph(next);
    values.push(...page.value);
    next = page["@odata.nextLink"];
  }
  return values;
}
type GraphList = { id: string; displayName: string; isShared: boolean; isOwner: boolean };
type Enrolled = { id: string; name: string; mode: Mode; aisle_order: string };
type Task = { id: string; title: string; status: string };
const getLists = () => collection<GraphList>("me/todo/lists");
const active = new Set<string>();
function log(listId: string, message: string) {
  db.prepare("INSERT INTO activity (list_id, message) VALUES (?, ?)").run(listId, message);
  db.prepare("DELETE FROM activity WHERE list_id = ? AND id NOT IN (SELECT id FROM activity WHERE list_id = ? ORDER BY id DESC LIMIT 200)").run(listId, listId);
}
async function run(list: Enrolled) {
  if (active.has(list.id)) return;
  active.add(list.id);
  try {
    const path = "me/todo/lists/" + encodeURIComponent(list.id) + "/tasks";
    const tasks = (await collection<Task>(path)).filter(task => task.status !== "completed");
    const stored = db.prepare("SELECT task_id, base, applied FROM titles WHERE list_id = ?").all(list.id) as { task_id: string; base: string; applied: string }[];
    const originals = Object.fromEntries(stored.map(row => [row.task_id, row]));
    const pending = db.prepare("SELECT task_id, base, applied FROM pending_titles WHERE list_id = ?").all(list.id) as typeof stored;
    const recover = new Map(pending.map(row => [row.task_id, row]));
    for (const task of tasks) {
      const interrupted = recover.get(task.id);
      if (interrupted?.applied !== task.title) continue;
      originals[task.id] = interrupted;
      db.prepare("INSERT OR REPLACE INTO titles VALUES (?, ?, ?, ?)").run(list.id, task.id, interrupted.base, interrupted.applied);
      db.prepare("DELETE FROM pending_titles WHERE list_id = ? AND task_id = ?").run(list.id, task.id);
    }
    let changed = 0;
    for (const task of planTitles(tasks, list.mode, JSON.parse(list.aisle_order), originals)) {
      if (task.title === task.next) continue;
      const taskPath = path + "/" + encodeURIComponent(task.id);
      const current = await graph<Task>(taskPath);
      if (current.title !== task.title || current.status === "completed") continue;
      db.prepare("INSERT OR REPLACE INTO pending_titles VALUES (?, ?, ?, ?)").run(list.id, task.id, task.base, task.next);
      await graph(taskPath, { title: task.next });
      if (list.mode === "off") {
        db.prepare("DELETE FROM titles WHERE list_id = ? AND task_id = ?").run(list.id, task.id);
      } else {
        db.prepare("INSERT OR REPLACE INTO titles VALUES (?, ?, ?, ?)").run(list.id, task.id, task.base, task.next);
      }
      db.prepare("DELETE FROM pending_titles WHERE list_id = ? AND task_id = ?").run(list.id, task.id);
      log(list.id, task.title + " → " + task.next);
      changed++;
    }
    write("last:" + list.id, new Date().toISOString());
    write("error:" + list.id, "");
    return changed;
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Microsoft Graph returned") ? error.message : "Run failed. Check the Microsoft connection.";
    if (read("error:" + list.id) !== message) log(list.id, message);
    write("error:" + list.id, message);
    throw new Error(message);
  } finally {
    active.delete(list.id);
  }
}
let sweeping = false;
setInterval(async () => {
  if (!configured || !read("account") || sweeping) return;
  sweeping = true;
  try {
    for (const list of db.prepare("SELECT * FROM lists").all() as Enrolled[]) {
      if (list.mode !== "off" || read("error:" + list.id)) await run(list).catch(() => undefined);
    }
  } finally {
    sweeping = false;
  }
}, 90_000).unref();

if (env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(express.json({ limit: "16kb" }));
app.use(session({
  secret: env.APP_SECRET ?? randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:") },
}));
app.get("/api/health", (_req, res) => { res.json({ ok: true }); });
app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.get("/api/session", (req, res) => { res.json({ configured, signedIn: !!req.session.admin }); });
app.use("/api", (req, res, next) => {
  if (req.method !== "GET" && req.get("X-GraphRelay") !== "1") {
    res.sendStatus(403);
    return;
  }
  next();
});
let failures = 0;
let resetAt = 0;
app.post("/api/login", (req, res, next) => {
  if (!configured) { res.sendStatus(503); return; }
  if (Date.now() > resetAt) { failures = 0; resetAt = Date.now() + 60_000; }
  if (failures >= 10) { res.sendStatus(429); return; }
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (typeof req.body.password !== "string" || !timingSafeEqual(digest(req.body.password), digest(env.ADMIN_PASSWORD!))) {
    failures++;
    res.sendStatus(401);
    return;
  }
  req.session.regenerate(error => {
    if (error) { next(error); return; }
    req.session.admin = true;
    res.sendStatus(204);
  });
});
app.use("/api", (req, res, next) => {
  if (!req.session.admin) { res.sendStatus(401); return; }
  next();
});
app.post("/api/logout", (req, res, next) => {
  req.session.destroy(error => {
    if (error) { next(error); return; }
    res.sendStatus(204);
  });
});
app.get("/api/microsoft", (_req, res) => { res.json({ account: read("username") ?? null, redirectUri }); });
app.post("/api/microsoft/connect", async (req, res) => {
  const state = randomBytes(32).toString("hex");
  const pkce = await new CryptoProvider().generatePkceCodes();
  req.session.oauth = { state, verifier: pkce.verifier, issued: Date.now() };
  const url = await msal!.getAuthCodeUrl({ scopes, redirectUri, state, codeChallenge: pkce.challenge, codeChallengeMethod: "S256", prompt: "select_account" });
  res.json({ url });
});
app.get("/api/microsoft/callback", async (req, res) => {
  const pending = req.session.oauth;
  delete req.session.oauth;
  if (!pending || Date.now() - pending.issued > 600_000 || req.query.state !== pending.state || typeof req.query.code !== "string") {
    res.redirect("/settings?connection=failed");
    return;
  }
  try {
    const result = await msal!.acquireTokenByCode({ code: req.query.code, scopes, redirectUri, codeVerifier: pending.verifier });
    if (!result.account) throw new Error("Missing Microsoft account.");
    const current = read("account");
    if (current && current !== result.account.homeAccountId && db.prepare("SELECT 1 FROM lists LIMIT 1").get()) {
      res.redirect("/settings?connection=wrong-account");
      return;
    }
    write("account", result.account.homeAccountId);
    write("username", result.account.username || "Microsoft account");
    res.redirect("/settings");
  } catch {
    res.redirect("/settings?connection=failed");
  }
});
app.get("/api/lists", async (_req, res) => {
  const lists = await getLists();
  const enrolled = new Map((db.prepare("SELECT * FROM lists").all() as Enrolled[]).map(list => [list.id, list]));
  res.json(lists.map(list => ({
    ...list, enrolled: enrolled.has(list.id), mode: enrolled.get(list.id)?.mode ?? "named",
    order: JSON.parse(enrolled.get(list.id)?.aisle_order ?? JSON.stringify(aisles)),
    lastRun: read("last:" + list.id), error: read("error:" + list.id),
  })));
});
app.put("/api/lists/:id", async (req, res) => {
  const { mode, order } = req.body;
  if (!["named", "number", "off"].includes(mode) || !Array.isArray(order) || order.length !== aisles.length || !aisles.every(aisle => order.includes(aisle))) {
    res.status(400).json({ error: "Choose a prefix style and include each aisle once." });
    return;
  }
  const list = (await getLists()).find(list => list.id === req.params.id);
  if (!list) { res.sendStatus(404); return; }
  if (active.has(list.id)) { res.status(409).json({ error: "Wait for the current run to finish." }); return; }
  db.prepare("INSERT OR REPLACE INTO lists VALUES (?, ?, ?, ?)").run(list.id, list.displayName, mode, JSON.stringify(order));
  await run({ id: list.id, name: list.displayName, mode, aisle_order: JSON.stringify(order) });
  res.sendStatus(204);
});
app.get("/api/lists/:id/activity", (req, res) => {
  res.json(db.prepare("SELECT created, message FROM activity WHERE list_id = ? ORDER BY id DESC LIMIT 100").all(req.params.id));
});
app.use("/api", (_req, res) => { res.sendStatus(404); });
const client = resolve("dist/client");
app.use(express.static(client));
app.get(/.*/, (_req, res) => { res.sendFile(resolve(client, "index.html")); });
const handleError: express.ErrorRequestHandler = (error: Error, _req, res, _next) => {
  const message = error.message.startsWith("Microsoft Graph returned") || error.message.startsWith("Run failed")
    ? error.message : "Request failed. Check your Microsoft connection and try again.";
  res.status(502).json({ error: message });
};
app.use(handleError);
app.listen(Number(env.PORT ?? 9304));
