export function apiOrigin(): string {
  const raw = import.meta.env.VITE_API_ORIGIN as string | undefined;
  return raw?.trim().replace(/\/$/, "") ?? "";
}

export function apiUrl(path: string): string {
  const base = apiOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
