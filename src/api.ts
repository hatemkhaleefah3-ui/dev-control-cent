import { createAuthApp } from "./factory";
import { handleGitHub } from "./github-api";
import { handleCloudflare } from "./cloudflare-api";
import { deployWebsite, generateWebsiteFile, planWebsite, publishWebsiteFile, setupWebsite } from "./website-builder";
import { errorMessage, json } from "./shared";
export async function api(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  try {
    if (request.method === "POST" && path === "/api/factory/auth-app") return createAuthApp(request);
    if (request.method === "POST" && path === "/api/website-builder/plan") return planWebsite(request);
    if (request.method === "POST" && path === "/api/website-builder/generate-file") return generateWebsiteFile(request);
    if (request.method === "POST" && path === "/api/website-builder/setup") return setupWebsite(request);
    if (request.method === "PUT" && path === "/api/website-builder/publish-file") return publishWebsiteFile(request);
    if (request.method === "POST" && path === "/api/website-builder/deploy") return deployWebsite(request);
    const github = await handleGitHub(request, path); if (github) return github;
    const cloudflare = await handleCloudflare(request, path); if (cloudflare) return cloudflare;
    return json({ error: "Not found" }, 404);
  } catch (error) { return json({ error: errorMessage(error) }, 400); }
}
