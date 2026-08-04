import { cloudflare, providerResult } from "./providers";

export async function connectBuilds(request: Request, accountId: string, workerName: string, repo: { id: number | string; name: string; owner: { id: number | string; login: string } }): Promise<void> {
  const connection = await providerResult<{ repo_connection_uuid: string }>(await cloudflare(request, `/accounts/${encodeURIComponent(accountId)}/builds/repos/connections`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider_type: "github", provider_account_id: String(repo.owner.id), provider_account_name: repo.owner.login, repo_id: String(repo.id), repo_name: repo.name }) }), "Connect GitHub repository");
  const workers = await providerResult<Array<{ id: string; tag?: string }>>(await cloudflare(request, `/accounts/${encodeURIComponent(accountId)}/workers/scripts`), "List Workers");
  const workerTag = workers.find(worker => worker.id === workerName)?.tag;
  if (!workerTag) throw new Error("Cloudflare did not return the new Worker's tag");
  const tokens = await providerResult<Array<{ build_token_uuid: string }>>(await cloudflare(request, `/accounts/${encodeURIComponent(accountId)}/builds/tokens`), "List build tokens");
  const buildToken = tokens[0]?.build_token_uuid;
  if (!buildToken) throw new Error("No Workers Builds token exists. Create one in Worker Settings → Builds → API token");
  const base = { external_script_id: workerTag, repo_connection_uuid: connection.repo_connection_uuid, build_token_uuid: buildToken, build_command: "npm run build", root_directory: "/", path_includes: ["*"], path_excludes: [] };
  await providerResult(await cloudflare(request, `/accounts/${encodeURIComponent(accountId)}/builds/triggers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...base, trigger_name: "Deploy production", deploy_command: "npx wrangler deploy", branch_includes: ["main"], branch_excludes: [] }) }), "Create production trigger");
  await providerResult(await cloudflare(request, `/accounts/${encodeURIComponent(accountId)}/builds/triggers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...base, trigger_name: "Deploy preview branches", deploy_command: "npx wrangler versions upload", branch_includes: ["*"], branch_excludes: ["main"] }) }), "Create preview trigger");
}
