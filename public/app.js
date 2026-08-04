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

async function call(path, options = {}) {
  show("Working…");
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({ error: "Invalid response" }));
  show({ status: response.status, ...body });
  if (!response.ok) throw new Error(body.error || body.message || "Request failed");
  return body;
}

$("ghCheck").onclick = () => call("/api/github/me", { headers: ghHeaders() });
$("repoCreate").onclick = () => call("/api/github/repos", { method: "POST", headers: ghHeaders(), body: JSON.stringify({ name: $("repoName").value, description: $("repoDescription").value, private: $("repoPrivate").checked }) });
$("starterCreate").onclick = () => call("/api/github/starter", { method: "POST", headers: ghHeaders(), body: JSON.stringify({ name: $("starterName").value, private: $("starterPrivate").checked }) });
$("fileSave").onclick = () => call("/api/github/file", { method: "PUT", headers: ghHeaders(), body: JSON.stringify({ owner: $("fileOwner").value, repo: $("fileRepo").value, path: $("filePath").value, content: $("fileContent").value }) });
$("cfList").onclick = () => call("/api/cloudflare/workers", { headers: cfHeaders() });
$("workerDeploy").onclick = () => call("/api/cloudflare/worker", { method: "PUT", headers: cfHeaders(), body: JSON.stringify({ name: $("workerName").value, code: $("workerCode").value }) });
$("workerDelete").onclick = async () => { const name = $("workerDeleteName").value.trim(); if (!name || !confirm(`Permanently delete Worker "${name}"?`)) return; await call(`/api/cloudflare/worker/${encodeURIComponent(name)}`, { method: "DELETE", headers: cfHeaders() }); };
$("clear").onclick = () => { ["ghToken","cfToken","cfAccount"].forEach((id) => $(id).value = ""); show("Credentials cleared from this browser tab."); };
$("copy").onclick = async () => navigator.clipboard.writeText(output.textContent);
window.addEventListener("beforeunload", () => { ["ghToken","cfToken","cfAccount"].forEach((id) => $(id).value = ""); });
