export interface Env { ASSETS: Fetcher; }
export type JsonObject = Record<string, unknown>;
export type ProviderEnvelope<T> = { success?: boolean; result?: T; errors?: Array<{ message?: string }> };

export const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" },
});
export const errorMessage = (error: unknown): string => error instanceof Error ? error.message : "Unexpected error";
export async function parseJson(request: Request): Promise<JsonObject> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) throw new Error("Expected JSON request");
  return await request.json() as JsonObject;
}
export function requiredHeader(request: Request, name: string): string {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name} header`);
  return value;
}
export function cleanRepo(value: unknown): string {
  const name = String(value ?? "").trim();
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) throw new Error("Repository name contains invalid characters");
  return name;
}
export function cleanSlug(value: unknown): string {
  const slug = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?$/.test(slug)) throw new Error("App slug must be 3–50 lowercase letters, numbers, or hyphens");
  return slug;
}
export function cleanTitle(value: unknown): string {
  const title = String(value ?? "").trim();
  if (!/^[A-Za-z0-9 ._'-]{1,80}$/.test(title)) throw new Error("App title contains unsupported characters");
  return title;
}
export function cleanPath(value: unknown): string {
  const path = String(value ?? "").trim().replace(/^\/+/, "");
  if (!path || path.includes("..") || path.length > 500) throw new Error("Invalid file path");
  return path;
}
export function encodeUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value); let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
