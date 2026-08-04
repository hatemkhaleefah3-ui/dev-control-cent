import { cleanPath, cleanRepo, json, parseJson } from "./shared";
import { github, githubCreateOrUpdateFile, providerResult, responseJson } from "./providers";
export async function handleGitHub(request: Request, path: string): Promise<Response | null> {
  if (request.method === "GET" && path === "/api/github/me") { const r = await github(request, "/user"); return json(await responseJson(r), r.status); }
  if (request.method === "POST" && path === "/api/github/repos") { const b = await parseJson(request); const r = await github(request, "/user/repos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: cleanRepo(b.name), description: String(b.description ?? "").slice(0, 350), private: Boolean(b.private), auto_init: true }) }); return json(await responseJson(r), r.status); }
  if (request.method === "PUT" && path === "/api/github/file") { const b = await parseJson(request); const p = cleanPath(b.path); return json(await githubCreateOrUpdateFile(request, cleanRepo(b.owner), cleanRepo(b.repo), p, String(b.content ?? ""), String(b.message ?? `Update ${p}`).slice(0, 200))); }
  if (request.method === "POST" && path === "/api/github/starter") {
    const b = await parseJson(request); const name = cleanRepo(b.name);
    const repo = await providerResult<{ owner: { login: string }; name: string; html_url: string }>(await github(request, "/user/repos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, description: "Starter website created by Dev Control Center", private: Boolean(b.private), auto_init: true }) }), "Create repository");
    const html = `<!doctype html><html><meta name="viewport" content="width=device-width"><title>${name}</title><body><h1>${name}</h1><p>Your website is ready.</p></body></html>`;
    await githubCreateOrUpdateFile(request, repo.owner.login, repo.name, "index.html", html, "Add starter website"); return json({ ok: true, repository: repo.html_url });
  }
  return null;
}
