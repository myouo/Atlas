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
      .filter(
        (entry) =>
          !entry.name.startsWith(".next") &&
          ![".wrangler", "dist", "node_modules", "out"].includes(entry.name)
      )
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
  const isTestFile = /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);

  if (
    /apps\/web\//.test(file) &&
    /from\s+["']@nivalis\/(?:connectors|domain|application)/.test(source)
  ) {
    findings.push(`${file}: Web imports a backend-internal package.`);
  }

  if (
    /packages\/(?:domain|application)\//.test(file) &&
    /(?:cloudflare:|@cloudflare\/|from\s+["'](?:fastify|kysely|pg|pg-boss|next)(?:\/|["']))/.test(
      source
    )
  ) {
    findings.push(
      `${file}: core package imports transport, database, frontend, or deployment code.`
    );
  }

  if (/apps\/api\/src\//.test(file) && /from\s+["']@nivalis\/connectors/.test(source)) {
    findings.push(
      `${file}: API process imports a Provider Connector; Provider execution belongs in Worker.`
    );
  }

  if (
    /apps\/worker\/src\//.test(file) &&
    /apps\/api\/src\/transport|transport\/http/.test(source)
  ) {
    findings.push(`${file}: Worker imports API transport code.`);
  }

  if (
    file.endsWith("kysely-dashboard-repository.ts") &&
    /projection_data|widget_updated_at|widget_projections/.test(source)
  ) {
    findings.push(`${file}: Revision repository contains live Projection persistence.`);
  }

  if (
    /apps\/api\/src\/transport\//.test(file) &&
    !isTestFile &&
    /(?:from\s+["'](?:kysely|pg)|from\s+["'][^"']*infrastructure\/)/.test(source)
  ) {
    findings.push(`${file}: HTTP transport imports a database implementation.`);
  }

  if (
    /apps\/web\//.test(file) &&
    !/apps\/web\/functions\//.test(file) &&
    !isTestFile &&
    /\bfetch\s*\(/.test(source)
  ) {
    findings.push(`${file}: Web performs a direct fetch instead of using @nivalis/api-client.`);
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
