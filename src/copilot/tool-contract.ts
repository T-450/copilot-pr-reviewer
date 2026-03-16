import { z } from 'zod';

export const FindingSchema = z.object({
  filePath: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  severity: z.enum(['critical', 'warning', 'suggestion', 'nitpick']),
  category: z.enum([
    'correctness',
    'security',
    'reliability',
    'maintainability',
    'testing',
  ]),
  title: z.string().min(1).max(140),
  message: z.string().min(1),
  suggestion: z.string().optional(),
  confidence: z.enum(['high', 'medium', 'low']),
});
