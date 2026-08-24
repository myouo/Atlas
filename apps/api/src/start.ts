import process from "node:process";

import { buildApi } from "./bootstrap/build-api";
import { loadApiConfig } from "./config/api-config";
import { loadRootEnvironment } from "./config/load-root-env";

loadRootEnvironment();

const config = loadApiConfig();
const app = buildApi({ config });

async function shutdown(signal: NodeJS.Signals) {
  app.log.info({ signal }, "Shutting down Nivalis API");
  await app.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

app.listen({ host: config.host, port: config.port }).catch((error: unknown) => {
  app.log.fatal(
    { error: error instanceof Error ? { message: error.message, name: error.name } : "unknown" },
    "Nivalis API startup failed"
  );
  process.exit(1);
});
