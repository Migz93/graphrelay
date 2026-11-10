import { ConfidentialClientApplication } from "@azure/msal-node";
import { Server } from "node:http";

// Exercise the real session/OAuth routes without Microsoft credentials or calls.
ConfidentialClientApplication.prototype.getAuthCodeUrl = async request =>
  "https://login.microsoftonline.com/fixture?" + new URLSearchParams({ state: request.state, redirect_uri: request.redirectUri });
ConfidentialClientApplication.prototype.acquireTokenByCode = async request => {
  if (request.code !== "fixture-code") throw new Error("Unexpected fixture authorization code");
  return { account: { homeAccountId: "fixture", username: "fixture@example.invalid" }, scopes: ["Calendars.Read"] };
};
ConfidentialClientApplication.prototype.getTokenCache = () => ({ getAccountByHomeId: async () => ({ homeAccountId: "fixture" }) });
ConfidentialClientApplication.prototype.acquireTokenSilent = async () => ({ accessToken: "fixture" });
globalThis.fetch = async input => {
  if (new URL(input).origin !== "https://graph.microsoft.com") throw new Error("Unexpected fixture request origin");
  return Response.json({ value: [] });
};
const listen = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  this.once("listening", () => process.send({ port: this.address().port }));
  return listen.apply(this, args);
};
await import("../../src/server/index.ts");
