import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(process.argv[2] ?? defaultRoot);
const documents = [
  "README.md",
  "multiplayer-server/packages/client/README.md",
  "multiplayer-server/documentation/games.md",
  "AGENTS.md",
];
const errors: string[] = [];

function report(file: string, message: string) {
  errors.push(`${file}: ${message}`);
}

function section(source: string, heading: string, file: string) {
  const lines = source.split(/\r?\n/);
  const start = lines.indexOf(heading);
  if (start < 0) {
    report(file, `missing ${heading} section`);
    return "";
  }
  const after = lines.slice(start + 1);
  const end = after.findIndex((line) => /^#{1,2} /.test(line));
  return (end < 0 ? after : after.slice(0, end)).join("\n");
}

function checkOrder(entries: {name: string}[], file: string) {
  for (let i = 1; i < entries.length; i++) {
    if (entries[i - 1]!.name.localeCompare(entries[i]!.name, "en") > 0) {
      report(file, `${entries[i]!.name} is out of alphabetical order (after ${entries[i - 1]!.name})`);
    }
  }
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.name)) report(file, `duplicate game: ${entry.name}`);
    seen.add(entry.name);
  }
}

function registryEntries(source: string, file: string) {
  const rows = section(source, "# Supported games", file)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|"))
    .slice(2);
  if (rows.length === 0) report(file, "supported-game table has no entries");
  const entries = rows.map((row) => {
    const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
    const match = cells[4]?.match(/^\[[^\]]+\]\((https:\/\/[^)]+)\)$/);
    if (cells.length !== 6 || !cells[0] || !cells[1] || !cells[3]) {
      report(file, `invalid supported-game row: ${row}`);
    }
    if (cells[4] !== "In development" && !match) {
      report(file, `invalid frontend entry for ${cells[0] ?? "unknown game"}`);
    }
    return {
      name: cells[0] ?? "",
      url: match?.[1] ?? null,
      development: /in development|live playtest/i.test(cells[4] ?? ""),
    };
  });
  checkOrder(entries, file);
  return entries;
}

function demoEntries(source: string, file: string) {
  const lines = section(source, "## Live Demos", file)
    .split(/\r?\n/)
    .filter((line) => line.startsWith("- "));
  const entries = lines.map((line) => {
    const linked = line.match(/^- \[\*\*(.+?)\*\*\]\((https:\/\/[^)]+)\) — (.+)$/);
    const unlinked = line.match(/^- \*\*(.+?)\*\* — (.+)$/);
    if (!linked && !unlinked) report(file, `invalid Live Demos bullet: ${line}`);
    return {
      name: linked?.[1] ?? unlinked?.[1] ?? line,
      url: linked?.[2] ?? null,
      description: linked?.[3] ?? unlinked?.[2] ?? "",
    };
  });
  checkOrder(entries, file);
  return entries;
}

function samePage(left: string, right: string) {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return false;
  }
}

function checkDemos(registry: ReturnType<typeof registryEntries>, demos: ReturnType<typeof demoEntries>, file: string) {
  const registered = new Map(registry.map((entry) => [entry.name, entry]));
  const found = new Set(demos.map((entry) => entry.name));
  for (const entry of registry) {
    if (!found.has(entry.name)) report(file, `missing game: ${entry.name}`);
  }
  for (const entry of demos) {
    const expected = registered.get(entry.name);
    if (!expected) {
      report(file, `extra game: ${entry.name}`);
      continue;
    }
    if (!entry.description.trim()) report(file, `${entry.name} has no description`);
    if (expected.url) {
      if (!entry.url) report(file, `${entry.name} needs a GitHub Pages link`);
      else if (!samePage(expected.url, entry.url)) report(file, `${entry.name} URL differs from the registry`);
    } else if (entry.url) {
      report(file, `${entry.name} must remain unlinked until a public Pages URL is registered`);
    }
    if (entry.url && !/^https:\/\/[^/]+\.github\.io\//.test(entry.url)) {
      report(file, `${entry.name} must link to a GitHub Pages site`);
    }
    if (expected.development && !/\(In development\.\)$/.test(entry.description)) {
      report(file, `${entry.name} needs the (In development.) label`);
    }
  }
}

async function checkLocalLinks(source: string, file: string) {
  const links = source.matchAll(/!?\[[^\]\r\n]*\]\((<?[^)\s>]+>?)\)/g);
  for (const match of links) {
    const target = match[1]!.replace(/^<|>$/g, "");
    if (target.startsWith("#") || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
    let relative;
    try {
      relative = decodeURIComponent(target.split(/[?#]/, 1)[0]!);
    } catch {
      report(file, `invalid local link: ${target}`);
      continue;
    }
    if (!relative) continue;
    const resolved = path.resolve(root, path.dirname(file), relative);
    try {
      await stat(resolved);
    } catch {
      report(file, `broken local link: ${target}`);
    }
  }
}

const sources = new Map();
for (const file of documents) {
  try {
    sources.set(file, await readFile(path.join(root, file), "utf8"));
  } catch (error) {
    report(file, `cannot read document: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

let gameCount = 0;
if (sources.size === documents.length) {
  const registryFile = documents[2]!;
  const registry = registryEntries(sources.get(registryFile)!, registryFile);
  gameCount = registry.length;
  for (const file of documents.slice(0, 2)) {
    checkDemos(registry, demoEntries(sources.get(file)!, file), file);
  }
  for (const file of documents) await checkLocalLinks(sources.get(file)!, file);
}

if (errors.length) {
  for (const error of errors) console.error(`docs: ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Documentation check passed: ${gameCount} supported games and local links.`);
}
