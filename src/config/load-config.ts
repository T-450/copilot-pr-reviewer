import { parse } from "yaml";
import { z } from "zod";
import type { ReviewConfig } from "../shared/types";

const DEFAULT_CONFIG: ReviewConfig = {
  ignore: [],
  severityThreshold: "suggestion",
  maxFiles: 30,
  securityOverrides: [],
};

const ConfigSchema = z
  .object({
    ignore: z.array(z.string()).default([]),
    severityThreshold: z
      .enum(["critical", "warning", "suggestion", "nitpick"])
      .default("suggestion"),
    maxFiles: z.number().int().positive().default(30),
    securityOverrides: z
      .array(
        z.object({
          path: z.string(),
          risk: z.enum(["HIGH_RISK", "DATA_RISK", "MEDIUM_RISK", "NORMAL"]),
        })
      )
      .default([]),
  })
  .passthrough();

export async function loadConfig(configPath: string): Promise<ReviewConfig> {
  let raw: string;

  try {
    raw = await Bun.file(configPath).text();
  } catch {
    return DEFAULT_CONFIG;
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err) {
    console.log(
      `##vso[task.logissue type=warning]Failed to parse config at ${configPath}: ${String(err)}`
    );
    return DEFAULT_CONFIG;
  }

  const result = ConfigSchema.safeParse(parsed ?? {});
  if (!result.success) {
    console.log(
      `##vso[task.logissue type=warning]Invalid config at ${configPath}: ${result.error.message}`
    );
    return DEFAULT_CONFIG;
  }

  return {
    ignore: result.data.ignore,
    severityThreshold: result.data.severityThreshold,
    maxFiles: result.data.maxFiles,
    securityOverrides: result.data.securityOverrides,
  };
}
