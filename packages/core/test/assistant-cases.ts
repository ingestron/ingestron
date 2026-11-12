// The conformance cases of spec/cli/conformance/assistants/, read for the guide's tests.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { memoryFiles, type FileSource } from "@ingestron/config";
import type { Pack } from "@ingestron/definitions";
import { parse } from "yaml";

const folder = resolve(import.meta.dirname, "../../../spec/cli/conformance/assistants");

/** One case, as its YAML file gives it. */
export interface AssistantCase {
  description: string;
  files: Record<string, string>;
  command: string;
  args?: string[];
  expect: {
    exit: number;
    lines?: string[];
    contains?: Record<string, string[]>;
    absent?: Record<string, string[] | null>;
    unchanged?: string[];
  };
}

/** The case in the file `name` (such as `02-databricks-adf`). */
export function assistantCase(name: string): AssistantCase {
  return parse(readFileSync(resolve(folder, `${name}.yaml`), "utf8")) as AssistantCase;
}

/** The case's project, without the files the guide goes in. */
export function caseProject(found: AssistantCase): FileSource {
  const files = { ...found.files };
  delete files["AGENTS.md"];
  return memoryFiles(files);
}

/** The stand-in packs of the output folder cases: `fold` builds environments together, `local` does not. */
export const standIns = [
  { id: "fold", buildEnvironments: () => ({ files: {}, problems: [] }) },
  { id: "local" },
] as unknown as Pack[];
