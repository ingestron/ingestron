// The platform request and the environment comparison for the editor's
// commands: the CLI's `ingestron request` and `ingestron compare` text, from
// the project's files with open editors read first.
import { compareEnvironments as compare, platformRequest as request } from "@ingestron/cli";
import { formatDiagnostics, type AnyDiagnostic } from "@ingestron/config";
import { unlessPackThrows } from "./pack-load.js";
import type { Project } from "./project.js";

/** The request as Markdown for the environment, as `ingestron request` prints it. */
export function platformRequest(project: Project, environment: string | undefined): string {
  return unlessPackThrows(() => request(project.files, environment), stopped);
}

/** What differs between two environments, as `ingestron compare` prints it. */
export function compareEnvironments(project: Project, a: string, b: string): string {
  return unlessPackThrows(() => compare(project.files, a, b), stopped);
}

/** The problem that stopped resolving, as a code block in place of the document. */
function stopped(problem: AnyDiagnostic): string {
  return `\`\`\`text\n${formatDiagnostics([problem])}\n\`\`\`\n`;
}
