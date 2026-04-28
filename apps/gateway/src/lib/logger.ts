import pino, { type Logger, type LoggerOptions } from "pino";

const level = process.env.LOG_LEVEL ?? "info";
const nodeEnv = process.env.NODE_ENV ?? "development";

const baseOptions: LoggerOptions = {
  level,
  base: { app: "gateway" },
};

// pino-pretty é spawned como worker thread — em test/production polui stdout
// e pode flakar CI. Só ativa em dev.
const options: LoggerOptions =
  nodeEnv === "development"
    ? {
        ...baseOptions,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:HH:MM:ss.l",
            ignore: "pid,hostname",
          },
        },
      }
    : baseOptions;

export const logger: Logger = pino(options);

export function createRequestLogger(reqId: string): Logger {
  return logger.child({ reqId });
}
