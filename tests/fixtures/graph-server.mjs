import Database from "better-sqlite3";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { Server } from "node:http";
import { resolve } from "node:path";

const db = new Database(resolve(process.env.DATA_DIR, "graphrelay.db"));
db.exec("CREATE TABLE state (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
const save = db.prepare("INSERT INTO state VALUES (?, ?)");
save.run("account", "fixture");
save.run("username", "fixture");
db.close();

ConfidentialClientApplication.prototype.getTokenCache = () => ({
  getAccountByHomeId: async () => ({ homeAccountId: "fixture" }),
});
ConfidentialClientApplication.prototype.acquireTokenSilent = async () => ({ accessToken: "fixture" });

const taskId = index => "fixture-".padEnd(140, "x") + String(index).padStart(3, "0");
const tasks = new Map(Array.from({ length: 269 }, (_, index) => [taskId(index), {
  id: taskId(index),
  title: "Duplicate fixture",
  status: index === 0 ? "notStarted" : "completed",
  ...(index === 267 ? { body: { content: "Keep this note" } } : {}),
}]));
const listPath = "/v1.0/me/todo/lists";
const tasksPath = listPath + "/fixture/tasks";
const resume = new Promise(resolve => process.on("message", message => {
  if (message === "resume") resolve();
}));
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  if (url.origin !== "https://graph.microsoft.com") throw new Error("Unexpected fixture request origin");
  const path = url.pathname;
  const method = options.method ?? "GET";
  if (method === "GET") {
    if (path === listPath) return Response.json({ value: [{ id: "fixture", displayName: "Fixture" }] });
    if (path === tasksPath) return Response.json({ value: [...tasks.values()] });
    if (path.startsWith(tasksPath + "/") && path.endsWith("/checklistItems")) {
      return Response.json({ value: path.includes(taskId(268)) ? [{ id: "step" }] : [] });
    }
    const task = tasks.get(path.slice(tasksPath.length + 1));
    if (task && path.startsWith(tasksPath + "/")) {
      return Response.json(task.id === taskId(265) ? { ...task, body: { content: "New note since preview" } } : task);
    }
  }
  if (method === "DELETE" && path.startsWith(tasksPath + "/")) {
    const id = path.slice(tasksPath.length + 1);
    if (id === taskId(2)) await resume;
    if (id === taskId(266)) return new Response(null, { status: 503 });
    if (id !== taskId(0) && id !== taskId(265) && id !== taskId(267) && id !== taskId(268) && tasks.delete(id)) {
      return new Response(null, { status: 204 });
    }
  }
  throw new Error("Unexpected mocked Graph request");
};

const listen = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  this.once("listening", () => process.send({ port: this.address().port }));
  return listen.apply(this, args);
};
await import("../../src/server/index.ts");
