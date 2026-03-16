import { z } from "zod";

export const FindingSchema = z.object({
  filePath: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  severity: z.enum(["critical", "warning", "suggestion", "nitpick"]),
  category: z.enum(["correctness", "security", "reliability", "maintainability", "testing"]),
  title: z.string().min(1).max(140),
  message: z.string().min(1),
  suggestion: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]),
});

export type RawFinding = z.infer<typeof FindingSchema>;

export function validateFinding(input: unknown): RawFinding | null {
  const result = FindingSchema.safeParse(input);
  if (!result.success) {
    console.warn("Invalid finding:", result.error.issues);
    return null;
  }
  return result.data;
}
