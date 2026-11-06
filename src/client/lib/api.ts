export const sessionExpiredEvent = "graphrelay:session-expired";
export class SessionExpiredError extends Error {
  constructor() { super("Sign in to continue."); }
}

let sessionGeneration = 0;

export async function api<T>(path: string, method = "GET", body?: object): Promise<T> {
  const generation = sessionGeneration;
  const response = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json", "X-GraphRelay": "1" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401 && path !== "/login" && path !== "/setup" && path !== "/session") {
    if (generation === sessionGeneration) {
      sessionGeneration++;
      window.dispatchEvent(new Event(sessionExpiredEvent));
    }
    throw new SessionExpiredError();
  }
  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(details?.error ?? (response.status === 401 && path === "/login" ? "Incorrect username or password." : "Request failed (" + response.status + ")."));
  }
  if (path === "/login") sessionGeneration++;
  return response.status === 204 ? undefined as T : await response.json() as T;
}
