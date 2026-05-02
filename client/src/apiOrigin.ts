/**
 * In dev, leave unset so requests stay same-origin and Vite proxies `/api` to the server.
 * For production (e.g. static app on Vercel), set `VITE_API_ORIGIN` to the Express API base
 * (no trailing slash), e.g. `https://generative-browser-xxxx.up.railway.app`.
 */
export function apiOrigin(): string {
  const raw = import.meta.env.VITE_API_ORIGIN as string | undefined;
  return raw?.trim().replace(/\/$/, "") ?? "";
}

export function apiUrl(path: string): string {
  const base = apiOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

/** WebSocket URL for `/api/ws` — uses API host when `VITE_API_ORIGIN` is set, else current page host. */
export function apiWebSocketUrl(sessionId: string): string {
  const base = apiOrigin();
  if (base) {
    const u = new URL("/api/ws", `${base}/`);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.searchParams.set("sessionId", sessionId);
    return u.toString();
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws?sessionId=${encodeURIComponent(sessionId)}`;
}
