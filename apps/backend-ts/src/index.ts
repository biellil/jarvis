import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();
app.listen(config.backendPort, () => {
  console.log(`JARVIS Backend TS listening on :${config.backendPort}`);
});
