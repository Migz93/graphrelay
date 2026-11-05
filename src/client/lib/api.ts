export async function api<T>(path: string, method = "GET", body?: object): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json", "X-GraphRelay": "1" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(details?.error ?? (response.status === 401 ? "Sign-in failed or your session expired." : "Request failed (" + response.status + ")."));
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}
