import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface Request {
    id: string;
    log: import("pino").Logger;
  }
}

export {};
