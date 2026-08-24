import pino from "pino";
import { loadRootEnvironment } from "@nivalis/api/sync-runtime";

import { buildWorker } from "./index";
import { loadWorkerConfig } from "./worker-config";

loadRootEnvironment();
const config = loadWorkerConfig();
const logger = pino({ level: config.logLevel });
const worker = buildWorker({ config, logger });
let stopping = false;

await worker.start();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    void worker
      .stop()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error(
          {
            error: {
              message: error instanceof Error ? error.message : "Unknown shutdown error"
            }
          },
          "Nivalis Worker shutdown failed"
        );
        process.exit(1);
      });
  });
}
