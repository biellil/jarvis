import http from 'http';
import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { setupWebSocketServer } from './lib/ws-server.js';

const app = createApp();
const httpServer = http.createServer(app);
setupWebSocketServer(httpServer);

httpServer.listen(config.gatewayPort, () => {
  logger.info({ port: config.gatewayPort }, 'JARVIS Gateway listening');
});
