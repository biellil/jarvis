import type { Config } from 'drizzle-kit';

export default {
  schema: './src/memory/schema.ts',
  out: './src/memory/migrations',
  driver: 'better-sqlite',
  dbCredentials: {
    url: './jarvis.sqlite',
  },
} satisfies Config;
