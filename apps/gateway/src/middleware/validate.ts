import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

export function validate<T>(schema: z.ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const err = new Error("Validation failed") as any;
      err.code = "VALIDATION_ERROR";
      err.details = result.error.issues;
      err.status = 400;
      return next(err);
    }
    req.body = result.data;
    next();
  };
}

export const ChatRequestSchema = z.object({
  message: z.string().min(1, "message is required"),
});
