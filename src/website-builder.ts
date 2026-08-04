import { AUTH_MIGRATION } from "./migration";
import { cloudflare, deployBoundWorker, github, githubCreateOrUpdateFile, providerResult } from "./providers";
import { cleanSlug, cleanTitle, json, parseJson, requiredHeader } from "./shared";

type InputFile = { name: string; mimeType: string; data: string };
type PlannedFile = { path: string; purpose: string };
type Plan = { summary: string; needsD1: boolean; needsR2: boolean; migrationSql: string; files: PlannedFile[] };

function safeModel(value: unknown): string {
  const model = String(value ?? "gemini-2.5-pro").trim();
  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(model)) throw new Error("Invalid Gemini model");
  return model;
}
function safePath(value: unknown): string {
  const path = String(value ?? "").trim().replace(/^\/+/, "");
  if (!path || path.includes("..") || path.startsWith(".") || path.length > 180 || !/^[A-Za-z0-9_./-]+$/.test(path)) {
    throw new Error(`Unsafe file path: ${String(value ?? "")}`);
  }
  return path;
}
function safeReferences(value: unknown): InputFile[] {
  if (!Array.isArray(value)) return [];
  if (value.length > 20) throw new Error("Upload at most 20 design files");
  let total = 0;
  return value.map((raw) => {
    const item = raw as Partial<InputFile>;
    const data = String(item.data ?? "");
    total += Math.ceil(data.length * 0.75);
    if (total > 20 * 1024 * 1024) throw new Error("Design references exceed 20 MB");
    return {
      name: String(item.name ?? "reference").slice(0, 160),
      mimeType: String(item.mimeType ?? "application/octet-stream").slice(0, 100),
      data,
    };
  });
}
async function geminiJson(request: Request, model: string, parts: Array<Record<string, unknown>>, schema: unknown, maxOutputTokens = 8192): Promise<any> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": requiredHeader(request, "x-gemini-key") },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.2, maxOutputTokens, responseMimeType: "application/json", responseSchema: schema },
    }),
  });
  const raw = await response.text();
  let body: any;
  try { body = JSON.parse(raw); } catch { throw new Error(`Gemini returned non-JSON: ${raw.slice(0, 500)}`); }
  if (!response.ok) throw new Error(`Gemini: ${body?.error?.message ?? `HTTP ${response.status}`}`);
  const text = body?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Gemini returned no output");
  try { return JSON.parse(text); } catch { throw new Error("Gemini returned malformed structured output"); }
}
function referenceParts(files: InputFile[]): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [];
  for (const file of files) {
    parts.push({ text: `Design reference: ${file.name}` });
    parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
  }
  return parts;
}

export async function planWebsite(request: Request): Promise<Response> {
  const body = await parseJson(request);
  const title = cleanTitle(body.title), slug = cleanSlug(body.slug), model = safeModel(body.model);
  const specification = String(body.specification ?? "").trim();
  if (specification.length < 30 || specification.length > 100000) throw new Error("Specification must be 30–100,000 characters");
  const references = safeReferences(body.files);
  const schema = {
    type: "OBJECT",
    properties: {
      summary: { type: "STRING" },
      needsD1: { type: "BOOLEAN" },
      needsR2: { type: "BOOLEAN" },
      migrationSql: { type: "STRING" },
      files: { type: "ARRAY", items: { type: "OBJECT", properties: { path: { type: "STRING" }, purpose: { type: "STRING" } }, required: ["path", "purpose"] } },
    },
    required: ["summary", "needsD1", "needsR2", "migrationSql", "files"],
  };
  const parts: Array<Record<string, unknown>> = [{
    text: `Create a detailed implementation plan for a production Cloudflare Worker website.\nTITLE: ${title}\nSLUG: ${slug}\nSPECIFICATION:\n${specification}\n\nReturn a file manifest only, not code. The deployable entry must be src/index.js. Include package.json, wrangler.jsonc and README.md. Use D1/R2 only when needed. Keep the manifest under 40 files.`,
  }, ...referenceParts(references)];
  const raw = await geminiJson(request, model, parts, schema, 8192) as Partial<Plan>;
  if (!Array.isArray(raw.files) || raw.files.length < 2 || raw.files.length > 40) throw new Error("Gemini returned an invalid file plan");
  const seen = new Set<string>();
  const files = raw.files.map((file) => {
    const path = safePath(file.path);
    if (seen.has(path)) throw new Error(`Duplicate planned path: ${path}`);
    seen.add(path);
    return { path, purpose: String(file.purpose ?? "").slice(0, 1000) };
  });
  if (!seen.has("src/index.js")) throw new Error("Plan must include src/index.js");
  return json({ ok: true, plan: { summary: String(raw.summary ?? "").slice(0, 2000), needsD1: Boolean(raw.needsD1), needsR2: Boolean(raw.needsR2), migrationSql: String(raw.migrationSql ?? ""), files } });
}

export async function generateWebsiteFile(request: Request): Promise<Response> {
  const body = await parseJson(request);
  const title = cleanTitle(body.title), slug = cleanSlug(body.slug), model = safeModel(body.model);
  const specification = String(body.specification ?? "").trim();
  const references = safeReferences(body.files);
  const path = safePath(body.path);
  const purpose = String(body.purpose ?? "").slice(0, 2000);
  const manifest = Array.isArray(body.manifest) ? body.manifest.map((x) => safePath(x)).slice(0, 40) : [];
  const schema = { type: "OBJECT", properties: { content: { type: "STRING" } }, required: ["content"] };
  const parts: Array<Record<string, unknown>> = [{
    text: `Generate exactly one file for a Cloudflare Worker website.\nTITLE: ${title}\nSLUG: ${slug}\nFILE: ${path}\nPURPOSE: ${purpose}\nFULL MANIFEST:\n${manifest.join("\n")}\nSPECIFICATION:\n${specification}\n\nReturn only JSON with the complete file content. Ensure this file integrates with the other planned files. Never include secrets.`,
  }, ...referenceParts(references)];
  const raw = await geminiJson(request, model, parts, schema, 16384);
  const content = String(raw.content ?? "");
  if (!content || content.length > 600000) throw new Error(`Generated ${path} is empty or too large`);
  if (/ghp_[A-Za-z0-9]+|cfat_[A-Za-z0-9]+|AIza[0-9A-Za-z_-]{20,}/.test(content)) throw new Error(`Generated ${path} appears to contain a secret`);
  return json({ ok: true, path, content });
}

export async function setupWebsite(request: Request): Promise<Response> {
  const body = await parseJson(request);
  const accountId = requiredHeader(request, "x-cloudflare-account-id");
  const title = cleanTitle(body.title), slug = cleanSlug(body.slug);
  const repo = await providerResult<{ name: string; html_url: string; owner: { login: string } }>(await github(request, "/user/repos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: slug, description: `${title} — generated website`, private: Boolean(body.private), auto_init: true }) }), "Create GitHub repository");
  let database: { name: string; id: string } | null = null;
  let bucket: { name: string } | null = null;
  if (Boolean(body.needsD1)) {
    const name = `${slug}-db`;
    const created = await providerResult<{ uuid: string }>(await cloudflare(request, `/accounts/${encodeURIComponent(accountId)}/d1/database`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }), "Create D1 database");
    const sql = String(body.migrationSql ?? "").trim() || AUTH_MIGRATION;
    await providerResult(await cloudflare(request, `/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(created.uuid)}/query`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sql }) }), "Apply D1 migration");
    database = { name, id: created.uuid };
  }
  if (Boolean(body.needsR2)) {
    const name = `${slug}-files`;
    await providerResult(await cloudflare(request, `/accounts/${encodeURIComponent(accountId)}/r2/buckets`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }), "Create R2 bucket");
    bucket = { name };
  }
  return json({ ok: true, repository: repo.html_url, owner: repo.owner.login, repo: repo.name, d1: database, r2: bucket }, 201);
}

export async function publishWebsiteFile(request: Request): Promise<Response> {
  const body = await parseJson(request);
  const owner = cleanSlug(body.owner), repo = cleanSlug(body.repo), path = safePath(body.path);
  const content = String(body.content ?? "");
  if (content.length > 700000) throw new Error("File is too large to publish");
  await githubCreateOrUpdateFile(request, owner, repo, path, content, `Add ${path}`);
  return json({ ok: true, path });
}

export async function deployWebsite(request: Request): Promise<Response> {
  const body = await parseJson(request);
  const accountId = requiredHeader(request, "x-cloudflare-account-id");
  const slug = cleanSlug(body.slug);
  const workerCode = String(body.workerCode ?? "");
  if (!workerCode) throw new Error("Missing src/index.js content");
  const databaseId = body.databaseId ? String(body.databaseId) : undefined;
  const bucketName = body.bucketName ? cleanSlug(body.bucketName) : undefined;
  await deployBoundWorker(request, accountId, slug, workerCode, databaseId, bucketName);
  await providerResult(await cloudflare(request, `/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(slug)}/subdomain`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: true, previews_enabled: true }) }), "Enable workers.dev URL");
  const sub = await providerResult<{ subdomain: string }>(await cloudflare(request, `/accounts/${encodeURIComponent(accountId)}/workers/subdomain`), "Read account subdomain");
  return json({ ok: true, public_url: `https://${slug}.${sub.subdomain}.workers.dev` }, 201);
}
