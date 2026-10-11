const token = process.env.VERCEL_TOKEN;
const url = new URL("https://api.vercel.com/v6/deployments");
url.searchParams.set("projectId", process.env.VERCEL_PROJECT_ID ?? "");
url.searchParams.set("teamId", process.env.VERCEL_ORG_ID ?? "");
url.searchParams.set("target", "production");
url.searchParams.set("state", "READY");
url.searchParams.set("limit", "1");
const response = await fetch(url, { headers: { Authorization: "Bearer " + token } });
if (!response.ok) throw new Error("Cannot inspect previous deployment: HTTP " + response.status);
const data = await response.json();
console.log("id=" + (data.deployments[0]?.uid || ""));

