import { z } from "zod";

const errorMessageSchema = z.object({ message: z.string() });
const errorStackSchema = z.object({ stack: z.string() });

export function errorMessage(cause: unknown): string {
  const message = errorMessageSchema.safeParse(cause);
  if (message.success) return message.data.message;
  const stack = errorStackSchema.safeParse(cause);
  if (stack.success) return stack.data.stack.split("\n", 1)[0]!;
  return String(cause);
}

export function errorWithContext(context: string, cause: unknown): Error {
  return new Error(`${context}: ${errorMessage(cause)}`, { cause });
}
