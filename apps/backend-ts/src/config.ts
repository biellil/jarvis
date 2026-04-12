export const config = {
  backendPort: parseInt(process.env.BACKEND_TS_PORT ?? "8001", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  chromaHost: process.env.CHROMA_HOST ?? "localhost",
  chromaPort: parseInt(process.env.CHROMA_PORT ?? "8000", 10),
} as const;
