export const config = {
  backendPort: parseInt(process.env.BACKEND_TS_PORT ?? "8001", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  chromaHost: process.env.CHROMA_HOST ?? "localhost",
  chromaPort: parseInt(process.env.CHROMA_PORT ?? "8000", 10),

  // Langfuse observability (Phase 83)
  // LANGFUSE_ENABLED=false by default — self-hosted or cloud opt-in via LANGFUSE_HOST
  langfuseEnabled: process.env.LANGFUSE_ENABLED === "true",
  langfuseHost: process.env.LANGFUSE_HOST ?? "http://localhost:3000",
  langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY ?? "",
  langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY ?? "",
} as const;
