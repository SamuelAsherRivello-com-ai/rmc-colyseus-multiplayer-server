import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import ts from "typescript";

const root = process.cwd();
const configNames = ["tsconfig.json", "tsconfig.client.json", "tsconfig.tools.json"];
const normalize = (path: string) => resolve(path).replaceAll("\\", "/").toLowerCase();
const covered = new Set<string>();
const failures: string[] = [];
for (const configName of configNames) {
  const configPath = resolve(root, configName);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, configPath);
  if (parsed.errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(parsed.errors, {
    getCanonicalFileName: path => path, getCurrentDirectory: () => root, getNewLine: () => "\n",
  }));
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  for (const source of program.getSourceFiles()) covered.add(normalize(source.fileName));
}
// Git reports tracked and nonignored untracked files. Deleted tracked rename
// sources are ignored only when absent from the current working tree.
const candidates = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0");
// Generated output and dependencies are never authoring roots. No first-party
// source, tests or tools are exempt. There are no external JS fixtures here.
const generated = /(?:^|\/)(?:node_modules|dist|\.git|coverage|playwright-report|test-results)\//;
for (const name of new Set(candidates)) {
  if (!name || !existsSync(resolve(root, name)) || generated.test(name)) continue;
  if (/\.(?:js|jsx|mjs|cjs)$/.test(name)) failures.push(`Authored JavaScript: ${name}`);
  if (/\.(?:ts|tsx|mts|cts)$/.test(name) && !covered.has(normalize(name))) failures.push(`TypeScript outside compiler coverage: ${name}`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  const count = [...covered].filter(path => !path.includes("/node_modules/") && !relative(root, path).startsWith("..")).length;
  console.log(`TypeScript source coverage passed (${count} first-party compiler files).`);
}
