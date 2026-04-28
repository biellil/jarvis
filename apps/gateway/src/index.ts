import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./lib/logger.js";

const app = createApp();
app.listen(config.gatewayPort, () => {
  logger.info({ port: config.gatewayPort }, "JARVIS Gateway listening");
});
