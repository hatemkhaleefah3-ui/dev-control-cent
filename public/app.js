const $ = (id) => document.getElementById(id);
const output = $("output");
const show = (value) => { output.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2); };

document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".tab,.panel").forEach((element) => element.classList.remove("active"));
  button.classList.add("active");
  $(button.dataset.tab).classList.add("active");
}));

const ghHeaders = () => ({ "content-type": "application/json", "x-github-token": $("ghToken").value.trim() });
const cfHeaders = () => ({ "content-type": "application/json", "x-cloudflare-token": $("cfToken").value.trim(), "x-cloudflare-account-id": $("cfAccount").value.trim() });
const allHeaders = () => ({ ...ghHeaders(), ...cfHeaders() });
const builderHeaders = () => ({ ...allHeaders(), "x-gemini-key": $("geminiKey").value.trim() });

async function call(path, options = {}) {
  const response = await fetch(path, options);
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : {}; }
  catch { body = { error: "Non-JSON server response", response_text: raw || "Empty response" }; }
  if (!response.ok) throw new Error(body.error || body.message || `Request failed with HTTP ${response.status}`);
  return body;
}
function progress(step, total, message, extra = {}) {
  show({ status: "working", step, total, message, ...extra });
  if ($("builderStatus")) $("builderStatus").textContent = `Step ${step}/${total}: ${message}`;
}
async function filesToPayload(input) {
  const selected = [...input.files];
  const payload = [];
  for (let i = 0; i < selected.length; i++) {
    progress(i + 1, selected.length, `Reading design reference ${selected[i].name}`);
    const buffer = await selected[i].arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
    payload.push({ name: selected[i].name, mimeType: selected[i].type || "application/octet-stream", data: btoa(binary) });
  }
  return payload;
}

$("builderCreate").onclick = async () => {
  const title = $("builderTitle").value.trim();
  const slug = $("builderSlug").value.trim();
  const model = $("geminiModel").value.trim();
  const specification = $("builderPrompt").value.trim();
  if (!title || !slug || !specification || !$("geminiKey").value.trim()) return show("Complete the title, slug, Gemini key, and website specification.");
  if (!confirm(`Generate and publish “${title}” as ${slug}?`)) return;
  $("builderOpen").disabled = true; $("builderCopy").disabled = true; $("builderRepo").disabled = true;

  try {
    const references = await filesToPayload($("builderFiles"));
    progress(1, 6, "Gemini is analyzing references and planning the website");
    const planned = await call("/api/website-builder/plan", {
      method: "POST", headers: builderHeaders(),
      body: JSON.stringify({ title, slug, model, specification, files: references }),
    });
    const plan = planned.plan;
    const manifest = plan.files.map((file) => file.path);
    const generated = new Map();

    // Uploaded references are intentionally not resent in this loop. Their design
    // details are compacted into plan.summary and each file purpose during step 1.
    for (let i = 0; i < plan.files.length; i++) {
      const file = plan.files[i];
      progress(2, 6, `Generating file ${i + 1} of ${plan.files.length}: ${file.path}`);
      const result = await call("/api/website-builder/generate-file", {
        method: "POST", headers: builderHeaders(),
        body: JSON.stringify({ title, slug, model, specification, designSummary: plan.summary, manifest, path: file.path, purpose: file.purpose }),
      });
      generated.set(result.path, result.content);
    }

    progress(3, 6, "Creating GitHub repository and Cloudflare resources");
    const setup = await call("/api/website-builder/setup", {
      method: "POST", headers: allHeaders(),
      body: JSON.stringify({ title, slug, private: $("builderPrivate").checked, needsD1: plan.needsD1, needsR2: plan.needsR2, migrationSql: plan.migrationSql }),
    });

    const wrangler = { name: slug, main: "src/index.js", compatibility_date: "2026-08-04", ...(setup.d1 ? { d1_databases: [{ binding: "DB", database_name: setup.d1.name, database_id: setup.d1.id }] } : {}), ...(setup.r2 ? { r2_buckets: [{ binding: "BUCKET", bucket_name: setup.r2.name }] } : {}) };
    generated.set("wrangler.jsonc", JSON.stringify(wrangler, null, 2));
    generated.set("GENERATION.md", `# Generation summary\n\n${plan.summary}\n\nModel: ${model}\n`);

    const entries = [...generated.entries()];
    for (let i = 0; i < entries.length; i++) {
      const [path, content] = entries[i];
      progress(4, 6, `Publishing file ${i + 1} of ${entries.length}: ${path}`);
      await call("/api/website-builder/publish-file", { method: "PUT", headers: ghHeaders(), body: JSON.stringify({ owner: setup.owner, repo: setup.repo, path, content }) });
    }

    progress(5, 6, "Deploying the generated Worker");
    const deployed = await call("/api/website-builder/deploy", {
      method: "POST", headers: cfHeaders(),
      body: JSON.stringify({ slug, workerCode: generated.get("src/index.js"), databaseId: setup.d1?.id || "", bucketName: setup.r2?.name || "" }),
    });

    progress(6, 6, "Website created successfully");
    const final = { status: 201, ok: true, public_url: deployed.public_url, repository: setup.repository, summary: plan.summary, files: entries.length, d1: setup.d1, r2: setup.r2 };
    show(final);
    $("builderStatus").textContent = `Website published: ${deployed.public_url}`;
    $("builderOpen").disabled = false; $("builderCopy").disabled = false; $("builderRepo").disabled = false;
    $("builderOpen").onclick = () => window.open(deployed.public_url, "_blank");
    $("builderCopy").onclick = async () => navigator.clipboard.writeText(deployed.public_url);
    $("builderRepo").onclick = () => window.open(setup.repository, "_blank");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    show({ status: "failed", error: message });
    $("builderStatus").textContent = message;
  }
};

$("factoryCreate").onclick = async () => {
  const slug = $("factorySlug").value.trim(), title = $("factoryTitle").value.trim();
  if (!slug || !title) return show("Enter an app title and slug.");
  if (!confirm(`Create and publish “${title}” as ${slug}?`)) return;
  show("Working… Keep this tab open.");
  try { const body = await call("/api/factory/auth-app", { method: "POST", headers: allHeaders(), body: JSON.stringify({ slug, title, private: $("factoryPrivate").checked, connectBuilds: $("factoryBuilds").checked }) }); show({ status: 201, ...body }); }
  catch (error) { show({ error: error instanceof Error ? error.message : String(error) }); }
};

$("ghCheck").onclick = () => call("/api/github/me", { headers: ghHeaders() }).then(show).catch((e) => show({ error: e.message }));
$("repoCreate").onclick = () => call("/api/github/repos", { method: "POST", headers: ghHeaders(), body: JSON.stringify({ name: $("repoName").value, description: $("repoDescription").value, private: $("repoPrivate").checked }) }).then(show).catch((e) => show({ error: e.message }));
$("starterCreate").onclick = () => call("/api/github/starter", { method: "POST", headers: ghHeaders(), body: JSON.stringify({ name: $("starterName").value, private: $("starterPrivate").checked }) }).then(show).catch((e) => show({ error: e.message }));
$("fileSave").onclick = () => call("/api/github/file", { method: "PUT", headers: ghHeaders(), body: JSON.stringify({ owner: $("fileOwner").value, repo: $("fileRepo").value, path: $("filePath").value, content: $("fileContent").value }) }).then(show).catch((e) => show({ error: e.message }));
$("cfList").onclick = () => call("/api/cloudflare/workers", { headers: cfHeaders() }).then(show).catch((e) => show({ error: e.message }));
$("d1Create").onclick = () => call("/api/cloudflare/d1", { method: "POST", headers: cfHeaders(), body: JSON.stringify({ name: $("d1Name").value }) }).then(show).catch((e) => show({ error: e.message }));
$("r2Create").onclick = () => call("/api/cloudflare/r2", { method: "POST", headers: cfHeaders(), body: JSON.stringify({ name: $("r2Name").value }) }).then(show).catch((e) => show({ error: e.message }));
$("d1Query").onclick = () => call("/api/cloudflare/d1/query", { method: "POST", headers: cfHeaders(), body: JSON.stringify({ databaseId: $("d1Id").value, sql: $("d1Sql").value }) }).then(show).catch((e) => show({ error: e.message }));
$("workerDeploy").onclick = () => call("/api/cloudflare/worker", { method: "PUT", headers: cfHeaders(), body: JSON.stringify({ name: $("workerName").value, code: $("workerCode").value, d1Id: $("workerD1").value, r2Bucket: $("workerR2").value }) }).then(show).catch((e) => show({ error: e.message }));
$("workerDelete").onclick = async () => { const name = $("workerDeleteName").value.trim(); if (!name || !confirm(`Permanently delete Worker “${name}”?`)) return; call(`/api/cloudflare/worker/${encodeURIComponent(name)}`, { method: "DELETE", headers: cfHeaders() }).then(show).catch((e) => show({ error: e.message })); };

$("builderFiles").addEventListener("change", () => { const files = [...$("builderFiles").files]; $("builderFileStatus").textContent = `${files.length} file(s), ${(files.reduce((sum, file) => sum + file.size, 0) / 1048576).toFixed(1)} MB total`; });
$("clear").onclick = () => { ["ghToken", "cfToken", "cfAccount", "geminiKey"].forEach((id) => $(id).value = ""); show("Credentials cleared from this browser tab."); };
$("copy").onclick = async () => navigator.clipboard.writeText(output.textContent);
window.addEventListener("beforeunload", () => ["ghToken", "cfToken", "cfAccount", "geminiKey"].forEach((id) => $(id).value = ""));
