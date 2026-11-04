import express from "express";
import session from "express-session";
import Database from "better-sqlite3";
import { ConfidentialClientApplication, CryptoProvider } from "@azure/msal-node";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { duplicateGroups } from "./duplicates.js";
import { aisles, itemKey, planTitles, type Mode } from "./ordering.js";

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
const dataDir = env.DATA_DIR ?? "/config";
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const keyFile = resolve(dataDir, "setup.key");
function loadKey() {
  if (env.APP_SECRET) return createHash("sha256").update(env.APP_SECRET).digest();
  try {
    return readFileSync(keyFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const generated = randomBytes(32);
    writeFileSync(keyFile, generated, { mode: 0o600, flag: "wx" });
    return generated;
  }
}
const key = loadKey();
const db = new Database(resolve(dataDir, "graphrelay.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS lists (id TEXT PRIMARY KEY, name TEXT, mode TEXT, aisle_order TEXT);
  CREATE TABLE IF NOT EXISTS titles (list_id TEXT, task_id TEXT, base TEXT, applied TEXT, PRIMARY KEY(list_id, task_id));
  CREATE TABLE IF NOT EXISTS pending_titles (list_id TEXT, task_id TEXT, base TEXT, applied TEXT, PRIMARY KEY(list_id, task_id));
  CREATE TABLE IF NOT EXISTS aisle_corrections (list_id TEXT, item_key TEXT, aisle TEXT NOT NULL, PRIMARY KEY(list_id, item_key));
  CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY, list_id TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP, message TEXT);
`);
if (!(db.pragma("table_info(lists)") as { name: string }[]).some(column => column.name === "auto_cleanup")) {
  db.exec("ALTER TABLE lists ADD COLUMN auto_cleanup INTEGER NOT NULL DEFAULT 0");
}
function read(key: string) {
  return (db.prepare("SELECT value FROM state WHERE key = ?").get(key) as { value: string } | undefined)?.value;
}
function write(key: string, value: string) {
  db.prepare("INSERT OR REPLACE INTO state VALUES (?, ?)").run(key, value);
}
function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
function decrypt(value: string) {
  const raw = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
function microsoftClient(clientId: string, clientSecret: string) {
  return new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
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
  });
}
type Setup = { clientId?: string; clientSecret?: string; salt: string; passwordHash: string };
const savedSetup = read("setup");
let setup = savedSetup ? JSON.parse(decrypt(savedSetup)) as Setup : undefined;
const legacySetup = Boolean(env.APP_SECRET && env.ADMIN_PASSWORD && env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET);
const adminConfigured = () => !!setup || legacySetup;
let msal = setup?.clientId && setup.clientSecret
  ? microsoftClient(setup.clientId, setup.clientSecret)
  : legacySetup ? microsoftClient(env.MICROSOFT_CLIENT_ID!, env.MICROSOFT_CLIENT_SECRET!) : undefined;
const scopes = ["openid", "profile", "offline_access", "Tasks.ReadWrite"];

let tokenRequest: Promise<string> | undefined;
async function accessToken() {
  if (!msal) throw new Error("Microsoft connection is unavailable.");
  const account = await msal.getTokenCache().getAccountByHomeId(read("account") ?? "");
  if (!account || !read("username")) throw new Error("Connect Microsoft in Settings.");
  return (await msal.acquireTokenSilent({ account, scopes })).accessToken;
}
async function graph<T = void>(path: string, body?: object, method = body ? "PATCH" : "GET"): Promise<T> {
  const url = new URL(path, "https://graph.microsoft.com/v1.0/");
  if (url.origin !== "https://graph.microsoft.com" || !url.pathname.startsWith("/v1.0/me/todo/")) throw new Error("Invalid Graph URL.");
  tokenRequest ??= accessToken().finally(() => { tokenRequest = undefined; });
  const response = await fetch(url, {
    method,
    headers: { Authorization: "Bearer " + await tokenRequest, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Microsoft Graph returned " + response.status + ".");
  return response.status === 204 ? undefined as T : await response.json() as T;
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
type Enrolled = { id: string; name: string; mode: Mode; aisle_order: string; auto_cleanup: number };
type Task = {
  id: string;
  title: string;
  status: string;
  createdDateTime?: string;
  completedDateTime?: { dateTime: string };
  body?: { content?: string };
  hasAttachments?: boolean;
  lastModifiedDateTime?: string;
};
const getLists = () => collection<GraphList>("me/todo/lists");
const directoryKey = "todo-directory";
function localDirectory(): GraphList[] {
  return JSON.parse(read(directoryKey) ?? "[]");
}
let directoryError = "";
let directorySync: Promise<void> | undefined;
function syncDirectory() {
  directorySync ??= refreshDirectory().finally(() => { directorySync = undefined; });
  return directorySync;
}
async function refreshDirectory() {
  const account = read("account");
  const client = msal;
  try {
    const lists = await getLists();
    if (client !== msal || account !== read("account")) return;
    db.transaction(() => {
      write(directoryKey, JSON.stringify(lists));
      const rename = db.prepare("UPDATE lists SET name = ? WHERE id = ?");
      for (const list of lists) rename.run(list.displayName, list.id);
    })();
    directoryError = "";
  } catch {
    if (client === msal && account === read("account")) directoryError = "Microsoft lists could not be refreshed. Showing the last synced data.";
  }
}
const active = new Set<string>();
function log(listId: string, message: string) {
  db.prepare("INSERT INTO activity (list_id, message) VALUES (?, ?)").run(listId, message);
  db.prepare("DELETE FROM activity WHERE list_id = ? AND id NOT IN (SELECT id FROM activity WHERE list_id = ? ORDER BY id DESC LIMIT 200)").run(listId, listId);
}
function taskPath(listId: string) {
  return "me/todo/lists/" + encodeURIComponent(listId) + "/tasks";
}
function planList(list: Enrolled, tasks: Task[], recoverTitles = false) {
  const stored = db.prepare("SELECT task_id, base, applied FROM titles WHERE list_id = ?").all(list.id) as { task_id: string; base: string; applied: string }[];
  const originals = Object.fromEntries(stored.map(row => [row.task_id, row]));
  const pending = db.prepare("SELECT task_id, base, applied FROM pending_titles WHERE list_id = ?").all(list.id) as typeof stored;
  const recover = new Map(pending.map(row => [row.task_id, row]));
  for (const task of tasks) {
    const interrupted = recover.get(task.id);
    if (interrupted?.applied !== task.title) continue;
    originals[task.id] = interrupted;
    if (!recoverTitles) continue;
    db.prepare("INSERT OR REPLACE INTO titles VALUES (?, ?, ?, ?)").run(list.id, task.id, interrupted.base, interrupted.applied);
    db.prepare("DELETE FROM pending_titles WHERE list_id = ? AND task_id = ?").run(list.id, task.id);
  }
  const rows = db.prepare("SELECT item_key, aisle FROM aisle_corrections WHERE list_id = ?").all(list.id) as { item_key: string; aisle: string }[];
  const corrections = new Map(rows.map(row => [row.item_key, row.aisle]));
  return planTitles(tasks, list.mode, JSON.parse(list.aisle_order), originals, corrections);
}
async function run(list: Enrolled, includeCleanup = false) {
  if (active.has(list.id)) return;
  active.add(list.id);
  try {
    const path = taskPath(list.id);
    const tasks = await collection<Task>(path);
    let changed = 0;
    for (const task of planList(list, tasks.filter(task => task.status !== "completed"), true)) {
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
    const cleanup = includeCleanup && list.auto_cleanup ? await removeDuplicates(list) : undefined;
    await syncSnapshot(list, changed || cleanup?.removed || cleanup?.failed ? undefined : tasks);
    if (cleanup?.failed) throw new Error("Run failed. Automatic duplicate cleanup could not remove " + cleanup.failed + " copies.");
    write("last:" + list.id, new Date().toISOString());
    write("error:" + list.id, "");
    return changed;
  } catch (error) {
    const message = error instanceof Error && (error.message.startsWith("Microsoft Graph returned") || error.message.startsWith("Run failed")) ? error.message : "Run failed. Check the Microsoft connection.";
    if (read("error:" + list.id) !== message) log(list.id, message);
    write("error:" + list.id, message);
    throw new Error(message);
  } finally {
    active.delete(list.id);
  }
}
const pollingOptions = [1, 2, 5, 10, 30, 60];
const pollingKey = "polling-minutes";
function pollingMinutes() {
  return Number(read(pollingKey) ?? 1);
}
let sweeping = false;
let pollTimer: NodeJS.Timeout | undefined;
function schedulePoll(delay = pollingMinutes() * 60_000) {
  clearTimeout(pollTimer);
  if (!sweeping) pollTimer = setTimeout(pollLists, delay).unref();
}
async function pollLists() {
  sweeping = true;
  try {
    if (!msal || !read("account") || !read("username")) return;
    const directory = syncDirectory();
    for (const { id } of db.prepare("SELECT id FROM lists").all() as { id: string }[]) {
      const list = enrolledList(id);
      if (list) await run(list, true).catch(() => undefined);
    }
    await directory;
  } finally {
    sweeping = false;
    schedulePoll();
  }
}
schedulePoll(0);

if (env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(express.json({ limit: "16kb" }));
app.use(session({
  secret: createHash("sha256").update(key).update("session").digest("hex"),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:") },
}));
app.get("/api/health", (_req, res) => { res.json({ ok: true }); });
app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
const build = {
  version: (JSON.parse(readFileSync(resolve("package.json"), "utf8")) as { version: string }).version,
  channel: env.BUILD_CHANNEL ?? "custom",
  revision: env.COMMIT_SHA ?? "local",
};
app.get("/api/session", (req, res) => { res.json({ configured: adminConfigured(), signedIn: !!req.session.admin, ...(req.session.admin ? { build } : {}) }); });
app.use("/api", (req, res, next) => {
  if (req.method !== "GET" && req.get("X-GraphRelay") !== "1") {
    res.sendStatus(403);
    return;
  }
  next();
});
app.post("/api/setup", (req, res) => {
  if (adminConfigured()) { res.sendStatus(409); return; }
  if (req.get("Origin") !== origin) { res.sendStatus(403); return; }
  const { password } = req.body ?? {};
  if (typeof password !== "string" || !password.trim() || password.length > 256) {
    res.status(400).json({ error: "Enter an admin password of up to 256 characters." });
    return;
  }
  const salt = randomBytes(16).toString("hex");
  const configuration = { salt, passwordHash: scryptSync(password, salt, 32).toString("hex") };
  write("setup", encrypt(JSON.stringify(configuration)));
  setup = configuration;
  res.sendStatus(204);
});
let failures = 0;
let resetAt = 0;
app.post("/api/login", (req, res, next) => {
  if (!adminConfigured()) { res.sendStatus(503); return; }
  if (Date.now() > resetAt) { failures = 0; resetAt = Date.now() + 60_000; }
  if (failures >= 10) { res.sendStatus(429); return; }
  const password = req.body?.password;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const valid = typeof password === "string" && password.length <= 1024 && (setup
    ? timingSafeEqual(scryptSync(password, setup.salt, 32), Buffer.from(setup.passwordHash, "hex"))
    : timingSafeEqual(digest(password), digest(env.ADMIN_PASSWORD!)));
  if (!valid) {
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
app.get("/api/microsoft", (_req, res) => { res.json({ account: read("username") ?? null, redirectUri, clientId: setup?.clientId ?? (legacySetup ? env.MICROSOFT_CLIENT_ID : null), editable: !!setup }); });
app.put("/api/microsoft", (req, res) => {
  if (req.get("Origin") !== origin) { res.sendStatus(403); return; }
  if (!setup) { res.sendStatus(409); return; }
  const clientId = typeof req.body?.clientId === "string" ? req.body.clientId.trim().toLowerCase() : "";
  const clientSecret = typeof req.body?.clientSecret === "string" ? req.body.clientSecret.trim() : "";
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(clientId) || !clientSecret || clientSecret.length > 1024) {
    res.status(400).json({ error: "Enter the Application (client) ID and client secret value from Microsoft Entra." });
    return;
  }
  const configuration = { ...setup, clientId, clientSecret };
  const client = microsoftClient(clientId, clientSecret);
  db.transaction(() => {
    write("setup", encrypt(JSON.stringify(configuration)));
    if (setup?.clientId?.toLowerCase() !== clientId) {
      db.prepare("DELETE FROM state WHERE key IN ('cache', 'username', 'todo-directory')").run();
    }
  })();
  setup = configuration;
  msal = client;
  delete req.session.oauth;
  res.sendStatus(204);
});
app.post("/api/microsoft/connect", async (req, res) => {
  if (!msal) { res.status(409).json({ error: "Save your Microsoft app credentials first." }); return; }
  const state = randomBytes(32).toString("hex");
  const pkce = await new CryptoProvider().generatePkceCodes();
  req.session.oauth = { state, verifier: pkce.verifier, issued: Date.now() };
  const url = await msal!.getAuthCodeUrl({ scopes, redirectUri, state, codeChallenge: pkce.challenge, codeChallengeMethod: "S256", prompt: "select_account" });
  res.json({ url });
});
app.get("/api/microsoft/callback", async (req, res) => {
  const pending = req.session.oauth;
  delete req.session.oauth;
  if (typeof req.query.error === "string" && pending && req.query.state === pending.state) {
    const code = /^[a-z_]{1,50}$/.test(req.query.error) ? req.query.error : "unknown";
    const detail = typeof req.query.error_description === "string" ? req.query.error_description.match(/AADSTS[0-9]{4,10}/)?.[0] : undefined;
    console.warn("Microsoft authorization rejected", detail ?? code);
    res.redirect("/settings?connection=failed&reason=" + (detail ?? code));
    return;
  }
  if (!pending || Date.now() - pending.issued > 600_000 || req.query.state !== pending.state || typeof req.query.code !== "string") {
    res.redirect("/settings?connection=failed&reason=session");
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
    schedulePoll(0);
    res.redirect("/settings");
  } catch (error) {
    const detail = error instanceof Error ? error.message.match(/AADSTS[0-9]{4,10}/)?.[0] : undefined;
    const reason = detail ?? "token-exchange";
    console.warn("Microsoft token exchange failed", reason);
    res.redirect("/settings?connection=failed&reason=" + reason);
  }
});
app.get("/api/polling", (_req, res) => {
  res.json({ minutes: pollingMinutes(), options: pollingOptions });
});
app.put("/api/polling", (req, res) => {
  const { minutes } = req.body ?? {};
  if (!pollingOptions.includes(minutes)) {
    res.status(400).json({ error: "Choose a supported polling interval." });
    return;
  }
  if (minutes !== pollingMinutes()) {
    write(pollingKey, String(minutes));
    schedulePoll();
  }
  res.sendStatus(204);
});
app.get("/api/lists", (_req, res) => {
  const enrolled = db.prepare("SELECT * FROM lists").all() as Enrolled[];
  const directory = new Map(localDirectory().map(list => [list.id, list]));
  const lists = enrolled.map(list => ({
    id: list.id, displayName: list.name, isShared: directory.get(list.id)?.isShared,
    enrolled: true, mode: list.mode, order: JSON.parse(list.aisle_order), autoCleanup: !!list.auto_cleanup,
    lastRun: read("last:" + list.id), error: read("error:" + list.id),
  }));
  res.json(lists);
});
app.get("/api/list-directory", (_req, res) => {
  const enrolled = new Set((db.prepare("SELECT id FROM lists").all() as { id: string }[]).map(list => list.id));
  const lists = localDirectory().filter(list => !enrolled.has(list.id)).map(list => ({
    ...list, enrolled: false, mode: "named", order: aisles, autoCleanup: false,
  }));
  res.json({ lists, directoryReady: read(directoryKey) !== undefined, directoryError, syncing: !!directorySync, connected: !!read("username") });
});
app.post("/api/list-directory/refresh", (_req, res) => {
  if (!msal || !read("username")) { res.sendStatus(409); return; }
  void syncDirectory();
  res.sendStatus(204);
});
app.put("/api/lists/:id", async (req, res) => {
  const { mode, order, autoCleanup } = req.body ?? {};
  if (autoCleanup !== undefined && typeof autoCleanup !== "boolean") {
    res.status(400).json({ error: "Automatic cleanup must be on or off." });
    return;
  }
  if (!["named", "number", "off"].includes(mode) || !Array.isArray(order) || order.length !== aisles.length || !aisles.every(aisle => order.includes(aisle))) {
    res.status(400).json({ error: "Choose a prefix style and include each aisle once." });
    return;
  }
  const existing = enrolledList(req.params.id);
  const list = existing ? { id: existing.id, displayName: existing.name } : localDirectory().find(list => list.id === req.params.id);
  if (!list) { res.sendStatus(404); return; }
  if (active.has(list.id)) { res.status(409).json({ error: "Wait for the current run to finish." }); return; }
  const autoCleanupValue = autoCleanup === undefined ? enrolledList(list.id)?.auto_cleanup ?? 0 : Number(autoCleanup);
  const aisleOrder = JSON.stringify(order);
  db.prepare("INSERT OR REPLACE INTO lists (id, name, mode, aisle_order, auto_cleanup) VALUES (?, ?, ?, ?, ?)").run(list.id, list.displayName, mode, aisleOrder, autoCleanupValue);
  await run({ id: list.id, name: list.displayName, mode, aisle_order: aisleOrder, auto_cleanup: autoCleanupValue });
  res.sendStatus(204);
});
function enrolledList(id: string) {
  return db.prepare("SELECT * FROM lists WHERE id = ?").get(id) as Enrolled | undefined;
}
app.post("/api/lists/:id/sync", async (req, res) => {
  const list = enrolledList(req.params.id);
  if (!list) { res.sendStatus(404); return; }
  if (active.has(list.id)) {
    res.status(409).json({ error: "This list is already syncing. Try again when it finishes." });
    return;
  }
  await run(list, true);
  res.sendStatus(204);
});
app.get("/api/lists/:id/items", (req, res) => {
  if (!enrolledList(req.params.id)) { res.sendStatus(404); return; }
  const snapshot = readSnapshot(req.params.id);
  res.json({ items: snapshot?.items ?? [], syncedAt: snapshot?.syncedAt ?? null });
});
app.put("/api/lists/:id/items/:taskId/aisle", async (req, res) => {
  const { aisle, name } = req.body ?? {};
  if (!aisles.includes(aisle) || typeof name !== "string" || !itemKey(name)) {
    res.status(400).json({ error: "Choose a valid item and aisle." });
    return;
  }
  const list = enrolledList(req.params.id);
  if (!list) { res.sendStatus(404); return; }
  const path = taskPath(list.id) + "/" + encodeURIComponent(req.params.taskId);
  const task = await graph<Task>(path);
  const currentList = enrolledList(list.id)!;
  const [item] = planList(currentList, [task]);
  if (task.status === "completed" || itemKey(item.base) !== itemKey(name)) {
    res.status(409).json({ error: "This item changed in Microsoft To Do. Refresh the items and try again." });
    return;
  }
  db.prepare("INSERT OR REPLACE INTO aisle_corrections VALUES (?, ?, ?)").run(list.id, itemKey(item.base), aisle);
  const applied = !active.has(list.id) && await run(currentList).then(() => true, () => false);
  res.json({ applied });
});
async function checklistFlags(path: string) {
  try {
    const steps = await graph<{ value: unknown[] }>(path + "/checklistItems");
    return steps.value.length ? ["Checklist steps"] : [];
  } catch {
    return ["Checklist could not be checked"];
  }
}
function detailFlags(task: Task) {
  const flags: string[] = [];
  if (task.body?.content?.trim()) flags.push("Notes");
  if (task.hasAttachments) flags.push("Attachments");
  return flags;
}
type Check = { flags: string[]; modified?: string; expires: number };
type DuplicateCopy = ReturnType<typeof previewCopy>;
type Snapshot = {
  syncedAt: string;
  items: { id: string; name: string; aisle: string }[];
  duplicates: { key: string; name: string; keep: DuplicateCopy; copies: DuplicateCopy[] }[];
  checks: Record<string, Check>;
};
function readSnapshot(listId: string): Snapshot | undefined {
  const stored = read("snapshot:" + listId);
  return stored ? JSON.parse(stored) as Snapshot : undefined;
}
function previewCopy(task: Task, flags: string[] = []) {
  return {
    id: task.id, title: task.title, completed: task.status === "completed",
    date: task.status === "completed" ? task.completedDateTime?.dateTime ?? task.createdDateTime : task.createdDateTime,
    flags,
  };
}
async function syncSnapshot(list: Enrolled, tasks?: Task[]) {
  const client = msal;
  const account = read("account");
  const path = taskPath(list.id);
  const planned = planList(list, tasks ?? await collection<Task>(path));
  const groups = duplicateGroups(planned);
  const previous = readSnapshot(list.id);
  const checks = new Map<string, Check>();
  const copies = groups.flatMap(group => group.copies);
  for (let index = 0; index < copies.length; index += 5) {
    await Promise.all(copies.slice(index, index + 5).map(async task => {
      const cached = previous?.checks[task.id];
      if (cached && cached.modified === task.lastModifiedDateTime && cached.expires > Date.now()) {
        checks.set(task.id, cached);
        return;
      }
      const flags = await checklistFlags(path + "/" + encodeURIComponent(task.id));
      checks.set(task.id, { flags, modified: task.lastModifiedDateTime, expires: Date.now() + (flags.includes("Checklist could not be checked") ? 0 : 10 * 60_000) });
    }));
  }
  if (client !== msal || account !== read("account")) return;
  const snapshot: Snapshot = {
    syncedAt: new Date().toISOString(),
    items: planned.filter(task => task.status !== "completed").map(({ id, base, aisle }) => ({ id, name: base, aisle })),
    duplicates: groups.map(({ key, keep, copies }) => ({
      key, name: keep.base, keep: previewCopy(keep),
      copies: copies.map(task => previewCopy(task, [...detailFlags(task), ...(checks.get(task.id)?.flags ?? [])])),
    })),
    checks: Object.fromEntries(checks),
  };
  write("snapshot:" + list.id, JSON.stringify(snapshot));
}
app.get("/api/lists/:id/duplicates", (req, res) => {
  if (!enrolledList(req.params.id)) { res.sendStatus(404); return; }
  const snapshot = readSnapshot(req.params.id);
  res.json({ groups: snapshot?.duplicates ?? [], syncedAt: snapshot?.syncedAt ?? null });
});

type ProposedDuplicate = { id: string; keepId: string; key: string; completed: boolean; keepCompleted: boolean };

async function removeDuplicates(list: Enrolled, proposed?: ProposedDuplicate[]) {
  const path = taskPath(list.id);
  const groups = new Map(duplicateGroups(planList(list, await collection<Task>(path))).map(group => [group.key, group]));
  const proposals = proposed ?? [...groups.values()].flatMap(group => group.copies.map(copy => ({
    id: copy.id, key: group.key, keepId: group.keep.id,
    completed: copy.status === "completed", keepCompleted: group.keep.status === "completed",
  })));
  const requests = new Map(proposals.map(copy => [copy.id, copy]));
  let removed = 0;
  let skipped = 0;
  let failed = 0;
  for (const request of requests.values()) {
    const group = groups.get(request.key);
    const copy = group?.copies.find(task => task.id === request.id);
    if (!group || !copy || group.keep.id !== request.keepId
      || (group.keep.status === "completed") !== request.keepCompleted
      || (copy.status === "completed") !== request.completed) {
      skipped++;
      continue;
    }
    const copyPath = path + "/" + encodeURIComponent(copy.id);
    const keepPath = path + "/" + encodeURIComponent(group.keep.id);
    try {
      if (detailFlags(copy).length || (await checklistFlags(copyPath)).length) {
        skipped++;
        continue;
      }
      const [latestCopy, latestKeep] = await Promise.all([graph<Task>(copyPath), graph<Task>(keepPath)]);
      const latest = planList(list, [latestCopy, latestKeep]);
      if (latestCopy.status !== copy.status || latestKeep.status !== group.keep.status
        || latest.some(task => itemKey(task.base) !== group.key) || detailFlags(latestCopy).length) {
        skipped++;
        continue;
      }
      await graph(copyPath, undefined, "DELETE");
      removed++;
      log(list.id, (proposed ? "Removed duplicate: " : "Automatically removed duplicate: ") + latestCopy.title);
    } catch {
      failed++;
    }
  }
  return { removed, skipped, failed };
}

app.post("/api/lists/:id/duplicates/remove", async (req, res) => {
  const list = enrolledList(req.params.id);
  if (!list) { res.sendStatus(404); return; }
  const proposed = req.body?.proposed;
  if (!Array.isArray(proposed) || !proposed.length || !proposed.every(copy =>
    typeof copy?.id === "string" && typeof copy.keepId === "string" && typeof copy.key === "string"
    && typeof copy.completed === "boolean" && typeof copy.keepCompleted === "boolean")) {
    res.status(400).json({ error: "Refresh the duplicate preview before removing copies." });
    return;
  }
  if (active.has(list.id)) {
    res.status(409).json({ error: "Wait for the current list run to finish, then try again." });
    return;
  }
  active.add(list.id);
  try {
    const result = await removeDuplicates(list, proposed as ProposedDuplicate[]);
    if (result.removed) await syncSnapshot(list).catch(() => undefined);
    res.json(result);
  } finally {
    active.delete(list.id);
  }
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
