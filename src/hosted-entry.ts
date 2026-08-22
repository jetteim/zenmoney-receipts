import { createHostedHttpServer, hostedConfigFromEnvironment } from "./hosted-server.js";

const config = hostedConfigFromEnvironment();
const hosted = createHostedHttpServer(config);

hosted.server.listen(config.port, config.listenHost, () => {
  process.stderr.write(
    `${JSON.stringify({ event: "hosted-server-ready", host: config.listenHost, port: config.port })}\n`
  );
});

async function shutdown(): Promise<void> {
  await hosted.close();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
