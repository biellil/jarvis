export const config = {
  backendPort: parseInt(process.env.BACKEND_TS_PORT ?? "8001", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
} as const;
