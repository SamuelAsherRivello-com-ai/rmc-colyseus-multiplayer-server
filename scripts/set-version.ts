import { readFile, writeFile } from "node:fs/promises";
const version = process.env.VERSION;
if (!/^\d+\.\d+\.\d+$/.test(version || "")) throw new Error("VERSION must be a semantic version");
for (const path of ["package.json", "multiplayer-server/packages/client/package.json"]) {
  const json = JSON.parse(await readFile(path, "utf8"));
  json.version = version;
  await writeFile(path, JSON.stringify(json, null, 2) + "\n");
}

