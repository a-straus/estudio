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

/** Load /prompts/<task>.md at call time; templates are never inlined in code. */
export function loadPrompt(task: string): PromptTemplate {
  const text = fs.readFileSync(path.join(promptsDir, `${task}.md`), "utf8");
  const version = crypto
    .createHash("sha256")
    .update(text)
    .digest("hex")
    .slice(0, 12);
  return { text, version };
}
