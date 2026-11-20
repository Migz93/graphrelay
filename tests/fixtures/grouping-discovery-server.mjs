import Database from "better-sqlite3";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { Server } from "node:http";
import { resolve } from "node:path";

const db = new Database(resolve(process.env.DATA_DIR, "graphrelay.db"));
db.exec("CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE lists (id TEXT PRIMARY KEY, name TEXT, mode TEXT, aisle_order TEXT)");
const save = db.prepare("INSERT INTO state VALUES (?, ?)");
save.run("account", "fixture");
save.run("username", "fixture");
save.run("grouping-profiles", "[]");
save.run("grouping-files-migrated", "1");
for (const [id, mode] of [["first", "named"], ["second", "number-2"], ["disabled", "off"]]) {
  db.prepare("INSERT INTO lists VALUES (?, ?, ?, '[]')").run(id, id, mode);
  save.run("list-profile:" + id, "sample");
}
db.close();
ConfidentialClientApplication.prototype.getTokenCache = () => ({ getAccountByHomeId: async () => ({ homeAccountId: "fixture" }) });
ConfidentialClientApplication.prototype.acquireTokenSilent = async () => ({ accessToken: "fixture" });
const tasks = new Map(["first", "second", "disabled", "unenrolled"].map(id => [id, [
  { id: "open", title: id === "disabled" || id === "unenrolled" ? id + " unknown" : "Star fruit 500g", status: "notStarted" },
  { id: "done", title: "Completed unknown", status: "completed" },
]]));
process.on("message", message => {
  if (message === "add") {
    tasks.get("first").push({ id: "new", title: "Dragon fruit", status: "notStarted" });
    process.send("added");
  }
});
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  if (url.origin !== "https://graph.microsoft.com") throw new Error("Unexpected fixture origin");
  const path = url.pathname;
  if (path === "/v1.0/me/todo/lists") return Response.json({ value: [...tasks.keys()].map(id => ({ id, displayName: id })) });
  const parts = path.match(/^\/v1.0\/me\/todo\/lists\/([^/]+)\/tasks(?:\/([^/]+))?$/);
  if (!parts || !tasks.has(parts[1])) throw new Error("Unexpected fixture path");
  if (!parts[2]) return Response.json({ value: tasks.get(parts[1]) });
  const task = tasks.get(parts[1]).find(task => task.id === parts[2]);
  if (!task) return new Response(null, { status: 404 });
  if (options.method === "PATCH") Object.assign(task, JSON.parse(options.body));
  return Response.json(task);
};
const listen = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  this.once("listening", () => process.send({ port: this.address().port }));
  return listen.apply(this, args);
};
await import("../../src/server/index.ts");
