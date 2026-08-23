import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const scanRoots = [".github", "apps", "packages", "infra", "openapi"];
const rootFiles = [".env.example"];
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".js",
  ".json",
  ".jsonc",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml"
]);
const findings = [];

async function collect(relativePath) {
  const absolutePath = path.join(root, relativePath);
  let entries;
  try {
    entries = await readdir(absolutePath, { withFileTypes: true });
  } catch {
    return [];
  }

  const nested = await Promise.all(
    entries
      .filter((entry) => ![".next", "dist", "node_modules"].includes(entry.name))
      .map((entry) => {
        const child = path.join(relativePath, entry.name);
        return entry.isDirectory() ? collect(child) : [child];
      })
  );
  return nested.flat();
}

const files = (await Promise.all(scanRoots.map(collect)))
  .flat()
  .filter((file) => textExtensions.has(path.extname(file)))
  .concat(rootFiles);

for (const file of files) {
  const source = await readFile(path.join(root, file), "utf8");

  if (
    /apps\/web\//.test(file) &&
    /from\s+["']@nivalis\/(?:connectors|domain|application)/.test(source)
  ) {
    findings.push(`${file}: Web imports a backend-internal package.`);
  }

  if (
    /packages\/(?:domain|application)\//.test(file) &&
    /(?:cloudflare:|@cloudflare\/)/.test(source)
  ) {
    findings.push(`${file}: core package imports deployment-specific code.`);
  }

  if (/(?:https?:\/\/[^\s"']+\.(?:pages|workers)\.dev|r2\.cloudflarestorage\.com)/i.test(source)) {
    findings.push(`${file}: deployment instance hostname is hard-coded.`);
  }

  if (/(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16})/.test(source)) {
    findings.push(`${file}: value resembles a committed credential.`);
  }
}

if (findings.length > 0) {
  console.error(findings.join("\n"));
  process.exit(1);
}

console.log(`Architecture boundary scan passed (${files.length} files).`);
