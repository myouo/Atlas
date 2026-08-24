import { existsSync } from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

export function loadRootEnvironment() {
  const repositoryRoot = resolveRepositoryRoot();
  dotenv.config({ path: path.join(repositoryRoot, ".env"), quiet: true });
  dotenv.config({ path: path.join(repositoryRoot, ".env.local"), override: true, quiet: true });
}

function resolveRepositoryRoot() {
  const candidates = [
    process.env.INIT_CWD,
    process.cwd(),
    path.resolve(process.cwd(), "../..")
  ].filter((value): value is string => Boolean(value));

  return (
    candidates.find((candidate) => existsSync(path.join(candidate, "pnpm-workspace.yaml"))) ??
    process.cwd()
  );
}
