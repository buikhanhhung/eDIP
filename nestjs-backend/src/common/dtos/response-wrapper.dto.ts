import { z } from 'zod';

export const wrapResponse = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    success: z.boolean(),
    data: schema,
    timestamp: z.string(),
    path: z.string(),
  });
