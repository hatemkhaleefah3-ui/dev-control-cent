import { createAuthApp } from "./factory";
import { handleGitHub } from "./github-api";
import { handleCloudflare } from "./cloudflare-api";
import { errorMessage, json } from "./shared";
export async function api(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  try {
    if (request.method === "POST" && path === "/api/factory/auth-app") return createAuthApp(request);
    const github = await handleGitHub(request, path); if (github) return github;
    const cloudflare = await handleCloudflare(request, path); if (cloudflare) return cloudflare;
    return json({ error: "Not found" }, 404);
  } catch (error) { return json({ error: errorMessage(error) }, 400); }
}
