import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// /prompts sits at the repo root: three levels up from server/src/llm in dev
// and from server/dist/llm in the build.
export const promptsDir = fileURLToPath(
  new URL("../../../prompts/", import.meta.url),
);

export interface PromptTemplate {
  text: string;
  /** Content hash of the template file — recorded as llm_call.prompt_version. */
  version: string;
}

/**
 * Load /prompts/<task>.md at call time; templates are never inlined in code.
 *
 * `substitutions` fills `{{placeholder}}` slots in the template. The version
 * hash is always taken from the raw template file, never the substituted text:
 * it identifies the prompt template (recorded as llm_call.prompt_version), not
 * the per-call runtime fill. Placeholders with no matching key are left as-is.
 */
export function loadPrompt(
  task: string,
  substitutions: Record<string, string> = {},
): PromptTemplate {
  const raw = fs.readFileSync(path.join(promptsDir, `${task}.md`), "utf8");
  const version = crypto
    .createHash("sha256")
    .update(raw)
    .digest("hex")
    .slice(0, 12);
  const text = Object.entries(substitutions).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
    raw,
  );
  return { text, version };
}
