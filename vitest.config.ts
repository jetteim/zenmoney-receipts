import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      ZENMONEY_RECEIPT_MEMORY_DIR: join(
        tmpdir(),
        `zenmoney-receipts-vitest-${process.pid}`
      )
    },
    coverage: { reporter: ["text", "json-summary"] }
  }
});
