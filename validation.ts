import { z } from 'zod';

export const userInputSchema = z.object({
  nome: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  idade: z.number().int().min(0).max(150)
}).strict();

export const listQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional()
}).strict();

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);

export function parsePagination(input: unknown) {
  const result = listQuerySchema.safeParse(input);
  if (!result.success) return null;

  const page = Number(result.data.page ?? '1');
  const limit = Number(result.data.limit ?? '100');
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return null;
  }

  return { page, limit };
}
