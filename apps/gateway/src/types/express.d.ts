declare global {
  namespace Express {
    interface Request {
      id: string;
      log: import("pino").Logger;
    }
  }
}

export {};
