import { readdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const root = process.cwd();
const scanRoots = [
  ".github",
  "apps",
  "docs",
  "infra",
  "migrations",
  "openapi",
  "packages",
  "scripts"
];
const extensions = new Set([
  ".cjs",
  ".css",
  ".env",
  ".js",
  ".json",
  ".jsonc",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml"
]);
const findings = [];
const execFileAsync = promisify(execFile);

async function collect(relativePath) {
  const entries = await readdir(path.join(root, relativePath), { withFileTypes: true }).catch(
    () => []
  );
  const nested = await Promise.all(
    entries
      .filter(
        (entry) =>
          !entry.name.startsWith(".next") &&
          ![
            ".git",
            ".next",
            ".wrangler",
            "dist",
            "node_modules",
            "out",
            "playwright-report",
            "test-results"
          ].includes(entry.name)
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
  .filter((file) => extensions.has(path.extname(file)))
  .concat([".env.example", "README.md"]);

for (const file of files) {
  const source = await readFile(path.join(root, file), "utf8");
  const patterns = [
    /ghp_[A-Za-z0-9]{30,}/,
    /github_pat_[A-Za-z0-9_]{30,}/,
    /(?:AKIA|ASIA)[0-9A-Z]{16}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /(?:CF_API_TOKEN|CLOUDFLARE_API_TOKEN)\s*=\s*[^\s#]{12,}/,
    /(?:MUSIC_U|NETEASE_INTEGRATION_MUSIC_U)[ \t]*[=:][ \t]*["']?(?!\$\{|nivalis_fixture_|[ \t]*(?:\r?\n|$))[A-Za-z0-9_%-]{24,}/i
  ];
  for (const pattern of patterns) {
    if (pattern.test(source)) findings.push(`${file}: content resembles a committed secret.`);
  }
}

const example = await readFile(path.join(root, ".env.example"), "utf8");
for (const [index, line] of example.split(/\r?\n/).entries()) {
  if (!line || line.startsWith("#")) continue;
  if (!/^[A-Z][A-Z0-9_]*=$/.test(line)) {
    findings.push(`.env.example:${index + 1}: example values must remain empty.`);
  }
}

const forbiddenEnvironmentFiles = [".env", ".env.local", ".env.production", ".env.test"];
const trackedEnvironmentFiles = await execFileAsync("git", [
  "ls-files",
  "--",
  ...forbiddenEnvironmentFiles
]).catch(() => ({ stdout: "" }));
for (const forbidden of trackedEnvironmentFiles.stdout.trim().split(/\r?\n/).filter(Boolean)) {
  findings.push(`${forbidden}: local environment file is tracked by Git.`);
}

if (findings.length > 0) {
  console.error([...new Set(findings)].join("\n"));
  process.exit(1);
}

console.log(`Secret scan passed (${files.length} files).`);
