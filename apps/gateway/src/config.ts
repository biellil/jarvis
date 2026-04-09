export const config = {
  fastapiUrl: process.env.FASTAPI_URL ?? "http://localhost:8000",
  backendTsUrl: process.env.BACKEND_TS_URL ?? "http://localhost:8001",
  gatewayPort: parseInt(process.env.GATEWAY_PORT ?? "3000", 10),
  apiKey: process.env.JARVIS_API_KEY as string | undefined,
} as const;
