import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { LazyBackend } from "./backend.js";
import { createServer } from "./server.js";
import { ZenMoneyReceiptService } from "./service.js";

const service = new ZenMoneyReceiptService(new LazyBackend());
const server = createServer(service);
const transport = new StdioServerTransport();

async function shutdown(): Promise<void> {
  await service.close();
  await server.close();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

await server.connect(transport);
