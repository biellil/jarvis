export const config = {
  fastapiUrl: process.env.FASTAPI_URL ?? "http://localhost:8000",
  gatewayPort: parseInt(process.env.GATEWAY_PORT ?? "3000", 10),
} as const;
