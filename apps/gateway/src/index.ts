import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();
app.listen(config.gatewayPort, () => {
  console.log(`JARVIS Gateway listening on :${config.gatewayPort}`);
});
