interface Env { ASSETS: Fetcher; }
type JsonObject = Record<string, unknown>;

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : "Unexpected error";
async function parseJson(request: Request): Promise<JsonObject> { const type = request.headers.get("content-type") ?? ""; if (!type.includes("application/json")) throw new Error("Expected JSON request"); return await request.json() as JsonObject; }
function requiredHeader(request: Request, name: string): string { const value = request.headers.get(name)?.trim(); if (!value) throw new Error(`Missing ${name} header`); return value; }
function cleanRepo(value: unknown): string { const name = String(value ?? "").trim(); if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) throw new Error("Repository name contains invalid characters"); return name; }
function cleanPath(value: unknown): string { const path = String(value ?? "").trim().replace(/^\/+/, ""); if (!path || path.includes("..") || path.length > 500) throw new Error("Invalid file path"); return path; }

async function github(request: Request, path: string, init: RequestInit = {}): Promise<Response> { const token = requiredHeader(request, "x-github-token"); return fetch(`https://api.github.com${path}`, { ...init, headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28", "user-agent": "dev-control-center", ...(init.headers ?? {}) } }); }
async function cloudflare(request: Request, path: string, init: RequestInit = {}): Promise<Response> { const token = requiredHeader(request, "x-cloudflare-token"); return fetch(`https://api.cloudflare.com/client/v4${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } }); }
async function proxyJson(response: Response): Promise<Response> { const body = await response.json().catch(() => ({ error: "Invalid provider response" })); return json(body, response.status); }

async function githubCreateOrUpdateFile(request: Request, owner: string, repo: string, path: string, content: string, message: string): Promise<Response> {
  const current = await github(request, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`);
  let sha: string | undefined;
  if (current.ok) { const found = await current.json() as { sha?: string }; sha = found.sha; }
  else if (current.status !== 404) return proxyJson(current);
  const encoded = btoa(unescape(encodeURIComponent(content)));
  return github(request, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, content: encoded, ...(sha ? { sha } : {}) }) });
}

async function api(request: Request): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (request.method === "GET" && url.pathname === "/api/github/me") return proxyJson(await github(request, "/user"));
    if (request.method === "POST" && url.pathname === "/api/github/repos") {
      const body = await parseJson(request); const name = cleanRepo(body.name);
      return proxyJson(await github(request, "/user/repos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, description: String(body.description ?? "").slice(0, 350), private: Boolean(body.private), auto_init: true }) }));
    }
    if (request.method === "PUT" && url.pathname === "/api/github/file") {
      const body = await parseJson(request); const owner = cleanRepo(body.owner); const repo = cleanRepo(body.repo); const path = cleanPath(body.path); const content = String(body.content ?? "");
      return proxyJson(await githubCreateOrUpdateFile(request, owner, repo, path, content, String(body.message ?? `Update ${path}`).slice(0, 200)));
    }
    if (request.method === "POST" && url.pathname === "/api/github/starter") {
      const body = await parseJson(request); const name = cleanRepo(body.name);
      const created = await github(request, "/user/repos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, description: "Starter website created by Dev Control Center", private: Boolean(body.private), auto_init: true }) });
      if (!created.ok) return proxyJson(created);
      const repo = await created.json() as { owner: { login: string }; name: string; html_url: string };
      const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title><style>body{font-family:system-ui;max-width:760px;margin:12vh auto;padding:24px;background:#0b1020;color:#eef2ff}main{padding:32px;border:1px solid #334155;border-radius:20px;background:#111827}h1{font-size:clamp(2rem,8vw,5rem);margin:0}p{color:#cbd5e1}</style><main><h1>${name}</h1><p>Your website repository is ready.</p></main></html>`;
      const file = await githubCreateOrUpdateFile(request, repo.owner.login, repo.name, "index.html", html, "Add starter website"); if (!file.ok) return proxyJson(file); return json({ ok: true, repository: repo.html_url });
    }
    if (request.method === "GET" && url.pathname === "/api/cloudflare/workers") { const accountId = requiredHeader(request, "x-cloudflare-account-id"); return proxyJson(await cloudflare(request, `/accounts/${encodeURIComponent(accountId)}/workers/scripts`)); }
    if (request.method === "PUT" && url.pathname === "/api/cloudflare/worker") {
      const accountId = requiredHeader(request, "x-cloudflare-account-id"); const body = await parseJson(request); const name = cleanRepo(body.name); const code = String(body.code ?? ""); if (!code || code.length > 1_000_000) throw new Error("Worker code is empty or too large");
      const form = new FormData(); form.set("metadata", JSON.stringify({ main_module: "index.js", compatibility_date: "2026-08-04" })); form.set("index.js", new Blob([code], { type: "application/javascript+module" }), "index.js");
      return proxyJson(await cloudflare(request, `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(name)}`, { method: "PUT", body: form }));
    }
    if (request.method === "DELETE" && url.pathname.startsWith("/api/cloudflare/worker/")) { const accountId = requiredHeader(request, "x-cloudflare-account-id"); const name = cleanRepo(decodeURIComponent(url.pathname.split("/").pop() ?? "")); return proxyJson(await cloudflare(request, `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(name)}`, { method: "DELETE" })); }
    return json({ error: "Not found" }, 404);
  } catch (error) { return json({ error: errorMessage(error) }, 400); }
}

export default { async fetch(request: Request, env: Env): Promise<Response> { const url = new URL(request.url); if (url.pathname.startsWith("/api/")) return api(request); const response = await env.ASSETS.fetch(request); const headers = new Headers(response.headers); headers.set("cache-control", "no-store"); headers.set("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"); headers.set("x-frame-options", "DENY"); headers.set("x-content-type-options", "nosniff"); headers.set("referrer-policy", "no-referrer"); return new Response(response.body, { status: response.status, headers }); } } satisfies ExportedHandler<Env>;
