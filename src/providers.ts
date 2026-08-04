import { ProviderEnvelope, requiredHeader, encodeUtf8Base64 } from "./shared";

export async function github(request: Request, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com${path}`, { ...init, headers: { accept: "application/vnd.github+json", authorization: `Bearer ${requiredHeader(request, "x-github-token")}`, "x-github-api-version": "2022-11-28", "user-agent": "dev-control-center", ...(init.headers ?? {}) } });
}
export async function cloudflare(request: Request, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.cloudflare.com/client/v4${path}`, { ...init, headers: { authorization: `Bearer ${requiredHeader(request, "x-cloudflare-token")}`, ...(init.headers ?? {}) } });
}
export async function responseJson(response: Response): Promise<unknown> { return response.json().catch(() => ({ error: "Invalid provider response" })); }
export async function providerResult<T>(response: Response, label: string): Promise<T> {
  const body = await responseJson(response) as ProviderEnvelope<T> & { message?: string };
  if (!response.ok || body.success === false) {
    const detail = body.errors?.map(item => item.message).filter(Boolean).join("; ") || body.message || `HTTP ${response.status}`;
    throw new Error(`${label}: ${detail}`);
  }
  return (body.result ?? body) as T;
}
export async function githubCreateOrUpdateFile(request: Request, owner: string, repo: string, path: string, content: string, message: string): Promise<unknown> {
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;
  const current = await github(request, endpoint); let sha: string | undefined;
  if (current.ok) sha = (await current.json() as { sha?: string }).sha;
  else if (current.status !== 404) await providerResult(current, `Read ${path}`);
  return providerResult(await github(request, endpoint, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, content: encodeUtf8Base64(content), ...(sha ? { sha } : {}) }) }), `Publish ${path}`);
}
export async function deployBoundWorker(request: Request, accountId: string, name: string, code: string, databaseId?: string, bucketName?: string): Promise<unknown> {
  const bindings: Array<Record<string, string>> = [];
  if (databaseId) bindings.push({ type: "d1", name: "DB", id: databaseId });
  if (bucketName) bindings.push({ type: "r2_bucket", name: "BUCKET", bucket_name: bucketName });
  const form = new FormData();
  form.set("metadata", JSON.stringify({ main_module: "index.js", compatibility_date: "2026-08-04", bindings, annotations: { "workers/message": "Deployed by Dev Control Center" } }));
  form.set("index.js", new Blob([code], { type: "application/javascript+module" }), "index.js");
  return providerResult(await cloudflare(request, `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(name)}`, { method: "PUT", body: form }), "Deploy Worker");
}
