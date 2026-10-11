const hookValue = process.env.RENDER_DEPLOY_HOOK_URL;
const serviceValue = process.env.RENDER_SERVICE_URL;
if (!hookValue) throw new Error("RENDER_DEPLOY_HOOK_URL is missing from GitHub Actions secrets");
if (!serviceValue) throw new Error("RENDER_SERVICE_URL is missing from GitHub Actions variables");

const hook = new URL(hookValue);
const service = new URL(serviceValue);
if (hook.protocol !== "https:" || service.protocol !== "https:") {
  throw new Error("Render deploy hook and service URL must use HTTPS");
}

let response;
try {
  response = await fetch(new URL("/api/health", service), { signal: AbortSignal.timeout(15000) });
} catch (error) {
  throw new Error(`Render service health check failed: ${(error instanceof Error ? error.message : String(error))}`);
}
if (!response.ok) throw new Error(`Render service health check failed (HTTP ${response.status})`);
const health = await response.json();
if (health.status !== "ok" || typeof health.version !== "string") {
  throw new Error("Render service returned invalid health metadata");
}
console.log(`Render service is healthy at version ${health.version}.`);
